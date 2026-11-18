// ============================================================
// settings.js — Kalıcı Oyuncu Ayarları
// Ses seviyeleri, ekran sarsıntısı/flaş, yüksek kontrast
// ============================================================

const KEY = 'bulletHellMicro_settings';

export const SETTING_ROWS = [
    { id: 'musicVolume', label: 'müzik sesi', type: 'volume' },
    { id: 'sfxVolume', label: 'efekt sesi', type: 'volume' },
    { id: 'shake', label: 'sarsıntı ve flaş', type: 'toggle' },
    { id: 'contrast', label: 'yüksek kontrast', type: 'toggle' },
    { id: 'tutorial', label: 'ipuçlarını tekrar göster', type: 'action' },
    { id: 'close', label: 'kapat', type: 'action' }
];

export class Settings {
    constructor() {
        this.values = { musicVolume: 0.8, sfxVolume: 0.9, shake: true, contrast: false };
        this.listeners = [];
        this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
            for (const k of Object.keys(this.values)) {
                if (typeof saved[k] === typeof this.values[k]) this.values[k] = saved[k];
            }
        } catch (e) {
            // varsayılanlar
        }
    }

    save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(this.values));
        } catch (e) {
            // oturum içinde geçerli
        }
    }

    get(id) {
        return this.values[id];
    }

    onChange(fn) {
        this.listeners.push(fn);
        fn(this.values);
    }

    /**
     * Bir satırı değiştirir: ses seviyeleri %10 adımla, anahtarlar aç/kapa.
     * @param {string} id
     * @param {number} dir -1 / +1 (anahtarlarda yön önemsiz)
     */
    adjust(id, dir = 1) {
        const v = this.values[id];
        if (typeof v === 'number') {
            this.values[id] = Math.round(Math.max(0, Math.min(1, v + dir * 0.1)) * 10) / 10;
        } else if (typeof v === 'boolean') {
            this.values[id] = !v;
        } else {
            return;
        }
        this.save();
        for (const fn of this.listeners) fn(this.values);
    }

    /** Satırın görünen değeri */
    display(id) {
        const v = this.values[id];
        if (typeof v === 'number') return `%${Math.round(v * 100)}`;
        if (typeof v === 'boolean') return v ? 'açık' : 'kapalı';
        return '';
    }
}
