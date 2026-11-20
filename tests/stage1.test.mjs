import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixedStepper, STEP, MAX_STEPS } from '../js/loop.js';
import { GAME_CONFIG } from '../js/config.js';
import { Player } from '../js/player.js';
import { WaveManager } from '../js/waveManager.js';
import { BulletManager } from '../js/bulletManager.js';
import { ModeRegistry } from '../js/modes.js';
import { seedRandom } from '../js/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Feeds `seconds` of wall time to the stepper at `hz` frames per second. */
function runAt(hz, seconds, update) {
    const advance = createFixedStepper(update);
    let steps = 0;
    const frames = Math.round(seconds * hz);
    for (let i = 0; i < frames; i++) steps += advance(1 / hz);
    return steps;
}

test('Fixed timestep: 30 / 60 / 90 / 120 Hz all simulate the same amount of time', () => {
    const results = [30, 60, 90, 120].map((hz) => {
        let simulated = 0;
        const steps = runAt(hz, 2, (dt) => { simulated += dt; });
        return { hz, steps, simulated };
    });
    for (const r of results) {
        assert.ok(Math.abs(r.simulated - 2) <= STEP + 1e-9, `${r.hz} Hz simulated ${r.simulated.toFixed(4)} s`);
        assert.ok(Math.abs(r.steps - 240) <= 1, `${r.hz} Hz ran ${r.steps} steps`);
    }
});

test('Fixed timestep: a long hitch is capped (no catch-up spiral)', () => {
    let steps = 0;
    const advance = createFixedStepper(() => { steps++; });
    assert.equal(advance(2.5), MAX_STEPS, 'a 2.5 s pause only simulates MAX_STEPS steps');
    assert.equal(advance(0), 0);
    assert.equal(advance(-1), 0);
    assert.ok(steps === MAX_STEPS);
});

test('Same seed → identical bullets at 30 Hz and 120 Hz (gameplay independent of refresh rate)', () => {
    function simulate(hz) {
        seedRandom(424242);
        const bullets = new BulletManager();
        const waves = new WaveManager(bullets, ModeRegistry.get('classic'));
        const player = new Player();
        player.x = GAME_CONFIG.CANVAS.WIDTH / 2;
        player.y = GAME_CONFIG.CANVAS.HEIGHT - 80;
        let elapsedMs = 0;
        runAt(hz, 6, (dt) => {
            waves.update(elapsedMs, dt, player);
            bullets.update(dt);
            elapsedMs += dt * 1000;
        });
        const active = bullets.getActiveBullets();
        const sum = active.reduce((acc, b) => acc + b.x * 3 + b.y * 7, 0);
        return { count: active.length, sum: Math.round(sum * 1000) / 1000, elapsedMs: Math.round(elapsedMs) };
    }
    const a = simulate(30);
    const b = simulate(120);
    assert.ok(a.count > 0, 'bullets were spawned');
    assert.deepEqual(a, b);
});

test('Game logic modules do not depend on the renderer (PixiJS only under js/render/ and the entry point)', () => {
    const jsDir = path.join(ROOT, 'js');
    const allowed = new Set(['game.js', 'main.js']); // game.js owns the renderer instance
    for (const file of fs.readdirSync(jsDir)) {
        if (!file.endsWith('.js') || allowed.has(file)) continue;
        const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
        assert.ok(!/from\s+['"]pixi\.js/.test(src) && !/['"]\.\/render\//.test(src), `${file} must not import the renderer`);
    }
});

test('Production safety: dev server removed, CSP only injected on build, font bundled locally', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'server.js')), false, 'old dev server is gone');
    const vite = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
    assert.match(vite, /apply:\s*'build'/);
    assert.match(vite, /script-src 'self'/);
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    assert.ok(!css.includes('fonts.googleapis.com'), 'no remote font');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const [name, ver] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        assert.match(ver, /^\d+\.\d+\.\d+$/, `${name} is pinned to an exact version (${ver})`);
    }
});
