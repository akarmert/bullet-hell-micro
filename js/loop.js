// ============================================================
// loop.js — Fixed-timestep stepper (no DOM, unit-tested)
// The simulation always advances in equal steps, so gameplay speed, boss timers,
// collisions and score are the same at 30, 60, 90 or 120 Hz.
// ============================================================

export const STEP = 1 / 120;      // Simulation step (s)
export const MAX_STEPS = 8;       // Cap per frame: ~66 ms simulated after a hitch / tab switch

/**
 * Returns `advance(elapsedSeconds)`, which calls `update(STEP)` as many times as the
 * accumulated time allows and returns how many steps ran.
 * @param {(dt: number) => void} update
 */
export function createFixedStepper(update, step = STEP, maxSteps = MAX_STEPS) {
    let acc = 0;
    return function advance(elapsed) {
        if (!(elapsed > 0)) return 0;
        acc += Math.min(elapsed, step * maxSteps);
        let steps = 0;
        while (acc >= step && steps < maxSteps) {
            update(step);
            acc -= step;
            steps++;
        }
        // Never carry more than one frame's worth of backlog (avoids a catch-up spiral)
        if (acc > step * maxSteps) acc = 0;
        return steps;
    };
}

/**
 * Frame-rate cap for requestAnimationFrame. Returns `shouldRender(now, fps)`.
 *
 * Counts display refreshes (vsyncs), not milliseconds: each rAF call adds fps / refresh-rate
 * to an accumulator and a frame renders whenever it reaches 1. 60 FPS on a 120 Hz display is
 * exactly every 2nd vsync, 90 FPS is 3 of every 4. A millisecond deadline drifted against the
 * real refresh clock (measured on a phone: ~1 % of frames at 25–33 ms with a 60 FPS cap).
 * The refresh interval is estimated from recent rAF intervals; when the display is slower
 * than the cap, every frame renders.
 */
export function createFramePacer() {
    let last = null;
    let acc = 1;                 // render the first frame
    let vsync = 1000 / 60;       // refresh interval estimate (ms)
    const samples = [];
    let batch = 8;               // first estimate after 8 frames, then every 30
    return function shouldRender(now, fps) {
        let elapsed = 1;         // vsyncs since the previous rAF call
        if (last !== null) {
            const dt = now - last;
            if (dt > 0 && dt < 50) {
                samples.push(dt);
                if (samples.length >= batch) {
                    // Median: robust to timestamp jitter and to the occasional missed vsync
                    const sorted = samples.splice(0).sort((x, y) => x - y);
                    vsync = sorted[Math.floor(sorted.length / 2)];
                    batch = 30;
                }
            }
            elapsed = Math.max(1, Math.round(dt / vsync));
        }
        last = now;
        // Fraction of vsyncs to render; snapped to quarter steps (0.5 = every 2nd, 0.75 = 3 of 4)
        let ratio = (fps * vsync) / 1000;
        const quarter = Math.round(ratio * 4) / 4;
        if (quarter > 0 && Math.abs(ratio - quarter) < 0.04) ratio = quarter;
        if (ratio >= 1) return true;
        acc += ratio * elapsed;
        if (acc < 1 - 1e-6) return false;
        acc = Math.min(acc - 1, 1);  // after a long stall, do not render a burst of frames
        return true;
    };
}
