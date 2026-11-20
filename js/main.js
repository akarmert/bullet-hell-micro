// ============================================================
// main.js — Application entry point
// Bundled Fredoka font, game creation and the fixed-timestep loop.
// ============================================================

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { Game } from './game.js';
import { createFixedStepper, createFramePacer } from './loop.js';
import { resizeArena } from './arena.js';

window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Game canvas element not found');
        return;
    }

    const game = new Game(canvas);
    window.game = game;
    if (game.ready) await game.ready;

    // Canvas text does not make the browser download @font-face files, so request every
    // Fredoka weight explicitly (incl. Turkish letters → latin-ext subset), then re-bake
    // the text textures that were drawn with the fallback font in the meantime.
    if (document.fonts && document.fonts.load) {
        const sample = 'BULLET HELL ŞşİıĞğÜüÖöÇç 0123456789';
        const loads = ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 16px "Fredoka"`, sample));
        Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))])
            .catch(() => {})
            .then(() => game.renderer.refreshTextures());
    }

    // Performance recorder: perf builds (`npm run apk:perf`) or the dev server with ?perf.
    // Written literally so Vite drops the telemetry chunk from normal builds.
    let telemetry = null;
    const perfAllowed = import.meta.env.VITE_PERF_TELEMETRY === 'true'
        || (import.meta.env.DEV && new URLSearchParams(location.search).has('perf'));
    if (perfAllowed) {
        import('./telemetry.js')
            .then(({ startTelemetry }) => { telemetry = startTelemetry(game); })
            .catch((e) => console.error('telemetry failed', e));
    }

    // Prepare the audio graph while the menu idles (one step per idle callback), so the first
    // "play" tap only resumes the context instead of building it (measured: 57–71 ms freeze).
    const idle = window.requestIdleCallback
        ? (fn) => window.requestIdleCallback(fn, { timeout: 1000 })
        : (fn) => setTimeout(fn, 50);
    const prepareAudio = () => {
        if (game.effects.sound.prepareStep()) idle(prepareAudio);
    };
    setTimeout(() => idle(prepareAudio), 1500);

    const advance = createFixedStepper((dt) => game.update(dt));
    let last = performance.now();

    // Frame rate cap. Menus / pause / result screens: 60 FPS. Play: the "frame rate" setting
    // (60 by default, 90 or 120 on request). On a 120 Hz phone every rendered frame costs CPU and
    // GPU time (measured at 120 FPS: ~2.2–2.5 cores busy, SoC 35 → 51 °C within minutes).
    const pace = createFramePacer();

    function frame(now) {
        requestAnimationFrame(frame);
        const fps = game.state === 'PLAYING' ? Number(game.settings.get('fps')) || 60 : 60;
        if (!pace(now, fps)) return;
        const dtMs = now - last;
        const t0 = telemetry ? performance.now() : 0;
        const steps = advance(dtMs / 1000);
        last = now;
        if (game.quality.sample(dtMs, game.state === 'PLAYING', now)) resizeArena(game);
        const t1 = telemetry ? performance.now() : 0;
        game.render();
        if (telemetry) telemetry.frame(dtMs, steps, t1 - t0, performance.now() - t1);
    }

    requestAnimationFrame((t) => {
        last = t;
        requestAnimationFrame(frame);
    });
});
