// ============================================================
// theme.js — "Marshmallow Candy" Görsel Teması
// Marşmelov beyazı + mor + sakız pembesi; neon parlama yok,
// koyu mor konturlu yumuşak "çıkartma" şekilleri.
// ============================================================

/** Açık tema: marşmelov beyazı zemin */
const LIGHT = {
    BG: '#FFF6FA',          // Marşmelov beyazı
    BG_TOP: '#FFF6FA',      // Zemin geçişinin üst rengi (açıkta düz)
    BG_SOFT: '#FBE8F2',     // Hafif pembe gölge
    WHITE: '#FFFFFF',
    INK: '#4B2A6E',         // Kontur: koyu erik moru
    INK_SOFT: 'rgba(75, 42, 110, 0.55)',
    TEXT: '#4B2A6E',        // Panel ve zemin üstündeki ana metin
    TEXT_HALO: '#FFFFFF',   // Konturlu metnin dış hattı
    SURFACE: '#FFFFFF',     // Kart, panel, hap dolgusu
    SURFACE_SOFT: '#FBE8F2', // Kart içindeki yumuşak tepsi (sonuç istatistikleri)
    SCRIM: '255, 246, 250', // Panellerin arkasındaki perde (rgb)
    ROW_HIGHLIGHT: 'rgba(205, 184, 255, 0.45)',
    GRID_DOT: 'rgba(142, 91, 232, 0.16)',
    BLOB_ALPHA: 0.55,
    SPARKLE: '#E8A800',     // Değerli şeker ışıltısı
    MUTED: '#6F5A8C',       // İkincil metin (zeminde 5.6:1)
    PURPLE: '#8E5BE8',
    PURPLE_DEEP: '#6A3FC8',
    LAVENDER: '#CDB8FF',
    PINK: '#FF6FAE',        // Sakız pembesi
    PINK_DEEP: '#F0468F',
    PINK_SOFT: '#FFC4DE',
    SHADOW: 'rgba(75, 42, 110, 0.16)',
    TEXT_ACCENT: '#C2185B',  // Küçük pembe metinler (zeminde 5.5:1); dolgular için PINK/PINK_DEEP
    TEXT_PRIMARY: '#6A3FC8', // Küçük mor metinler; beyaz yazılı mor dolgular için PURPLE_DEEP
    SPRINKLES: ['#FF6FAE', '#8E5BE8', '#CDB8FF', '#FFC4DE', '#FFFFFF'],
    dark: false
};

/** Koyu tema "Gece Şekercisi": gece moru zemin, ay ışığında parlayan şekerler */
const DARK = {
    ...LIGHT,
    BG: '#150F22',
    BG_TOP: '#261A3D',
    BG_SOFT: '#2A1E44',
    WHITE: '#FFFDFE',
    INK: '#120B20',         // Şekillerin konturu koyu kalır (çıkartma görünümü)
    INK_SOFT: 'rgba(18, 11, 32, 0.6)',
    TEXT: '#F6EAFF',        // Ay kremi
    TEXT_HALO: '#120B20',
    SURFACE: '#2E2150',
    SURFACE_SOFT: '#241A3D',
    SCRIM: '21, 15, 34',
    ROW_HIGHLIGHT: 'rgba(205, 184, 255, 0.18)',
    GRID_DOT: 'rgba(205, 184, 255, 0.10)',
    BLOB_ALPHA: 0.12,
    SPARKLE: '#FFD36E',
    MUTED: '#B7A6D6',       // Lavanta ikincil metin
    SHADOW: 'rgba(0, 0, 0, 0.38)',
    TEXT_ACCENT: '#FF8DC0',
    TEXT_PRIMARY: '#C7A8FF',
    dark: true
};

export const THEME_MODES = ['system', 'light', 'dark'];

export const THEME = {
    ...LIGHT,
    mode: 'light',

    // Ayarlarla değişen görsel bayraklar
    BULLET_OUTLINE: 1.6,
    highContrast: false
};

/** Tercih + sistem ayarından gerçek tema: 'light' | 'dark' */
export function resolveTheme(pref, systemDark = false) {
    return pref === 'dark' || (pref === 'system' && systemDark) ? 'dark' : 'light';
}

/** Sistem karanlık modda mı? (DOM yoksa hayır) */
export function systemPrefersDark() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Paleti değiştirir; sayfa kenarlarını (CSS, adres çubuğu rengi) da eşitler
 * @param {'light'|'dark'} mode
 */
export function applyTheme(mode) {
    Object.assign(THEME, mode === 'dark' ? DARK : LIGHT);
    THEME.mode = mode === 'dark' ? 'dark' : 'light';
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = THEME.mode;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME.BG);
    }
    return THEME.mode;
}

/** Yüksek kontrast: kalın mermi konturu, sade arka plan */
export function setHighContrast(on) {
    THEME.highContrast = !!on;
    THEME.BULLET_OUTLINE = on ? 2.6 : 1.6;
}

/**
 * Yuvarlak hatlı yazı tipi tanımı
 * @param {number} size piksel
 * @param {number|string} weight
 */
export function font(size, weight = 600) {
    return `${weight} ${size}px "Fredoka", "Nunito", system-ui, sans-serif`;
}

/**
 * Şeker buton / kart: aşağı kaydırılmış koyu gölge + dolgu + kontur
 */
export function candyPanel(ctx, x, y, w, h, r, fill, { stroke = THEME.INK, lineWidth = 2, depth = 4, shadow = THEME.INK } = {}) {
    ctx.save();
    if (depth > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y + depth, w, h, r);
        ctx.fillStyle = shadow;
        ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (lineWidth > 0) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * Konturlu metin (zemine zıt dış hat ile her zeminde okunur)
 */
export function outlinedText(ctx, text, x, y, fill, outline = THEME.TEXT_HALO, width = 4) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
}
