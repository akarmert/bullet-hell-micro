import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../js/config.js';
import { Player } from '../js/player.js';
import { CollisionSystem } from '../js/collision.js';
import { WaveManager } from '../js/waveManager.js';
import { ModeRegistry } from '../js/modes.js';
import { Bullet } from '../js/bullet.js';

test('Joystick düşük itişte yavaşlar, çaprazda hızlanmaz ve bırakılınca durur', () => {
    const player = new Player();
    player.setMoveInput(.25, 0);
    player.update(.1);
    assert.equal(player.x, 309);
    player.setMoveInput(0, 0);
    player.update(.1);
    assert.equal(player.x, 309);
    player.setMoveInput(1, 1);
    const x = player.x;
    const y = player.y;
    player.update(.1);
    assert.ok(Math.abs(Math.hypot(player.x - x, player.y - y) - 36) < 1e-8);
});

test('Dash mevcut 2400ms cooldown ve 160ms dokunulmazlık süresini korur', () => {
    const player = new Player();
    player.setMoveInput(1, 0);
    assert.equal(player.triggerDash(), true);
    assert.equal(player.dashCooldownTimer, 2400);
    assert.equal(player.dashTimer, 160);
    assert.equal(player.triggerDash(), false);
    player.setMoveInput(0, 0);
    player.update(.16);
    assert.equal(player.isDashing, false);
    player.update(1.04);
    assert.ok(Math.abs(player.getDashReadyRatio() - .5) < 1e-8);
    player.update(1.2);
    assert.equal(player.getDashReadyRatio(), 1);
});

test('Graze, Shield ve Dash çarpışma korumaları değişmez', () => {
    const player = new Player();
    const near = new Bullet({ x: 312, y: 300, radius: 4 });
    assert.equal(CollisionSystem.checkPlayerGraze(player, near), true);
    assert.equal(CollisionSystem.checkPlayerGraze(player, near), false);
    const hit = new Bullet({ x: 300, y: 300, radius: 4 });
    player.hasShield = true;
    assert.equal(CollisionSystem.processInteractions(player, [hit]), null);
    assert.equal(player.hasShield, false);
    assert.equal(hit.active, false);
    hit.active = true;
    assert.equal(CollisionSystem.checkPlayerBullet(player, hit), false, 'kalkan sonrası kısa dokunulmazlık');
    player.invulnTimer = 0;
    player.isDashing = true;
    assert.equal(CollisionSystem.checkPlayerBullet(player, hit), false);
    player.isDashing = false;
    assert.equal(CollisionSystem.checkPlayerBullet(player, hit), true);
});

test('Geniş arena: başlangıç, dört kenar çarpışması, sekme ve tüm mod kaynakları', () => {
    const previous = { ...GAME_CONFIG.CANVAS };
    const start = GAME_CONFIG.PLAYER.START_X;
    try {
        GAME_CONFIG.CANVAS.WIDTH = 1300;
        GAME_CONFIG.PLAYER.START_X = 650;
        const player = new Player();
        assert.equal(player.x, 650);
        assert.equal(CollisionSystem.checkPlayerArena(player), false);
        for (const [x, y] of [[5, 300], [1295, 300], [650, 5], [650, 595]]) {
            player.x = x; player.y = y;
            assert.equal(CollisionSystem.checkPlayerArena(player), true);
        }
        player.reset();
        player.setMoveInput(1, 0);
        player.update(10);
        assert.equal(player.x, 1294);
        assert.equal(CollisionSystem.checkPlayerArena(player), false);
        const bullet = new Bullet({ x: 1298, y: 300, vx: 100, maxBounces: 2 });
        bullet.update(.1);
        assert.equal(bullet.x, 1296);
        assert.equal(bullet.vx, -100);
        for (const mode of ModeRegistry.getAll()) {
            const spawned = [];
            const waves = new WaveManager({ spawn: b => spawned.push(b) }, mode);
            for (const ms of [1000, 11000, 21000, 36000]) waves.update(ms, 2, player);
            waves.updateTelegraphs(1000);
            assert.ok(spawned.length > 0, mode.id);
            assert.ok(spawned.every(b => Number.isFinite(b.x) && Number.isFinite(b.vx)));
        }
    } finally {
        Object.assign(GAME_CONFIG.CANVAS, previous);
        GAME_CONFIG.PLAYER.START_X = start;
    }
});

test('Kalkan: her güçlendirme +1 hak (0 → 1 → 2 → 3), en fazla 3', () => {
    const S = GAME_CONFIG.PLAYER.SHIELD;
    const player = new Player();
    assert.equal(player.hasShield, false);
    assert.equal(player.shieldPips(), '');
    assert.equal(player.addShield(), 1);
    assert.equal(player.addShield(), 2);
    assert.equal(player.shieldPips(), '🛡️🛡️');
    assert.equal(player.addShield(), 3);
    assert.equal(player.addShield(), S.MAX, 'en fazla 3');
});

test('Kalkan: her darbe bir hak harcar; dokunulmazlık sadece son kalkan kırılınca', () => {
    const S = GAME_CONFIG.PLAYER.SHIELD;
    const player = new Player();
    player.addShield(); player.addShield(); player.addShield();
    const at = () => new Bullet({ x: player.x, y: player.y, radius: 4 });

    assert.equal(CollisionSystem.processInteractions(player, [at()]), null);
    assert.equal(player.shieldCharges, 2);
    assert.equal(player.invulnTimer, 0, 'ara kırılmalarda dokunulmazlık yok');
    assert.equal(CollisionSystem.processInteractions(player, [at()]), null);
    assert.equal(player.shieldCharges, 1);
    assert.equal(player.invulnTimer, 0);
    assert.equal(CollisionSystem.processInteractions(player, [at()]), null);
    assert.equal(player.shieldCharges, 0);
    assert.equal(player.invulnTimer, S.IFRAME_MS, 'son kalkan kırılınca dokunulmazlık');

    assert.equal(CollisionSystem.processInteractions(player, [at()]), null, 'dokunulmazken ölmez');
    player.update(S.IFRAME_MS / 1000 + 0.01);
    assert.ok(CollisionSystem.processInteractions(player, [at()]), 'dokunulmazlık bitince mermi öldürür');
});

test('Kalkan: aynı karede iki mermi iki hak harcar, sonra gelen dokunulmazlıkta zarar vermez', () => {
    const player = new Player();
    player.addShield(); player.addShield();
    const cluster = [0, 1, 2, 3].map(i => new Bullet({ x: player.x + i, y: player.y, radius: 4 }));
    assert.equal(CollisionSystem.processInteractions(player, cluster), null);
    assert.equal(player.shieldCharges, 0);
    assert.equal(cluster.filter(b => !b.active).length, 2, 'iki mermi iki kalkanla engellendi');
    assert.ok(player.invulnTimer > 0);
});
