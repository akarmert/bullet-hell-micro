// ============================================================
// main.js — Application entry point
// Bundled Fredoka font, game creation and the fixed-timestep loop.
// ============================================================

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { Game } from './game.js';

// Simulation runs in fixed steps so movement, boss timers, collisions and score
// do not depend on the display refresh rate (30 / 60 / 90 / 120 Hz).
const STEP = 1 / 120;
const MAX_STEPS = 8;      // At most ~66 ms simulated per frame (tab switches, hitches)

window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Game canvas element not found');
        return;
    }

    const game = new Game(canvas);
    window.game = game;
    if (game.ready) await game.ready;

    let last = performance.now();
    let acc = 0;

    function frame(now) {
        let elapsed = (now - last) / 1000;
        last = now;
        if (elapsed > STEP * MAX_STEPS) elapsed = STEP * MAX_STEPS;
        acc += elapsed;
        let steps = 0;
        while (acc >= STEP && steps < MAX_STEPS) {
            game.update(STEP);
            acc -= STEP;
            steps++;
        }
        game.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame((t) => {
        last = t;
        requestAnimationFrame(frame);
    });
});
