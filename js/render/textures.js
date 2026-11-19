// ============================================================
// render/textures.js — Texture baking, live canvas sprites, pooled particles
//
// The game's original Canvas 2D drawing code is kept as a *texture generator*:
// shapes are drawn once into an offscreen canvas and uploaded to the GPU.
// Nothing here draws to the screen directly; PixiJS does all on-screen rendering.
// ============================================================

import { Texture, Sprite, ParticleContainer, Particle } from 'pixi.js';

/** Global texture state: device pixels per logical unit, and a cache epoch. */
export const TexState = {
    res: 1,      // device px per logical unit (DPR × stage scale), quantized
    epoch: 0     // bumps on resolution / theme / language / font changes
};

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
}

// ------------------------------------------------------------
// Baked (static) textures
// ------------------------------------------------------------

const baked = new Map();
const MAX_BAKED = 600;

/**
 * Returns a cached texture for `key`, drawing it once if needed.
 * `bounds` is in logical units relative to the sprite origin; `draw(ctx)` draws
 * with that origin at (0, 0).
 * @returns {{ texture: Texture, anchorX: number, anchorY: number, scale: number }}
 */
export function bake(key, bounds, draw, res = TexState.res) {
    // Safety valve: an unexpected stream of unique keys must not grow GPU memory forever
    if (baked.size >= MAX_BAKED) invalidateBaked();
    const fullKey = `${key}@${res}#${TexState.epoch}`;
    let entry = baked.get(fullKey);
    if (entry) return entry;
    const pad = 2 / res;
    const x = bounds.x - pad;
    const y = bounds.y - pad;
    const w = bounds.w + pad * 2;
    const h = bounds.h + pad * 2;
    const canvas = makeCanvas(w * res, h * res);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(res, 0, 0, res, -x * res, -y * res);
    draw(ctx);
    const texture = Texture.from(canvas, true);
    texture.source.scaleMode = 'linear';
    entry = { texture, anchorX: -x / w, anchorY: -y / h, scale: 1 / res };
    baked.set(fullKey, entry);
    return entry;
}

/** Applies a baked entry to a sprite (texture, anchor, logical scale). */
export function applyBaked(sprite, entry, scale = 1) {
    if (sprite.texture !== entry.texture) sprite.texture = entry.texture;
    sprite.anchor.set(entry.anchorX, entry.anchorY);
    sprite.scale.set(entry.scale * scale);
}

// Textures replaced this frame are destroyed only after the next render,
// so nothing on stage ever points at a destroyed GPU resource.
const trash = [];

/** Drops every baked texture (resolution / theme / font change). */
export function invalidateBaked() {
    for (const entry of baked.values()) trash.push(entry.texture);
    baked.clear();
    TexState.epoch++;
}

/** Called by the renderer after a frame has been drawn. */
export function flushTextureTrash() {
    while (trash.length) trash.pop().destroy(true);
}

/** Destroys a texture after the next render (safe for objects still on stage this frame). */
export function retireTexture(texture) {
    if (texture) trash.push(texture);
}

/** Sets the bake resolution; quantized to 0.25 to avoid re-baking on tiny resizes. */
export function setBakeResolution(deviceScale) {
    const res = Math.max(0.5, Math.round(deviceScale * 4) / 4);
    if (res !== TexState.res) {
        TexState.res = res;
        invalidateBaked();
    }
}

// ------------------------------------------------------------
// Live canvas sprites (redrawn only when their state key changes)
// ------------------------------------------------------------

export class LiveCanvasSprite {
    constructor() {
        this.sprite = new Sprite(Texture.EMPTY);
        this.canvas = null;
        this.ctx = null;
        this.texture = null;
        this.key = null;
        this.uploads = 0; // For diagnostics
    }

