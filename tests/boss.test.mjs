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
