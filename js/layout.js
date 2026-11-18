// ============================================================
// layout.js — Ekran Yerleşimi & Arena Boyutlandırma
// Telefonda/tablette arena tüm ekranı kaplar (dikey veya yatay). Kısa kenar
// 600 mantıksal birim, uzun kenar ekran oranıyla uzar. Joystick ve DASH butonu
// arenanın üzerinde yarı şeffaf olarak durur. Masaüstünde 600x600 kare korunur.
// ============================================================

import { GAME_CONFIG } from './config.js';

let insetProbe = null;

// Telefon dikey tutulduğu (veya otomatik döndürme kapalı olduğu) halde oyun yatay
// oynansın diye içerik CSS ile 90° döndürülür. Bu durumda tüm dokunma koordinatları
// "sanal yatay" uzaya çevrilir.
let rotated = false;

export function isRotated() {
    return rotated;
}

/**
 * Oyunun gördüğü ekran boyutu (döndürülmüşse en/boy yer değiştirir)
 */
export function getViewport() {
    return rotated
        ? { w: window.innerHeight, h: window.innerWidth }
        : { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Ekran (client) koordinatını sanal görünüm koordinatına çevirir.
 * İçerik saat yönünde 90° döndürülür: sanal (u, v) → ekran (W − v, u)
 */
export function toVirtual(clientX, clientY) {
    if (!rotated) return { x: clientX, y: clientY };
    return { x: clientY, y: window.innerWidth - clientX };
}

/**
 * Çentik / ana ekran çubuğu güvenli alan boşluklarını (CSS px) okur
 */
export function getSafeInsets() {
    if (!insetProbe) {
        insetProbe = document.createElement('div');
        insetProbe.style.cssText =
            'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
            'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
        document.body.appendChild(insetProbe);
    }
    const cs = getComputedStyle(insetProbe);
    const ins = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0
    };
    if (!rotated) return ins;
    // Döndürülmüş görünümde kenarlar da döner: ekranın üstü sanal görünümün solu olur
    return { top: ins.right, right: ins.bottom, bottom: ins.left, left: ins.top };
}

function isCoarsePointer() {
    try {
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
        return false;
    }
}

/**
 * Mevcut ekrana göre arena ve canvas yerleşimini hesaplar.
 * Dokunmatik cihazda canvas tüm ekranı kaplar: kısa kenar 600 mantıksal birim,
 * uzun kenar ekran oranına göre uzar (dikey veya yatay fark etmez).
 * Masaüstünde klasik 600x600 kare arena korunur.
 * @returns {{fullscreen:boolean, landscape:boolean, arenaW:number, arenaH:number, cssW:number, cssH:number}}
 */
export function computeLayout() {
    const L = GAME_CONFIG.LAYOUT;
    const base = GAME_CONFIG.CANVAS.BASE_SIZE;
    const coarse = isCoarsePointer();

    // Yatay zorunluysa ve ekran dikey görünüyorsa içeriği döndür
    rotated = coarse && L.FORCE_LANDSCAPE && window.innerHeight > window.innerWidth;
    const { w: vw, h: vh } = getViewport();

    if (coarse) {
        const landscape = vw >= vh;
        const ratio = Math.max(vw, vh) / Math.max(1, Math.min(vw, vh));
        const longSide = Math.round(Math.min(L.MAX_ARENA_LONG, Math.max(base, base * ratio)));
        const arenaW = landscape ? longSide : base;
        const arenaH = landscape ? base : longSide;

        // Çok uzun ekranlarda üst sınır aşılırsa oranı koruyarak sığdır (nadiren siyah şerit)
        // Sınır aşılmadıysa ekranı birebir kapla (yuvarlama kaynaklı 1px boşluk olmasın)
        let cssW = vw;
        let cssH = vh;
        if (longSide < base * ratio - 0.5) {
            cssH = vw * (arenaH / arenaW);
            if (cssH > vh) {
                cssH = vh;
                cssW = vh * (arenaW / arenaH);
            }
        }
        return { fullscreen: true, landscape, rotated, arenaW, arenaH, cssW: Math.floor(cssW), cssH: Math.floor(cssH) };
    }

    const ins = getSafeInsets();
    const pad = L.PADDING;
    const availW = vw - Math.max(pad, ins.left) - Math.max(pad, ins.right);
    const availH = vh - Math.max(pad, ins.top) - Math.max(pad, ins.bottom);
    const size = Math.floor(Math.min(availW, availH, L.MAX_CSS_SIZE));
    return { fullscreen: false, landscape: false, rotated: false, arenaW: base, arenaH: base, cssW: size, cssH: size };
}
