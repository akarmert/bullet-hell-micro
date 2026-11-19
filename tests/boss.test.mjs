import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../js/config.js';
import { Player } from '../js/player.js';
import { WaveManager } from '../js/waveManager.js';
import { BulletManager } from '../js/bulletManager.js';
import { ModeRegistry } from '../js/modes.js';
import { BOSS_STATE } from '../js/boss.js';

const B = GAME_CONFIG.BOSS;

// Simülasyonu sabit adımlarla ilerletir
function run(waves, player, fromMs, toMs, stepMs = 16) {
    for (let t = fromMs; t < toMs; t += stepMs) waves.update(t, stepMs / 1000, player);
    return toMs;
}

function bossWaves(modeId = 'classic') {
    const bullets = new BulletManager();
    const waves = new WaveManager(bullets, ModeRegistry.get(modeId));
    const phases = [];
    waves.onPhaseChange = (p) => phases.push(p);
    return { bullets, waves, phases };
}

test('Boss 30. saniyede gelir, girişte ateş etmez ve faz adı BOSS olur', () => {
    const { bullets, waves, phases } = bossWaves();
    const player = new Player();
    waves.update(30000, 0.016, player);
    assert.equal(waves.getPhaseName(30000), 'BOSS');
    assert.equal(phases.at(-1), 'BOSS');
    assert.equal(waves.boss.state, BOSS_STATE.ENTERING);
    bullets.clear();
    run(waves, player, 30016, 30000 + B.ENTRY_TIME - 50);
    assert.equal(bullets.count, 0);
    run(waves, player, 30000 + B.ENTRY_TIME, 30000 + B.ENTRY_TIME + 1500);
    assert.equal(waves.boss.state, BOSS_STATE.FIGHTING);
    assert.ok(bullets.count > 0);
    assert.ok(bullets.getActiveBullets().every(b => b.type === 'boss'));
});

test('Hasar verilmezse boss DURATION sonunda söner, sonra CHAOS başlar', () => {
    const { waves, phases } = bossWaves();
    const player = new Player();
    let defeated = 0;
    waves.onBossDefeated = () => defeated++;
    const fightStart = 30000 + B.ENTRY_TIME;
    let t = run(waves, player, 30000, fightStart + B.DURATION - 500);
    assert.equal(waves.boss.alive, true);
    t = run(waves, player, t, fightStart + B.DURATION + B.DEATH_TIME + 300);
    assert.equal(defeated, 1);
    assert.equal(waves.boss.state, BOSS_STATE.DEAD);
    assert.ok(waves.bossDefeatedAt > fightStart + B.DURATION);
    assert.equal(waves.chaosStartMs, waves.bossDefeatedAt);
    run(waves, player, t, t + 100);
    assert.equal(phases.at(-1), 'CHAOS');
    assert.equal(waves.telegraphs.every(tg => tg.color !== B.COLOR), true);
});

test('Graze ve Dash-Ram boss enerjisini düşürür; ram dash başına bir kez', () => {
    const { waves } = bossWaves();
    const player = new Player();
    run(waves, player, 30000, 30000 + B.ENTRY_TIME + 32);
    const boss = waves.boss;
    const hp = boss.hp;
    boss.onGraze();
    assert.ok(Math.abs(hp - boss.hp - B.GRAZE_DAMAGE) < 1e-9);

    player.x = boss.x; player.y = boss.y + boss.radius + 4;
    player.isDashing = true;
    const before = boss.hp;
    boss.update(0, player);
    boss.update(0, player);
    assert.ok(Math.abs(before - boss.hp - B.RAM_DAMAGE) < 1e-9, 'tek ram hasarı');
    player.isDashing = false;
    boss.update(0, player);
    player.isDashing = true;
    boss.update(0, player);
    assert.ok(Math.abs(before - boss.hp - 2 * B.RAM_DAMAGE) < 1e-9, 'yeni dash yeni ram');
});

test('Aşamalar enerji eşiklerinde değişir: BLOOM → FANG → VORTEX', () => {
    const { waves } = bossWaves();
    const player = new Player();
    const stages = [];
    waves.onBossStageChange = (b) => stages.push(b.stageName);
    run(waves, player, 30000, 30000 + B.ENTRY_TIME + 32);
    const boss = waves.boss;
    assert.equal(boss.stageName, 'BLOOM');
    boss.damage(40);
    boss.update(0.001, player);
    assert.equal(boss.stageName, 'FANG');
    boss.damage(30);
    boss.update(0.001, player);
    assert.equal(boss.stageName, 'VORTEX');
    assert.deepEqual(stages, ['FANG', 'VORTEX']);
});

