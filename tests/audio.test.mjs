import test from 'node:test';
import assert from 'node:assert/strict';

// --- Sahte Web Audio ortamı: her düğüm bağlanabilir, her parametre zamanlanabilir ---
const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {}
});
const node = () => new Proxy({
    connect() {}, disconnect() {}, start() {}, stop() {},
    getChannelData: () => new Float32Array(16)
}, {
    get(target, key) {
        if (!(key in target)) target[key] = param();
        return target[key];
    },
    set(target, key, value) { target[key] = value; return true; }
});
class FakeAudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 16; this.state = 'running'; this.destination = node(); this.created = 0; }
    resume() {}
}
for (const name of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createDynamicsCompressor',
    'createConvolver', 'createDelay', 'createStereoPanner', 'createBuffer']) {
    FakeAudioContext.prototype[name] = function () { this.created++; return node(); };
}

const store = new Map();
globalThis.window = { AudioContext: FakeAudioContext };
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v))
};

const { SoundSystem, GRAZE_SCALE } = await import('../js/audio.js');

function fresh() {
    const s = new SoundSystem();
    s.init();
    return s;
}

test('Müzik modu menü → oyun → sessiz geçişlerini yönetir ve aynı modda yeniden başlatmaz', () => {
    const s = fresh();
    try {
        s.setMusicMode('menu');
        assert.equal(s.bgmPlaying, true);
        assert.equal(s.musicMode, 'menu');
        s.bgmStep = 7;
        s.setMusicMode('menu');
        assert.equal(s.bgmStep, 7, 'aynı modda baştan başlamamalı');
        s.setMusicMode('game');
        assert.equal(s.musicMode, 'game');
        assert.ok(s.bgmStep <= 1, 'mod değişince baştan başlar (ilk nota hemen zamanlanır)');
        s.setMusicMode('none');
        assert.equal(s.bgmPlaying, false);
    } finally {
        s.stopBGM();
    }
});

test('Müzik kapalıyken çalmaz, açılınca kaldığı moddan başlar; ölüm müziği durdurur', () => {
    store.clear();
    const s = fresh();
    try {
        s.toggleBGM();
        s.setMusicMode('game');
        assert.equal(s.bgmPlaying, false);
        s.toggleBGM();
        s.setMusicMode('game');
        assert.equal(s.bgmPlaying, true);
        s.playDeath(100);
        assert.equal(s.bgmPlaying, false);
    } finally {
        s.stopBGM();
    }
});

test('AudioContext yokken mod hatırlanır, ilk etkileşimden sonra müzik başlar', () => {
    const s = new SoundSystem();
    s.setMusicMode('menu');
    assert.equal(s.bgmPlaying, false);
    s.init();
    try {
        s.setMusicMode('menu');
        assert.equal(s.bgmPlaying, true);
    } finally {
        s.stopBGM();
    }
});

test('Graze serisi hızlı ardışık grazelerde yükselir, arada boşluk olunca sıfırlanır', () => {
    const s = fresh();
    const combos = [];
    for (let i = 0; i < 5; i++) {
        s.ctx.currentTime += 0.2;
        combos.push(s.playGraze(50));
    }
    assert.deepEqual(combos, [0, 1, 2, 3, 4]);
    s.ctx.currentTime += 1.5;
    assert.equal(s.playGraze(50), 0);
    for (let i = 0; i < 40; i++) { s.ctx.currentTime += 0.1; s.playGraze(); }
    assert.ok(s.grazeCombo > GRAZE_SCALE.length, 'seri ölçeği aşsa da hata vermez');
});

test('Ses ayarları kaydedilir ve yeni oturumda geri yüklenir', () => {
    store.clear();
    const a = new SoundSystem();
    assert.equal(a.toggleSFX(), false);
    assert.equal(a.toggleBGM(), false);
    const b = new SoundSystem();
    assert.equal(b.enabled, false);
    assert.equal(b.bgmEnabled, false);
    b.toggleSFX();
    b.toggleBGM();
    store.clear();
});

test('Efektler kapalıyken ses düğümü üretilmez; tüm efektler hatasız çalışır', () => {
    const s = fresh();
    const effects = ['playStart', 'playDash', 'playDashReady', 'playShieldBreak', 'playEmp', 'playPickup', 'playSlowmo',
        'playRecord', 'playPhase', 'playBossAlarm', 'playBossHit', 'playBossRam', 'playBossStage', 'playBossDefeat'];
    s.enabled = false;
    const before = s.ctx.created;
    for (const fn of effects) s[fn](120);
    assert.equal(s.ctx.created, before);
    s.enabled = true;
    for (const fn of effects) { s.ctx.currentTime += 0.1; s[fn](120, 0.5); }
    assert.ok(s.ctx.created > before);
    assert.equal(s.panFor(0), -0.7);
    assert.equal(s.panFor(null), 0);
});
