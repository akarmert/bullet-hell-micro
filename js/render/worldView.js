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
import { bake, applyBaked, LiveCanvasSprite, ParticleLayer, TextureAtlas, TexState, toTint } from './textures.js';

// Bullet bodies and saw faces share one atlas texture: one draw call for all bullets
const bulletAtlas = new TextureAtlas('bulletAtlas', 1024);
import { dotEntry, DOT_RADIUS, glowEntry, GLOW_RADIUS, haloEntry, parseRgba } from './shapes.js';

// ------------------------------------------------------------
// Static parts of animated entities (baked once, animated with transforms)
// ------------------------------------------------------------

function ellipseShadowEntry(rx, ry) {
    return bake(`shadow:${rx.toFixed(2)}:${ry}:${THEME.mode}`, { x: -rx, y: -ry, w: rx * 2, h: ry * 2 }, (ctx) => {
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();
    });
}

function pickupWingsEntry(p) {
    const r = p.radius;
    const R = r * 2;
    return bake(`pkwings:${p.bad}:${r}:${THEME.mode}`, { x: -R, y: -R, w: R * 2, h: R * 2 }, (ctx) => p.drawWings(ctx, r));
}

function pickupBodyEntry(p, lang) {
    const r = p.radius;
    return bake(`pkbody:${p.type}:${p.bad}:${p.color}:${r}:${lang}:${THEME.mode}`,
        { x: -r * 2.6, y: -r * 2.35 - 12, w: r * 5.2, h: r * 3.35 + 14 }, (ctx) => p.drawBody(ctx, r));
}

function coinBodyEntry(c) {
    const r = c.radius;
    return bake(`coin:${c.value}:${c.color}:${c.textColor}:${r}:${THEME.mode}`, { x: -r - 2, y: -r - 2, w: r * 2 + 4, h: r * 2 + 4 }, (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = font(c.value >= 100 ? r * 0.8 : r * 0.95, 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.textColor;
        ctx.fillText(String(c.value), 0, 1, r * 1.5);
    });
}

/** Four-point coin sparkle with unit size (sr = 1) */
function sparkleEntry() {
    return bake('shape:coinsparkle', { x: -1, y: -1.8, w: 2, h: 3.6 }, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(0, -1.6);
        ctx.lineTo(0.5, 0);
        ctx.lineTo(0, 1.6);
        ctx.lineTo(-0.5, 0);
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    }, 16);
}

function playerBodyEntry(p, blink, dashing) {
    const P = GAME_CONFIG.PLAYER;
    const r = P.RADIUS * 1.9;
    const R = r * 2.4;
    return bake(`pbody:${p.skin.id}:${blink}:${dashing}:${THEME.mode}`, { x: -R, y: -R * 1.15, w: R * 2, h: R * 2.15 }, (ctx) => {
        drawMarshmallow(ctx, 0, 0, r, p.skin, {
            squash: dashing ? 0.82 : 1,       // dash squash is baked; breathing (±3 %) is a scale
            blink: blink ? 0.25 : 1,
            hitboxRadius: P.HITBOX_RADIUS * 0.6,
            body: dashing ? THEME.PINK_SOFT : null
        });
    });
}

