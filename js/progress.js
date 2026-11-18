// ============================================================
// progress.js — Kalıcı İstatistikler, Başarımlar ve Kostüm Seçimi
// ============================================================

import { SKINS, getSkin } from './skins.js';

const KEY = 'bulletHellMicro_progress';

const DEFAULT_STATS = {
    runs: 0,
    bestTime: 0,
    bestGrazeRun: 0,
    bestCombo: 0,
    bossKills: 0,
    hardcoreBest: 0,
    dailyDays: []
};

export class Progress {
    constructor() {
        this.stats = { ...DEFAULT_STATS, dailyDays: [] };
        this.unlocked = ['classic'];
        this.selected = 'classic';
        this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (!saved) return;
            this.stats = { ...DEFAULT_STATS, ...saved.stats, dailyDays: [...(saved.stats?.dailyDays || [])] };
            this.unlocked = Array.from(new Set(['classic', ...(saved.unlocked || [])]));
            this.selected = this.isUnlocked(saved.selected) ? saved.selected : 'classic';
        } catch (e) {
            // Bozuk kayıt: varsayılanlarla devam
        }
    }

    save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ stats: this.stats, unlocked: this.unlocked, selected: this.selected }));
        } catch (e) {
            // Kaydedilemezse oturum içinde geçerli kalır
        }
    }

    isUnlocked(id) {
        return this.unlocked.includes(id);
    }

    get skin() {
        return getSkin(this.selected);
    }

    select(id) {
        if (!this.isUnlocked(id)) return false;
        this.selected = id;
        this.save();
        return true;
    }

    /**
     * Tur bittiğinde istatistikleri işler ve yeni açılan kostümleri döner.
     * @param {{modeId:string, timeMs:number, graze:number, bestCombo:number, bossDefeated:boolean, dateKey?:string}} run
     * @returns {Array} Yeni açılan kostümler
     */
    recordRun(run) {
        const s = this.stats;
        s.runs++;
        s.bestTime = Math.max(s.bestTime, run.timeMs);
        s.bestGrazeRun = Math.max(s.bestGrazeRun, run.graze);
        s.bestCombo = Math.max(s.bestCombo, run.bestCombo);
        if (run.bossDefeated) s.bossKills++;
        if (run.modeId === 'hardcore') s.hardcoreBest = Math.max(s.hardcoreBest, run.timeMs);
        if (run.modeId === 'daily' && run.dateKey && !s.dailyDays.includes(run.dateKey)) {
            s.dailyDays.push(run.dateKey);
            if (s.dailyDays.length > 60) s.dailyDays.shift();
        }

        const fresh = [];
        for (const skin of SKINS) {
            if (!this.isUnlocked(skin.id) && skin.test(s)) {
                this.unlocked.push(skin.id);
                fresh.push(skin);
            }
        }
        this.save();
        return fresh;
    }
}
