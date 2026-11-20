// ============================================================
// main.js — Application entry point
// Bundled Fredoka font, game creation and the fixed-timestep loop.
// ============================================================

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { Game } from './game.js';
import { createFixedStepper } from './loop.js';
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

    const advance = createFixedStepper((dt) => game.update(dt));
    let last = performance.now();

    function frame(now) {
        const dtMs = now - last;
        advance(dtMs / 1000);
        last = now;
        if (game.quality.sample(dtMs, game.state === 'PLAYING', now)) resizeArena(game);
        game.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame((t) => {
        last = t;
        requestAnimationFrame(frame);
    });
});
