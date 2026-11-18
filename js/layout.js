// ============================================================
// layout.js — Ekran Yerleşimi & Arena Boyutlandırma
// Telefonda/tablette arena tüm ekranı kaplar (dikey veya yatay). Kısa kenar
// 600 mantıksal birim, uzun kenar ekran oranıyla uzar. Joystick ve DASH butonu
// arenanın üzerinde yarı şeffaf olarak durur. Masaüstünde 600x600 kare korunur.
// ============================================================

import { GAME_CONFIG } from './config.js';

let insetProbe = null;

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
    return {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0
    };
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
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const base = GAME_CONFIG.CANVAS.BASE_SIZE;

    if (isCoarsePointer()) {
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
        return { fullscreen: true, landscape, arenaW, arenaH, cssW: Math.floor(cssW), cssH: Math.floor(cssH) };
    }

    const ins = getSafeInsets();
    const pad = L.PADDING;
    const availW = vw - Math.max(pad, ins.left) - Math.max(pad, ins.right);
    const availH = vh - Math.max(pad, ins.top) - Math.max(pad, ins.bottom);
    const size = Math.floor(Math.min(availW, availH, L.MAX_CSS_SIZE));
    return { fullscreen: false, landscape: false, arenaW: base, arenaH: base, cssW: size, cssH: size };
}
