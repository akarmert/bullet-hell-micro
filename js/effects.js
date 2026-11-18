// ============================================================
// effects.js — Görsel Efektler, Reaktif Benekli Zemin ve Prosedürel Müzik
// Şeker serpintisi parçacıkları, pastel bulutlar, yaylı benek zemini,
// marimba/pop sesleri ve faza göre katmanlanan neşeli müzik
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font, candyPanel } from './theme.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Akor ilerlemeleri (MIDI): normal C – Am – F – G, boss Am – F – C – E
const CHORDS = {
    normal: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    boss: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [52, 56, 59]]
};
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const BELL = [2, 0, 1, 2];

/**
 * Sıfır bağımlılıklı Web Audio ses sistemi
 * Marimba/pop efektleri ve ileriye dönük zamanlamalı (lookahead) sequencer
 */
class SoundSystem {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.bgmEnabled = true;

        this.bgmPlaying = false;
        this.bgmStep = 0;
        this.bgmTimer = null;
        this.bgmFilter = null;
        this.bgmGain = null;
        this.master = null;
        this.noiseBuffer = null;
        this.nextNoteTime = 0;

        this.tension = 0;      // 0-3: faza göre müzik katmanları
        this.bossMode = false; // Boss sırasında minör ilerleme ve hızlı tempo
    }

    /**
     * Kullanıcının ilk etkileşiminde AudioContext'i güvenle başlatır
     */
    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            this.ctx = ctx;

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.ratio.value = 4;
            comp.connect(ctx.destination);

            this.master = ctx.createGain();
            this.master.gain.value = GAME_CONFIG.AUDIO.MASTER_VOLUME * 3;
            this.master.connect(comp);

            this.bgmFilter = ctx.createBiquadFilter();
            this.bgmFilter.type = 'lowpass';
            this.bgmFilter.frequency.value = 1800;
            this.bgmGain = ctx.createGain();
            this.bgmGain.gain.value = 0.55;
            this.bgmFilter.connect(this.bgmGain);
            this.bgmGain.connect(this.master);

            const len = ctx.sampleRate;
            this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // ------------------------------------------------------------
    // SES ÜRETİCİ YARDIMCILAR
    // ------------------------------------------------------------

    /** Tek osilatörlü nota (isteğe bağlı kayma ve vibrato) */
    tone(freq, time, { type = 'sine', dur = 0.2, vol = 0.2, attack = 0.005, glideTo = null, vibrato = 0, dest = null } = {}) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, time + dur);
        if (vibrato) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = 11;
            depth.gain.value = vibrato;
            lfo.connect(depth);
            depth.connect(osc.frequency);
            lfo.start(time);
            lfo.stop(time + dur + 0.05);
        }
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(vol, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(gain);
        gain.connect(dest || this.master);
        osc.start(time);
        osc.stop(time + dur + 0.05);
    }

    /** Marimba benzeri yumuşak tını: temel + 4x kısmi */
    pluck(freq, time, vol = 0.18, dur = 0.35, dest = null) {
        this.tone(freq, time, { type: 'sine', dur, vol, dest });
        this.tone(freq * 4, time, { type: 'sine', dur: dur * 0.18, vol: vol * 0.35, dest });
    }

    /** Filtrelenmiş gürültü vuruşu (shaker, snap, whoosh) */
    noise(time, { dur = 0.05, vol = 0.1, type = 'highpass', freq = 6000, q = 0.8, sweepTo = null, dest = null } = {}) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.setValueAtTime(freq, time);
        if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(dest || this.master);
        src.start(time, Math.random() * 0.5);
        src.stop(time + dur + 0.02);
    }

    ready() {
        return this.ctx && this.enabled;
    }

    // ------------------------------------------------------------
    // PROSEDÜREL MÜZİK (lookahead zamanlayıcı)
    // ------------------------------------------------------------

    startBGM() {
        if (!this.ctx || !this.bgmEnabled || this.bgmPlaying) return;
        this.bgmPlaying = true;
        this.bgmStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.06;
        this.bgmFilter.frequency.cancelScheduledValues(this.ctx.currentTime);
        this.bgmFilter.frequency.setValueAtTime(1800, this.ctx.currentTime);
        this.bgmTimer = setInterval(() => this.scheduleBGM(), 25);
        this.scheduleBGM();
    }

    scheduleBGM() {
        if (!this.bgmPlaying || !this.ctx) return;
        const bpm = this.bossMode ? 132 : 116;
        const stepDur = 60 / bpm / 4;
        while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
            this.tickBGM(this.nextNoteTime);
            this.nextNoteTime += stepDur;
            this.bgmStep++;
        }
    }

    tickBGM(time) {
        if (!this.enabled || !this.bgmEnabled) return;
        const out = this.bgmFilter;
        const step = this.bgmStep % 16;
        const bar = Math.floor(this.bgmStep / 16) % 4;
        const chord = (this.bossMode ? CHORDS.boss : CHORDS.normal)[bar];
        const root = chord[0] - 24;
        const tension = this.bossMode ? 3 : this.tension;

        // Yumuşak kick
        const kickSteps = this.bossMode ? [0, 4, 8, 12] : [0, 8];
        if (kickSteps.includes(step)) {
            this.tone(140, time, { dur: 0.16, vol: 0.5, glideTo: 50, dest: out });
        }

        // Zıplayan bas
        const bass = { 0: 0, 6: 12, 8: 0, 14: 7 };
        if (bass[step] !== undefined) {
            this.tone(midi(root + bass[step]), time, { type: 'triangle', dur: 0.22, vol: 0.32, dest: out });
        }

        // Marimba arpej (8'likler), gerilimde 16'lık süslemeler
        if (step % 2 === 0) {
            const note = chord[ARP[(step / 2) % 8] % 3] + 12;
            this.pluck(midi(note), time, 0.14, 0.3, out);
        } else if (tension >= 2) {
            const note = chord[(step + bar) % 3] + 24;
            this.pluck(midi(note), time, 0.05, 0.18, out);
        }

        // Shaker ve parmak şıklatma
        if (tension >= 1) {
            if (step % 4 === 2 || (this.bossMode && step % 2 === 1)) {
                this.noise(time, { dur: 0.035, vol: 0.08, freq: 7000, dest: out });
            }
            if (step === 4 || step === 12) {
                this.noise(time, { dur: 0.09, vol: 0.22, type: 'bandpass', freq: 1900, q: 1.2, dest: out });
            }
        }

        // Çan melodisi
        if (tension >= 3 && step % 4 === 0) {
            const note = chord[BELL[step / 4]] + 24;
            this.tone(midi(note), time, { type: 'triangle', dur: 0.45, vol: 0.07, dest: out });
            this.tone(midi(note) * 2, time, { type: 'sine', dur: 0.25, vol: 0.03, dest: out });
        }
    }

    /**
     * Süreye göre müzik katmanlarını ve filtre açıklığını ayarlar
     */
    updateBGMTension(elapsedMs) {
        if (!this.ctx || !this.bgmFilter) return;
        this.tension = elapsedMs < 10000 ? 0 : elapsedMs < 20000 ? 1 : elapsedMs < 30000 ? 2 : 3;
        const target = this.bossMode ? 6500 : 1800 + this.tension * 1300;
        this.bgmFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.3);
    }

    stopBGM() {
        this.bgmPlaying = false;
        if (this.bgmTimer) {
            clearInterval(this.bgmTimer);
            this.bgmTimer = null;
        }
    }

    toggleBGM() {
        this.bgmEnabled = !this.bgmEnabled;
        if (!this.bgmEnabled) this.stopBGM();
        return this.bgmEnabled;
    }

    // ------------------------------------------------------------
    // OYUN İÇİ SES EFEKTLERİ
    // ------------------------------------------------------------

    /** Başlangıç: yukarı tırmanan marimba */
    playStart() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        [72, 76, 79, 84].forEach((m, i) => this.pluck(midi(m), t + i * 0.06, 0.22, 0.4));
    }

    /** Ölüm: sönen balon + hüzünlü iki nota */
    playDeath() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        if (this.bgmFilter) {
            this.bgmFilter.frequency.cancelScheduledValues(t);
            this.bgmFilter.frequency.setValueAtTime(1500, t);
            this.bgmFilter.frequency.exponentialRampToValueAtTime(80, t + 0.4);
        }
        this.stopBGM();
        this.tone(620, t, { type: 'sine', dur: 0.55, vol: 0.4, glideTo: 90, vibrato: 35 });
        this.noise(t, { dur: 0.3, vol: 0.25, type: 'lowpass', freq: 1200, sweepTo: 200 });
        this.tone(midi(67), t + 0.45, { type: 'triangle', dur: 0.3, vol: 0.18 });
        this.tone(midi(60), t + 0.72, { type: 'triangle', dur: 0.6, vol: 0.18 });
    }

    /** Graze: minik baloncuk patlaması (her seferinde hafif farklı perde) */
    playGraze() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const f = 520 * (1 + Math.random() * 0.35);
        this.tone(f, t, { dur: 0.06, vol: 0.16, glideTo: f * 2.6, attack: 0.002 });
    }

    /** Dash: yumuşak hava süpürmesi */
    playDash() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.noise(t, { dur: 0.22, vol: 0.35, type: 'bandpass', freq: 500, sweepTo: 3500, q: 1.4 });
        this.tone(300, t, { dur: 0.16, vol: 0.12, glideTo: 640 });
    }

    /** Kalkan kırılması: büyük köpük patlaması + düşen ışıltı */
    playShieldBreak() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.tone(260, t, { dur: 0.1, vol: 0.4, glideTo: 900, attack: 0.002 });
        this.noise(t, { dur: 0.12, vol: 0.2, type: 'bandpass', freq: 2500, q: 0.7 });
        [96, 93, 89].forEach((m, i) => this.tone(midi(m), t + 0.06 + i * 0.05, { dur: 0.12, vol: 0.06 }));
    }

    /** Güçlendirme: parlak üçlü çan */
    playPickup() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        [84, 88, 91].forEach((m, i) => this.pluck(midi(m), t + i * 0.05, 0.16, 0.3));
    }

    /** Yeni rekor: küçük fanfar */
    playRecord() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        [72, 76, 79].forEach((m, i) => this.pluck(midi(m), t + i * 0.09, 0.2, 0.3));
        this.pluck(midi(84), t + 0.27, 0.24, 0.8);
        this.tone(midi(88), t + 0.27, { type: 'triangle', dur: 0.8, vol: 0.08 });
    }

    /** Faz değişimi: iki notalı çan */
    playPhase() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.pluck(midi(79), t, 0.16, 0.25);
        this.pluck(midi(84), t + 0.08, 0.16, 0.4);
    }

    /** Boss geliyor: titrek "uh-oh" */
    playBossAlarm() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 2; i++) {
            const s = t + i * 0.6;
            this.tone(midi(76), s, { type: 'triangle', dur: 0.2, vol: 0.28, vibrato: 18 });
            this.tone(midi(71), s + 0.22, { type: 'triangle', dur: 0.32, vol: 0.28, glideTo: midi(69), vibrato: 18 });
            this.tone(110, s, { dur: 0.2, vol: 0.35, glideTo: 55 });
        }
    }
}

