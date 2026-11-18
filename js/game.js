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
import { THEME, setHighContrast } from './theme.js';
import { ScoreSystem } from './score.js';
import { Tutorial } from './tutorial.js';
import { Progress } from './progress.js';
import { Settings, SETTING_ROWS } from './settings.js';
import { SKINS, getSkin, drawMarshmallow } from './skins.js';
import { seedRandom, dateKey, dateLabel } from './rng.js';
import { GhostRecorder, loadGhost, saveGhost } from './ghost.js';
import { buildShareText, shareText } from './share.js';
import { t, setLang } from './i18n.js';

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

        // Skor, öğretici, ilerleme (kostümler) ve ayarlar
        this.score = new ScoreSystem();
        this.tutorial = new Tutorial();
        this.progress = new Progress();
        this.settings = new Settings();
        this.currentHint = null;
        this.lastUnlocked = [];
        this.ghostRecorder = new GhostRecorder();
        this.ghost = null;
        this.ghostPassed = false;
        this.ui.progress = this.progress;
        this.ui.settings = this.settings;
        this.ui.sound = this.effects.sound;
        this.ui.skinIndex = Math.max(0, SKINS.findIndex(s => s.id === this.progress.selected));
        this.player.skin = this.progress.skin;
        this.settings.onChange((v) => {
            this.effects.sound.setVolumes(v.musicVolume, v.sfxVolume);
            this.effects.motionEnabled = v.shake;
            setHighContrast(v.contrast);
            setLang(v.lang);
            this.applyDomText();
        });

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
                this.effects.triggerBossIncoming(this.waveManager.nextBossDef().TITLE);
            } else {
                this.effects.triggerPhase(phaseName);
            }
        };
        this.waveManager.onBossStageChange = (boss) => {
            this.effects.triggerBossStage(boss.x, boss.y, boss.stageName, boss.title);
        };
        this.waveManager.onBossRam = (boss) => {
            this.effects.triggerBossRam(boss.x, boss.y);
        };
        this.waveManager.onBossDefeated = (boss) => {
            this.score.onBossDefeat(boss.x, boss.y);
            const destroyed = this.bulletManager.destroyAll();
            this.effects.triggerBossDefeated(boss.x, boss.y, destroyed, boss.title);
        };

        this.touchControls = new TouchControls(() => {
            this.effects.initAudio();
            this.pollKeyboardAndGamepad();
            this.tryDash();
        });
        this.menuButton = document.getElementById('menuButton');
        this.menuButton.addEventListener('click', () => this.returnToMenu());
        this.shareButton = document.getElementById('shareButton');
        this.shareButton.addEventListener('click', () => this.shareResult());
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
                if (this.ui.settingsOpen) {
                    const action = this.ui.getSettingsAction(coords.x, coords.y);
                    if (action) {
                        this.ui.settingsRow = action.row;
                        this.activateSetting(action.row, action.dir);
                    }
                    return;
                }
                const action = this.ui.getMenuAction(coords.x, coords.y);
                if (!action || action.type === 'play') {
                    this.startGame();
                } else if (action.type === 'mode') {
                    this.selectMode(action.id);
                } else if (action.type === 'settings') {
                    this.openSettings();
                } else if (action.type === 'skinPrev' || action.type === 'skinNext') {
                    this.cycleSkin(action.type === 'skinNext' ? 1 : -1);
                }
            } else if (this.state === GAME_STATE.PAUSED) {
                this.resumeGame();
            } else if (this.state === GAME_STATE.DEAD) {
                if (this.deathScreenReady()) {
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

            // Ayarlar paneli açıkken tüm tuşlar panele gider
            if (this.state === GAME_STATE.MENU && this.ui.settingsOpen) {
                e.preventDefault();
                const rows = SETTING_ROWS.length;
                if (e.code === 'ArrowUp' || e.code === 'KeyW') this.ui.settingsRow = (this.ui.settingsRow + rows - 1) % rows;
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.ui.settingsRow = (this.ui.settingsRow + 1) % rows;
                else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.activateSetting(this.ui.settingsRow, -1, true);
                else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.activateSetting(this.ui.settingsRow, 1, true);
                else if (e.code === 'Enter' || e.code === 'Space') this.activateSetting(this.ui.settingsRow, 1);
                else if (e.code === 'Escape' || e.code === 'KeyO') this.ui.settingsOpen = false;
                return;
            }
            if (this.state === GAME_STATE.MENU) {
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.cycleSkin(-1); return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.cycleSkin(1); return; }
                if (e.code === 'KeyO') { this.openSettings(); return; }
            }

            // Space veya Enter
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                if (this.state === GAME_STATE.MENU) {
                    this.startGame();
                } else if (this.state === GAME_STATE.DEAD) {
                    if (this.deathScreenReady()) {
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
                this.effects.triggerBanner(isBgmOn ? t('banner.musicOn') : t('banner.musicOff'), THEME.LAVENDER);
            } else if (e.code === 'KeyN') {
                // 'N' tuşu: Ses efektlerini Aç / Kapat
                const isSfxOn = this.effects.sound.toggleSFX();
                this.effects.triggerBanner(isSfxOn ? t('banner.sfxOn') : t('banner.sfxOff'), THEME.LAVENDER);
            } else if (e.code === 'KeyC' && this.state === GAME_STATE.DEAD) {
                this.shareResult();
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

    selectMode(id) {
        this.currentMode = ModeRegistry.get(id);
        this.ui.setMode(this.currentMode);
        this.waveManager.setMode(this.currentMode);
        this.effects.sound.playPhase();
    }

    openSettings() {
        this.ui.settingsOpen = true;
        this.ui.settingsRow = 0;
        this.effects.sound.playPhase();
    }

    /**
     * Ayar satırını uygular
     * @param {number} row
     * @param {number} dir -1 / +1
     * @param {boolean} arrowsOnly Ok tuşları eylem satırlarını tetiklemesin
     */
    activateSetting(row, dir = 1, arrowsOnly = false) {
        const item = SETTING_ROWS[row];
        if (!item) return;
        if (item.type === 'action') {
            if (arrowsOnly) return;
            if (item.id === 'close') {
                this.ui.settingsOpen = false;
            } else if (item.id === 'tutorial') {
                this.tutorial.resetProgress();
                this.effects.triggerBanner(t('banner.tipsReset'), THEME.LAVENDER);
            }
        } else if (item.id === 'sfxVolume' && !this.effects.sound.enabled) {
            this.effects.sound.toggleSFX();
            this.effects.triggerBanner(t('banner.sfxOn'), THEME.LAVENDER);
        } else if (item.id === 'musicVolume' && !this.effects.sound.bgmEnabled) {
            this.effects.sound.toggleBGM();
            this.effects.triggerBanner(t('banner.musicOn'), THEME.LAVENDER);
        } else {
            this.settings.adjust(item.id, dir);
        }
        this.effects.sound.playGraze(null, 2);
    }

    /** Menüde kostümler arasında gezinir; açık olanı seçer */
    cycleSkin(dir) {
        const n = SKINS.length;
        this.ui.skinIndex = (this.ui.skinIndex + dir + n) % n;
        const skin = SKINS[this.ui.skinIndex];
        if (this.progress.select(skin.id)) {
            this.player.skin = this.progress.skin;
            this.effects.sound.playPickup();
        } else {
            this.effects.sound.playGraze(null, 0);
        }
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
                    } else if (this.state === GAME_STATE.MENU || (this.state === GAME_STATE.DEAD && this.deathScreenReady())) {
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
        this.effects.sound.bossMode = false;

        // Günlük modda tarih tohumu; diğerlerinde rastgele
        seedRandom(this.currentMode.getSeed());
        this.score.reset();
        this.tutorial.start(this.touchControls.touchDevice);
        this.currentHint = null;
        this.lastUnlocked = [];
        this.ui.settingsOpen = false;
        this.player.skin = this.progress.skin;

        // Hayalet: bu modun en iyi turu
        this.ghostRecorder.reset();
        this.ghost = this.settings.get('ghost') ? loadGhost(this.currentMode.storageKey) : null;
        this.ghostPassed = false;

        this.dashWasReady = true;
        this.effects.sound.playStart();
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

        // Rekorlar: süre ve skor ayrı tutulur; "yeni rekor" skoru gösterir
        this.ui.checkAndSaveHighScore(this.elapsedMs, this.currentMode);
        const isRecord = this.ui.checkAndSaveBestScore(this.score.total, this.currentMode);
        if (isRecord) {
            saveGhost(this.currentMode.storageKey, this.ghostRecorder, { score: this.score.total, skin: this.progress.selected });
        }

        // İstatistikler ve kostüm başarımları
        this.lastUnlocked = this.progress.recordRun({
            modeId: this.currentMode.id,
            timeMs: this.elapsedMs,
            graze: this.player.grazeCount,
            bestCombo: this.score.bestCombo,
            bossKills: this.waveManager.bossKills,
            bossesBeaten: this.waveManager.bossesBeaten,
            dateKey: dateKey()
        });

        if (isRecord || this.lastUnlocked.length) {
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
        const deadReady = this.state === GAME_STATE.DEAD && this.deathScreenReady();
        this.menuButton.hidden = !(deadReady || (this.state === GAME_STATE.PAUSED && this.resumeCountdown <= 0));
        this.shareButton.hidden = !deadReady;
        this.pauseButton.hidden = !(this.state === GAME_STATE.PLAYING && this.touchControls.touchDevice);

        // Müzik: menüde sakin tema, oyunda faz müziği, duraklatma/ölümde sessiz
        const sound = this.effects.sound;
        sound.setMusicMode(this.state === GAME_STATE.MENU ? 'menu' : this.state === GAME_STATE.PLAYING ? 'game' : 'none');
        sound.slowmo = this.state === GAME_STATE.PLAYING && this.pickupManager.isSlowmoActive();

        // Duraklatılmışken dünya donar; sadece devam geri sayımı işler
        if (this.state === GAME_STATE.PAUSED) {
            if (this.resumeCountdown > 0) {
                this.resumeCountdown -= dt * 1000;
                if (this.resumeCountdown <= 0) {
                    this.resumeCountdown = 0;
                    this.state = GAME_STATE.PLAYING;
                }
            }
            return;
        }

        // Oyuncu mantığı (Dash, Afterimages, Klavye hareketi)
        if (this.state === GAME_STATE.PLAYING) {
            this.player.update(dt);
            // Dash yeniden dolunca küçük çan
            const dashReady = this.player.getDashReadyRatio() >= 1;
            if (dashReady && !this.dashWasReady) sound.playDashReady();
            this.dashWasReady = dashReady;
        }

        // Efektler ve Reaktif Izgara fiziği
        this.effects.update(dt, this.elapsedMs);

        if (this.state === GAME_STATE.PLAYING) {
            this.ghostRecorder.sample(this.elapsedMs, this.player.x, this.player.y, GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
            this.elapsedMs += dt * 1000;
            this.score.update(dt * 1000);
            if (this.ghost && !this.ghostPassed && this.elapsedMs > this.ghost.durationMs && this.ghost.durationMs > 3000) {
                this.ghostPassed = true;
                this.effects.triggerBanner(t('banner.ghostPassed'), THEME.LAVENDER);
            }
            this.currentHint = this.tutorial.update(this.elapsedMs, this.waveManager.isBossPhase(this.elapsedMs));

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

            // Müzik boss sırasında minör ve hızlı çalar
            this.effects.sound.bossMode = this.waveManager.isBossPhase(this.elapsedMs);

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
                    const g = this.score.onGraze(this.player.x, this.player.y);
                    this.effects.triggerGraze(this.player.x, this.player.y, g.combo - 1);
                    const boss = this.waveManager.boss;
                    if (boss && boss.alive) {
                        boss.onGraze();
                        sound.playBossHit(boss.x, boss.hpRatio);
                    }
                },
                // onShieldBreak
                (bullet) => {
                    this.effects.triggerShieldBreak(this.player.x, this.player.y);
                    this.effects.triggerBanner(t('banner.shieldBroken'), THEME.PURPLE);
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
                    this.effects.triggerBanner(t('banner.shieldBroken'), THEME.PURPLE);
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
        ctx.fillStyle = THEME.BG;
        ctx.fillRect(0, 0, w, h);

        // Reaktif Dinamik Yaylı Izgara
        this.effects.renderGrid(ctx);

        // Telegraf (Ön Uyarı Lazerleri)
        this.waveManager.renderTelegraphs(ctx);

        // Saha Güçlendirmeleri (Pickups)
        this.pickupManager.render(ctx);

        // Boss
        if (this.state !== GAME_STATE.MENU) this.waveManager.renderBoss(ctx);

        // Hayalet (en iyi tur), mermilerin altında
        if (this.ghost && (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED)) {
            this.renderGhost(ctx, w, h);
        }

        // Mermiler ve Oyuncu
        this.bulletManager.render(ctx);
        if (this.state !== GAME_STATE.MENU) {
            this.player.render(ctx);
        }
        if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED) {
            this.ui.renderComboAndPopups(ctx, this.player, this.score);
        }

        // Post-render görsel efektler (Parçacıklar, Şok dalgaları, Flaş, Banner)
        this.effects.postRender(ctx);

        // UI Katmanı
        if (this.state === GAME_STATE.MENU) {
            this.ui.renderMenu(ctx, this.currentMode.id);
        } else if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED) {
            this.renderEdgeWarning(ctx, w, h);
            this.ui.renderHUD(ctx, this.elapsedMs, this.currentMode, this.player, this.pickupManager, this.score);
            if (this.state === GAME_STATE.PLAYING) this.ui.renderHint(ctx, this.currentHint, this.player);
            if (this.waveManager.boss) this.waveManager.boss.renderHealthBar(ctx, this.ui.safe.top);
            if (this.state === GAME_STATE.PAUSED) {
                this.ui.renderPaused(ctx, this.resumeCountdown, this.touchControls.touchDevice);
            }
        } else if (this.state === GAME_STATE.DEAD) {
            this.ui.renderDead(ctx, this.elapsedMs, this.currentMode, this.player, {
                reveal: this.deathReveal(),
                score: this.score,
                waves: this.waveManager,
                unlocked: this.lastUnlocked
            });
        }

        // Arena sınır çerçevesi
        this.renderArenaBorder(ctx, w, h);
    }

    /** Ölüm patlaması bitti mi? (yeniden başlatma ve butonlar bundan sonra) */
    deathScreenReady() {
        return performance.now() - this.deathTimestamp >= GAME_CONFIG.EFFECTS.DEATH_REVEAL;
    }

    /** Ölüm ekranının belirme oranı (0 = sadece patlama, 1 = tam ekran) */
    deathReveal() {
        const age = performance.now() - this.deathTimestamp - GAME_CONFIG.EFFECTS.DEATH_REVEAL;
        return Math.max(0, Math.min(1, age / GAME_CONFIG.EFFECTS.DEATH_FADE));
    }

    /** HTML butonları ve erişilebilirlik etiketlerini seçili dile çevirir */
    applyDomText() {
        if (typeof document === 'undefined') return;
        document.documentElement.lang = this.settings.get('lang');
        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const aria = (id, text) => { const el = document.getElementById(id); if (el) el.setAttribute('aria-label', text); };
        set('menuButton', t('dom.menu'));
        set('shareButton', t('dom.share'));
        set('rotateHint', t('dom.rotate'));
        aria('pauseButton', t('dom.pause'));
        aria('joystick', t('dom.joystick'));
        aria('gameCanvas', t('dom.canvas'));
    }

    renderGhost(ctx, w, h) {
        const pos = this.ghost.positionAt(this.elapsedMs, w, h);
        if (!pos) return;
        ctx.save();
        ctx.globalAlpha = 0.32;
        drawMarshmallow(ctx, pos.x, pos.y, this.player.radius * 1.9, getSkin(this.ghost.skin));
        ctx.globalAlpha = 0.6;
        ctx.font = '700 9px "Fredoka", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(t('hud.ghost'), pos.x, pos.y - 16);
        ctx.restore();
    }

    /** Ölüm ekranından sonucu paylaşır / kopyalar */
    async shareResult() {
        if (this.state !== GAME_STATE.DEAD) return;
        const mode = this.currentMode;
        const isWeb = location.protocol.startsWith('http') && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
        const text = buildShareText({
            modeLabel: mode.label,
            dateText: mode.id === 'daily' ? dateLabel() : '',
            score: this.score.total,
            timeText: UIManager.formatTime(this.elapsedMs),
            timeMs: this.elapsedMs,
            graze: this.player.grazeCount,
            bestCombo: this.score.bestCombo,
            bossKills: this.waveManager.bossKills,
            url: isWeb ? location.origin + location.pathname : ''
        });
        const result = await shareText(text, this.touchControls.touchDevice);
        if (result === 'copied') this.effects.triggerBanner(t('banner.copied'), THEME.PURPLE);
        else if (result === 'failed') this.effects.triggerBanner(t('banner.copyFailed'), THEME.PINK);
    }

    /**
     * Oyuncu kenara yaklaştıkça o kenarda nabız gibi atan pembe uyarı
     */
    renderEdgeWarning(ctx, w, h) {
        const p = this.player;
        if (!p.alive) return;
        const range = 60;
        const band = 50;
        const pulse = 0.75 + Math.sin(performance.now() * 0.012) * 0.25;
        const edges = [
            [p.x - p.radius, [0, 0, band, 0], [0, 0, band, h]],
            [w - p.x - p.radius, [w, 0, w - band, 0], [w - band, 0, band, h]],
            [p.y - p.radius, [0, 0, 0, band], [0, 0, w, band]],
            [h - p.y - p.radius, [0, h, 0, h - band], [0, h - band, w, band]]
        ];
        ctx.save();
        for (const [dist, g, rect] of edges) {
            if (dist >= range) continue;
            const k = Math.max(0, 1 - dist / range) * pulse;
            const grad = ctx.createLinearGradient(g[0], g[1], g[2], g[3]);
            grad.addColorStop(0, `rgba(240, 70, 143, ${0.6 * k})`);
            grad.addColorStop(1, 'rgba(240, 70, 143, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
        }
        ctx.restore();
    }

    /**
     * Arena sınırlarını parlayan çizgi ile belirler
     */
    renderArenaBorder(ctx, w, h) {
        ctx.save();
        ctx.strokeStyle = this.state === GAME_STATE.DEAD ? THEME.PINK : THEME.LAVENDER;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(3, 3, w - 6, h - 6, 18);
        ctx.stroke();
        ctx.restore();
    }
}
