// ============================================================
// audio.js — Prosedürel Ses ve Müzik Sistemi (Web Audio API, dosyasız)
// Reverb + yankı, stereo konumlandırma, müzik kısma (ducking),
// menü / oyun / boss müzik modları, yavaş çekim müziği, graze serisi
// ============================================================

import { GAME_CONFIG } from './config.js';

const SETTINGS_KEY = 'bulletHellMicro_audio';
const MUSIC_LEVEL = 0.55;

export const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Akor ilerlemeleri (MIDI): normal C – Am – F – G, boss Am – F – C – E
const CHORDS = {
    normal: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    boss: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [52, 56, 59]]
};
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const BELL = [2, 0, 1, 2];

// Art arda grazeler bu pentatonik merdivende yükselir
export const GRAZE_SCALE = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
const GRAZE_CHAIN_GAP = 0.7; // s: bu süreden uzun ara seriyi sıfırlar

export class SoundSystem {
    constructor() {
        this.ctx = null;
        this.enabled = true;     // Ses efektleri
        this.bgmEnabled = true;  // Müzik
        this.loadSettings();

        this.bgmPlaying = false;
        this.bgmStep = 0;
        this.bgmTimer = null;
        this.nextNoteTime = 0;

        this.musicMode = 'none'; // 'none' | 'menu' | 'game'
        this.tension = 0;        // 0-3: faza göre müzik katmanları
        this.bossMode = false;   // Boss: minör ilerleme, hızlı tempo
        this.slowmo = false;     // Yavaş çekim: müzik yavaşlar ve boğuklaşır

        this.grazeCombo = 0;
        this.lastGrazeAt = -Infinity;
        this.lastBossHitAt = -Infinity;

        this.musicVolume = 1;
        this.sfxVolume = 1;
    }

    get musicLevel() {
        return MUSIC_LEVEL * this.musicVolume;
    }

    /** Ayarlar menüsünden 0-1 ses seviyeleri */
    setVolumes(music = 1, sfx = 1) {
        this.musicVolume = music;
        this.sfxVolume = sfx;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.bgmGain.gain.setTargetAtTime(this.musicLevel, t, 0.05);
        this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
    }

    // ------------------------------------------------------------
    // AYARLAR
    // ------------------------------------------------------------

    loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            if (typeof saved.music === 'boolean') this.bgmEnabled = saved.music;
            if (typeof saved.sfx === 'boolean') this.enabled = saved.sfx;
        } catch (e) {
            // Gizli sekme vb.: varsayılanlar kalır
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: this.bgmEnabled, sfx: this.enabled }));
        } catch (e) {
            // Kaydedilemezse sessizce geç
        }
    }

    toggleBGM() {
        this.bgmEnabled = !this.bgmEnabled;
        if (!this.bgmEnabled) this.stopBGM();
        this.saveSettings();
        return this.bgmEnabled;
    }

    toggleSFX() {
        this.enabled = !this.enabled;
        this.saveSettings();
        return this.enabled;
    }

    // ------------------------------------------------------------
    // SES GRAFİĞİ
    // ------------------------------------------------------------

    /**
     * Kullanıcının ilk etkileşiminde AudioContext'i ve ses yollarını kurar:
     * müzik → filtre → kazanç → (yankı, reverb) → master → kompresör
     * efekt → (stereo) → efekt yolu → (reverb) → master
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

            // Ortak reverb (üretilmiş oda yanıtı)
            this.reverb = ctx.createConvolver();
            this.reverb.buffer = this.createImpulse(2.2, 3);
            const reverbOut = ctx.createGain();
            reverbOut.gain.value = 0.9;
            this.reverb.connect(reverbOut);
            reverbOut.connect(this.master);

            // Müzik yolu
            this.bgmFilter = ctx.createBiquadFilter();
            this.bgmFilter.type = 'lowpass';
            this.bgmFilter.frequency.value = 1800;
            this.bgmGain = ctx.createGain();
            this.bgmGain.gain.value = this.musicLevel;
            this.bgmFilter.connect(this.bgmGain);
            this.bgmGain.connect(this.master);
            this.send(this.bgmGain, this.reverb, 0.22);

            // Müzik yankısı: 3/16'lık gecikme, kararan geri besleme
            this.delay = ctx.createDelay(1.0);
            this.delay.delayTime.value = (60 / 116) * 0.75;
            const delayTone = ctx.createBiquadFilter();
            delayTone.type = 'lowpass';
            delayTone.frequency.value = 2400;
            const feedback = ctx.createGain();
            feedback.gain.value = 0.32;
            this.delay.connect(delayTone);
            delayTone.connect(feedback);
            feedback.connect(this.delay);
            delayTone.connect(this.master);
            this.send(this.bgmGain, this.delay, 0.16);

            // Efekt yolu
            this.sfxBus = ctx.createGain();
            this.sfxBus.gain.value = this.sfxVolume;
            this.sfxBus.connect(this.master);
            this.send(this.sfxBus, this.reverb, 0.14);

            const len = ctx.sampleRate;
            this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    /** Kaynak → hedef arasına seviyeli bir gönderim bağlar */
    send(from, to, level) {
        const g = this.ctx.createGain();
        g.gain.value = level;
        from.connect(g);
        g.connect(to);
        return g;
    }

    /** Sönümlenen stereo gürültüden reverb yanıtı üretir */
    createImpulse(seconds, decay) {
        const rate = this.ctx.sampleRate;
        const len = Math.max(1, Math.floor(rate * seconds));
        const buffer = this.ctx.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buffer;
    }

    /** Arena x konumunu stereo değerine çevirir (-0.7 sol … 0.7 sağ) */
    panFor(x) {
        if (x === null || x === undefined || !Number.isFinite(x)) return 0;
        const w = GAME_CONFIG.CANVAS.WIDTH || 1;
        return Math.max(-1, Math.min(1, (x / w) * 2 - 1)) * 0.7;
    }

    /** Stereo konumlu efekt çıkışı */
    out(x = null) {
        const pan = this.panFor(x);
        if (!pan || typeof this.ctx.createStereoPanner !== 'function') return this.sfxBus;
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        p.connect(this.sfxBus);
        return p;
    }

    /** Büyük olaylarda müziği kısa süre kısar */
    duck(amount = 0.35, hold = 0.25) {
        if (!this.ctx || !this.bgmGain) return;
        const g = this.bgmGain.gain;
        const t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(this.musicLevel * amount, t + 0.03);
        g.setTargetAtTime(this.musicLevel, t + hold, 0.25);
    }

    ready() {
        return !!this.ctx && this.enabled;
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
        gain.connect(dest || this.sfxBus);
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
        gain.connect(dest || this.sfxBus);
        src.start(time, Math.random() * 0.5);
        src.stop(time + dur + 0.02);
    }

    // ------------------------------------------------------------
    // MÜZİK (lookahead zamanlayıcı)
    // ------------------------------------------------------------

    /**
     * Oyunun durumuna göre çalması gereken müziği seçer; her frame çağrılabilir.
     * @param {'none'|'menu'|'game'} mode
     */
    setMusicMode(mode) {
        if (!this.ctx || !this.bgmEnabled) {
            if (this.bgmPlaying) this.stopBGM();
            this.musicMode = mode;
            return;
        }
        const inSync = mode === this.musicMode && (mode === 'none') === !this.bgmPlaying;
        if (inSync) return;
        this.musicMode = mode;
        this.stopBGM();
        if (mode !== 'none') this.startBGM();
    }

    startBGM() {
        if (!this.ctx || !this.bgmEnabled || this.bgmPlaying) return;
        this.bgmPlaying = true;
        this.bgmStep = 0;
        const t = this.ctx.currentTime;
        this.nextNoteTime = t + 0.06;
        this.bgmFilter.frequency.cancelScheduledValues(t);
        this.bgmFilter.frequency.setValueAtTime(this.musicMode === 'menu' ? 2200 : 1800, t);
        this.bgmGain.gain.cancelScheduledValues(t);
        this.bgmGain.gain.setValueAtTime(this.musicLevel, t);
        this.bgmTimer = setInterval(() => this.scheduleBGM(), 25);
        this.scheduleBGM();
    }

    stopBGM() {
        this.bgmPlaying = false;
        if (this.bgmTimer) {
            clearInterval(this.bgmTimer);
            this.bgmTimer = null;
        }
    }

    currentBpm() {
        const base = this.musicMode === 'menu' ? 92 : this.bossMode ? 132 : 116;
        return this.slowmo ? base * 0.7 : base;
    }

    scheduleBGM() {
        if (!this.bgmPlaying || !this.ctx) return;
        const stepDur = 60 / this.currentBpm() / 4;
        while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
            if (this.musicMode === 'menu') this.tickMenu(this.nextNoteTime);
            else this.tickBGM(this.nextNoteTime);
            this.nextNoteTime += stepDur;
            this.bgmStep++;
        }
    }

    /** Menü: yavaş, rüya gibi pad + seyrek marimba */
    tickMenu(time) {
        const out = this.bgmFilter;
        const step = this.bgmStep % 16;
        const bar = Math.floor(this.bgmStep / 16) % 4;
        const chord = CHORDS.normal[bar];

        if (step === 0) {
            for (const m of chord) {
                this.tone(midi(m), time, { type: 'triangle', dur: 2.6, vol: 0.035, attack: 0.5, dest: out });
                this.tone(midi(m + 12), time, { type: 'sine', dur: 2.2, vol: 0.02, attack: 0.6, dest: out });
            }
        }
        if (step === 0 || step === 8) {
            this.tone(midi(chord[0] - 24), time, { type: 'triangle', dur: 0.6, vol: 0.2, dest: out });
        }
        if (step % 4 === 0) {
            this.pluck(midi(chord[ARP[(step / 4 + bar) % 8] % 3] + 12), time, 0.09, 0.7, out);
        } else if (step % 4 === 2 && bar % 2 === 1) {
            this.pluck(midi(chord[(step + bar) % 3] + 24), time, 0.035, 0.4, out);
        }
    }

    /** Oyun: faza göre katmanlanan neşeli groove */
    tickBGM(time) {
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
            this.pluck(midi(chord[ARP[(step / 2) % 8] % 3] + 12), time, 0.14, 0.3, out);
        } else if (tension >= 2) {
            this.pluck(midi(chord[(step + bar) % 3] + 24), time, 0.05, 0.18, out);
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
        let target = this.musicMode === 'menu' ? 2200 : this.bossMode ? 6500 : 1800 + this.tension * 1300;
        if (this.slowmo) target = Math.max(500, target * 0.3);
        this.bgmFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.3);
    }

    // ------------------------------------------------------------
    // OYUN İÇİ SES EFEKTLERİ (x: stereo konum için arena x'i)
    // ------------------------------------------------------------

    /** Başlangıç: yukarı tırmanan marimba */
    playStart() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.grazeCombo = 0;
        this.lastGrazeAt = -Infinity;
        [72, 76, 79, 84].forEach((m, i) => this.pluck(midi(m), t + i * 0.06, 0.22, 0.4));
    }

    /** Ölüm: sönen balon + hüzünlü iki nota */
    playDeath(x = null) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        if (this.bgmFilter) {
            this.bgmFilter.frequency.cancelScheduledValues(t);
            this.bgmFilter.frequency.setValueAtTime(1500, t);
            this.bgmFilter.frequency.exponentialRampToValueAtTime(80, t + 0.4);
        }
        this.stopBGM();
        if (!this.enabled) return;
        const out = this.out(x);
        this.tone(620, t, { type: 'sine', dur: 0.55, vol: 0.4, glideTo: 90, vibrato: 35, dest: out });
        this.noise(t, { dur: 0.3, vol: 0.25, type: 'lowpass', freq: 1200, sweepTo: 200, dest: out });
        this.tone(midi(67), t + 0.45, { type: 'triangle', dur: 0.3, vol: 0.18 });
        this.tone(midi(60), t + 0.72, { type: 'triangle', dur: 0.6, vol: 0.18 });
    }

    /**
     * Graze: baloncuk patlaması; art arda grazelerde pentatonik merdivende yükselir
     * @param {number|null} combo Oyunun seri sayacı (0 tabanlı); verilmezse kendi zamanlaması
     * @returns {number} Mevcut seri sayısı (0 = tek)
     */
    playGraze(x = null, combo = null) {
        if (!this.ctx) return 0;
        const t = this.ctx.currentTime;
        if (combo !== null) this.grazeCombo = Math.max(0, combo);
        else this.grazeCombo = t - this.lastGrazeAt < GRAZE_CHAIN_GAP ? this.grazeCombo + 1 : 0;
        this.lastGrazeAt = t;
        if (!this.enabled) return this.grazeCombo;

        const m = GRAZE_SCALE[Math.min(this.grazeCombo, GRAZE_SCALE.length - 1)];
        const f = midi(m);
        const out = this.out(x);
        this.tone(f * 0.5, t, { dur: 0.07, vol: 0.15, glideTo: f, attack: 0.002, dest: out });
        if (this.grazeCombo >= 4 && this.grazeCombo % 4 === 0) {
            this.pluck(midi(m + 12), t + 0.03, 0.07, 0.3, out);
        }
        return this.grazeCombo;
    }

    /** Dash: yumuşak hava süpürmesi */
    playDash(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.noise(t, { dur: 0.22, vol: 0.35, type: 'bandpass', freq: 500, sweepTo: 3500, q: 1.4, dest: out });
        this.tone(300, t, { dur: 0.16, vol: 0.12, glideTo: 640, dest: out });
    }

    /** Dash yeniden hazır: minik çift çan */
    playDashReady() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.tone(midi(88), t, { dur: 0.12, vol: 0.06 });
        this.tone(midi(95), t + 0.06, { dur: 0.2, vol: 0.06 });
    }

    /** Kalkan kırılması: büyük köpük patlaması + düşen ışıltı */
    playShieldBreak(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.duck(0.45, 0.2);
        this.tone(260, t, { dur: 0.1, vol: 0.4, glideTo: 900, attack: 0.002, dest: out });
        this.noise(t, { dur: 0.12, vol: 0.2, type: 'bandpass', freq: 2500, q: 0.7, dest: out });
        [96, 93, 89].forEach((m, i) => this.tone(midi(m), t + 0.06 + i * 0.05, { dur: 0.12, vol: 0.06, dest: out }));
    }

    /** POP! güçlendirmesi: ekranı temizleyen tatlı patlama */
    playEmp(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.duck(0.3, 0.3);
        this.tone(120, t, { dur: 0.35, vol: 0.45, glideTo: 40 });
        this.noise(t, { dur: 0.45, vol: 0.3, type: 'lowpass', freq: 4000, sweepTo: 300, dest: out });
        [84, 88, 91, 96].forEach((m, i) => this.tone(midi(m), t + 0.05 + i * 0.04, { dur: 0.18, vol: 0.06, dest: out }));
    }

    /** Güçlendirme: parlak üçlü çan */
    playPickup(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        [84, 88, 91].forEach((m, i) => this.pluck(midi(m), t + i * 0.05, 0.16, 0.3, out));
    }

    /** Yavaş çekim başladı: bant durması gibi aşağı kayan ton */
    playSlowmo() {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        this.tone(900, t, { dur: 0.6, vol: 0.16, glideTo: 180 });
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
        this.duck(0.4, 1.0);
        for (let i = 0; i < 2; i++) {
            const s = t + i * 0.6;
            this.tone(midi(76), s, { type: 'triangle', dur: 0.2, vol: 0.28, vibrato: 18 });
            this.tone(midi(71), s + 0.22, { type: 'triangle', dur: 0.32, vol: 0.28, glideTo: midi(69), vibrato: 18 });
            this.tone(110, s, { dur: 0.2, vol: 0.35, glideTo: 55 });
        }
    }

    /** Boss'a graze hasarı: enerji azaldıkça pesleşen jöle "boing" (seyreltilmiş) */
    playBossHit(x = null, hpRatio = 1) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        if (t - this.lastBossHitAt < 0.07) return;
        this.lastBossHitAt = t;
        const f = 260 + hpRatio * 220;
        this.tone(f, t, { type: 'triangle', dur: 0.12, vol: 0.14, glideTo: f * 0.62, dest: this.out(x) });
    }

    /** Dash ile boss'tan geçiş: tok jöle ezilmesi */
    playBossRam(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.duck(0.5, 0.15);
        this.tone(200, t, { dur: 0.28, vol: 0.45, glideTo: 60, vibrato: 25, dest: out });
        this.noise(t, { dur: 0.18, vol: 0.22, type: 'lowpass', freq: 900, sweepTo: 200, dest: out });
        this.tone(midi(84), t + 0.05, { type: 'triangle', dur: 0.15, vol: 0.1, glideTo: midi(91), dest: out });
    }

    /** Boss aşama değişimi: sinirli titrek iniş + çan */
    playBossStage(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.tone(midi(74), t, { type: 'triangle', dur: 0.4, vol: 0.22, glideTo: midi(62), vibrato: 30, dest: out });
        this.pluck(midi(79), t + 0.3, 0.12, 0.3);
    }

    /** Boss eridi: kısılan müzik üstünde büyük akor ve yükselen ışıltı */
    playBossDefeat(x = null) {
        if (!this.ready()) return;
        const t = this.ctx.currentTime;
        const out = this.out(x);
        this.duck(0.15, 1.3);
        this.noise(t, { dur: 0.6, vol: 0.3, type: 'lowpass', freq: 5000, sweepTo: 250, dest: out });
        this.tone(90, t, { dur: 0.5, vol: 0.5, glideTo: 35 });
        [60, 64, 67, 72].forEach((m) => {
            this.pluck(midi(m), t + 0.12, 0.14, 1.2);
            this.tone(midi(m), t + 0.12, { type: 'triangle', dur: 1.6, vol: 0.05, attack: 0.05 });
        });
        [84, 86, 88, 91, 93, 96].forEach((m, i) => this.tone(midi(m), t + 0.3 + i * 0.05, { dur: 0.25, vol: 0.05 }));
    }
}
