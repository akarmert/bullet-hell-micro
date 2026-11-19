// ============================================================
// render/shapes.js — Shared white shape textures (tinted on the GPU)
// One texture per shape lets hundreds of dots / glows / sprinkles batch together.
// ============================================================

import { bake } from './textures.js';

const DOT_R = 8;
const GLOW_R = 32;
const STAR_R = 8;

/** Solid white circle, radius DOT_R logical units. scale = radius / DOT_R */
export function dotEntry() {
    return bake('shape:dot', { x: -DOT_R, y: -DOT_R, w: DOT_R * 2, h: DOT_R * 2 }, (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    });
}
export const DOT_RADIUS = DOT_R;

/** White radial glow: opaque centre fading to transparent at GLOW_R. scale = radius / GLOW_R */
export function glowEntry() {
    return bake('shape:glow', { x: -GLOW_R, y: -GLOW_R, w: GLOW_R * 2, h: GLOW_R * 2 }, (ctx) => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, GLOW_R);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-GLOW_R, -GLOW_R, GLOW_R * 2, GLOW_R * 2);
    }, 1);
}
export const GLOW_RADIUS = GLOW_R;

/** Bullet halo (dark theme): solid from 0.6/2.6 of the radius, fading out at the edge */
export function haloEntry() {
    return bake('shape:halo', { x: -GLOW_R, y: -GLOW_R, w: GLOW_R * 2, h: GLOW_R * 2 }, (ctx) => {
        const g = ctx.createRadialGradient(0, 0, GLOW_R * (0.6 / 2.6), 0, 0, GLOW_R);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-GLOW_R, -GLOW_R, GLOW_R * 2, GLOW_R * 2);
    }, 1);
}

/** Rounded sprinkle (8 × 3.2 logical units) */
export function pillEntry() {
    return bake('shape:pill', { x: -4, y: -1.6, w: 8, h: 3.2 }, (ctx) => {
        ctx.beginPath();
        ctx.roundRect(-4, -1.6, 8, 3.2, 1.6);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    }, 4);
}

/** Five-point star (outer STAR_R, inner STAR_R × 0.7/1.9) */
export function starEntry() {
    return bake('shape:star', { x: -STAR_R, y: -STAR_R, w: STAR_R * 2, h: STAR_R * 2 }, (ctx) => {
        drawStarPath(ctx, 0, 0, STAR_R, STAR_R * (0.7 / 1.9));
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    });
}
export const STAR_RADIUS = STAR_R;

/** Shooting star streak: 100 units long, bright head at x=0 fading towards +x */
export function streakEntry() {
    return bake('shape:streak', { x: 0, y: -1.5, w: 100, h: 3 }, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 100, 0);
        g.addColorStop(0, 'rgba(255, 246, 250, 0.95)');
        g.addColorStop(1, 'rgba(255, 141, 192, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(0, -1.5, 100, 3, 1.5);
        ctx.fill();
    }, 2);
}

export function drawStarPath(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r : R;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
}

/** 'rgba(r, g, b, a)' → { tint, alpha } */
export function parseRgba(str, fallbackAlpha = 1) {
    const m = String(str).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
    if (!m) return { tint: 0xffffff, alpha: fallbackAlpha };
    return {
        tint: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
        alpha: m[4] !== undefined ? Number(m[4]) : fallbackAlpha
    };
}