    /**
     * Redraws into the backing canvas only if `key` (or the texture epoch) changed.
     * @param {string} key  Everything that affects the pixels
     * @param {{x:number,y:number,w:number,h:number}} bounds Logical region to cover
     * @param {(ctx: CanvasRenderingContext2D) => void} draw Draws in logical (world) coordinates
     */
    draw(key, bounds, draw) {
        const res = TexState.res;
        // Position is NOT part of the key: content is drawn relative to the bounds origin,
        // so a moving object only moves its sprite until its look actually changes.
        const fullKey = `${key}|${Math.ceil(bounds.w)}x${Math.ceil(bounds.h)}@${res}#${TexState.epoch}`;
        this.sprite.position.set(bounds.x, bounds.y);
        this.sprite.scale.set(1 / res);
        if (fullKey === this.key) return false;
        this.key = fullKey;
        // Grow-only backing canvas, rounded up to 32 px to avoid churn
        const needW = Math.ceil((bounds.w * res) / 32) * 32 || 32;
        const needH = Math.ceil((bounds.h * res) / 32) * 32 || 32;
        if (!this.canvas || this.canvas.width < needW || this.canvas.height < needH) {
            if (this.texture) retireTexture(this.texture);
            this.canvas = makeCanvas(Math.max(needW, this.canvas ? this.canvas.width : 0), Math.max(needH, this.canvas ? this.canvas.height : 0));
            this.ctx = this.canvas.getContext('2d');
            this.texture = Texture.from(this.canvas, true);
            this.sprite.texture = this.texture;
        }
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(res, 0, 0, res, -bounds.x * res, -bounds.y * res);
        ctx.save();
        draw(ctx);
        ctx.restore();
        this.texture.source.update();
        this.uploads++;
        return true;
    }

    hide() {
        this.sprite.visible = false;
    }

    show() {
        this.sprite.visible = true;
    }

    destroy() {
        if (this.texture) this.texture.destroy(true);
        this.sprite.destroy();
        this.canvas = null;
        this.ctx = null;
    }
}

// ------------------------------------------------------------
// Pooled ParticleContainer layer
// ------------------------------------------------------------

/**
 * A ParticleContainer whose particles are reused frame to frame.
 * All particles must share one texture source (atlas or a single texture).
 */
export class ParticleLayer {
    constructor(dynamic = { position: true, rotation: true, color: true, vertex: true, uvs: false }) {
        this.container = new ParticleContainer({ dynamicProperties: dynamic });
        this.pool = [];
        this.count = 0;
        this.lastCount = -1;
    }

    begin() {
        this.count = 0;
    }

    /** Adds (reuses) a particle for this frame. */
    add(texture, x, y, scaleX, scaleY, rotation, tint, alpha, anchorX = 0.5, anchorY = 0.5) {
        let p = this.pool[this.count];
        if (!p) {
            p = new Particle({ texture });
            this.pool.push(p);
        }
        if (p.texture !== texture) p.texture = texture;
        p.x = x;
        p.y = y;
        p.scaleX = scaleX;
        p.scaleY = scaleY;
        p.rotation = rotation;
        p.tint = tint;
        p.alpha = alpha;
        p.anchorX = anchorX;
        p.anchorY = anchorY;
        this.count++;
        return p;
    }

    end() {
        // The container draws every particle with one texture: keep it current (re-bakes)
        if (this.count > 0 && this.container.texture !== this.pool[0].texture) this.container.texture = this.pool[0].texture;
        const kids = this.container.particleChildren;
        if (this.count !== this.lastCount || kids.length !== this.count) {
            kids.length = 0;
            for (let i = 0; i < this.count; i++) kids.push(this.pool[i]);
            this.container.update();
            this.lastCount = this.count;
        }
    }
}

/** '#RRGGBB' or 'r, g, b' → 0xRRGGBB */
export function toTint(color) {
    if (typeof color === 'number') return color;
    if (color[0] === '#') {
        const hex = color.length === 4
            ? color.slice(1).split('').map(c => c + c).join('')
            : color.slice(1, 7);
        return parseInt(hex, 16);
    }
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]) : 0xffffff;
}
