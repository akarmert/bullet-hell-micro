// ============================================================
// effects.js — Görsel Efektler, Reaktif Izgara ve Prosedürel Web Audio BGM
// Screen shake, parçacık patlamaları, esnek yaylı ızgara ve synth müzik
// ============================================================

import { GAME_CONFIG } from './config.js';

/**
 * 100% Sıfır Bağımlılıklı Web Audio API Ses ve Dinamik BGM Sistemi
 */
class SoundSystem {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.bgmEnabled = true;

        // BGM Sentezleyici Durumu
        this.bgmPlaying = false;
        this.bgmStep = 0;
        this.bgmTimer = null;
        this.bgmFilter = null;
        this.bgmGain = null;
    }

    /**
     * Kullanıcının ilk etkileşiminde AudioContext'i güvenle başlatır
     */
    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();

                // BGM Ana Filtresi ve Kazanç Hattı
                this.bgmFilter = this.ctx.createBiquadFilter();
                this.bgmFilter.type = 'lowpass';
                this.bgmFilter.frequency.setValueAtTime(1000, this.ctx.currentTime);

                this.bgmGain = this.ctx.createGain();
                this.bgmGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

                this.bgmFilter.connect(this.bgmGain);
                this.bgmGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ------------------------------------------------------------
    // PROSEDÜREL DİNAMİK BGM (Cyberpunk Retro Synth Sequencer)
    // ------------------------------------------------------------

    startBGM() {
        if (!this.ctx || !this.bgmEnabled || this.bgmPlaying) return;
        this.bgmPlaying = true;
        this.bgmStep = 0;

        if (this.bgmFilter) {
            this.bgmFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
        }

        const stepTime = 115; // ~130 BPM (16th note aralığı)

        const scheduleTick = () => {
            if (!this.bgmPlaying) return;
            this.tickBGM();
            this.bgmTimer = setTimeout(scheduleTick, stepTime);
        };

        scheduleTick();
    }

    tickBGM() {
        if (!this.ctx || !this.bgmPlaying || !this.enabled || !this.bgmEnabled) return;

        const now = this.ctx.currentTime;
        const step = this.bgmStep % 16;
        this.bgmStep++;

        // D-Minor Pentatonik Arpej Nota Havuzu (Hz)
        const arpNotes = [293.66, 349.23, 440.00, 523.25, 587.33, 523.25, 440.00, 392.00];

        // 1. Kick/Sub Bas: Adımlar 0, 4, 8, 12 (Düz 4/4 vuruş)
        if (step % 4 === 0) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(this.bgmFilter);

            osc.start(now);
            osc.stop(now + 0.12);
        }

        // 2. Synth Arpej Hattı (16'lık adımlar)
        if (step % 2 === 0 || this.bgmStep > 16) {
            const noteIdx = (step + Math.floor(this.bgmStep / 16)) % arpNotes.length;
            const freq = arpNotes[noteIdx];

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            osc.connect(gain);
            gain.connect(this.bgmFilter);

            osc.start(now);
            osc.stop(now + 0.08);
        }
    }

    /**
     * Süreye göre müziğin tansiyonunu ve filtre frekansını açar
     */
    updateBGMTension(elapsedMs) {
        if (!this.ctx || !this.bgmFilter) return;
        const now = this.ctx.currentTime;

        let targetCutoff = 800;
        if (elapsedMs < 10000) {
            targetCutoff = 800 + (elapsedMs / 10000) * 400; // 800 -> 1200
        } else if (elapsedMs < 20000) {
            targetCutoff = 1200 + ((elapsedMs - 10000) / 10000) * 600; // 1200 -> 1800
        } else if (elapsedMs < 30000) {
            targetCutoff = 1800 + ((elapsedMs - 20000) / 10000) * 800; // 1800 -> 2600
        } else {
            targetCutoff = 2800;
        }

        this.bgmFilter.frequency.setTargetAtTime(targetCutoff, now, 0.2);
    }

    stopBGM() {
        this.bgmPlaying = false;
        if (this.bgmTimer) {
            clearTimeout(this.bgmTimer);
            this.bgmTimer = null;
        }
    }

    toggleBGM() {
        this.bgmEnabled = !this.bgmEnabled;
        if (!this.bgmEnabled) {
            this.stopBGM();
        }
        return this.bgmEnabled;
    }

    // ------------------------------------------------------------
    // OYUN İÇİ SES EFEKTLERİ
    // ------------------------------------------------------------

    playStart() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
    }

    playDeath() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;

        // BGM'yi dramatik alçak geçiren filtreyle sönümle
        if (this.bgmFilter) {
            this.bgmFilter.frequency.setValueAtTime(400, now);
            this.bgmFilter.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        }
        this.stopBGM();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.32);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 1.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    /**
     * Graze (Teğet geçme) geri bildirim tık sesi (hafif, tatmin edici)
     */
    playGraze() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(2200, now + 0.04);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.045);
    }

    /**
     * Dash (I-Frame) hava yarılma / sıyrılma sesi
     */
    playDash() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.16);
    }

    /**
     * Kalkan kırılma / darbe emme sesi
     */
    playShieldBreak() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 1.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.24);
    }

    /**
     * Güçlendirme (Pick-up) toplama sesi (parlak arpej)
     */
    playPickup() {
        if (!this.ctx || !this.enabled) return;
        const notes = [440, 659.25, 880]; // A4, E5, A5
        const now = this.ctx.currentTime;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + idx * 0.05;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 0.8, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.12);
        });
    }

    playRecord() {
        if (!this.ctx || !this.enabled) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const now = this.ctx.currentTime;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + idx * 0.08;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.2);
        });
    }

    playPhase() {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);

        gain.gain.setValueAtTime(GAME_CONFIG.AUDIO.MASTER_VOLUME * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    }
}

