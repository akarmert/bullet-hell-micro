// ============================================================
// render/backdropView.js — Interactive menu / result-card background in PixiJS
// Light theme: drifting candies, cursor trail, pop bursts. Dark theme: twinkling
// stars, constellation lines, shooting stars, fireflies. State lives in MenuBackdrop.
// ============================================================

import { Container, Graphics, Sprite } from 'pixi.js';
import { THEME } from '../theme.js';
import { LINK_RADIUS, drawCandy } from '../menuBackdrop.js';
import { bake, applyBaked, ParticleLayer, toTint } from './textures.js';
import { dotEntry, DOT_RADIUS, glowEntry, GLOW_RADIUS, pillEntry, starEntry, STAR_RADIUS, streakEntry } from './shapes.js';

const CANDY_BAKE_SIZE = 20; // Candies are baked at their largest size and scaled down

function candyEntry(kind, color) {
    const s = CANDY_BAKE_SIZE;
    return bake(`candy:${kind}:${color}:${THEME.mode}`, { x: -s * 1.4, y: -s * 1.4, w: s * 2.8, h: s * 3.2 }, (ctx) => {
        drawCandy(ctx, { x: 0, y: 0, rot: 0, size: s, kind, color });
    });
}

export class BackdropView {
    constructor() {
        this.container = new Container();
        this.trail = new ParticleLayer();          // Cursor sprinkle trail (pill texture)
        this.candies = new Container();
        this.candyPool = [];
        this.lines = new Graphics();               // Constellation lines + ripples
        this.starDots = new ParticleLayer();
        this.starShapes = new ParticleLayer();
        this.streaks = new ParticleLayer({ position: true, rotation: true, color: true, vertex: true, uvs: false });
        this.streakHeads = new ParticleLayer();
        this.glows = new ParticleLayer();
        this.cores = new ParticleLayer();
        this.bursts = new ParticleLayer();
        this.container.addChild(
            this.trail.container, this.candies, this.lines,
            this.starDots.container, this.starShapes.container,
            this.streaks.container, this.streakHeads.container,
            this.glows.container, this.cores.container, this.bursts.container
        );
    }

    /**
     * @param {import('../menuBackdrop.js').MenuBackdrop} bd
     * @param {number} opacity 1 in the menu, softer inside the result card
     */
    sync(bd, opacity = 1) {
        const visible = !THEME.highContrast;
        this.container.visible = visible;
        if (!visible) return;
        const layers = [this.trail, this.starDots, this.starShapes, this.streaks, this.streakHeads, this.glows, this.cores, this.bursts];
        for (const l of layers) l.begin();
        this.lines.clear();
        let candyCount = 0;

        if (THEME.dark) {
            this.syncNight(bd, opacity);
        } else {
            const pill = pillEntry();
            for (const tr of bd.trail) {
                this.trail.add(pill.texture, tr.x, tr.y, pill.scale * (7 / 8), pill.scale * (2.8 / 3.2), tr.rot, toTint(tr.c), tr.life * 0.7 * opacity);
            }
            for (const c of bd.candies) {
                let sp = this.candyPool[candyCount];
                if (!sp) {
                    sp = new Sprite();
                    this.candyPool.push(sp);
                    this.candies.addChild(sp);
                }
                applyBaked(sp, candyEntry(c.kind, c.color), c.size / CANDY_BAKE_SIZE);
                sp.position.set(c.x, c.y);
                sp.rotation = c.rot;
                sp.alpha = 0.88 * opacity;
                sp.visible = true;
                candyCount++;
            }
        }
        for (let i = candyCount; i < this.candyPool.length; i++) this.candyPool[i].visible = false;

        // Ripples (both themes)
        for (const r of bd.ripples) {
            this.lines.circle(r.x, r.y, r.r).stroke({ width: Math.max(0.1, 3 * r.life), color: toTint(r.c), alpha: r.life * 0.7 * opacity });
        }
        // Pop bursts (both themes)
        const pill = pillEntry();
        for (const b of bd.bursts) {
            this.bursts.add(pill.texture, b.x, b.y, pill.scale, pill.scale, b.rot, toTint(b.c), Math.min(1, b.life * 1.5) * opacity);
        }
        for (const l of layers) l.end();
    }

    syncNight(bd, opacity) {
        const a = bd.attractor;
        const tw = bd.time * 1.6;
        const linked = bd.constellation();
        const linkAlpha = a.idle ? 0.35 : 0.6;
        const lav = toTint(THEME.LAVENDER);
        for (let i = 0; i < linked.length; i++) {
            const { s, d } = linked[i];
            const prev = i === 0 ? a : linked[i - 1].s;
            this.lines.moveTo(prev.x, prev.y).lineTo(s.x, s.y)
                .stroke({ width: 1.2, color: lav, alpha: (1 - d / LINK_RADIUS) * linkAlpha * opacity });
        }
        const linkedSet = new Set(linked.map(l => l.s));
        const dot = dotEntry();
        const star = starEntry();
        for (const s of bd.stars) {
            const lit = linkedSet.has(s) ? 0.55 : 0;
            const glow = Math.max(lit, s.flare);
            const alpha = Math.min(1, 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(tw + s.ph)) + glow * 0.7) * opacity;
            const r = (s.big ? 2.2 : 1.2) + glow * 2.2;
            if (glow > 0.3) {
                const k = (r * 1.9) / STAR_RADIUS;
                this.starShapes.add(star.texture, s.x, s.y, star.scale * k, star.scale * k, 0, toTint(s.c), alpha);
            } else {
                const k = r / DOT_RADIUS;
                this.starDots.add(dot.texture, s.x, s.y, dot.scale * k, dot.scale * k, 0, toTint(s.c), alpha);
            }
        }
        // Shooting stars: streak trailing behind the head
        const streak = streakEntry();
        for (const s of bd.shooting) {
            const len = Math.hypot(s.vx, s.vy) * 0.09;
            const ang = Math.atan2(-s.vy, -s.vx);
            const alpha = Math.min(1, s.life * 1.6) * opacity;
            this.streaks.add(streak.texture, s.x, s.y, streak.scale * (len / 100), streak.scale, ang, 0xffffff, alpha, 0, 0.5);
            const k = 4 / STAR_RADIUS;
            this.streakHeads.add(star.texture, s.x, s.y, star.scale * k, star.scale * k, 0, 0xfff6fa, alpha);
        }
        // Fireflies
        const glowTex = glowEntry();
        for (let i = 0; i < bd.fireflies.length; i++) {
            const f = bd.fireflies[i];
            const pulse = 0.5 + 0.5 * Math.sin(bd.time * 3 + f.orbit);
            const R = 9 + pulse * 5;
            const k = R / GLOW_RADIUS;
            this.glows.add(glowTex.texture, f.x, f.y, glowTex.scale * k, glowTex.scale * k, 0, i % 2 ? 0xff8dc0 : 0xcdb8ff, (0.55 + pulse * 0.3) * opacity);
            const c = 1.4 / DOT_RADIUS;
            this.cores.add(dot.texture, f.x, f.y, dot.scale * c, dot.scale * c, 0, 0xfff6fa, opacity);
        }
    }
}