test('Gövde teması ölümcül; dash geçer, kalkan kırılıp oyuncuyu dışarı iter', () => {
    const { waves } = bossWaves();
    const player = new Player();
    run(waves, player, 30000, 30000 + B.ENTRY_TIME + 32);
    const boss = waves.boss;
    player.x = boss.x; player.y = boss.y + 5;
    assert.equal(boss.resolveBodyContact(player), 'fatal');
    player.isDashing = true;
    assert.equal(boss.resolveBodyContact(player), 'none');
    player.isDashing = false;
    player.hasShield = true;
    assert.equal(boss.resolveBodyContact(player), 'shield');
    assert.equal(player.hasShield, false);
    assert.equal(boss.touches(player), false);
});

test('CHAOS modunda boss yok; reset boss durumunu temizler', () => {
    const { waves } = bossWaves('chaos');
    const player = new Player();
    run(waves, player, 30000, 33000);
    assert.equal(waves.boss, null);

    const other = bossWaves('hardcore').waves;
    run(other, player, 30000, 31000);
    assert.ok(other.boss);
    other.reset();
    assert.equal(other.boss, null);
    assert.equal(other.bossDefeatedAt, null);
});

test('Boss rotasyonu: Jöle Kral yenilince 30 sn sonra Pamuk Bulut gelir, sonra Jöle Kral daha zor döner', () => {
    const { waves } = bossWaves();
    const player = new Player();
    const titles = [];
    waves.onBossDefeated = (b) => titles.push(b.title);
    let t = run(waves, player, 30000, 30000 + B.ENTRY_TIME + 100);
    assert.equal(waves.boss.kind, 'jelly');
    waves.boss.damage(1000);
    t = run(waves, player, t, t + B.DEATH_TIME + 100);
    assert.equal(waves.bossActive, false);
    assert.equal(waves.getPhaseName(t), 'CHAOS');
    assert.equal(waves.nextBossDef().KIND, 'cloud');

    t = run(waves, player, t, waves.nextBossAt + 50);
    assert.equal(waves.boss.kind, 'cloud');
    assert.equal(waves.getPhaseName(t), 'BOSS');
    const C = GAME_CONFIG.BOSS_CLOUD;
    t = run(waves, player, t, t + C.ENTRY_TIME + 200);
    waves.boss.damage(1000);
    t = run(waves, player, t, t + C.DEATH_TIME + 100);
    assert.deepEqual(titles, ['Jöle Kral', 'Pamuk Bulut']);
    assert.equal(waves.bossKills, 2);
    assert.deepEqual(waves.bossesBeaten, ['jelly', 'cloud']);

    run(waves, player, t, waves.nextBossAt + 50);
    assert.equal(waves.boss.kind, 'jelly');
    assert.equal(waves.boss.level, 1);
    assert.ok(waves.boss.speedMult > 1, 'ikinci turda mermiler hızlanır');
});

test('Pamuk Bulut: yağmurda güvenli koridor, duvarda tek geçit, girdapta çekim (dash çekimi kırar)', () => {
    const { bullets, waves } = bossWaves();
    const player = new Player();
    waves.nextBossAt = 30000;
    waves.bossCount = 1; // Rotasyonda sıradaki: Pamuk Bulut
    const C = GAME_CONFIG.BOSS_CLOUD;
    let t = run(waves, player, 30000, 30000 + C.ENTRY_TIME + 32);
    const boss = waves.boss;
    assert.equal(boss.kind, 'cloud');

    // YAĞMUR
    bullets.clear();
    boss.age = 0;
    boss.patternRain(C.STAGES[0], 3000);
    const gapHalf = C.STAGES[0].GAP / 2;
    assert.ok(bullets.count > 10);
    assert.ok(bullets.getActiveBullets().every(b => Math.abs(b.x - boss.rainGap) >= gapHalf));

    // DUVAR: uyarı → ateş, tek boşluk
    bullets.clear();
    waves.telegraphs.length = 0;
    boss.wallDir = 0;
    boss.patternWalls(C.STAGES[1], C.STAGES[1].INTERVAL * 2);
    assert.equal(waves.telegraphs.length, 1);
    const gapX = waves.telegraphs[0].x1;
    waves.updateTelegraphs(C.STAGES[1].TELEGRAPH_TIME + 1);
    const xs = bullets.getActiveBullets().map(b => b.x).sort((a, b) => a - b);
    assert.ok(xs.length > 10);
    assert.ok(xs.every(x => Math.abs(x - gapX) >= C.STAGES[1].GAP / 2));

    // GİRDAP
    player.x = boss.x; player.y = boss.y + 250;
    const before = Math.hypot(player.x - boss.x, player.y - boss.y);
    boss.patternPull(C.STAGES[2], 0.5, 500, player);
    assert.ok(Math.hypot(player.x - boss.x, player.y - boss.y) < before);
    const y = player.y;
    player.isDashing = true;
    boss.patternPull(C.STAGES[2], 0.5, 500, player);
    assert.equal(player.y, y);
});

