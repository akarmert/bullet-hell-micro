// ============================================================
// quality.js — Adaptive render quality (frame pacing watchdog)
//
// Watches real frame intervals while a run is being played. A frame counts as slow
// when it misses 60 FPS (not the display's own rate: on a 120 Hz phone, frames that
// fall back to 16.7 ms are frame pacing, and lowering the resolution barely helps —
// measured on a Galaxy A54: 88 → 96 FPS for a much blurrier image). If many frames
// are slow for a sustained period, quality steps down:
//   level 1 → resolution cap 1.25x, level 2 → resolution cap 1x + reduced effects.
// It never steps back up automatically during a session (no oscillation); a page
// reload starts again at full quality. Pure logic: no rendering imports.
// ============================================================

export const QUALITY_LEVELS = [
    { dprCap: Infinity, reducedFx: false },
    { dprCap: 1.25, reducedFx: false },
    { dprCap: 1, reducedFx: true }
];

const WINDOW = 180;          // frames per evaluation window (~3 s at 60 Hz)
const MISS_RATIO = 0.2;      // more than 20 % slow frames → step down
const COOLDOWN_MS = 4000;    // after a change, wait (re-bakes cause one-off hitches)
const HITCH_MS = 250;        // longer gaps (tab switch, GC of a background tab) are ignored
const MIN_BUDGET_MS = 1000 / 60; // never demand more than 60 FPS before lowering quality

export class AdaptiveQuality {
    constructor() {
        this.level = 0;
        this.interval = 1000 / 60;   // estimated refresh interval (ms)
        this.intervals = [];         // first frames: refresh rate estimate
        this.count = 0;
        this.slow = 0;
        this.cooldownUntil = 0;
        this.enabled = true;
        // Diagnostics (dev overlay)
        this.fps = 0;
        this.frameMs = 0;
        this.fpsFrames = 0;
        this.fpsTime = 0;
    }

    /** A frame slower than this (ms) counts as missed: 1.5 × max(refresh interval, 60 FPS budget) */
    get slowThreshold() {
        return Math.max(this.interval, MIN_BUDGET_MS) * 1.5;
    }

    get settings() {
        return QUALITY_LEVELS[this.level];
    }

    /**
     * Feed one frame interval.
     * @param {number} dtMs time since the previous frame
     * @param {boolean} active true while a run is being played (menus are not judged)
     * @param {number} now current time (ms)
     * @returns {boolean} true when the level changed (caller re-applies resolution)
     */
    sample(dtMs, active, now) {
        if (!(dtMs > 0)) return false;
        // FPS readout (dev overlay)
        this.fpsFrames++;
        this.fpsTime += dtMs;
        if (this.fpsTime >= 500) {
            this.fps = (this.fpsFrames * 1000) / this.fpsTime;
            this.frameMs = this.fpsTime / this.fpsFrames;
            this.fpsFrames = 0;
            this.fpsTime = 0;
        }
        if (dtMs > HITCH_MS) return false;
        // Refresh interval: the fastest typical frame interval seen (60 / 90 / 120 Hz displays)
        if (this.intervals.length < 120) {
            this.intervals.push(dtMs);
            if (this.intervals.length === 120) {
                const sorted = [...this.intervals].sort((a, b) => a - b);
                this.interval = Math.max(1000 / 165, sorted[Math.floor(sorted.length * 0.25)]);
            }
            return false;
        }
        if (!this.enabled || !active || now < this.cooldownUntil || this.level >= QUALITY_LEVELS.length - 1) {
            this.count = 0;
            this.slow = 0;
            return false;
        }
        this.count++;
        if (dtMs > this.slowThreshold) this.slow++;
        if (this.count < WINDOW) return false;
        const missed = this.slow / this.count > MISS_RATIO;
        this.count = 0;
        this.slow = 0;
        if (!missed) return false;
        this.level++;
        this.cooldownUntil = now + COOLDOWN_MS;
        return true;
    }
}
