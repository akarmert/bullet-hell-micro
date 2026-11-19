// ============================================================
// render/fxView.js — Effects in PixiJS: confetti particles, shockwaves, flash, banner
// ============================================================

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GAME_CONFIG } from '../config.js';
import { THEME, font, candyPanel } from '../theme.js';
import { bake, applyBaked, LiveCanvasSprite, toTint } from './textures.js';
import { SpritePool } from './worldView.js';

const PILL_L = 8;
const PILL_W = 2.6;

/** Confetti piece (pill or ball) in one colour with the soft ink outline, baked once. */
function confettiEntry(round, color) {
    return bake(`confetti:${round ? 'ball' : 'pill'}:${color}:${THEME.mode}`, { x: -6, y: -4, w: 12, h: 8 }, (ctx) => {
        ctx.beginPath();
        if (round) ctx.arc(0, 0, PILL_W * 0.9, 0, Math.PI * 2);
        else ctx.roundRect(-PILL_L / 2, -PILL_W / 2, PILL_L, PILL_W, PILL_W / 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = THEME.INK_SOFT;
        ctx.stroke();
    }, 4);
}

export class FxView {
    constructor() {
        this.container = new Container();
        this.shockwaves = new Graphics();
        this.particleLayer = new Container();
        this.particles = new SpritePool(this.particleLayer);
        this.flash = new Sprite(Texture.WHITE);
        this.flash.tint = 0xffc4de;
        this.banner = new LiveCanvasSprite();
        this.container.addChild(this.shockwaves, this.particleLayer, this.flash, this.banner.sprite);
        this.stats = { particles: 0 };
    }

    sync(effects, w, h) {
        // Shockwaves: thick soft rings
        const g = this.shockwaves;
        g.clear();
        for (const sw of effects.shockwaves) {
            g.circle(sw.x, sw.y, Math.max(0.1, sw.radius)).stroke({ width: 6 * sw.alpha + 1, color: toTint(sw.color), alpha: sw.alpha * 0.8 });
        }

        // Candy confetti
        this.particles.begin();
        for (const p of effects.particles) {
            if (p.life <= 0) continue;
            const sp = this.particles.next();
            const entry = confettiEntry(p.round, p.color);
            applyBaked(sp, entry);
            if (p.round) sp.scale.set(entry.scale * (p.width / PILL_W));
            else sp.scale.set(entry.scale * (p.length / PILL_L), entry.scale * (p.width / PILL_W));
            sp.position.set(p.x, p.y);
            sp.rotation = p.rotation;
            sp.alpha = Math.min(1, (p.life / p.maxLife) * 1.8);
        }
        this.particles.end();
        this.stats.particles = this.particles.used;

        // Pink flash
        const flashOn = effects.motionEnabled && effects.flashAlpha > 0.01;
        this.flash.visible = flashOn;
        if (flashOn) {
            this.flash.width = w;
            this.flash.height = h;
            this.flash.alpha = effects.flashAlpha;
        }

        // Banner (candy label under the timer / boss bar)
        if (effects.bannerTimer > 0) {
            this.banner.show();
            this.banner.sprite.alpha = Math.min(1, effects.bannerTimer / 300);
            const cx = GAME_CONFIG.CANVAS.WIDTH / 2;
            const cy = 148;
            const key = `${effects.bannerText}|${effects.bannerColor}|${THEME.mode}`;
            this.banner.draw(key, { x: cx - 320, y: cy - 22, w: 640, h: 48 }, (ctx) => {
                ctx.font = font(16, 700);
                const tw = ctx.measureText(effects.bannerText).width;
                ctx.translate(cx, cy);
                candyPanel(ctx, -tw / 2 - 16, -15, tw + 32, 30, 15, THEME.SURFACE, { depth: 3, shadow: effects.bannerColor });
                ctx.fillStyle = THEME.TEXT;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(effects.bannerText, 0, 1);
            });
        } else {
            this.banner.hide();
        }
    }
}

export { applyBaked };
