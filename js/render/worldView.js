// ============================================================
// render/worldView.js — Background and play-field rendering in PixiJS
//
// Draw order (back to front) matches the old Canvas 2D renderer:
// background → stars / grid dots → telegraphs → pickups → coins → boss → ghost
// → bullet trails → bullet halos → bullets → player → score popups / combo pill.
// ============================================================

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GAME_CONFIG } from '../config.js';
import { THEME, font, outlinedText } from '../theme.js';
import { Bullet, drawCapsule } from '../bullet.js';
import { getSkin, drawMarshmallow } from '../skins.js';
import { t, getLang } from '../i18n.js';
import { bake, applyBaked, LiveCanvasSprite, ParticleLayer, toTint } from './textures.js';
import { dotEntry, DOT_RADIUS, glowEntry, GLOW_RADIUS, haloEntry, parseRgba } from './shapes.js';

/** 30 Hz animation clock used in redraw keys (live sprites redraw at most 30×/s). */
const tick30 = (seconds) => Math.floor(seconds * 30);

// ------------------------------------------------------------
// Bullet body textures (one per shape / colour / size / outline / theme)
// ------------------------------------------------------------

function bulletEntry(b) {
    const key = `bullet:${b.shape}:${b.color}:${b.radius}:${THEME.BULLET_OUTLINE}:${THEME.mode}`;
    const R = b.radius * 3;
    return bake(key, { x: -R, y: -R, w: R * 2, h: R * 2 }, (ctx) => {
        const fake = Object.create(Bullet.prototype);
        Object.assign(fake, { x: 0, y: 0, rotation: 0, radius: b.radius, color: b.color, age: 0, spinAngle: 0, trail: [] });
        ctx.lineWidth = THEME.BULLET_OUTLINE;
        ctx.strokeStyle = THEME.INK;
        ctx.lineJoin = 'round';
        switch (b.shape) {
            case 'diamond': fake.renderDiamond(ctx); break;
            case 'capsule':
                ctx.lineWidth = THEME.BULLET_OUTLINE;
                drawCapsule(ctx, b.color, b.radius);
                break;
            case 'ring': fake.renderRing(ctx); break;
            case 'bubble': fake.renderBubble(ctx); break;
            case 'saw': Bullet.drawSawBody(ctx, b.radius, b.color); break;
            default: fake.renderCircle(ctx); break;
        }
    });
}

function sawFaceEntry(radius) {
    const R = radius * 2;
    return bake(`sawface:${radius}:${THEME.mode}`, { x: -R, y: -R, w: R * 2, h: R * 2 }, (ctx) => Bullet.drawSawFace(ctx, radius));
}

/** Sprite pool that hides unused sprites instead of destroying them. */
class SpritePool {
    constructor(parent) {
        this.parent = parent;
        this.items = [];
        this.used = 0;
    }

    begin() {
        this.used = 0;
    }

    next() {
        let s = this.items[this.used];
        if (!s) {
            s = new Sprite();
            this.items.push(s);
            this.parent.addChild(s);
        }
        s.visible = true;
        this.used++;
        return s;
    }

    end() {
        for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
    }
}

/** Pool of live canvas sprites (pickups, coins). */
class LivePool {
    constructor(parent) {
        this.parent = parent;
        this.items = [];
        this.used = 0;
    }

    begin() {
        this.used = 0;
    }

    next() {
        let s = this.items[this.used];
        if (!s) {
            s = new LiveCanvasSprite();
            this.items.push(s);
            this.parent.addChild(s.sprite);
        }
        s.show();
        this.used++;
        return s;
    }

    end() {
        for (let i = this.used; i < this.items.length; i++) this.items[i].hide();
    }
}

export class WorldView {
    constructor() {
        // Background (never shaken)
        this.background = new Container();
        this.bgFill = new Sprite(Texture.WHITE);
        this.bgSky = new Sprite();
        this.blobs = new ParticleLayer();
        this.background.addChild(this.bgFill, this.bgSky, this.blobs.container);

        // Play field (shaken with the screen)
        this.field = new Container();
        this.stars = new ParticleLayer();
        this.gridDots = new ParticleLayer();
        this.telegraphLines = new Graphics();
        this.telegraphDots = new ParticleLayer();
        this.pickupLayer = new Container();
        this.coinLayer = new Container();
        this.bossSprite = new LiveCanvasSprite();
        this.ghostSprite = new LiveCanvasSprite();
        this.trails = new ParticleLayer();
        this.halos = new ParticleLayer();
        this.bulletLayer = new Container();
        this.sawFaceLayer = new Container();
        this.playerSprite = new LiveCanvasSprite();
        this.popupLayer = new Container();
        this.comboSprite = new LiveCanvasSprite();
        this.field.addChild(
            this.stars.container, this.gridDots.container,
            this.telegraphLines, this.telegraphDots.container,
            this.pickupLayer, this.coinLayer,
            this.bossSprite.sprite, this.ghostSprite.sprite,
            this.trails.container, this.halos.container, this.bulletLayer, this.sawFaceLayer,
            this.playerSprite.sprite, this.popupLayer, this.comboSprite.sprite
        );
        this.pickups = new LivePool(this.pickupLayer);
        this.coins = new LivePool(this.coinLayer);
        this.bulletSprites = new SpritePool(this.bulletLayer);
        this.sawFaces = new SpritePool(this.sawFaceLayer);
        this.popups = new SpritePool(this.popupLayer);
        this.starList = null;
        this.stats = { bullets: 0, sprites: 0 };
    }