/**
 * Şeker serpintisi parçacığı (dönen yuvarlak çubuk veya minik top)
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
        const scale = Math.min(speedScale, 1.5);
        this.length = (5 + Math.random() * 5) * scale;
        this.width = 2.6 * Math.max(0.7, scale);
        this.round = Math.random() < 0.3; // Bazıları minik şeker topu
        this.rotation = Math.random() * Math.PI;
        this.spin = (Math.random() * 2 - 1) * 10;
        this.maxLife = GAME_CONFIG.EFFECTS.PARTICLE_LIFETIME * lifeScale * 1.3;
        this.life = this.maxLife;
    }

    update(dt) {
        this.life -= dt * 1000;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.94;
        this.vy = this.vy * 0.94 + 160 * dt; // Hafif yerçekimi: konfeti gibi düşer
        this.rotation += this.spin * dt;
    }

    render(ctx) {
        if (this.life <= 0) return;
        const alpha = Math.min(1, (this.life / this.maxLife) * 1.8);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        if (this.round) {
            ctx.arc(0, 0, this.width * 0.9, 0, Math.PI * 2);
        } else {
            ctx.roundRect(-this.length / 2, -this.width / 2, this.length, this.width, this.width / 2);
        }
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = THEME.INK_SOFT;
        ctx.stroke();
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
        this.cols = Math.ceil(width / step) + 1;
        this.rows = Math.floor(height / step) + 1;

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
     * Esneyen benekli zemin: itilen benekler büyür ve pembeleşir
     */
    render(ctx) {
        ctx.save();
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                const d = Math.min(24, Math.abs(pt.x - pt.baseX) + Math.abs(pt.y - pt.baseY));
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2 + d * 0.14, 0, Math.PI * 2);
                ctx.fillStyle = d > 3 ? 'rgba(255, 111, 174, 0.55)' : 'rgba(142, 91, 232, 0.16)';
                ctx.fill();
            }
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

        // Arka planda süzülen pastel bulutlar
        this.blobs = this.createBlobs(GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
    }

    createBlobs(width, height) {
        const colors = ['255, 196, 222', '205, 184, 255', '255, 214, 232'];
        const blobs = [];
        const count = Math.max(5, Math.round(width / 140));
        for (let i = 0; i < count; i++) {
            blobs.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: 90 + Math.random() * 110,
                vx: (Math.random() * 2 - 1) * 8,
                vy: (Math.random() * 2 - 1) * 6,
                color: colors[i % colors.length]
            });
        }
        return blobs;
    }

    resize(width, height) {
        this.grid = new SpringGrid(width, height, 50);
        this.blobs = this.createBlobs(width, height);
    }

    initAudio() {
        this.sound.init();
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
        const colors = THEME.SPRINKLES;

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
        this.triggerBanner(`FAZ: ${phaseName}`, THEME.PURPLE);
        this.sound.playPhase();
    }

    /**
     * Genel amaçlı ekran üstü neon bildirim
     */
    triggerBanner(text, color = THEME.PINK) {
        this.bannerText = text;
        this.bannerColor = color;
        this.bannerTimer = 1600;
    }

    /**
     * Graze (teğet geçme) anında minik sarı kıvılcım parçacığı
     */
    triggerGraze(x, y) {
        this.sound.playGraze();
        const colors = [THEME.PINK, THEME.LAVENDER];
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
            this.particles.push(new Particle(x, y, i % 2 ? THEME.WHITE : THEME.PINK_SOFT, 0.6, 0.5));
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
            this.particles.push(new Particle(x, y, i % 2 ? THEME.PURPLE : THEME.LAVENDER, 0.9, 0.8));
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
            color: THEME.PINK,
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
     * Boss geliyor uyarısı
     */
    triggerBossIncoming() {
        this.triggerBanner('⚠ JÖLE KRAL GELİYOR!', THEME.PINK_DEEP);
        this.bannerTimer = 2200;
        this.shakeTimer = 600;
        this.shakeIntensity = 4;
        this.sound.playBossAlarm();
    }

    /**
     * Boss aşama değişimi: turuncu şok dalgası
     */
    triggerBossStage(x, y, stageName) {
        this.triggerBanner(`JÖLE KRAL: ${stageName}`, THEME.PINK_DEEP);
        this.sound.playPhase();
        this.shakeTimer = 220;
        this.shakeIntensity = 6;
        this.shockwaves.push({ x, y, radius: 10, maxRadius: 220, color: THEME.PINK, alpha: 1.0 });
        for (let i = 0; i < 16; i++) {
            this.particles.push(new Particle(x, y, i % 2 ? THEME.LAVENDER : THEME.PINK, 0.8, 0.7));
        }
        this.grid.applyForce(x, y, 200, 160);
    }

    /**
     * Boss yenildi: büyük patlama ve ekran temizliği
     */
    triggerBossDefeated(x, y, destroyedBullets) {
        this.triggerEMP(x, y, destroyedBullets);
        this.shockwaves[this.shockwaves.length - 1].color = THEME.PINK_DEEP;
        this.shockwaves.push({ x, y, radius: 4, maxRadius: 700, color: THEME.PURPLE, alpha: 1.0 });
        this.shakeTimer = 500;
        this.shakeIntensity = 14;
        this.flashAlpha = 0.6;
        const colors = THEME.SPRINKLES;
        for (let i = 0; i < 60; i++) {
            this.particles.push(new Particle(x, y, colors[i % colors.length], 1.3, 1.4));
        }
        this.triggerBanner('★ JÖLE KRAL ERİDİ! ★', THEME.PURPLE);
        this.bannerTimer = 2200;
        this.sound.playRecord();
    }

    /**
     * Tüm efektleri günceller
     * @param {number} dt Delta time (saniye)
     * @param {number} elapsedMs Oyun süresi (BGM gerilimi için)
     */
    update(dt, elapsedMs = 0) {
        const dtMs = dt * 1000;

        // Reaktif benek fiziği
        this.grid.update(dt);

        // Pastel bulut süzülmesi (kenarlardan dolanır)
        const W = GAME_CONFIG.CANVAS.WIDTH;
        const H = GAME_CONFIG.CANVAS.HEIGHT;
        for (const b of this.blobs) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -b.r) b.x = W + b.r;
            if (b.x > W + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = H + b.r;
            if (b.y > H + b.r) b.y = -b.r;
        }

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
        for (const b of this.blobs) {
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            g.addColorStop(0, `rgba(${b.color}, 0.55)`);
            g.addColorStop(1, `rgba(${b.color}, 0)`);
            ctx.fillStyle = g;
            ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
        this.grid.render(ctx);
    }

    /**
     * Çizim bittikten sonra parçacıkları, şok dalgalarını, flaşı ve banner'ı çizer
     */
    postRender(ctx) {
        // Şok dalgaları: kalın yumuşak halkalar
        for (let i = 0; i < this.shockwaves.length; i++) {
            const sw = this.shockwaves[i];
            ctx.save();
            ctx.globalAlpha = sw.alpha * 0.8;
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 6 * sw.alpha + 1;
            ctx.stroke();
            ctx.restore();
        }

        // Şeker serpintisi
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].render(ctx);
        }

        // Pembe flaş
        if (this.flashAlpha > 0.01) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 196, 222, ${this.flashAlpha})`;
            ctx.fillRect(0, 0, GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
            ctx.restore();
        }

        // Bildirim: şeker etiketi
        if (this.bannerTimer > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.bannerTimer / 300);
            ctx.font = font(16, 700);
            const tw = ctx.measureText(this.bannerText).width;
            const cx = GAME_CONFIG.CANVAS.WIDTH / 2;
            const cy = 148; // Sayaç ve boss barının altında
            ctx.translate(cx, cy);
            candyPanel(ctx, -tw / 2 - 16, -15, tw + 32, 30, 15, THEME.WHITE, { depth: 3, shadow: this.bannerColor });
            ctx.fillStyle = THEME.INK;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.bannerText, 0, 1);
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