/**
 * Patlama ve Efekt Parçacığı
 */
class Particle {
    constructor(x, y, color, speedScale = 1.0, lifeScale = 1.0) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = (GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MIN +
            Math.random() * (GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MAX - GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MIN)) * speedScale;

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = (2 + Math.random() * 3) * Math.min(speedScale, 1.5);
        this.maxLife = GAME_CONFIG.EFFECTS.PARTICLE_LIFETIME * lifeScale;
        this.life = this.maxLife;
    }

    update(dt) {
        this.life -= dt * 1000;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.95; // Sürtünme
        this.vy *= 0.95;
    }

    render(ctx) {
        if (this.life <= 0) return;
        const alpha = Math.max(0, this.life / this.maxLife);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
    }
}

/**
 * Reaktif / Esnek Yaylı Arena Izgarası (Verlet / Spring Grid)
 * Oyuncu, dash ve patlamalarda fiziksel olarak esner
 */
class SpringGrid {
    constructor(width, height, step = 50) {
        this.width = width;
        this.height = height;
        this.step = step;
        // ceil: arena genişliği adımın katı değilse (yatay ekran) ızgara kenara kadar uzansın
        this.cols = Math.ceil(width / step) + 1;
        this.rows = Math.ceil(height / step) + 1;

        this.points = [];
        for (let c = 0; c < this.cols; c++) {
            this.points[c] = [];
            for (let r = 0; r < this.rows; r++) {
                const bx = c * step;
                const by = r * step;
                this.points[c][r] = {
                    x: bx,
                    y: by,
                    baseX: bx,
                    baseY: by,
                    vx: 0,
                    vy: 0
                };
            }
        }
    }

    /**
     * Izgara üzerine belirli bir noktadan dairesel kuvvet uygular
     */
    applyForce(cx, cy, force, radius = 90) {
        const radSq = radius * radius;
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                const dx = pt.x - cx;
                const dy = pt.y - cy;
                const distSq = dx * dx + dy * dy;

                if (distSq < radSq && distSq > 1) {
                    const dist = Math.sqrt(distSq);
                    const factor = (1 - dist / radius) * force;
                    pt.vx += (dx / dist) * factor;
                    pt.vy += (dy / dist) * factor;
                }
            }
        }
    }

    /**
     * Yay fiziği denklemleri ile noktaları denge konumuna çeker
     */
    update(dt) {
        const springK = 38; // Yay sertliği
        const damping = 0.91; // Sönüm katsayısı

        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];

                const ax = (pt.baseX - pt.x) * springK;
                const ay = (pt.baseY - pt.y) * springK;

                pt.vx = (pt.vx + ax * dt) * damping;
                pt.vy = (pt.vy + ay * dt) * damping;

                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
            }
        }
    }

    /**
     * Esnemiş ızgara çizgilerini çizer
     */
    render(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.04)';
        ctx.lineWidth = 1;

        // Yatay çizgiler
        for (let r = 0; r < this.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(this.points[0][r].x, this.points[0][r].y);
            for (let c = 1; c < this.cols; c++) {
                ctx.lineTo(this.points[c][r].x, this.points[c][r].y);
            }
            ctx.stroke();
        }

        // Dikey çizgiler
        for (let c = 0; c < this.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(this.points[c][0].x, this.points[c][0].y);
            for (let r = 1; r < this.rows; r++) {
                ctx.lineTo(this.points[c][r].x, this.points[c][r].y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    reset() {
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                pt.x = pt.baseX;
                pt.y = pt.baseY;
                pt.vx = 0;
                pt.vy = 0;
            }
        }
    }
}

