// ============================================================
// quality.js — Grafik Kalite Seviyeleri & Otomatik FPS Uyarlaması
// Orta segment telefonlarda (ör. Samsung A54) Canvas shadowBlur ve yüksek
// çözünürlük kare süresini uzatır. FPS düşerse kalite kendiliğinden azalır
// ve seçim bir sonraki açılış için hatırlanır.
// ============================================================

const STORAGE_KEY = 'bulletHell_quality';

export const QUALITY_LEVELS = {
    //        çözünürlük sınırı | canlı gölge | ızgara | parçacık
    high:   { dpr: 2.0,  shadows: true,  grid: true,  particles: 1.0 },
    medium: { dpr: 1.5,  shadows: false, grid: true,  particles: 0.7 },
    low:    { dpr: 1.0,  shadows: false, grid: false, particles: 0.45 }
};
const ORDER = ['high', 'medium', 'low'];

const SLOW_FRAME_MS = 21;     // ~48 FPS altı "yavaş" sayılır
const SLOW_WINDOW_MS = 1500;  // Bu süre boyunca yavaşsa bir seviye düşür
const WARMUP_FRAMES = 60;     // Açılış / seviye değişimi sonrası ölçüm bekleme

function isCoarsePointer() {
    try {
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
        return false;
    }
}

export const Quality = {
    level: 'high',
    onChange: null,

    init() {
        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* yok say */ }
        // Telefonda varsayılan "medium": canlı gölgeler kapalı (ışımalar önbellekten çizilir)
        this.level = QUALITY_LEVELS[saved] ? saved : (isCoarsePointer() ? 'medium' : 'high');
        this.resetMonitor();
    },

    get settings() {
        return QUALITY_LEVELS[this.level];
    },

    get shadows() {
        return this.settings.shadows;
    },

    set(level, persist = true) {
        if (!QUALITY_LEVELS[level] || level === this.level) return;
        this.level = level;
        if (persist) {
            try { localStorage.setItem(STORAGE_KEY, level); } catch (e) { /* yok say */ }
        }
        this.resetMonitor();
        if (this.onChange) this.onChange(level);
    },

    resetMonitor() {
        this.frames = 0;
        this.slowMs = 0;
        this.avg = 16.7;
    },

    /**
     * Her karede ham kare süresiyle çağrılır (yalnızca oyun sırasında)
     * @param {number} frameMs
     */
    sample(frameMs) {
        if (frameMs > 250) return; // Sekme değişimi vb. ölçüm dışı
        this.frames++;
        this.avg = this.avg * 0.9 + frameMs * 0.1;
        if (this.frames < WARMUP_FRAMES) return;

        if (this.avg > SLOW_FRAME_MS) {
            this.slowMs += frameMs;
            if (this.slowMs > SLOW_WINDOW_MS) {
                const idx = ORDER.indexOf(this.level);
                if (idx < ORDER.length - 1) this.set(ORDER[idx + 1]);
                else this.resetMonitor();
            }
        } else {
            this.slowMs = Math.max(0, this.slowMs - frameMs * 0.5);
        }
    },

    /**
     * Context'in shadowBlur değerini kalite ayarına bağlar. Gölgeler kapalıyken
     * tüm shadowBlur atamaları 0'a çevrilir: kod tabanına dokunmadan en pahalı
     * Canvas işlemi devre dışı kalır.
     * @param {CanvasRenderingContext2D} ctx
     */
    patchContext(ctx) {
        const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
        if (!desc || !desc.set) return;
        const self = this;
        Object.defineProperty(ctx, 'shadowBlur', {
            configurable: true,
            get() { return desc.get.call(this); },
            set(v) { desc.set.call(this, self.shadows ? v : 0); }
        });
    }
};
