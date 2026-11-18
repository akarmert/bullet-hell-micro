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
import { TouchControls } from './touchControls.js';
import { resizeArena } from './arena.js';

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

        resizeArena(this);

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
        this.elapsedMs = 0;          // Simülasyon süresi: sadece oynanırken dt ile birikir
        this.resumeCountdown = 0;    // Devam ederken geri sayım (ms)
        this.deathTimestamp = 0;

        // Klavye tuş durumu haritası
        this.keys = {};

        // Gamepad son tetiklenme durumu (tek seferlik basış için)
        this.lastGamepadDashPressed = false;
        this.lastGamepadStartPressed = false;

        // Faz değişimi geri bildirimi
        this.waveManager.onPhaseChange = (phaseName) => {
            if (this.state !== GAME_STATE.PLAYING) return;
            if (phaseName === GAME_CONFIG.BOSS.NAME) {
                this.effects.triggerBossIncoming();
            } else {
                this.effects.triggerPhase(phaseName);
            }
        };
        this.waveManager.onBossStageChange = (boss) => {
            this.effects.triggerBossStage(boss.x, boss.y, boss.stageName);
        };
        this.waveManager.onBossDefeated = (boss) => {
            const destroyed = this.bulletManager.destroyAll();
            this.effects.triggerBossDefeated(boss.x, boss.y, destroyed);
        };

        this.touchControls = new TouchControls(() => {
            this.effects.initAudio();
            this.pollKeyboardAndGamepad();
            this.tryDash();
        });
        this.menuButton = document.getElementById('menuButton');
        this.menuButton.addEventListener('click', () => this.returnToMenu());
        this.pauseButton = document.getElementById('pauseButton');
        this.pauseButton.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pauseGame(); });
        this.initInputListeners();
        resizeArena(this);
        new ResizeObserver(() => resizeArena(this)).observe(this.canvas);
        // Odak kaybında oyunu otomatik duraklat (sekme değişimi, bildirim, uygulama değişimi)
        window.addEventListener('blur', () => { this.keys = {}; this.pauseGame(); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseGame(); });
    }

    /**
     * Fare, dokunmatik, klavye ve contextmenu dinleyicilerini kurar
     */
    initInputListeners() {
        // Sağ tık bağlam menüsünü engelle (Sağ tık Dash için kullanılır)
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // CSS pikselinden mantıksal arena koordinatına dönüşüm
        const getCanvasCoords = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return { x: 300, y: 300 };
            const scaleX = GAME_CONFIG.CANVAS.WIDTH / rect.width;
            const scaleY = GAME_CONFIG.CANVAS.HEIGHT / rect.height;
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };

        // Fare Hareketi (1:1 Hassasiyet)
        const handlePointerMove = (clientX, clientY) => {
            const coords = getCanvasCoords(clientX, clientY);

            if (this.state === GAME_STATE.PLAYING) {
                this.player.moveTo(coords.x, coords.y);
                this.effects.grid.applyForce(coords.x, coords.y, 8, 35);

                // Hareket anında anlık sınır kontrolü
                if (CollisionSystem.checkPlayerArena(this.player)) {
                    this.triggerDeath();
                }
            }
        };

        this.canvas.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse' || this.touchControls.pointers.size) return;
            handlePointerMove(e.clientX, e.clientY);
        });

        // Tıklama Eylemleri (Sol Tık & Sağ Tık)
        this.canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.effects.initAudio();

            // Sağ Tık -> Oyun esnasında Dash tetikler
            if (e.button === 2) {
                this.tryDash();
                return;
            }

            const coords = getCanvasCoords(e.clientX, e.clientY);

            if (this.state === GAME_STATE.MENU) {
                // Menüde buton kontrolü
                const clickedModeId = this.ui.getClickedMode(coords.x, coords.y);
                if (clickedModeId) {
                    this.currentMode = ModeRegistry.get(clickedModeId);
                    this.ui.setMode(this.currentMode);
                    this.waveManager.setMode(this.currentMode);
                    this.effects.sound.playPhase();
                } else {
                    this.startGame();
                }
            } else if (this.state === GAME_STATE.PAUSED) {
                this.resumeGame();
            } else if (this.state === GAME_STATE.DEAD) {
                if (performance.now() - this.deathTimestamp > 80) {
                    this.restartGame();
                }
            }
        });

        // Klavye Basışları
        window.addEventListener('keydown', (e) => {
            this.effects.initAudio();
            this.keys[e.code] = true;

            // Duraklatma: P / ESC oynarken durdurur, duraklatılmışken devam ettirir
            if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
                if (this.state === GAME_STATE.PLAYING) { e.preventDefault(); this.pauseGame(); return; }
                if (this.state === GAME_STATE.PAUSED) { e.preventDefault(); this.resumeGame(); return; }
            }
            if (this.state === GAME_STATE.PAUSED) {
                if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.resumeGame(); }
                else if (e.code === 'KeyM') this.returnToMenu();
                return;
            }

            // Space veya Enter
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                if (this.state === GAME_STATE.MENU) {
                    this.startGame();
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
            } else if (e.code === 'KeyM' || e.code === 'Escape') {
                // Mod değiştirmek veya ana menüye dönmek için
                if (this.state === GAME_STATE.DEAD) {
                    this.returnToMenu();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    /**
     * Dash (I-Frame) eylemini dener
     */
    tryDash() {
        if (this.state !== GAME_STATE.PLAYING) return;
        const success = this.player.triggerDash();
        if (success) {
            this.effects.triggerDash(this.player.x, this.player.y);
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
                    if (this.state === GAME_STATE.PLAYING) {
                        this.pauseGame();
                    } else if (this.state === GAME_STATE.PAUSED) {
                        this.resumeGame();
                    } else if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.DEAD) {
                        this.startGame();
                    }
                }
                this.lastGamepadStartPressed = startPressed;
            }
        }

        inputX += this.touchControls.input.x;
        inputY += this.touchControls.input.y;
        this.player.setMoveInput(inputX, inputY);
    }

    /**
     * Oyunu seçili mod ile başlatır
     */
    /**
     * Oyunu dondurur; simülasyon süresi ilerlemez, müzik durur
     */
    pauseGame() {
        if (this.state === GAME_STATE.PAUSED) { this.resumeCountdown = 0; return; }
        if (this.state !== GAME_STATE.PLAYING) return;
        this.state = GAME_STATE.PAUSED;
        this.resumeCountdown = 0;
        this.keys = {};
        this.touchControls.reset();
        this.player.setMoveInput(0, 0);
        this.effects.sound.stopBGM();
    }

    /**
     * Kısa bir geri sayımla oyuna döner (ani ölümleri önlemek için)
     */
    resumeGame() {
        if (this.state !== GAME_STATE.PAUSED || this.resumeCountdown > 0) return;
        this.resumeCountdown = GAME_CONFIG.PAUSE.RESUME_COUNTDOWN;
    }

    returnToMenu() {
        this.state = GAME_STATE.MENU;
        this.resumeCountdown = 0;
        this.touchControls.reset();
        this.bulletManager.clear();
        this.pickupManager.reset();
        this.effects.reset();
        this.effects.sound.stopBGM();
    }

    startGame() {
        this.touchControls.reset();
        this.state = GAME_STATE.PLAYING;
        this.player.reset();
        this.bulletManager.clear();
        this.waveManager.setMode(this.currentMode);
        this.pickupManager.reset();
        this.effects.reset();
        this.ui.resetGameSession();
        this.ui.setMode(this.currentMode);

        this.elapsedMs = 0;
        this.resumeCountdown = 0;

        this.effects.sound.playStart();
        this.effects.sound.startBGM();
    }

    restartGame() {
        this.startGame();
    }

    /**
     * Ölüm olayı
     */
    triggerDeath() {
        if (this.state !== GAME_STATE.PLAYING) return;

        this.state = GAME_STATE.DEAD;
        this.touchControls.reset();
        this.player.setMoveInput(0, 0);
        this.player.alive = false;
        this.deathTimestamp = performance.now();

        // Efektleri ateşle & BGM'yi sönümle
        this.effects.triggerDeath(this.player.x, this.player.y);

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

        this.touchControls.update(this.state === GAME_STATE.PLAYING, this.player);
        this.menuButton.hidden = !(this.state === GAME_STATE.DEAD || (this.state === GAME_STATE.PAUSED && this.resumeCountdown <= 0));
        this.pauseButton.hidden = !(this.state === GAME_STATE.PLAYING && this.touchControls.touchDevice);

        // Duraklatılmışken dünya donar; sadece devam geri sayımı işler
        if (this.state === GAME_STATE.PAUSED) {
            if (this.resumeCountdown > 0) {
                this.resumeCountdown -= dt * 1000;
                if (this.resumeCountdown <= 0) {
                    this.resumeCountdown = 0;
                    this.state = GAME_STATE.PLAYING;
                    this.effects.sound.startBGM();
                }
            }
            return;
        }

        // Oyuncu mantığı (Dash, Afterimages, Klavye hareketi)
        if (this.state === GAME_STATE.PLAYING) this.player.update(dt);

        // Efektler ve Reaktif Izgara fiziği
        this.effects.update(dt, this.elapsedMs);

        if (this.state === GAME_STATE.PLAYING) {
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
                    const boss = this.waveManager.boss;
                    if (boss && boss.alive) boss.onGraze();
                },
                // onShieldBreak
                (bullet) => {
                    this.effects.triggerShieldBreak(this.player.x, this.player.y);
                    this.effects.triggerBanner('KALKAN KIRILDI!', '#00ff88');
                }
            );

            if (fatalBullet) {
                this.triggerDeath();
                return;
            }

            // Boss gövdesine temas
            const boss = this.waveManager.boss;
            if (boss) {
                const contact = boss.resolveBodyContact(this.player);
                if (contact === 'shield') {
                    this.effects.triggerShieldBreak(this.player.x, this.player.y);
                    this.effects.triggerBanner('KALKAN KIRILDI!', '#00ff88');
                } else if (contact === 'fatal') {
                    this.triggerDeath();
                    return;
                }
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

        // Boss
        if (this.state !== GAME_STATE.MENU) this.waveManager.renderBoss(ctx);

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
        } else if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED) {
            this.ui.renderHUD(ctx, this.elapsedMs, this.currentMode, this.player, this.pickupManager);
            if (this.waveManager.boss) this.waveManager.boss.renderHealthBar(ctx, this.ui.safe.top);
            if (this.state === GAME_STATE.PAUSED) {
                this.ui.renderPaused(ctx, this.resumeCountdown, this.touchControls.touchDevice);
            }
        } else if (this.state === GAME_STATE.DEAD) {
            this.ui.renderDead(ctx, this.elapsedMs, this.currentMode, this.player, this.waveManager);
        }

        // Arena sınır çerçevesi
        this.renderArenaBorder(ctx, w, h);
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