function shieldBubbleEntry(sr) {
    return bake(`shield:${sr}:${THEME.mode}`, { x: -sr - 2, y: -sr - 2, w: sr * 2 + 4, h: sr * 2 + 4 }, (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, sr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(205, 184, 255, 0.22)';
        ctx.fill();
        ctx.strokeStyle = THEME.PURPLE;
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function shieldArcEntry(sr) {
    const R = sr - 4;
    return bake(`shieldarc:${sr}:${THEME.mode}`, { x: -R - 2, y: -R - 2, w: R * 2 + 4, h: R * 2 + 4 }, (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, 0.9);
        ctx.strokeStyle = THEME.WHITE;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
    });
}

function shieldPipEntry() {
    return bake(`shieldpip:${THEME.mode}`, { x: -4, y: -4, w: 8, h: 8 }, (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PINK;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
    });
}

let measureCtx = null;
function textWidth(text, fontStr) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = fontStr;
    return measureCtx.measureText(text).width;
}

/** Pool of composite views (Container with named parts), hidden when unused. */
class ViewPool {
    constructor(parent, create) {
        this.parent = parent;
        this.create = create;
        this.items = [];
        this.used = 0;
    }

    begin() {
        this.used = 0;
    }

    next() {
        let v = this.items[this.used];
        if (!v) {
            v = this.create();
            this.items.push(v);
            this.parent.addChild(v.root);
        }
        v.root.visible = true;
        this.used++;
        return v;
    }

    end() {
        for (let i = this.used; i < this.items.length; i++) this.items[i].root.visible = false;
    }
}

/** 30 Hz animation clock used in redraw keys (live sprites redraw at most 30×/s). */
const tick30 = (seconds) => Math.floor(seconds * 30);

// ------------------------------------------------------------
// Bullet body textures (one per shape / colour / size / outline / theme)
// ------------------------------------------------------------

function bulletEntry(b) {
    const key = `bullet:${b.shape}:${b.color}:${b.radius}:${THEME.BULLET_OUTLINE}:${THEME.mode}`;
    const R = b.radius * 3;
    return bulletAtlas.get(key, { x: -R, y: -R, w: R * 2, h: R * 2 }, (ctx) => {
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
    return bulletAtlas.get(`sawface:${radius}:${THEME.mode}`, { x: -R, y: -R, w: R * 2, h: R * 2 }, (ctx) => Bullet.drawSawFace(ctx, radius));
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
        this.bossSprite = new LiveCanvasSprite('boss');
        this.ghostSprite = new LiveCanvasSprite('ghost');
        this.trails = new ParticleLayer();
        this.halos = new ParticleLayer();
        this.bulletLayer = new Container();
        this.sawFaceLayer = new Container();
        this.popupLayer = new Container();
        this.comboSprite = new LiveCanvasSprite('combo');
        // Player: glow, dash after-images, shield bubble / arc / pips, body
        this.player = new Container();
        this.playerGlow = new Sprite();
        this.afterLayer = new Container();
        this.afterImages = new SpritePool(this.afterLayer);
        this.shieldBubble = new Sprite();
        this.shieldArc = new Sprite();
        this.pipLayer = new Container();
        this.pips = new SpritePool(this.pipLayer);
        this.playerBody = new Sprite();
        this.player.addChild(this.playerGlow, this.afterLayer, this.shieldBubble, this.shieldArc, this.pipLayer, this.playerBody);
        // Combo pill: baked pill + remaining-time bar sprite
        this.comboBar = new Sprite(Texture.WHITE);
        this.field.addChild(
            this.stars.container, this.gridDots.container,
            this.telegraphLines, this.telegraphDots.container,
            this.pickupLayer, this.coinLayer,
            this.bossSprite.sprite, this.ghostSprite.sprite,
            this.trails.container, this.halos.container, this.bulletLayer, this.sawFaceLayer,
            this.player, this.popupLayer, this.comboSprite.sprite, this.comboBar
        );
        this.pickups = new ViewPool(this.pickupLayer, () => {
            const root = new Container();
            const v = { root, shadow: new Sprite(), ring: new Graphics(), wings: new Sprite(), body: new Sprite() };
            root.addChild(v.shadow, v.ring, v.wings, v.body);
            return v;
        });
        this.coins = new ViewPool(this.coinLayer, () => {
            const root = new Container();
            const v = { root, shadow: new Sprite(), ring: new Graphics(), body: new Sprite(), sparkles: [new Sprite(), new Sprite(), new Sprite()] };
            root.addChild(v.shadow, v.ring, v.body, ...v.sparkles);
            return v;
        });
        this.bulletSprites = new SpritePool(this.bulletLayer);
        this.sawFaces = new SpritePool(this.sawFaceLayer);
        this.popups = new SpritePool(this.popupLayer);
        this.starList = null;
        this.stats = { bullets: 0, sprites: 0 };
        this.bulletAtlas = bulletAtlas;   // exposed for diagnostics / A-B benchmarks
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
            const v = this.pickups.next();
            const r = p.radius;
            const bob = p.bob;
            v.root.position.set(p.x, p.y);
            v.root.alpha = p.fadeAlpha;
            applyBaked(v.shadow, ellipseShadowEntry(r * 0.9, 3));
            v.shadow.position.set(0, r + 6);
            applyBaked(v.wings, pickupWingsEntry(p));
            v.wings.position.set(0, bob);
            v.wings.rotation = p.wiggle;
            applyBaked(v.body, pickupBodyEntry(p, lang));
            v.body.position.set(0, bob);
            v.ring.clear();
            if (p.bad) {
                const pulse = p.sourPulse;
                v.ring.circle(0, bob, r * 1.9 + pulse * 3).stroke({ width: 2.5, color: 0xf0468f, alpha: 0.35 + pulse * 0.35 });
            }
        }
        this.pickups.end();
    }

    syncCoins(game, playing) {
        this.coins.begin();
        if (playing) {
            const spark = sparkleEntry();
            const sparkTint = toTint(THEME.SPARKLE);
            for (const c of game.coins.coins) {
                if (!c.active) continue;
                const v = this.coins.next();
                const k = c.remaining;
                const pop = Math.min(1, c.age / 200);
                const r = c.radius * (0.5 + 0.5 * pop) * (1 + Math.sin(c.age * 0.006) * 0.04);
                const bob = Math.sin(c.age * 0.004) * 2;
                v.root.position.set(c.x, c.y);
                v.root.alpha = k < 0.3 ? 0.45 + 0.55 * Math.abs(Math.sin(c.age * 0.018)) : 1;
                applyBaked(v.shadow, ellipseShadowEntry(c.radius * 0.85, 2.5), r / c.radius);
                v.shadow.position.set(0, r + 5);
                v.ring.clear();
                if (k > 0) {
                    v.ring.arc(0, bob, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
                        .stroke({ width: 3, color: c.color, cap: 'round' });
                }
                applyBaked(v.body, coinBodyEntry(c), r / c.radius);
                v.body.position.set(0, bob);
                for (let i = 0; i < 3; i++) {
                    const sp = v.sparkles[i];
                    sp.visible = !!c.sparkle;
                    if (!c.sparkle) continue;
                    const a = c.age * 0.005 + (i * Math.PI * 2) / 3;
                    const sr = 2.2 + Math.sin(c.age * 0.02 + i) * 0.8;
                    applyBaked(sp, spark, sr);
                    sp.tint = sparkTint;
                    sp.position.set(Math.cos(a) * (r + 9), bob + Math.sin(a) * (r + 9));
                }
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
        const R = bossTextureRadius(boss);
        // The boss shape wobbles every frame, so its texture re-uploads at 30 Hz. On devices
        // that adaptive quality has stepped down: ≤1.5 px per unit, and 15 Hz at the lowest level.
        const q = this.qualityLevel || 0;
        const resScale = q >= 1 ? Math.min(1, 1.5 / TexState.res) : 1;
        const tick = q >= 2 ? Math.floor(boss.age * 15) : tick30(boss.age);
        const key = [boss.kind, boss.state, boss.stage, tick, Math.floor(boss.stateTimer / 33),
            boss.hitFlash > 0.05, Math.round((boss.inflate || 0) * 20), boss.pulling, THEME.mode, THEME.highContrast].join('|');
        this.bossSprite.draw(key, { x: boss.x - R, y: boss.y - R, w: R * 2, h: R * 2 + 24 }, (ctx) => boss.render(ctx), resScale);
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
                const stride = this.reducedFx ? 4 : 2;
                for (let i = 1; i < b.trail.length; i += stride) {
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
        bulletAtlas.flush();
        this.bulletSprites.end();
        this.sawFaces.end();
        this.trails.end();
        this.halos.end();
        this.stats.bullets = n;
    }

    syncPlayer(game, playing, now) {
        const p = game.player;
        if (!playing || !p.alive) {
            this.player.visible = false;
            this.afterImages.begin();
            this.afterImages.end();
            return;
        }
        this.player.visible = true;
        const P = GAME_CONFIG.PLAYER;
        const scale = p.radius / P.RADIUS;             // DEV sour candy grows the player
        const r = p.radius * 1.9;
        this.player.position.set(p.x, p.y);
        // Invulnerability after the last shield popped: blink
        this.player.alpha = p.invulnTimer > 0 && Math.floor(p.invulnTimer / 90) % 2 === 0 ? 0.35 : 1;

        // Dark theme "night light"
        this.playerGlow.visible = THEME.dark;
        if (THEME.dark) {
            const glow = glowEntry();
            applyBaked(this.playerGlow, glow, (r * 4.2) / GLOW_RADIUS);
            this.playerGlow.tint = 0xff8dc0;
            this.playerGlow.alpha = 0.32;
        }

        // Dash after-images
        this.afterImages.begin();
        const dot = dotEntry();
        const softTint = toTint(THEME.PINK_SOFT);
        for (const img of p.afterImages) {
            const sp = this.afterImages.next();
            applyBaked(sp, dot, r / DOT_RADIUS);
            sp.tint = softTint;
            sp.alpha = img.alpha * 0.7;
            sp.position.set(img.x - p.x, img.y - p.y);
        }
        this.afterImages.end();

        // Shield: bubble, spinning highlight arc, one pip per charge
        const shield = p.hasShield;
        this.shieldBubble.visible = shield;
        this.shieldArc.visible = shield;
        this.pips.begin();
        if (shield) {
            const baseSr = P.RADIUS * 3.9;
            applyBaked(this.shieldBubble, shieldBubbleEntry(baseSr), scale);
            applyBaked(this.shieldArc, shieldArcEntry(baseSr), scale);
            this.shieldArc.rotation = p.shieldAngle;
            const sr = p.radius * 3.9;
            const pip = shieldPipEntry();
            for (let i = 0; i < p.shieldCharges; i++) {
                const a = -p.shieldAngle * 0.6 + (i * Math.PI * 2) / 3;
                const sp = this.pips.next();
                applyBaked(sp, pip);
                sp.position.set(Math.cos(a) * sr, Math.sin(a) * sr);
            }
        }
        this.pips.end();

        // Body: baked per costume / blink / dash tint; squash and size via scale
        const blink = (now % 3.2) < 0.12;
        const squash = p.isDashing ? 1 : 1 + Math.sin(now * 5) * 0.03;
        applyBaked(this.playerBody, playerBodyEntry(p, blink, p.isDashing));
        this.playerBody.scale.x *= scale / squash;
        this.playerBody.scale.y *= scale * squash;
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
            const key = `${label}|${score.multiplier > 1}|${THEME.mode}`;
            // The pill is drawn around a fixed anchor; the sprite then follows the player
            const ax = 0;
            const ay = 0;
            this.comboSprite.draw(key, { x: ax - 80, y: ay - 44, w: 160, h: 30 }, (ctx) => {
                const popups = score.popups;
                score.popups = [];
                game.ui.renderComboAndPopups(ctx, { x: ax, y: ay, alive: true }, score, { skipBar: true });
                score.popups = popups;
            });
            this.comboSprite.sprite.position.set(p.x - 80, p.y - 44);
            const tw = textWidth(label, font(11, 700)) + 16;
            this.comboBar.visible = true;
            this.comboBar.tint = score.multiplier > 1 ? 0xffffff : 0xcdb8ff;
            this.comboBar.alpha = score.multiplier > 1 ? 0.5 : 0.7;
            this.comboBar.position.set(p.x - tw / 2 + 6, p.y - 30 + 5);
            this.comboBar.width = Math.max(0, (tw - 12) * score.comboRatio);
            this.comboBar.height = 2;
        } else {
            this.comboSprite.hide();
            this.comboBar.visible = false;
        }
    }
}

/** Half-size of the boss texture: tight per kind (measured from the drawn pixels, + margin) */
function bossTextureRadius(boss) {
    const r = boss.radius;
    if (boss.kind === 'cloud') return boss.stage === 2 ? r * 2.75 + 8 : r * 1.9 + 14;
    if (boss.kind === 'gum') return r * 2.3 + 34;
    return r * 2.1 + 22;
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

export { tick30, SpritePool, bulletAtlas };
