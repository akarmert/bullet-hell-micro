// ============================================================
// progress.js — Kalıcı İstatistikler, Başarımlar ve Kostüm Seçimi
// ============================================================

import { SKINS, getSkin } from './skins.js';
import { GAME_CONFIG } from './config.js';

const KEY = 'bulletHellMicro_progress';

const DEFAULT_STATS = {
    runs: 0,
    bestTime: 0,
    bestGrazeRun: 0,
    bestCombo: 0,
    bossKills: 0,
    bossesBeaten: [],
    hardcoreBest: 0,
    dailyDays: []
};

export class Progress {
    constructor() {
        this.stats = { ...DEFAULT_STATS, dailyDays: [], bossesBeaten: [] };
        this.unlocked = ['classic'];
        this.selected = 'classic';
        this.candies = 0;
        this.load();
    }

    /** Tur sonunda kazanılacak şeker: puan / 200 + boss başına 15 */
    static runReward(score, bossKills = 0) {
        const C = GAME_CONFIG.CANDY;
        return Math.max(0, Math.floor((score || 0) / C.POINTS_PER) + (bossKills || 0) * C.PER_BOSS);
    }

    addCandies(n) {
        const amount = Math.max(0, Math.floor(n || 0));
        this.candies += amount;
        this.save();
        return amount;
    }

    /** Kostüm şekerle alınabilir mi (fiyatı var ve henüz açılmamış)? */
    isForSale(id) {
        const skin = SKINS.find(s => s.id === id);
        return !!(skin && skin.price && !this.isUnlocked(id));
    }

    /**
     * Şekerle kostüm alır ve hemen seçer
     * @returns {boolean} Başarılı mı
     */
    buy(id) {
        const skin = SKINS.find(s => s.id === id);
        if (!skin || !this.isForSale(id) || this.candies < skin.price) return false;
        this.candies -= skin.price;
        this.unlocked.push(id);
        this.selected = id;
        this.save();
        return true;
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (!saved) return;
            this.stats = {
                ...DEFAULT_STATS,
                ...saved.stats,
                dailyDays: [...(saved.stats?.dailyDays || [])],
                bossesBeaten: [...(saved.stats?.bossesBeaten || [])]
            };
            this.unlocked = Array.from(new Set(['classic', ...(saved.unlocked || [])]));
            this.selected = this.isUnlocked(saved.selected) ? saved.selected : 'classic';
            this.candies = Math.max(0, Math.floor(saved.candies || 0));
        } catch (e) {
            // Bozuk kayıt: varsayılanlarla devam
        }
    }

    save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ stats: this.stats, unlocked: this.unlocked, selected: this.selected, candies: this.candies }));
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
     * @param {{modeId:string, timeMs:number, graze:number, bestCombo:number, bossKills?:number, bossesBeaten?:string[], bossDefeated?:boolean, dateKey?:string}} run
     * @returns {Array} Yeni açılan kostümler
     */
    recordRun(run) {
        const s = this.stats;
        s.runs++;
        s.bestTime = Math.max(s.bestTime, run.timeMs);
        s.bestGrazeRun = Math.max(s.bestGrazeRun, run.graze);
        s.bestCombo = Math.max(s.bestCombo, run.bestCombo);
        s.bossKills += run.bossKills ?? (run.bossDefeated ? 1 : 0);
        for (const kind of run.bossesBeaten || (run.bossDefeated ? ['jelly'] : [])) {
            if (!s.bossesBeaten.includes(kind)) s.bossesBeaten.push(kind);
        }
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
