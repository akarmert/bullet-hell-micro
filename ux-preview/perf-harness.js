// ============================================================
// ux-preview/perf-harness.js — Reproducible render benchmarks (dev only)
//
// Usage (dev server, browser console or automation):
//   const { installPerfHarness } = await import('/ux-preview/perf-harness.js');
//   const perf = installPerfHarness(game);          // also installs the save-blocking sandbox
//   await perf.run(['menu', 'play', 'boss0', 'dead'], 'light');
//
// Each measured frame = 2 simulation steps (1/120 s) + render + gl.finish(), i.e. one
// 60 Hz frame including GPU completion. Upload rates assume 60 frames per second.
// ============================================================

import { installSandbox } from './sandbox.js';
import { GAME_CONFIG } from '../js/config.js';

export function installPerfHarness(game) {
    installSandbox(game);
    const step = (n) => { for (let i = 0; i < n; i++) game.update(1 / 120); };

    async function scene(name, theme = 'light') {
        game.settings.values.theme = theme;
        game.applyThemeSetting();
        const w = game.waveManager;
        if (name === 'menu') { await window.uxScenario('menu'); step(60); return; }
        if (name === 'pause') { await window.uxScenario('play'); game.__invincible = true; step(240); game.pauseGame(); game.resumeCountdown = 0; return; }
        if (name === 'dead') {
            await window.uxScenario('deadBullet');
            for (let i = 0; i < 80 && game.state !== 'DEAD'; i++) step(10);
            game.deathTimestamp -= 2000;
            game.lastCandies = 7;
            return;
        }
        await window.uxScenario('play');
        game.__invincible = true;
        if (name === 'play') {
            // Chaos after two bosses (the hardest regular phase)
            game.elapsedMs = 120000; w.bossKills = 2; w.bossCount = 2; w.nextBossAt = 1e12; w.chaosStartMs = 60000; w.bossActive = false; w.boss = null;
            step(480);
            return;
        }
        if (name.startsWith('boss')) {
            w.boss = null; w.bossActive = false; game.bulletManager.clear();
            game.elapsedMs = 30000; w.bossCount = Number(name.slice(4)); w.nextBossAt = 30000;
            step(600);
            return;
        }
        if (name.startsWith('stress')) {
            const n = Number(name.slice(6));
            w.update = () => {};
            game.bulletManager.clear();
            const shapes = ['circle', 'ring', 'diamond', 'capsule', 'saw'];
            const colors = ['#FF6FAE', '#B79BFF', '#8E5BE8', '#F0468F'];
            const W = GAME_CONFIG.CANVAS;
            let seed = 7;
            const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            for (let i = 0; i < n; i++) {
                const a = rnd() * Math.PI * 2;
                const sp = 20 + rnd() * 30;
                game.bulletManager.spawn({ x: rnd() * W.WIDTH, y: rnd() * W.HEIGHT, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, radius: 4 + (i % 3), color: colors[i % 4], shape: shapes[i % 5], maxBounces: 999, trailLength: i % 4 === 0 ? 8 : 0, spin: 6 });
            }
            step(20);
        }
    }

    function measure(frames = 240) {
        const R = game.renderer;
        const gl = R.app.renderer.gl;
        // Animations read performance.now(): run them on a simulated 60 Hz clock so
        // time-based redraws are counted as they would happen in real time.
        const realNow = performance.now.bind(performance);
        let fakeNow = realNow();
        performance.now = () => fakeNow;
        const tick = () => { fakeNow += 1000 / 60; };
        // warm-up (bakes, first uploads)
        for (let i = 0; i < 30; i++) { tick(); step(2); game.render(); }
        gl.finish();
        R.perf.reset();
        let calls = 0;
        const de = gl.drawElements, da = gl.drawArrays;
        gl.drawElements = function (...a) { calls++; return de.apply(gl, a); };
        gl.drawArrays = function (...a) { calls++; return da.apply(gl, a); };
        const times = [];
        let bullets = 0;
        for (let i = 0; i < frames; i++) {
            tick();
            const t0 = realNow();
            step(2);
            game.render();
            gl.finish();
            times.push(realNow() - t0);
            bullets += R.getStats().bullets;
        }
        gl.drawElements = de;
        gl.drawArrays = da;
        performance.now = realNow;
        if (game.waveManager.update !== Object.getPrototypeOf(game.waveManager).update) delete game.waveManager.update;
        const s = [...times].sort((a, b) => a - b);
        const pct = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
        const seconds = frames / 60;
        const uploads = {};
        let upCount = 0, upBytes = 0;
        for (const [name, u] of Object.entries(R.perf.uploads)) {
            uploads[name] = `${(u.count / seconds).toFixed(1)}/s ${(u.bytes / seconds / 1024).toFixed(0)}KB/s`;
            upCount += u.count;
            upBytes += u.bytes;
        }
        return {
            frames,
            avgMs: +(times.reduce((a, b) => a + b, 0) / frames).toFixed(2),
            p95Ms: pct(0.95),
            p99Ms: pct(0.99),
            maxMs: pct(1),
            over16: times.filter((t) => t > 16.7).length,
            drawCalls: +(calls / frames).toFixed(1),
            bulletsDrawn: Math.round(bullets / frames),
            uploadsPerSec: +(upCount / seconds).toFixed(1),
            uploadKBPerSec: +(upBytes / seconds / 1024).toFixed(0),
            bakes: R.perf.bakes,
            uploads,
            canvas: `${game.canvas.width}x${game.canvas.height}`
        };
    }

    async function run(scenes, theme = 'light', frames = 240) {
        const out = [];
        for (const name of scenes) {
            await scene(name, theme);
            out.push({ scene: name, theme, ...measure(frames) });
        }
        return out;
    }

    return { scene, measure, run };
}
