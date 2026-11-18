// ============================================================
// layout.js — Ekran Yerleşimi & Arena Boyutlandırma
// Telefon yatay tutulduğunda arena ekran oranına göre genişler (yükseklik 600
// sabit kalır, genişlik 600–1200 arası). Sol ve sağda başparmaklar için boşluk
// (gutter) bırakılır; joystick ve DASH butonu arenayı kapatmaz.
// Masaüstü ve dikey ekranda klasik 600x600 kare arena korunur.
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
 * Mevcut ekrana göre arena ve canvas yerleşimini hesaplar
 * @returns {{landscape:boolean, arenaW:number, arenaH:number, cssW:number, cssH:number, gutter:number}}
 */
export function computeLayout() {
    const L = GAME_CONFIG.LAYOUT;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ins = getSafeInsets();
    const pad = L.PADDING;

    const availH = vh - Math.max(pad, ins.top) - Math.max(pad, ins.bottom);
    const landscape = isCoarsePointer() && vw > vh * L.LANDSCAPE_MIN_RATIO;

    if (landscape) {
        // Başparmak bölgeleri: ekran genişliğine oranlı, sınırlı
        const gutter = Math.round(Math.min(L.GUTTER_MAX, Math.max(L.GUTTER_MIN, vw * L.GUTTER_RATIO)));
        const availW = vw - 2 * gutter - ins.left - ins.right;

        const arenaH = GAME_CONFIG.CANVAS.BASE_SIZE;
        const ratio = Math.max(1, availW / availH);
        const arenaW = Math.round(Math.min(L.MAX_ARENA_W, Math.max(arenaH, arenaH * ratio)));

        let cssH = availH;
        let cssW = cssH * (arenaW / arenaH);
        if (cssW > availW) {
            cssW = availW;
            cssH = cssW * (arenaH / arenaW);
        }
        return { landscape, arenaW, arenaH, cssW: Math.floor(cssW), cssH: Math.floor(cssH), gutter };
    }

    // Dikey / masaüstü: kare arena
    const availW = vw - Math.max(pad, ins.left) - Math.max(pad, ins.right);
    const size = Math.floor(Math.min(availW, availH, L.MAX_CSS_SIZE));
    const base = GAME_CONFIG.CANVAS.BASE_SIZE;
    return { landscape: false, arenaW: base, arenaH: base, cssW: size, cssH: size, gutter: 0 };
}
