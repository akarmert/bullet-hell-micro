import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

const { ScoreSystem, SCORE, formatScore } = await import('../js/score.js');
const { random, seedRandom, hashSeed, dateKey } = await import('../js/rng.js');
const { Tutorial, TUTORIAL_DONE_AT } = await import('../js/tutorial.js');
const { Progress } = await import('../js/progress.js');
const { SKINS } = await import('../js/skins.js');
const { Settings } = await import('../js/settings.js');
const { ModeRegistry } = await import('../js/modes.js');
const { WaveManager } = await import('../js/waveManager.js');
const { BulletManager } = await import('../js/bulletManager.js');
const { Player } = await import('../js/player.js');

test('Skor: süre puanı, seri çarpanı, seri penceresi ve boss bonusu', () => {
    const s = new ScoreSystem();
    s.update(2000);
    assert.equal(s.total, 2 * SCORE.POINTS_PER_SECOND);

    for (let i = 0; i < 4; i++) s.onGraze();
    assert.equal(s.multiplier, 1);
    const fifth = s.onGraze();
    assert.equal(fifth.multiplier, 2);
    assert.equal(fifth.points, SCORE.GRAZE_POINTS * 2);
    assert.equal(s.total, 200 + 4 * SCORE.GRAZE_POINTS + 2 * SCORE.GRAZE_POINTS);

    for (let i = 0; i < 100; i++) s.onGraze();
    assert.equal(s.multiplier, SCORE.MAX_MULTIPLIER);
    assert.equal(s.bestCombo, 105);

    s.update(SCORE.COMBO_WINDOW + 1);
    assert.equal(s.combo, 0, 'seri pencere dolunca biter');
    assert.equal(s.bestCombo, 105, 'en uzun seri korunur');

    const before = s.total;
    s.onBossDefeat();
    assert.equal(s.total, before + SCORE.BOSS_BONUS);
    s.reset();
    assert.equal(s.total, 0);
    assert.equal(formatScore(1234567), '1.234.567');
});

test('RNG aynı tohumla aynı diziyi üretir; günlük mod herkese aynı mermileri verir', () => {
    seedRandom(42);
    const a = Array.from({ length: 5 }, random);
    seedRandom(42);
    const b = Array.from({ length: 5 }, random);
    assert.deepEqual(a, b);
    assert.ok(a.every(v => v >= 0 && v < 1));
    assert.notEqual(hashSeed('2026-11-18'), hashSeed('2026-11-19'));
    assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');

    const daily = ModeRegistry.get('daily');
    assert.equal(daily.getSeed(), daily.getSeed());
    assert.match(daily.storageKey, /^bulletHellHighScore_daily_\d{4}-\d{2}-\d{2}$/);
    assert.equal(ModeRegistry.get('classic').getSeed(), null);

    const runOnce = () => {
        seedRandom(daily.getSeed());
        const bullets = new BulletManager();
        const waves = new WaveManager(bullets, daily);
        const player = new Player();
        for (let t = 0; t < 6000; t += 16) waves.update(t, 0.016, player);
        return bullets.getActiveBullets().map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.vx)]);
    };
    assert.deepEqual(runOnce(), runOnce());
});

test('Öğretici ipuçları ilk turda sırayla çıkar, 12 saniyede tamamlanır, boss ipucu bir kez', () => {
    store.clear();
    const tut = new Tutorial();
    tut.start(false);
    assert.equal(tut.update(100), null);
    assert.match(tut.update(1000).text, /kenarlara/);
    assert.match(tut.update(5000).text, /graze/);
    assert.match(tut.update(9000).text, /DASH/);
    tut.update(TUTORIAL_DONE_AT + 1);
    assert.equal(tut.done, true);

    const next = new Tutorial();
    next.start(true);
    assert.equal(next.update(1000), null, 'tamamlanınca adım ipuçları çıkmaz');
    assert.equal(next.update(30000, true), null, 'boss ipucu girişten 2 sn sonra');
    assert.match(next.update(32500, true).text, /Jöle Kral/);
    next.start(true);
    assert.equal(next.update(32500, true), null, 'boss ipucu ikinci kez çıkmaz');

    next.resetProgress();
    const again = new Tutorial();
    again.start(true);
    assert.match(again.update(1000).text, /joystick/);
});

test('İlerleme: başarımlar kostüm açar, kilitli kostüm seçilemez, kayıt kalıcıdır', () => {
    store.clear();
    const p = new Progress();
    assert.deepEqual(p.unlocked, ['classic']);
    assert.equal(p.select('strawberry'), false);

    let fresh = p.recordRun({ modeId: 'classic', timeMs: 31000, graze: 55, bestCombo: 8, bossDefeated: true });
    assert.deepEqual(fresh.map(s => s.id).sort(), ['chocolate', 'lavender', 'strawberry']);
    fresh = p.recordRun({ modeId: 'classic', timeMs: 1000, graze: 0, bestCombo: 0, bossDefeated: false });
    assert.deepEqual(fresh, [], 'açılan kostüm tekrar bildirilmez');

    for (const day of ['2026-11-16', '2026-11-17', '2026-11-17', '2026-11-18']) {
        fresh = p.recordRun({ modeId: 'daily', timeMs: 5000, graze: 0, bestCombo: 0, bossDefeated: false, dateKey: day });
    }
    assert.ok(p.isUnlocked('bow'), '3 farklı günlük gün');
    p.recordRun({ modeId: 'hardcore', timeMs: 30500, graze: 0, bestCombo: 25, bossDefeated: false });
    assert.ok(p.isUnlocked('royal') && p.isUnlocked('party'));
    assert.equal(p.unlocked.length, SKINS.length);

    assert.equal(p.select('chocolate'), true);
    const reloaded = new Progress();
    assert.equal(reloaded.selected, 'chocolate');
    assert.equal(reloaded.stats.dailyDays.length, 3);
});

test('Ayarlar: ses %10 adımla sınırlar içinde, anahtarlar değişir ve kaydedilir', () => {
    store.clear();
    const s = new Settings();
    const seen = [];
    s.onChange(v => seen.push({ ...v }));
    for (let i = 0; i < 5; i++) s.adjust('musicVolume', 1);
    assert.equal(s.get('musicVolume'), 1);
    for (let i = 0; i < 15; i++) s.adjust('sfxVolume', -1);
    assert.equal(s.get('sfxVolume'), 0);
    s.adjust('shake');
    s.adjust('contrast');
    assert.equal(s.display('shake'), 'kapalı');
    assert.equal(s.display('musicVolume'), '%100');
    const reloaded = new Settings();
    assert.equal(reloaded.get('shake'), false);
    assert.equal(reloaded.get('contrast'), true);
    assert.ok(seen.length > 1, 'dinleyiciler her değişiklikte çağrılır');
});
