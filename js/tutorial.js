// ============================================================
// tutorial.js — İlk Oyun İpuçları
// İlk turlarda zamanlanmış kısa ipuçları; 12 saniye hayatta kalınca
// öğretici tamamlanır. Jöle Kral ipucu ilk karşılaşmada bir kez çıkar.
// ============================================================

const KEY = 'bulletHellMicro_tutorial';
export const TUTORIAL_DONE_AT = 12000;

const STEPS = [
    { from: 300, to: 3600, mouse: 'fareyle kaç · kenarlara değme!', touch: 'joystick ile kaç · kenarlara değme!' },
    { from: 4000, to: 7600, mouse: 'mermilerin yanından sıyrıl → graze = puan', touch: 'mermilerin yanından sıyrıl → graze = puan' },
    { from: 8000, to: 11600, mouse: 'sağ tık / space → DASH: kısa süre dokunulmazsın', touch: 'DASH butonu: kısa süre dokunulmazsın' }
];
const BOSS_HINT = { duration: 4000, text: 'Jöle Kral: yakınında graze yap, dash ile içinden geç!' };

function load() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

export class Tutorial {
    constructor() {
        const saved = load();
        this.done = !!saved.done;
        this.bossSeen = !!saved.bossSeen;
        this.touch = false;
        this.bossHintAt = null;
        this.activeRun = false;
    }

    save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ done: this.done, bossSeen: this.bossSeen }));
        } catch (e) {
            // Kaydedilemezse ipuçları bir sonraki oturumda tekrar çıkar
        }
    }

    /** Yeni tur başlarken çağrılır */
    start(touch = false) {
        this.touch = touch;
        this.bossHintAt = null;
        this.activeRun = !this.done; // Tamamlanmamışsa bu turda adım ipuçları gösterilir
    }

    /** Ayarlardan: ipuçlarını baştan göster */
    resetProgress() {
        this.done = false;
        this.bossSeen = false;
        this.save();
    }

    /**
     * @param {number} elapsedMs
     * @param {boolean} bossPhase Boss şu an sahnede mi
     * @returns {{text:string, alpha:number}|null} Gösterilecek ipucu
     */
    update(elapsedMs, bossPhase = false) {
        if (!this.done && elapsedMs >= TUTORIAL_DONE_AT) {
            this.done = true;
            this.save();
        }
        if (bossPhase && !this.bossSeen) {
            this.bossSeen = true;
            this.bossHintAt = elapsedMs + 2000; // Giriş uyarısından sonra
            this.save();
        }

        if (this.bossHintAt !== null) {
            const t = elapsedMs - this.bossHintAt;
            if (t >= 0 && t < BOSS_HINT.duration) return { text: BOSS_HINT.text, alpha: fade(t, BOSS_HINT.duration) };
        }

        if (!this.activeRun) return null;
        for (const step of STEPS) {
            if (elapsedMs >= step.from && elapsedMs < step.to) {
                return { text: this.touch ? step.touch : step.mouse, alpha: fade(elapsedMs - step.from, step.to - step.from) };
            }
        }
        return null;
    }
}

function fade(t, duration) {
    return Math.min(1, t / 250, (duration - t) / 300);
}