export class EffectsManager {
    constructor() {
        this.sound = new SoundSystem();
        this.grid = new SpringGrid(GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT, 50);
        this.particles = [];
        
        // Screen shake değişkenleri
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        this.shakeX = 0;
        this.shakeY = 0;

        // Flash efekti
        this.flashAlpha = 0;

        // Bildirim metin banner'ı
        this.bannerText = '';
        this.bannerColor = '#ffffff';
        this.bannerTimer = 0;

        // EMP Şok Dalgası Halka Efekti
        this.shockwaves = [];
    }

    initAudio() {
        this.sound.init();
    }

    /**
     * Arena boyutu değiştiğinde (ekran döndürme) reaktif ızgarayı yeniden kurar
     */
    resizeArena(width, height) {
        this.grid = new SpringGrid(width, height, 50);
    }

    /**
     * Oyuncu öldüğünde patlama, sarsıntı ve ses efektini tetikler
     */
    triggerDeath(x, y) {
        this.shakeTimer = GAME_CONFIG.EFFECTS.SHAKE_DURATION;
        this.shakeIntensity = GAME_CONFIG.EFFECTS.SHAKE_INTENSITY;
        this.flashAlpha = 0.45;

        this.particles = [];
        const count = GAME_CONFIG.EFFECTS.PARTICLE_COUNT;
        const colors = ['#00ffff', '#ffffff', '#ff0055', '#ffea00'];

        for (let i = 0; i < count; i++) {
            const color = colors[i % colors.length];
            this.particles.push(new Particle(x, y, color));
        }

        this.grid.applyForce(x, y, 220, 180);
        this.sound.playDeath();
    }

    /**
     * Faz değişimini bildirir
     */
    triggerPhase(phaseName) {
        this.triggerBanner(`FAZ: ${phaseName}`, '#00ffff');
        this.sound.playPhase();
    }

    /**
     * Genel amaçlı ekran üstü neon bildirim
     */
    triggerBanner(text, color = '#ffffff') {
        this.bannerText = text;
        this.bannerColor = color;
        this.bannerTimer = 1600;
    }

    /**
     * Graze (teğet geçme) anında minik sarı kıvılcım parçacığı
     */
    triggerGraze(x, y) {
        this.sound.playGraze();
        const colors = ['#ffe600', '#ffffff'];
        for (let i = 0; i < 3; i++) {
            this.particles.push(new Particle(x, y, colors[i % 2], 0.4, 0.4));
        }
        this.grid.applyForce(x, y, 20, 45);
    }