// Kaos molasını ölçmek için: belli bir boss sayısında 10 sn içinde üretilen mermiler
function chaosSample(bossKills, ms = 10000) {
    const { bullets, waves } = bossWaves();
    const player = new Player();
    const spawned = [];
    const orig = bullets.spawn.bind(bullets);
    bullets.spawn = (p) => { spawned.push(p); return orig(p); };
    const t0 = 60000;
    waves.bossKills = bossKills;
    waves.bossActive = false;
    waves.bossDefeatedAt = t0;
    waves.chaosStartMs = t0;
    waves.nextBossAt = t0 + 999999;
    waves.currentPhaseName = 'CHAOS';
    for (let t = t0; t < t0 + ms; t += 16) {
        waves.update(t, 0.016, player);
    }
    waves.updateTelegraphs(1000);
    return { spawned, waves };
}

test('İlk boss sonrası mola: sakin başlangıç, daha az ve daha yavaş mermi, tek sekme', () => {
    const K = GAME_CONFIG.BOSS_BREAK;
    const calm = chaosSample(1, K.CALM_MS - 100);
    assert.equal(calm.spawned.length, 0, 'zaferden sonraki ilk saniyelerde hiç mermi yok');
    assert.equal(calm.waves.telegraphs.length, 0);

    const relief = chaosSample(1).spawned;
    const normal = chaosSample(2).spawned;
    assert.ok(relief.length < normal.length * 0.5, `molada en az yarı yarıya az mermi (${relief.length} / ${normal.length})`);
    const chaosOf = (list) => list.filter(b => b.type === 'chaos');
    const avg = (list) => list.reduce((a, b) => a + b.speed, 0) / list.length;
    assert.ok(avg(chaosOf(relief)) < avg(chaosOf(normal)) * 0.85, 'molada çubuklar daha yavaş');
    assert.ok(chaosOf(relief).every(b => b.maxBounces === K.BOUNCES), 'molada tek sekme');
    assert.ok(chaosOf(normal).every(b => b.maxBounces === GAME_CONFIG.PHASE_4.MAX_BOUNCES));
});

test('Pamuk Bulut eskisinden zor: daha uzun, daha yoğun yağmur, duvarlarda çisenti', () => {
    const C = GAME_CONFIG.BOSS_CLOUD;
    assert.ok(C.DURATION > B.DURATION, 'Jöle Kral\'dan uzun dayanır');
    const { bullets, waves } = bossWaves();
    const player = new Player();
    waves.bossCount = 1;
    run(waves, player, 30000, 30000 + C.ENTRY_TIME + 32);
    const boss = waves.boss;
    assert.equal(boss.kind, 'cloud');

    // Yağmur: 3 sn'de eski ayarın (95 ms) belirgin üstünde damla
    bullets.clear();
    boss.timers.a = 0;
    boss.patternRain(C.STAGES[0], 3000);
    const oldExpected = (3000 / 95) * (1 - 120 / GAME_CONFIG.CANVAS.WIDTH);
    assert.ok(bullets.count > oldExpected * 1.15, `yağmur daha yoğun (${bullets.count} > ${oldExpected.toFixed(0)})`);

    // Duvar aşamasında duvar uyarısının yanında çisenti de yağar
    bullets.clear();
    waves.telegraphs.length = 0;
    boss.timers.a = 0; boss.timers.b = 0;
    boss.runPattern(C.STAGES[1], 1.5, 1500, player);
    assert.ok(bullets.count > 0, 'çisenti damlaları');
    assert.equal(waves.telegraphs.length, 0, 'ilk duvar henüz gelmedi');
    boss.runPattern(C.STAGES[1], 0.4, 400, player);
    assert.equal(waves.telegraphs.length, 1, 'duvar uyarısı');
});

test('Boss ödülü: güçlendirme istenen türde ve oynanabilir alanda düşer', async () => {
    const { PickupManager } = await import('../js/pickup.js');
    const pm = new PickupManager();
    const p = pm.spawnAt('shield', -50, 20);
    assert.equal(p.type, 'shield');
    assert.ok(p.x >= 40 && p.y >= 160, 'kenar ve HUD dışında');
    assert.equal(pm.spawnAt('yok', 100, 300), null);
});

