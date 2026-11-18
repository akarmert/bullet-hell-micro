// ============================================================
// theme.js — "Marshmallow Candy" Görsel Teması
// Marşmelov beyazı + mor + sakız pembesi; neon parlama yok,
// koyu mor konturlu yumuşak "çıkartma" şekilleri.
// ============================================================

export const THEME = {
    BG: '#FFF6FA',          // Marşmelov beyazı
    BG_SOFT: '#FBE8F2',     // Hafif pembe gölge
    WHITE: '#FFFFFF',
    INK: '#4B2A6E',         // Kontur ve metin: koyu erik moru
    INK_SOFT: 'rgba(75, 42, 110, 0.55)',
    MUTED: '#9C86B8',       // İkincil metin
    PURPLE: '#8E5BE8',
    PURPLE_DEEP: '#6A3FC8',
    LAVENDER: '#CDB8FF',
    PINK: '#FF6FAE',        // Sakız pembesi
    PINK_DEEP: '#F0468F',
    PINK_SOFT: '#FFC4DE',
    SHADOW: 'rgba(75, 42, 110, 0.16)',
    SPRINKLES: ['#FF6FAE', '#8E5BE8', '#CDB8FF', '#FFC4DE', '#FFFFFF'],

    // Ayarlarla değişen görsel bayraklar
    BULLET_OUTLINE: 1.6,
    highContrast: false
};

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
 * Konturlu metin (beyaz dış hat ile her zeminde okunur)
 */
export function outlinedText(ctx, text, x, y, fill, outline = THEME.WHITE, width = 4) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
}