    /**
     * Dash anında beyaz hız parçacıkları ve ızgara itmesi
     */
    triggerDash(x, y) {
        this.sound.playDash();
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(x, y, '#ffffff', 0.6, 0.5));
        }
        this.grid.applyForce(x, y, 120, 100);
    }

    /**
     * Kalkan darbeyi emip kırıldığında yeşil parça patlaması
     */
    triggerShieldBreak(x, y) {
        this.sound.playShieldBreak();
        this.shakeTimer = 180;
        this.shakeIntensity = 8;
        this.flashAlpha = 0.25;

        for (let i = 0; i < 16; i++) {
            this.particles.push(new Particle(x, y, '#00ff88', 0.9, 0.8));
        }
        this.grid.applyForce(x, y, 160, 130);
    }

    /**
     * Güçlendirme alındığında renkli ışıma
     */
    triggerPickupEffect(x, y, color) {
        for (let i = 0; i < 14; i++) {
            this.particles.push(new Particle(x, y, color, 0.7, 0.6));
        }
        this.grid.applyForce(x, y, 80, 80);
    }

    /**
     * EMP patlaması: Ekranı temizleyen şok dalgası ve mermi parçacıkları
     */
    triggerEMP(x, y, destroyedBullets) {
        this.sound.playShieldBreak();
        this.shakeTimer = 250;
        this.shakeIntensity = 10;
        this.flashAlpha = 0.35;

        this.shockwaves.push({
            x,
            y,
            radius: 10,
            maxRadius: 450,
            color: '#ff00aa',
            alpha: 1.0
        });

        // Yok edilen her merminin yerinde minik patlama
        for (let i = 0; i < destroyedBullets.length; i++) {
            const b = destroyedBullets[i];
            for (let k = 0; k < 3; k++) {
                this.particles.push(new Particle(b.x, b.y, b.color, 0.5, 0.5));
            }
        }

        this.grid.applyForce(x, y, 280, 250);
    }

    /**
     * Tüm efektleri günceller
     * @param {number} dt Delta time (saniye)
     * @param {number} elapsedMs Oyun süresi (BGM gerilimi için)
     */
    update(dt, elapsedMs = 0) {
        const dtMs = dt * 1000;

        // Reaktif ızgara fiziği
        this.grid.update(dt);

        // BGM Filtresi gerilim güncellemesi
        if (this.sound.bgmPlaying) {
            this.sound.updateBGMTension(elapsedMs);
        }

        // Screen shake sönümleme
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dtMs;
            const progress = this.shakeTimer / GAME_CONFIG.EFFECTS.SHAKE_DURATION;
            const currentMag = this.shakeIntensity * Math.max(0, progress);
            this.shakeX = (Math.random() * 2 - 1) * currentMag;
            this.shakeY = (Math.random() * 2 - 1) * currentMag;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        // Flash sönümleme
        if (this.flashAlpha > 0) {
            this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
        }

        // Banner sönümleme
        if (this.bannerTimer > 0) {
            this.bannerTimer = Math.max(0, this.bannerTimer - dtMs);
        }

        // Şok dalgası halkaları
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += dt * 650;
            sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
            if (sw.radius >= sw.maxRadius) {
                this.shockwaves.splice(i, 1);
            }
        }

        // Parçacık güncellemesi
        let activeCount = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.update(dt);
            if (p.life > 0) {
                this.particles[activeCount++] = p;
            }
        }
        this.particles.length = activeCount;
    }

    /**
     * Çizim başlamadan önce canvas'a sarsıntı ofsetini uygular
     */
    preRender(ctx) {
        ctx.save();
        if (this.shakeX !== 0 || this.shakeY !== 0) {
            ctx.translate(this.shakeX, this.shakeY);
        }
    }

    /**
     * Reaktif ızgarayı çizer
     */
    renderGrid(ctx) {
        this.grid.render(ctx);
    }

    /**
     * Çizim bittikten sonra parçacıkları, şok dalgalarını, flaşı ve banner'ı çizer
     */
    postRender(ctx) {
        // Şok dalgaları
        for (let i = 0; i < this.shockwaves.length; i++) {
            const sw = this.shockwaves[i];
            ctx.save();
            ctx.globalAlpha = sw.alpha;
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = sw.color;
            ctx.shadowBlur = 14;
            ctx.stroke();
            ctx.restore();
        }

        // Parçacıklar
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].render(ctx);
        }

        // Flash efekti
        if (this.flashAlpha > 0.01) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
            ctx.fillRect(0, 0, GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
            ctx.restore();
        }

        // Bildirim banner'ı
        if (this.bannerTimer > 0) {
            ctx.save();
            const alpha = Math.min(1, this.bannerTimer / 350);
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 16px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowColor = this.bannerColor;
            ctx.shadowBlur = 14;
            ctx.fillText(this.bannerText, GAME_CONFIG.CANVAS.WIDTH / 2, 95);
            ctx.restore();
        }

        ctx.restore(); // preRender'daki ctx.save'i kapatır
    }

    /**
     * Yeni tur başladığında efektleri temizler
     */
    reset() {
        this.shakeTimer = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.flashAlpha = 0;
        this.particles = [];
        this.shockwaves = [];
        this.bannerTimer = 0;
        this.grid.reset();
    }
}
