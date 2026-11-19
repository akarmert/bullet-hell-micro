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
