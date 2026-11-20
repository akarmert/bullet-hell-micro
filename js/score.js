// ============================================================
// score.js — Skor ve Graze Serisi (Combo)
// Skor = hayatta kalınan süre + seri çarpanlı graze puanları + boss bonusu
// ============================================================

import { getLang } from './i18n.js';

export const SCORE = {
    POINTS_PER_SECOND: 100,
    GRAZE_POINTS: 25,
    COMBO_WINDOW: 900,   // ms: bu sürede yeni graze gelmezse seri biter
    COMBO_STEP: 5,       // Her 5 grazede çarpan +1
    MAX_MULTIPLIER: 5,
    BOSS_BONUS: 3000
};

export class ScoreSystem {
    constructor() {
        this.reset();
    }

    reset() {
        this.points = 0;
        this.combo = 0;
        this.bestCombo = 0;
        this.comboTimer = 0;
        this.popups = []; // Oyuncu yanında süzülen "+50" yazıları
    }

    get total() {
        return Math.floor(this.points);
    }

    get multiplier() {
        return Math.min(SCORE.MAX_MULTIPLIER, 1 + Math.floor(this.combo / SCORE.COMBO_STEP));
    }

    /** Seri penceresinin kalan oranı (0-1), HUD barı için */
    get comboRatio() {
        return this.combo > 0 ? Math.max(0, this.comboTimer / SCORE.COMBO_WINDOW) : 0;
    }

    /**
     * @param {number} dtMs Oyun zamanında geçen süre
     */
    update(dtMs) {
        this.points += (dtMs / 1000) * SCORE.POINTS_PER_SECOND;
        if (this.combo > 0) {
            this.comboTimer -= dtMs;
            if (this.comboTimer <= 0) {
                this.combo = 0;
                this.comboTimer = 0;
            }
        }
        let n = 0;
        for (let i = 0; i < this.popups.length; i++) {
            const p = this.popups[i];
            p.age += dtMs;
            if (p.age < 700) this.popups[n++] = p;
        }
        this.popups.length = n;
    }

    /**
     * @returns {{combo:number, multiplier:number, points:number}}
     */
    onGraze(x = 0, y = 0) {
        this.combo++;
        this.comboTimer = SCORE.COMBO_WINDOW;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const multiplier = this.multiplier;
        const points = SCORE.GRAZE_POINTS * multiplier;
        this.points += points;
        if (this.popups.length > 12) this.popups.shift();
        this.popups.push({ x, y, text: `+${points}`, multiplier, age: 0 });
        return { combo: this.combo, multiplier, points };
    }

    onBossDefeat(x = 0, y = 0) {
        this.points += SCORE.BOSS_BONUS;
        this.popups.push({ x, y, text: `+${SCORE.BOSS_BONUS}`, multiplier: SCORE.MAX_MULTIPLIER, age: 0, big: true });
    }
}

/** 12345 → "12.345" (EN: "12,345") */
export function formatScore(n) {
    const sep = getLang() === 'en' ? ',' : '.';
    return Math.floor(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
