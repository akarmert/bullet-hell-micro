// ============================================================
// render/glyphText.js — Text from pre-baked glyph sprites (no per-frame uploads)
// Used for numbers that change every frame (run timer, score). Each character is
// baked once (fill + optional outline) and laid out with its measured advance width.
// ============================================================

import { Container } from 'pixi.js';
import { font } from '../theme.js';
import { bake, applyBaked, TexState } from './textures.js';
import { SpritePool } from './worldView.js';

let measureCtx = null;
const advanceCache = new Map();

function advance(ch, fontStr) {
    const key = `${fontStr}|${ch}`;
    let a = advanceCache.get(key);
    if (a === undefined) {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = fontStr;
        a = measureCtx.measureText(ch).width;
        advanceCache.set(key, a);
    }
    return a;
}

/** Forget measured widths (after the real font finished loading). */
export function resetGlyphMetrics() {
    advanceCache.clear();
}

export class GlyphText {
    constructor() {
        this.container = new Container();
        // Outlines go in a layer under all fills, so a glyph's halo never covers its neighbour
        this.haloLayer = new Container();
        this.fillLayer = new Container();
        this.container.addChild(this.haloLayer, this.fillLayer);
        this.halos = new SpritePool(this.haloLayer);
        this.fills = new SpritePool(this.fillLayer);
        this.width = 0;
    }

    /**
     * @param {string} text
     * @param {number} x anchor x (logical units)
     * @param {number} y vertical centre (logical units)
     * @param {{ size:number, weight?:number, fill:string, halo?:string, haloWidth?:number, align?:'left'|'center'|'right' }} style
     */
    set(text, x, y, style) {
        const { size, weight = 700, fill, halo = null, haloWidth = 0, align = 'center' } = style;
        const fontStr = font(size, weight);
        let total = 0;
        for (const ch of text) total += advance(ch, fontStr);
        this.width = total;
        let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
        this.halos.begin();
        this.fills.begin();
        const pad = haloWidth / 2 + 2;
        const withHalo = !!(halo && haloWidth > 0);
        for (const ch of text) {
            const adv = advance(ch, fontStr);
            if (ch !== ' ') {
                const bounds = { x: -pad, y: -size, w: adv + pad * 2, h: size * 2 };
                if (withHalo) {
                    const he = bake(`glyphhalo:${ch}:${fontStr}:${halo}:${haloWidth}`, bounds, (ctx) => {
                        ctx.font = fontStr;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.lineJoin = 'round';
                        ctx.lineWidth = haloWidth;
                        ctx.strokeStyle = halo;
                        ctx.strokeText(ch, 0, 0);
                    });
                    const hs = this.halos.next();
                    applyBaked(hs, he);
                    hs.position.set(cx, y);
                }
                const fe = bake(`glyph:${ch}:${fontStr}:${fill}`, bounds, (ctx) => {
                    ctx.font = fontStr;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = fill;
                    ctx.fillText(ch, 0, 0);
                });
                const fs = this.fills.next();
                applyBaked(fs, fe);
                fs.position.set(cx, y);
            }
            cx += adv;
        }
        this.halos.end();
        this.fills.end();
        return this;
    }

    hide() {
        this.container.visible = false;
    }

    show() {
        this.container.visible = true;
    }
}
