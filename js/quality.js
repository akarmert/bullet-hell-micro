// ============================================================
// quality.js — Adaptive render quality (frame pacing watchdog)
//
// Watches real frame intervals while a run is being played. If many frames miss
// the display's refresh interval for a sustained period, quality steps down:
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
        if (dtMs > this.interval * 1.5) this.slow++;
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