    // ------------------------------------------------------------
    // Background: flat colour (light) or night gradient (dark) + drifting pastel blobs
    // ------------------------------------------------------------
    syncBackground(game, w, h) {
        this.bgFill.tint = toTint(THEME.BG);
        this.bgFill.width = w;
        this.bgFill.height = h;
        this.bgSky.visible = THEME.dark;
        if (THEME.dark) {
            const sky = bake(`sky:${THEME.BG_TOP}:${THEME.BG}`, { x: 0, y: 0, w: 4, h: 600 }, (ctx) => {
                const g = ctx.createLinearGradient(0, 0, 0, 600);
                g.addColorStop(0, THEME.BG_TOP);
                g.addColorStop(1, THEME.BG);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, 4, 600);
            }, 1);
            this.bgSky.texture = sky.texture;
            this.bgSky.anchor.set(0, 0);
            this.bgSky.width = w;
            this.bgSky.height = h;
        }
        this.blobs.begin();
        if (!THEME.highContrast) {
            const glow = glowEntry();
            for (const b of game.effects.blobs) {
                const k = b.r / GLOW_RADIUS;
                this.blobs.add(glow.texture, b.x, b.y, glow.scale * k, glow.scale * k, 0, toTint(b.color), THEME.BLOB_ALPHA);
            }
        }
        this.blobs.end();
    }

    // ------------------------------------------------------------
    // Play field
    // ------------------------------------------------------------
    syncField(game, w, h, inMenu) {
        const playing = !inMenu;
        const now = performance.now() / 1000;
        const dot = dotEntry();

        // Night stars (dark theme, in play)
        this.stars.begin();
        if (playing && THEME.dark && !THEME.highContrast) {
            if (!this.starList || this.starList.w !== w) this.starList = makeStars(w, h);
            const tw = performance.now() * 0.0016;
            for (const s of this.starList.list) {
                const k = (s.big ? 2.2 : 1.2) / DOT_RADIUS;
                this.stars.add(dot.texture, s.x, s.y, dot.scale * k, dot.scale * k, 0, toTint(s.c), 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(tw + s.ph)));
            }
        }
        this.stars.end();

        // Reactive spring grid dots
        this.gridDots.begin();
        if (playing) {
            const base = parseRgba(THEME.GRID_DOT);
            const grid = game.effects.grid;
            for (let c = 0; c < grid.cols; c++) {
                for (let r = 0; r < grid.rows; r++) {
                    const pt = grid.points[c][r];
                    const d = Math.min(24, Math.abs(pt.x - pt.baseX) + Math.abs(pt.y - pt.baseY));
                    const k = (2 + d * 0.14) / DOT_RADIUS;
                    if (d > 3) this.gridDots.add(dot.texture, pt.x, pt.y, dot.scale * k, dot.scale * k, 0, 0xff6fae, 0.55);
                    else this.gridDots.add(dot.texture, pt.x, pt.y, dot.scale * k, dot.scale * k, 0, base.tint, base.alpha);
                }
            }
        }
        this.gridDots.end();

        this.syncTelegraphs(game, w, h, dot);
        this.syncPickups(game, now);
        this.syncCoins(game, playing);
        this.syncBoss(game, playing);
        this.syncGhost(game, w, h);
        this.syncBullets(game, w, h);
        this.syncPlayer(game, playing, now);
        this.syncPopups(game);
    }

    syncTelegraphs(game, w, h, dot) {
        const g = this.telegraphLines;
        g.clear();
        this.telegraphDots.begin();
        const ink = toTint(THEME.INK);
        const diag = Math.hypot(w, h) + 40;
        for (const tg of game.waveManager.telegraphs) {
            const progress = 1 - Math.max(0, tg.remaining / tg.duration);
            const color = toTint(tg.color);
            // Wide soft band that darkens before firing
            g.moveTo(tg.x1, tg.y1).lineTo(tg.x2, tg.y2).stroke({ width: 10, color, alpha: 0.12 + progress * 0.2, cap: 'round' });
            // Dotted candy line, marching forward (old dash pattern [1, 9])
            const len = Math.min(Math.hypot(tg.x2 - tg.x1, tg.y2 - tg.y1), diag);
            const ux = (tg.x2 - tg.x1) / (len || 1);
            const uy = (tg.y2 - tg.y1) / (len || 1);
            const offset = (progress * 40) % 10;
            const k = 1.6 / DOT_RADIUS;
            const alpha = 0.45 + progress * 0.55;
            for (let s = offset; s <= len; s += 10) {
                this.telegraphDots.add(dot.texture, tg.x1 + ux * (s + 0.5), tg.y1 + uy * (s + 0.5), dot.scale * k, dot.scale * k, 0, color, alpha);
            }
            // Shrinking ring at the origin
            g.circle(tg.x1, tg.y1, 4 + (1 - progress) * 10).stroke({ width: 1.5, color: ink, alpha: 1 });
        }
        this.telegraphDots.end();
    }

    syncPickups(game, now) {
        this.pickups.begin();
        const lang = getLang();
        for (const p of game.pickupManager.pickups) {
            if (!p.active) continue;
            const live = this.pickups.next();
            const R = p.radius * 3 + 16;
            const fading = p.lifetime < 1500 ? Math.floor(p.lifetime / 33) : 's';
            const key = `${p.type}|${p.bad}|${Math.floor(p.pulsePhase * 7.5)}|${fading}|${THEME.mode}|${lang}`;
            live.draw(key, { x: p.x - R, y: p.y - R - 8, w: R * 2, h: R * 2 + 16 }, (ctx) => p.render(ctx));
        }
        this.pickups.end();
    }

    syncCoins(game, playing) {
        this.coins.begin();
        if (playing) {
            for (const c of game.coins.coins) {
                if (!c.active) continue;
                const live = this.coins.next();
                const R = c.radius + 20;
                const key = `${c.value}|${Math.floor(c.age / 33)}|${THEME.mode}`;
                live.draw(key, { x: c.x - R, y: c.y - R, w: R * 2, h: R * 2 + 6 }, (ctx) => c.render(ctx));
            }
        }
        this.coins.end();
    }

    syncBoss(game, playing) {
        const boss = game.waveManager.boss;
        if (!playing || !boss || boss.state === 'DEAD') {
            this.bossSprite.hide();
            return;
        }
        this.bossSprite.show();
        const R = boss.radius * 3.2 + 44;
        const key = [boss.kind, boss.state, boss.stage, tick30(boss.age), Math.floor(boss.stateTimer / 33),
            boss.hitFlash > 0.05, Math.round((boss.inflate || 0) * 20), boss.pulling, THEME.mode, THEME.highContrast].join('|');
        this.bossSprite.draw(key, { x: boss.x - R, y: boss.y - R, w: R * 2, h: R * 2 + 24 }, (ctx) => boss.render(ctx));
    }

    syncGhost(game, w, h) {
        const show = game.ghost && (game.state === 'PLAYING' || game.state === 'PAUSED');
        const pos = show ? game.ghost.positionAt(game.elapsedMs, w, h) : null;
        if (!pos) {
            this.ghostSprite.hide();
            return;
        }
        this.ghostSprite.show();
        const r = game.player.radius * 1.9;
        const key = `${game.ghost.skin}|${r.toFixed(1)}|${THEME.mode}|${getLang()}`;
        this.ghostSprite.draw(key, { x: pos.x - 30, y: pos.y - 30, w: 60, h: 56 }, (ctx) => {
            ctx.globalAlpha = 0.32;
            drawMarshmallow(ctx, pos.x, pos.y, r, getSkin(game.ghost.skin));
            ctx.globalAlpha = 0.6;
            ctx.font = '700 9px "Fredoka", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = THEME.TEXT_PRIMARY;
            ctx.fillText(t('hud.ghost'), pos.x, pos.y - 16);
        });
    }

    syncBullets(game, w, h) {
        // Culling: bullets slightly outside the arena keep updating in the game logic,
        // but are not drawn (no sprite, halo or trail)
        const M = 40;
        this.bulletSprites.begin();
        this.sawFaces.begin();
        this.trails.begin();
        this.halos.begin();
        const dot = dotEntry();
        const halo = THEME.dark ? haloEntry() : null;
        let n = 0;
        for (const b of game.bulletManager.bullets) {
            if (!b.active) continue;
            if (b.x < -M || b.x > w + M || b.y < -M || b.y > h + M) continue;
            n++;
            const tint = toTint(b.color);
            // Soft trail: fading pastel dots
            if (b.trail.length > 1) {
                for (let i = 1; i < b.trail.length; i += 2) {
                    const pt = b.trail[i];
                    const ratio = 1 - i / b.trail.length;
                    const k = (b.radius * ratio * 0.7) / DOT_RADIUS;
                    this.trails.add(dot.texture, pt.x, pt.y, dot.scale * k, dot.scale * k, 0, tint, ratio * 0.4);
                }
            }
            // Dark theme: moonlight halo
            if (halo) {
                const k = (b.radius * 2.6) / GLOW_RADIUS;
                this.halos.add(halo.texture, b.x, b.y, halo.scale * k, halo.scale * k, 0, tint, 1);
            }
            const sp = this.bulletSprites.next();
            const entry = bulletEntry(b);
            if (b.shape === 'saw') {
                const r = b.sawRadius();
                applyBaked(sp, entry, r / b.radius);
                sp.rotation = b.spinAngle;
                const face = this.sawFaces.next();
                applyBaked(face, sawFaceEntry(b.radius), r / b.radius);
                face.position.set(b.x, b.y);
                face.rotation = 0;
            } else if (b.shape === 'bubble') {
                applyBaked(sp, entry, b.bubbleWobble());
                sp.rotation = 0;
            } else {
                applyBaked(sp, entry);
                sp.rotation = (b.shape === 'diamond' || b.shape === 'capsule') ? b.rotation : 0;
            }
            sp.position.set(b.x, b.y);
        }
        this.bulletSprites.end();
        this.sawFaces.end();
        this.trails.end();
        this.halos.end();
        this.stats.bullets = n;
    }

    syncPlayer(game, playing, now) {
        const p = game.player;
        if (!playing || !p.alive) {
            this.playerSprite.hide();
            return;
        }
        this.playerSprite.show();
        let R = Math.max(p.radius * 1.9 * 4.2, p.radius * 3.9 + 8, 30);
        for (const img of p.afterImages) R = Math.max(R, Math.abs(img.x - p.x) + 14, Math.abs(img.y - p.y) + 14);
        const flicker = p.invulnTimer > 0 ? Math.floor(p.invulnTimer / 90) % 2 : 0;
        const key = [p.skin.id, tick30(now), p.isDashing, p.shieldCharges, flicker, p.sizeScale.toFixed(2),
            p.afterImages.length, THEME.mode, THEME.highContrast].join('|');
        this.playerSprite.draw(key, { x: p.x - R, y: p.y - R, w: R * 2, h: R * 2 }, (ctx) => p.render(ctx));
    }

    syncPopups(game) {
        this.popups.begin();
        const score = game.score;
        const showCombo = game.state === 'PLAYING' || game.state === 'PAUSED';
        if (showCombo && score) {
            for (const p of score.popups) {
                const k = p.age / 700;
                const size = p.big ? 20 : 11 + p.multiplier;
                const color = p.multiplier > 1 ? THEME.PINK_DEEP : THEME.PURPLE;
                const entry = bake(`popup:${p.text}:${size}:${color}:${THEME.mode}`, { x: -70, y: -16, w: 140, h: 32 }, (ctx) => {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = font(size, 700);
                    outlinedText(ctx, p.text, 0, 0, color, THEME.TEXT_HALO, 3);
                });
                const sp = this.popups.next();
                applyBaked(sp, entry);
                sp.position.set(p.x, p.y - 18 - k * 26);
                sp.alpha = Math.max(0, 1 - k);
            }
        }
        this.popups.end();

        const p = game.player;
        if (showCombo && score && p.alive && score.combo >= 2) {
            this.comboSprite.show();
            const label = score.multiplier > 1 ? `x${score.multiplier} · ${score.combo}` : t('hud.combo', { n: score.combo });
            const key = `${label}|${score.multiplier > 1}|${Math.round(score.comboRatio * 24)}|${THEME.mode}`;
            this.comboSprite.draw(key, { x: p.x - 80, y: p.y - 44, w: 160, h: 30 }, (ctx) => {
                // Only the combo pill (popups are drawn as sprites above)
                const popups = score.popups;
                score.popups = [];
                game.ui.renderComboAndPopups(ctx, p, score);
                score.popups = popups;
            });
        } else {
            this.comboSprite.hide();
        }
    }
}

function makeStars(w, h) {
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list = [];
    for (let i = 0; i < Math.round(w / 14); i++) {
        list.push({ x: rnd() * w, y: rnd() * h, ph: rnd() * 6.28, big: rnd() < 0.15, c: THEME.SPRINKLES[i % THEME.SPRINKLES.length] });
    }
    return { w, list };
}

export { tick30, SpritePool };
