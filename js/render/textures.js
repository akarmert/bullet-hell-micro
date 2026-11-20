// ============================================================
// render/textures.js — Texture baking, live canvas sprites, pooled particles
//
// The game's original Canvas 2D drawing code is kept as a *texture generator*:
// shapes are drawn once into an offscreen canvas and uploaded to the GPU.
// Nothing here draws to the screen directly; PixiJS does all on-screen rendering.
// ============================================================

import { Texture, Sprite, ParticleContainer, Particle, Rectangle } from 'pixi.js';

/** Diagnostics: how often each live texture re-uploads, and how many bytes go to the GPU. */
export const PerfStats = {
    bakedCount: () => baked.size,
    uploads: {},   // name → { count, bytes }
    bakes: 0,
    record(name, bytes) {
        const u = this.uploads[name] || (this.uploads[name] = { count: 0, bytes: 0 });
        u.count++;
        u.bytes += bytes;
    },
    reset() {
        this.uploads = {};
        this.bakes = 0;
    }
};

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
    PerfStats.bakes++;
    entry = { texture, anchorX: -x / w, anchorY: -y / h, scale: 1 / res };
    baked.set(fullKey, entry);
    return entry;
}

/**
 * Small shelf-packed texture atlas for frequently mixed sprites (bullets).
 * Every entry shares one GPU texture, so sprites of different shapes / colours
 * batch into a single draw call. Entries have the same shape as `bake()` results;
 * when the atlas is full, `get()` falls back to a separate baked texture.
 */
export class TextureAtlas {
    constructor(name, size = 1024) {
        this.name = name;
        this.size = size;
        this.canvas = null;
        this.ctx = null;
        this.source = null;
        this.entries = new Map();
        this.epoch = -1;
        this.res = 0;
        this.dirty = false;
        this.disabled = false;
    }

    reset() {
        if (!this.canvas) {
            this.canvas = makeCanvas(this.size, this.size);
            this.ctx = this.canvas.getContext('2d');
            const base = Texture.from(this.canvas, true);
            base.source.scaleMode = 'linear';
            this.source = base.source;
        }
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.size, this.size);
        for (const e of this.entries.values()) if (e.atlas) e.texture.destroy(false);
        this.entries.clear();
        this.cx = 1;
        this.cy = 1;
        this.rowH = 0;
        this.epoch = TexState.epoch;
        this.res = TexState.res;
        this.dirty = true;
    }

    get(key, bounds, draw) {
        if (this.disabled) return bake(`${this.name}:${key}`, bounds, draw);   // A/B benchmarks
        if (this.epoch !== TexState.epoch || this.res !== TexState.res) this.reset();
        let entry = this.entries.get(key);
        if (entry) return entry;
        const res = this.res;
        const pad = 2 / res;
        const x = bounds.x - pad;
        const y = bounds.y - pad;
        const w = bounds.w + pad * 2;
        const h = bounds.h + pad * 2;
        const pw = Math.ceil(w * res);
        const ph = Math.ceil(h * res);
        // Shelf packing with a 2 px gutter (no bleeding with linear filtering)
        if (this.cx + pw + 1 > this.size) {
            this.cx = 1;
            this.cy += this.rowH + 2;
            this.rowH = 0;
        }
        if (pw + 2 > this.size || this.cy + ph + 1 > this.size) {
            entry = bake(`${this.name}:${key}`, bounds, draw);
            this.entries.set(key, entry);
            return entry;
        }
        const px = this.cx;
        const py = this.cy;
        this.cx += pw + 2;
        this.rowH = Math.max(this.rowH, ph);
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();
        ctx.setTransform(res, 0, 0, res, px - x * res, py - y * res);
        draw(ctx);
        ctx.restore();
        const texture = new Texture({ source: this.source, frame: new Rectangle(px, py, pw, ph) });
        entry = { texture, anchorX: -x / w, anchorY: -y / h, scale: 1 / res, atlas: true };
        this.entries.set(key, entry);
        this.dirty = true;
        PerfStats.bakes++;
        return entry;
    }

    /** Uploads the atlas once per frame if entries were added. */
    flush() {
        if (!this.dirty || !this.source) return;
        this.dirty = false;
        this.source.update();
        PerfStats.record(this.name, this.size * this.size * 4);
    }
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
    constructor(name = 'live') {
        this.name = name;
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
     * @param {number} [resScale] fraction of the stage resolution to draw at
     */
    draw(key, bounds, draw, resScale = 1) {
        // resScale < 1 renders this texture below screen resolution (adaptive quality)
        const res = TexState.res * resScale;
        // Position is NOT part of the key: content is drawn relative to the bounds origin,
        // so a moving object only moves its sprite until its look actually changes.
        const fullKey = `${key}|${Math.ceil(bounds.w)}x${Math.ceil(bounds.h)}@${res}#${TexState.epoch}`;
        this.sprite.position.set(bounds.x, bounds.y);
        this.sprite.scale.set(1 / res);
        if (fullKey === this.key) return false;
        this.key = fullKey;
        // Backing canvas rounded up to 32 px to avoid churn
        const needW = Math.ceil((bounds.w * res) / 32) * 32 || 32;
        const needH = Math.ceil((bounds.h * res) / 32) * 32 || 32;
        // Grow when too small; shrink when more than twice the needed area (the whole canvas
        // is uploaded on every redraw, so a leftover large canvas wastes bandwidth)
        const tooSmall = !this.canvas || this.canvas.width < needW || this.canvas.height < needH;
        const tooBig = this.canvas && this.canvas.width * this.canvas.height > needW * needH * 2;
        if (tooSmall || tooBig) {
            if (this.texture) retireTexture(this.texture);
            this.canvas = tooBig
                ? makeCanvas(needW, needH)
                : makeCanvas(Math.max(needW, this.canvas ? this.canvas.width : 0), Math.max(needH, this.canvas ? this.canvas.height : 0));
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
        PerfStats.record(this.name, this.canvas.width * this.canvas.height * 4);
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
const tintCache = new Map();

/** CSS colour → 0xRRGGBB (cached: called for every bullet, every frame). */
export function toTint(color) {
    if (typeof color === 'number') return color;
    let v = tintCache.get(color);
    if (v === undefined) {
        v = parseTint(color);
        if (tintCache.size > 512) tintCache.clear();
        tintCache.set(color, v);
    }
    return v;
}

function parseTint(color) {
    if (color[0] === '#') {
        const hex = color.length === 4
            ? color.slice(1).split('').map(c => c + c).join('')
            : color.slice(1, 7);
        return parseInt(hex, 16);
    }
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]) : 0xffffff;
}