test('Pamuk Bulut oyun saatinde 1:15\'te gelir; geç yenilirse en az 15 sn mola korunur; sonrakiler 15 sn arayla', () => {
    const defeatAt = (waves, player, from) => {
        let t = run(waves, player, from, from + 2500);
        waves.boss.damage(1000);
        return run(waves, player, t, t + 1200);
    };
    const { waves } = bossWaves();
    const player = new Player();
    let t = defeatAt(waves, player, 30000); // Jöle Kral ~0:34'te yenilir
    assert.equal(waves.nextBossAt, 75000);
    t = run(waves, player, t, 74900);
    assert.equal(waves.bossActive, false, '1:15\'ten önce gelmez');
    t = run(waves, player, t, 75100);
    assert.equal(waves.boss.kind, 'cloud');
    t = defeatAt(waves, player, t);
    assert.ok(Math.abs(waves.nextBossAt - (waves.bossDefeatedAt + GAME_CONFIG.BOSS_INTERVAL)) < 1, 'üçüncü boss 15 sn sonra');

    // Jöle Kral geç yenilirse (ör. 1:05) yine de 15 sn mola kalır
    const late = bossWaves().waves;
    run(late, player, 30000, 30100);
    late.boss.state = 'FIGHTING';
    run(late, player, 30100, 64000);
    if (late.bossActive) { late.boss.damage(1000); run(late, player, 64000, 65200); }
    assert.ok(late.nextBossAt >= late.bossDefeatedAt + GAME_CONFIG.BOSS_INTERVAL - 1);
    assert.ok(late.nextBossAt >= 75000);
});

test('Şeker testere: dalgalı ama yolundan çok sapmayan hareket, dönme ve duvardan sekme', async () => {
    const { Bullet } = await import('../js/bullet.js');
    const S = GAME_CONFIG.SAW;
    const saw = new Bullet({ x: 100, y: 300, vx: S.SPEED, vy: 0, radius: S.RADIUS, shape: 'saw', type: 'saw',
        maxBounces: S.BOUNCES, wobble: S.WOBBLE, wobbleFreq: S.WOBBLE_FREQ, spin: S.SPIN });
    let maxOff = 0;
    for (let i = 0; i < 60; i++) {
        saw.update(1 / 60);
        maxOff = Math.max(maxOff, Math.abs(saw.y - 300));
    }
    assert.ok(Math.abs(saw.x - (100 + S.SPEED)) < 2, 'ana yönde hız korunur');
    assert.ok(maxOff > 5 && maxOff < 25, `yan salınım sınırlı (${maxOff.toFixed(1)} px)`);
    assert.ok(Math.abs(saw.spinAngle - S.SPIN) < 0.01, 'dişler döner');

    const edge = new Bullet({ x: GAME_CONFIG.CANVAS.WIDTH - 10, y: 300, vx: 200, vy: 0, radius: S.RADIUS, maxBounces: 2, shape: 'saw' });
    edge.update(0.05);
    assert.ok(edge.vx < 0, 'duvardan seker');

    const plain = new Bullet({ x: 0, y: 0, vx: 10, vy: 0 });
    assert.equal(plain.wobble, 0, 'havuzdan gelen eski mermide salınım kalmaz');
});

test('Şeker testereler: AIM fazında ilk kez görünür, boss sırasında gelmez, molada daha seyrek', () => {
    const count = (waves, from, to) => {
        const player = new Player();
        let n = 0;
        const orig = waves.bulletManager.spawn.bind(waves.bulletManager);
        waves.bulletManager.spawn = (p) => { if (p.type === 'saw') n++; return orig(p); };
        run(waves, player, from, to);
        return n;
    };
    assert.equal(count(bossWaves().waves, 0, 20000), 0, 'ilk 20 sn testere yok');
    const aim = bossWaves().waves;
    run(aim, new Player(), 0, 20000);
    assert.ok(count(aim, 20000, 29900) >= 2, 'AIM fazında görünür');

    const boss = bossWaves().waves;
    run(boss, new Player(), 0, 30000);
    assert.equal(count(boss, 30000, 45000), 0, 'boss sırasında testere yok');

    const sawsIn = (kills) => {
        const { waves } = bossWaves();
        const t0 = 60000;
        Object.assign(waves, { bossKills: kills, bossActive: false, bossDefeatedAt: t0, chaosStartMs: t0, nextBossAt: t0 + 1e9, currentPhaseName: 'CHAOS' });
        return count(waves, t0, t0 + 20000);
    };
    assert.ok(sawsIn(1) < sawsIn(2), 'molada normal kaostan seyrek');

    // Testereler kenarın içinde doğar ve sonlu hızlıdır
    const w = bossWaves().waves;
    for (let i = 0; i < 20; i++) {
        const b = w.spawnSaw(25000);
        assert.ok(b.x >= b.radius && b.x <= GAME_CONFIG.CANVAS.WIDTH - b.radius);
        assert.ok(b.y >= b.radius && b.y <= GAME_CONFIG.CANVAS.HEIGHT - b.radius);
        assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy));
    }
});
