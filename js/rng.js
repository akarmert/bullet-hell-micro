// ============================================================
// rng.js — Tohumlanabilir Rastgele Sayı Üreteci (mulberry32)
// Oynanışı etkileyen tüm rastgelelik buradan gelir; günlük meydan
// okumada herkes aynı tohumla aynı mermi dizisini görür.
// ============================================================

let state = (Math.random() * 2 ** 32) >>> 0;

/** 0 ≤ x < 1 */
export function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * @param {number|null} seed null → rastgele tohum
 */
export function seedRandom(seed = null) {
    state = (seed === null ? Math.random() * 2 ** 32 : seed) >>> 0;
}

/** Yerel tarih anahtarı: "2026-11-18" */
export function dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Metinden kararlı 32-bit tohum (FNV-1a) */
export function hashSeed(text) {
    let h = 0x811C9DC5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

import { getLang } from './i18n.js';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "18 Kasım" */
export function dateLabel(date = new Date()) {
    if (getLang() === 'en') return `${MONTHS_EN[date.getMonth()]} ${date.getDate()}`;
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
