// ============================================================
// ghost.js — Hayalet Tekrar
// En iyi skorlu turun yolu kaydedilir; sonraki turlarda saydam bir
// marşmelov olarak seninle aynı anda oynar. Konumlar arena boyutuna
// göre normalize edilir, böylece farklı ekranlarda da doğru yerdedir.
// ============================================================

const PREFIX = 'bulletHellMicro_ghost_';
export const GHOST_INTERVAL = 50;      // ms başına bir örnek
const MAX_SAMPLES = 3600;              // 3 dakika

export class GhostRecorder {
    constructor() {
        this.reset();
    }

    reset() {
        this.points = [];
        this.nextAt = 0;
    }

    /** Oynanış sırasında her frame çağrılır */
    sample(elapsedMs, x, y, width, height) {
        if (this.points.length >= MAX_SAMPLES * 2) return;
        while (elapsedMs >= this.nextAt) {
            this.points.push(Math.round((x / width) * 1000), Math.round((y / height) * 1000));
            this.nextAt += GHOST_INTERVAL;
            if (this.points.length >= MAX_SAMPLES * 2) break;
        }
    }

    toJSON(meta = {}) {
        return { v: 1, interval: GHOST_INTERVAL, points: this.points, ...meta };
    }
}

export class GhostTrack {
    constructor(data) {
        this.interval = data.interval || GHOST_INTERVAL;
        this.points = data.points || [];
        this.skin = data.skin || 'classic';
        this.score = data.score || 0;
    }

    get durationMs() {
        return (this.points.length / 2 - 1) * this.interval;
    }

    /**
     * Belirli zamandaki konum (iki örnek arasında doğrusal ara değer)
     * @returns {{x:number, y:number}|null} Tur bittiyse null
     */
    positionAt(elapsedMs, width, height) {
        const count = this.points.length / 2;
        if (count < 2 || elapsedMs > this.durationMs) return null;
        const f = Math.max(0, elapsedMs / this.interval);
        const i = Math.min(count - 2, Math.floor(f));
        const k = f - i;
        const p = this.points;
        const x = p[i * 2] + (p[i * 2 + 2] - p[i * 2]) * k;
        const y = p[i * 2 + 1] + (p[i * 2 + 3] - p[i * 2 + 1]) * k;
        return { x: (x / 1000) * width, y: (y / 1000) * height };
    }
}

/**
 * @param {string} modeKey Modun rekor anahtarı (günlükte tarihli)
 */
export function loadGhost(modeKey) {
    try {
        const raw = localStorage.getItem(PREFIX + modeKey);
        return raw ? new GhostTrack(JSON.parse(raw)) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Yeni en iyi turu kaydeder; eski günlerin günlük hayaletlerini temizler.
 */
export function saveGhost(modeKey, recorder, meta = {}) {
    try {
        if (modeKey.includes('_daily_')) {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith(PREFIX) && k.includes('_daily_') && k !== PREFIX + modeKey) localStorage.removeItem(k);
            }
        }
        localStorage.setItem(PREFIX + modeKey, JSON.stringify(recorder.toJSON(meta)));
        return true;
    } catch (e) {
        return false; // Kota dolu vb.
    }
}
