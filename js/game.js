// ============================================================
// game.js — Ana Oyun Koordinatörü
// Çoklu Mod, Input Haritalama (Fare, Dokunmatik, Klavye, Gamepad),
// Dash (I-Frame), Graze, Güçlendirmeler ve Reaktif Efekt Döngüsü
// ============================================================

import { GAME_CONFIG } from './config.js';
import { Player } from './player.js';
import { BulletManager } from './bulletManager.js';
import { WaveManager } from './waveManager.js';
import { PickupManager } from './pickup.js';
import { CollisionSystem } from './collision.js';
import { EffectsManager } from './effects.js';
import { UIManager } from './ui.js';
import { ModeRegistry } from './modes.js';
import { Haptics } from './haptics.js';
import { TouchControls } from './touchControls.js';
import { computeLayout } from './layout.js';

export const GAME_STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    DEAD: 'DEAD'
};

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Mantıksal arena (kare 600x600 ya da yatay telefonda geniş) + DPR ölçekli çizim
        this.renderScale = 1;
        this.layout = null;
        this.applyLayout(true);

        // Aktif mod (varsayılan: Classic)
        this.currentMode = ModeRegistry.get('classic');

        // Alt sistemler
        this.player = new Player();
        this.bulletManager = new BulletManager();
        this.waveManager = new WaveManager(this.bulletManager, this.currentMode);
        this.pickupManager = new PickupManager();
        this.effects = new EffectsManager();
        this.ui = new UIManager();
        this.ui.setMode(this.currentMode);

        // State & Zamanlama
        this.state = GAME_STATE.MENU;
        this.elapsedMs = 0;          // Gerçek oynanan süre (dt birikimi; arka planda saymaz)
        this.deathTimestamp = 0;

        // Klavye tuş durumu haritası
        this.keys = {};

        // Gamepad son tetiklenme durumu (tek seferlik basış için)
        this.lastGamepadDashPressed = false;
        this.lastGamepadStartPressed = false;

        // Dokunmatik kontroller (joystick veya göreli sürükleme)
        this.touch = new TouchControls({
            toCanvas: (cx, cy) => this.getCanvasCoords(cx, cy),
            onDash: () => this.tryDash(),
            onDragDelta: (dx, dy) => this.applyPlayerMove(this.player.x + dx, this.player.y + dy)
        });
        this.ui.touchScheme = this.touch.scheme;
        this.touch.setLayout(this.layout);
        this.lastGrazeHaptic = 0;

        // Faz değişimi geri bildirimi
        this.waveManager.onPhaseChange = (phaseName) => {
            if (this.state === GAME_STATE.PLAYING) {
                this.effects.triggerPhase(phaseName);
            }
        };

        this.pickupManager.onPickupCollect = () => Haptics.pickup();

        this.initInputListeners();
        this.initLifecycleListeners();
    }

    /**
     * Ekran boyutuna/yönüne göre arena boyutunu, canvas ekran boyutunu ve
     * fiziksel çözünürlüğü (DPR) ayarlar. Ekran döndürülürse çağrılır.
     */
    applyLayout(initial = false) {
        const L = computeLayout();
        const prev = this.layout;
        const arenaChanged = !prev || prev.arenaW !== L.arenaW || prev.arenaH !== L.arenaH;
        this.layout = L;

        // Arena boyutu: tüm alt sistemler GAME_CONFIG.CANVAS'ı anlık okur
        GAME_CONFIG.CANVAS.WIDTH = L.arenaW;
        GAME_CONFIG.CANVAS.HEIGHT = L.arenaH;

        // Ekran (CSS) boyutu ve fiziksel çözünürlük
        const dpr = Math.min(window.devicePixelRatio || 1, GAME_CONFIG.DISPLAY.MAX_DPR);
        this.canvas.style.width = `${L.cssW}px`;
        this.canvas.style.height = `${L.cssH}px`;
        const bw = Math.max(1, Math.round(L.cssW * dpr));
        const bh = Math.max(1, Math.round(L.cssH * dpr));
        if (this.canvas.width !== bw) this.canvas.width = bw;
        if (this.canvas.height !== bh) this.canvas.height = bh;
        this.renderScale = bw / L.arenaW;
        document.body.classList.toggle('landscape', L.landscape);
        if (this.touch) this.touch.setLayout(L);

        if (initial || !arenaChanged) return;

        // Oyun sırasında döndürme: duraklat, oyuncuyu yeni arenaya sığdır
        if (this.state === GAME_STATE.PLAYING) this.pauseGame();
        if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.DEAD) {
            this.player.reset();
        } else {
            this.player.x = Math.min(this.player.x, L.arenaW - 30);
            this.player.y = Math.min(this.player.y, L.arenaH - 30);
            this.player.x = Math.max(30, this.player.x);
            this.player.y = Math.max(30, this.player.y);
        }
        this.effects.resizeArena(L.arenaW, L.arenaH);
    }

    /**
     * Ekran koordinatlarını 600x600 mantıksal canvas uzayına dönüştürür
     */
    getCanvasCoords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return { x: 300, y: 300 };
        return {
            x: (clientX - rect.left) * (GAME_CONFIG.CANVAS.WIDTH / rect.width),
            y: (clientY - rect.top) * (GAME_CONFIG.CANVAS.HEIGHT / rect.height)
        };
    }

    /**
     * Oyuncuyu yeni konuma taşır ve duvar temasını denetler
     */
    applyPlayerMove(x, y) {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.player.moveTo(x, y);
        this.effects.grid.applyForce(x, y, 8, 35);
        if (CollisionSystem.checkPlayerArena(this.player)) {
            this.triggerDeath();
        }
    }

    /**
     * Fare, dokunmatik, klavye ve contextmenu dinleyicilerini kurar
     */
    initInputListeners() {
        // Sağ tık bağlam menüsünü engelle (Sağ tık Dash için kullanılır)
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // --- FARE: Mutlak 1:1 takip (masaüstü tasarımı korunur) ---
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            const c = this.getCanvasCoords(e.clientX, e.clientY);
            this.applyPlayerMove(c.x, c.y);
        });

        // --- DOKUNMATİK: window seviyesinde dinlenir; böylece arenanın dışındaki
        // boş ekran alanı da (dikey telefonda alt kısım) joystick bölgesi olur.
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            e.preventDefault();
            this.handleTouchDown(e);
        }, { passive: false });
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'mouse') return;
            e.preventDefault();
            this.touch.move(e);
        }, { passive: false });
        const endTouch = (e) => {
            if (e.pointerType === 'mouse') return;
            this.touch.up(e);
        };
        window.addEventListener('pointerup', endTouch);
        window.addEventListener('pointercancel', endTouch);

        // --- FARE: Tıklama Eylemleri (Sol Tık & Sağ Tık) ---
        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse') return;
            e.preventDefault();
            this.effects.initAudio();
            this.ui.setInputType('desktop');

            // Sağ Tık -> Oyun esnasında Dash tetikler
            if (e.button === 2) {
                this.tryDash();
                return;
            }

            const coords = this.getCanvasCoords(e.clientX, e.clientY);
            switch (this.state) {
                case GAME_STATE.PAUSED:
                    this.resumeGame();
                    break;
                case GAME_STATE.MENU: {
                    const clickedModeId = this.ui.getClickedMode(coords.x, coords.y);
                    if (clickedModeId) this.selectMode(clickedModeId);
                    else this.startGame();
                    break;
                }
                case GAME_STATE.DEAD:
                    if (performance.now() - this.deathTimestamp <= 80) break;
                    if (this.ui.getDeadAction(coords.x, coords.y) === 'menu') this.goToMenu();
                    else this.restartGame();
                    break;
            }
        });

        // Klavye Basışları
        window.addEventListener('keydown', (e) => {
            this.effects.initAudio();
            this.keys[e.code] = true;
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) {
                this.ui.setInputType('desktop');
            }

            // Space veya Enter
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                if (this.state === GAME_STATE.MENU) {
                    this.startGame();
                } else if (this.state === GAME_STATE.PAUSED) {
                    this.resumeGame();
                } else if (this.state === GAME_STATE.DEAD) {
                    if (performance.now() - this.deathTimestamp > 80) {
                        this.restartGame();
                    }
                } else if (this.state === GAME_STATE.PLAYING && e.code === 'Space') {
                    // Oyun esnasında Space tuşu da Dash tetikler
                    this.tryDash();
                }
            } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                // Shift tuşu ile Dash
                if (this.state === GAME_STATE.PLAYING) {
                    e.preventDefault();
                    this.tryDash();
                }
            } else if (e.code === 'KeyB') {
                // 'B' tuşu: Synth Müziği Aç / Kapat
                const isBgmOn = this.effects.sound.toggleBGM();
                this.effects.triggerBanner(isBgmOn ? 'SYNTH MÜZİK: AÇIK' : 'SYNTH MÜZİK: KAPALI', '#00ffff');
            } else if (e.code === 'KeyP') {
                if (this.state === GAME_STATE.PLAYING) this.pauseGame();
                else if (this.state === GAME_STATE.PAUSED) this.resumeGame();
            } else if (e.code === 'KeyM' || e.code === 'Escape') {
                // Mod değiştirmek veya ana menüye dönmek için
                if (this.state === GAME_STATE.DEAD || this.state === GAME_STATE.PAUSED) {
                    this.goToMenu();
                } else if (this.state === GAME_STATE.PLAYING && e.code === 'Escape') {
                    this.pauseGame();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    /**
     * Uygulama arka plana alınınca otomatik duraklatma ve ekran döndürme/yeniden boyutlandırma
     */
    initLifecycleListeners() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === GAME_STATE.PLAYING) {
                this.pauseGame();
            }
        });
        window.addEventListener('blur', () => {
            if (this.state === GAME_STATE.PLAYING && this.ui.inputType === 'touch') {
                this.pauseGame();
            }
        });
        const relayout = () => this.applyLayout();
        window.addEventListener('resize', relayout);
        window.addEventListener('orientationchange', () => setTimeout(relayout, 120));
    }

    /**
     * Dokunmatik basış: oyun durumuna göre yönlendirilir.
     * Menü/ölüm ekranında butonlara bakılır; oyunu başlatan dokunuş aynı zamanda
     * joystick'i (veya sürüklemeyi) o noktada başlatır — tek hareketle oyuna girilir.
     */
    handleTouchDown(e) {
        this.effects.initAudio();
        this.ui.setInputType('touch');
        const coords = this.getCanvasCoords(e.clientX, e.clientY);

        switch (this.state) {
            case GAME_STATE.PLAYING:
                this.touch.down(e);
                break;

            case GAME_STATE.PAUSED:
                this.resumeGame();
                this.touch.down(e);
                break;

            case GAME_STATE.MENU: {
                const clickedModeId = this.ui.getClickedMode(coords.x, coords.y);
                if (clickedModeId) {
                    this.selectMode(clickedModeId);
                } else if (this.ui.isSchemeToggleClicked(coords.x, coords.y)) {
                    this.ui.touchScheme = this.touch.toggleScheme();
                    this.effects.sound.playPhase();
                    Haptics.pickup();
                } else {
                    this.startGame();
                    this.touch.down(e);
                }
                break;
            }

            case GAME_STATE.DEAD: {
                if (performance.now() - this.deathTimestamp <= GAME_CONFIG.TOUCH.RESTART_GUARD_MS) break;
                if (this.ui.getDeadAction(coords.x, coords.y) === 'menu') {
                    this.goToMenu();
                } else {
                    this.restartGame();
                    this.touch.down(e);
                }
                break;
            }
        }
    }

    selectMode(modeId) {
        this.currentMode = ModeRegistry.get(modeId);
        this.ui.setMode(this.currentMode);
        this.waveManager.setMode(this.currentMode);
        this.effects.sound.playPhase();
    }

    /**
     * Dash (I-Frame) eylemini dener
     */
    tryDash() {
        if (this.state !== GAME_STATE.PLAYING) return;
        const success = this.player.triggerDash();
        if (success) {
            this.effects.triggerDash(this.player.x, this.player.y);
            Haptics.dash();
            // Dash itmesi oyuncuyu duvara yapıştırmışsa ölüm kuralı geçerli
            if (CollisionSystem.checkPlayerArena(this.player)) {
                this.triggerDeath();
            }
        }
    }

    /**
     * Klavye ve Gamepad yön girdilerini okur ve oyuncuya iletir
     */
    pollKeyboardAndGamepad() {
        let inputX = 0;
        let inputY = 0;

        // 1. Klavye Tuşları (WASD & Ok Tuşları)
        if (this.keys['KeyW'] || this.keys['ArrowUp']) inputY -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) inputY += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) inputX -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) inputX += 1;

        // 2. Gamepad Kontrolü (Standart API)
        if (typeof navigator.getGamepads === 'function') {
            const gamepads = navigator.getGamepads();
            if (gamepads && gamepads[0]) {
                const gp = gamepads[0];
                const deadzone = 0.18;

                // Sol Analog Çubuk
                const ax = gp.axes[0] || 0;
                const ay = gp.axes[1] || 0;

                if (Math.abs(ax) > deadzone) inputX += ax;
                if (Math.abs(ay) > deadzone) inputY += ay;

                // D-Pad
                if (gp.buttons[12] && gp.buttons[12].pressed) inputY -= 1;
                if (gp.buttons[13] && gp.buttons[13].pressed) inputY += 1;
                if (gp.buttons[14] && gp.buttons[14].pressed) inputX -= 1;
                if (gp.buttons[15] && gp.buttons[15].pressed) inputX += 1;

                // Gamepad Tuşları: A (button 0) veya RT (button 7) ile Dash
                const dashPressed = (gp.buttons[0] && gp.buttons[0].pressed) || (gp.buttons[7] && gp.buttons[7].pressed);
                if (dashPressed && !this.lastGamepadDashPressed) {
                    if (this.state === GAME_STATE.PLAYING) {
                        this.tryDash();
                    } else if (this.state === GAME_STATE.PAUSED) {
                        this.resumeGame();
                    } else if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.DEAD) {
                        this.startGame();
                    }
                }
                this.lastGamepadDashPressed = dashPressed;

                // Gamepad Start Tuşu (button 9)
                const startPressed = gp.buttons[9] && gp.buttons[9].pressed;
                if (startPressed && !this.lastGamepadStartPressed) {
                    if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.DEAD) {
                        this.startGame();
                    } else if (this.state === GAME_STATE.PLAYING) {
                        this.pauseGame();
                    } else if (this.state === GAME_STATE.PAUSED) {
                        this.resumeGame();
                    }
                }
                this.lastGamepadStartPressed = startPressed;
            }
        }

        // 3. Sanal Joystick (analog, kendi hız ayarıyla)
        let speed = null;
        if (this.touch.isJoystick && this.touch.joystickActive) {
            const v = this.touch.getVector();
            inputX += v.x;
            inputY += v.y;
            speed = GAME_CONFIG.JOYSTICK.SPEED;
        }

        this.player.setMoveInput(inputX, inputY, speed);
    }

    /**
     * Oyunu seçili mod ile başlatır
     */
    startGame() {
        this.state = GAME_STATE.PLAYING;
        this.player.reset();
        this.bulletManager.clear();
        this.waveManager.setMode(this.currentMode);
        this.pickupManager.reset();
        this.effects.reset();
        this.ui.resetGameSession();
        this.ui.setMode(this.currentMode);

        this.elapsedMs = 0;
        this.touch.reset();

        this.effects.sound.playStart();
        this.effects.sound.startBGM();
    }

    restartGame() {
        this.startGame();
    }

    pauseGame() {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.state = GAME_STATE.PAUSED;
        this.touch.reset();
        this.effects.sound.stopBGM();
    }

    resumeGame() {
        if (this.state !== GAME_STATE.PAUSED) return;
        this.state = GAME_STATE.PLAYING;
        this.effects.sound.startBGM();
    }

    goToMenu() {
        this.state = GAME_STATE.MENU;
        this.bulletManager.clear();
        this.pickupManager.reset();
        this.waveManager.reset();
        this.effects.reset();
        this.effects.sound.stopBGM();
        this.touch.reset();
    }

    /**
     * Ölüm olayı
     */
    triggerDeath() {
        if (this.state !== GAME_STATE.PLAYING) return;

        this.state = GAME_STATE.DEAD;
        this.player.alive = false;
        this.deathTimestamp = performance.now();
        this.touch.reset();

        // Efektleri ateşle & BGM'yi sönümle
        this.effects.triggerDeath(this.player.x, this.player.y);
        Haptics.death();

        // Rekor kontrolü ve kayıt
        const isRecord = this.ui.checkAndSaveHighScore(this.elapsedMs, this.currentMode);
        if (isRecord) {
            setTimeout(() => {
                this.effects.sound.playRecord();
            }, 350);
        }
    }

    /**
     * Oyun mantığını delta time bazlı günceller
     * @param {number} dt Saniye cinsinden delta time
     */
    update(dt) {
        // Kontrolcüleri tara (WASD & Gamepad)
        this.pollKeyboardAndGamepad();

        // Duraklatıldığında dünya donar
        if (this.state === GAME_STATE.PAUSED) return;

        // Oyuncu mantığı (Dash, Afterimages, Klavye hareketi)
        this.player.update(dt);

        // Efektler ve Reaktif Izgara fiziği
        this.effects.update(dt, this.elapsedMs);

        if (this.state === GAME_STATE.PLAYING) {
            // Süre, kare süresinin birikimiyle hesaplanır: uygulama arka plandayken
            // (requestAnimationFrame durur) süre saymaz, skor şişirilemez.
            this.elapsedMs += dt * 1000;

            // Klavye/Gamepad hareketi sonrasında duvar kontrolü
            if (CollisionSystem.checkPlayerArena(this.player)) {
                this.triggerDeath();
                return;
            }

            // Izgaraya oyuncu hareketi etkisi
            this.effects.grid.applyForce(
                this.player.x,
                this.player.y,
                this.player.isDashing ? 70 : 10,
                this.player.isDashing ? 65 : 40
            );

            // Slow-mo güçlendirmesi çarpanı
            const speedFactor = this.pickupManager.getSpeedFactor();

            // Mermileri ve dalga üretimini güncelle
            this.waveManager.update(this.elapsedMs, dt * speedFactor, this.player);
            this.bulletManager.update(dt, speedFactor);

            // Güçlendirmeleri (Pickups) güncelle ve topla
            this.pickupManager.update(dt, this.player, this.effects, this.bulletManager);

            // Gelişmiş Çarpışma & Graze Sistemi
            const fatalBullet = CollisionSystem.processInteractions(
                this.player,
                this.bulletManager.getActiveBullets(),
                // onGraze
                (bullet) => {
                    this.effects.triggerGraze(this.player.x, this.player.y);
                    const now = performance.now();
                    if (now - this.lastGrazeHaptic > GAME_CONFIG.TOUCH.GRAZE_HAPTIC_GAP_MS) {
                        this.lastGrazeHaptic = now;
                        Haptics.graze();
                    }
                },
                // onShieldBreak
                (bullet) => {
                    this.effects.triggerShieldBreak(this.player.x, this.player.y);
                    this.effects.triggerBanner('KALKAN KIRILDI!', '#00ff88');
                    Haptics.shieldBreak();
                }
            );

            if (fatalBullet) {
                this.triggerDeath();
                return;
            }
        }
    }

    /**
     * Arenayı, varlıkları, efektleri ve arayüzü çizer
     */
    render() {
        const ctx = this.ctx;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        // Mantıksal arena uzayını fiziksel piksellere ölçekle
        ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);

        // Ekran sarsıntısı varsa canvas matrisine uygula
        this.effects.preRender(ctx);

        // Arka plan temizliği
        ctx.fillStyle = '#080811';
        ctx.fillRect(0, 0, w, h);

        // Reaktif Dinamik Yaylı Izgara
        this.effects.renderGrid(ctx);

        // Telegraf (Ön Uyarı Lazerleri)
        this.waveManager.renderTelegraphs(ctx);

        // Saha Güçlendirmeleri (Pickups)
        this.pickupManager.render(ctx);

        // Mermiler ve Oyuncu
        this.bulletManager.render(ctx);
        if (this.state !== GAME_STATE.MENU) {
            this.player.render(ctx);
        }

        // Post-render görsel efektler (Parçacıklar, Şok dalgaları, Flaş, Banner)
        this.effects.postRender(ctx);

        // UI Katmanı
        if (this.state === GAME_STATE.MENU) {
            this.ui.renderMenu(ctx, this.currentMode.id);
        } else if (this.state === GAME_STATE.PLAYING) {
            this.ui.renderHUD(ctx, this.elapsedMs, this.currentMode, this.player, this.pickupManager);
        } else if (this.state === GAME_STATE.PAUSED) {
            this.ui.renderHUD(ctx, this.elapsedMs, this.currentMode, this.player, this.pickupManager);
            this.ui.renderPaused(ctx);
        } else if (this.state === GAME_STATE.DEAD) {
            this.ui.renderDead(ctx, this.elapsedMs, this.currentMode, this.player);
        }

        // Arena sınır çerçevesi
        this.renderArenaBorder(ctx, w, h);

        // Dokunmatik kontrol overlay'i (joystick + DASH butonu)
        const showControls = this.ui.isTouch && this.state === GAME_STATE.PLAYING;
        this.touch.render(showControls, this.player.getDashReadyRatio());
    }

    /**
     * Arena sınırlarını parlayan çizgi ile belirler
     */
    renderArenaBorder(ctx, w, h) {
        ctx.save();
        ctx.strokeStyle = this.state === GAME_STATE.DEAD ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 255, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.restore();
    }
}
