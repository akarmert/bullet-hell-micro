// ============================================================
// render/uiView.js — Interface in PixiJS
//
// The UI keeps its existing Canvas 2D drawing code as a texture generator, split
// into small regions that are re-uploaded only when what they show changes:
// HUD (left / centre / right / dash bar), hint, boss bar, menu, pause and the
// result card. The arena frame and the wall warning are native PixiJS objects.
// ============================================================

import { Container, Graphics, Sprite } from 'pixi.js';
import { GAME_CONFIG } from '../config.js';
import { THEME, font, candyPanel } from '../theme.js';
import { UIManager } from '../ui.js';
import { formatScore } from '../score.js';
import { getLang } from '../i18n.js';
import { bake, applyBaked, LiveCanvasSprite, toTint } from './textures.js';
import { glowEntry, GLOW_RADIUS } from './shapes.js';
import { BackdropView } from './backdropView.js';
import { GlyphText } from './glyphText.js';
import { tick30, SpritePool } from './worldView.js';

let measureCtx = null;
function textWidth(text, fontStr) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = fontStr;
    return measureCtx.measureText(text).width;
}

/** Score pill background, baked per (rounded) width */
function scorePillEntry(pw) {
    return bake(`scorepill:${pw}:${THEME.mode}`, { x: 0, y: -14, w: pw, h: 30 }, (ctx) => {
        candyPanel(ctx, 0, -11, pw, 22, 11, THEME.PINK, { lineWidth: 1.5, depth: 2 });
    });
}

/** Four-point "dizzy" star of the result card, radius 1 */
function dizzyStarEntry() {
    return bake('shape:dizzystar', { x: -1, y: -1, w: 2, h: 2 }, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.quadraticCurveTo(0, 0, 1, 0);
        ctx.quadraticCurveTo(0, 0, 0, 1);
        ctx.quadraticCurveTo(0, 0, -1, 0);
        ctx.quadraticCurveTo(0, 0, 0, -1);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    }, 24);
}

const EDGE_RANGE = 60;

export class UiView {
    constructor() {
        this.container = new Container();

        // Wall warning glow: masked to the inside of the arena frame
        this.edgeGlows = new Container();
        this.edgeGlowMask = new Graphics();
        this.edgeGlows.mask = this.edgeGlowMask;
        this.edgeGlowSprites = [0, 1, 2, 3].map(() => this.edgeGlows.addChild(new Sprite()));

        // HUD regions
        this.hudLeft = new LiveCanvasSprite('hudLeft');
        this.hudCenter = new LiveCanvasSprite('hudCenter');
        this.hudRight = new LiveCanvasSprite('hudRight');
        this.hudDash = new LiveCanvasSprite('hudDash');
        this.hint = new LiveCanvasSprite('hint');
        // Numbers that change every frame: baked glyphs (no texture uploads)
        this.timeText = new GlyphText();
        this.scorePill = new Sprite();
        this.scoreText = new GlyphText();
        // Boss bar: labels + empty track / animated fill (Graphics) / marks + outline
        this.bossBar = new LiveCanvasSprite('bossBar');
        this.bossFill = new Graphics();
        this.bossFillMask = new Graphics();
        this.bossFill.mask = this.bossFillMask;
        this.bossBarTop = new LiveCanvasSprite('bossBarTop');

        // Full-screen overlays
        this.menu = new LiveCanvasSprite('menu');
        // Animated menu parts: drawn once, moved by the renderer
        this.menuTitle = new LiveCanvasSprite('menuTitle');
        this.menuPlay = new LiveCanvasSprite('menuPlay');
        this.menuSkin = new LiveCanvasSprite('menuSkin');
        this.pause = new LiveCanvasSprite('pause');
        this.pauseResume = new LiveCanvasSprite('pauseResume');
        this.deadBase = new LiveCanvasSprite('deadBase');
        this.cardBackdrop = new BackdropView();
        this.cardMask = new Graphics();
        this.cardBackdrop.container.mask = this.cardMask;
        this.deadContent = new LiveCanvasSprite('deadContent');
        this.deadStarLayer = new Container();
        this.deadStars = new SpritePool(this.deadStarLayer);

        // Arena frame + the part of it that lights up near a wall
        this.frame = new Graphics();
        this.edgeLines = new Container();
        this.edgeLineMask = new Graphics();
        this.edgeLines.mask = this.edgeLineMask;
        this.edgeLineSprites = [0, 1, 2, 3].map(() => this.edgeLines.addChild(new Sprite()));

        this.container.addChild(
            this.edgeGlowMask, this.edgeGlows,
            this.hudLeft.sprite, this.hudCenter.sprite, this.timeText.container,
            this.hudRight.sprite, this.scorePill, this.scoreText.container, this.hudDash.sprite,
            this.hint.sprite, this.bossBar.sprite, this.bossFillMask, this.bossFill, this.bossBarTop.sprite,
            this.menu.sprite, this.menuTitle.sprite, this.menuPlay.sprite, this.menuSkin.sprite,
            this.pause.sprite, this.pauseResume.sprite,
            this.deadBase.sprite, this.cardMask, this.cardBackdrop.container, this.deadContent.sprite, this.deadStarLayer,
            this.frame, this.edgeLineMask, this.edgeLines
        );
        this.all = [this.hudLeft, this.hudCenter, this.hudRight, this.hudDash, this.hint, this.bossBar, this.bossBarTop,
            this.menu, this.menuTitle, this.menuPlay, this.menuSkin, this.pause, this.pauseResume, this.deadBase, this.deadContent];
        this.extras = [this.timeText.container, this.scorePill, this.scoreText.container, this.bossFill, this.deadStarLayer];
    }

    sync(game, w, h) {
        const ui = game.ui;
        const state = game.state;
        const now = performance.now() / 1000;
        const lang = getLang();
        const theme = `${THEME.mode}|${THEME.highContrast}`;
        for (const l of this.all) l.hide();
        for (const o of this.extras) o.visible = false;
        this.cardBackdrop.container.visible = false;
        this.edgeGlows.visible = false;
        this.edgeLines.visible = false;
        this.frame.clear();

        if (state === 'MENU') {
            this.syncMenu(game, w, h, now, theme, lang);
            return;
        }

        if (state === 'PLAYING' || state === 'PAUSED') {
            this.syncEdge(game, w, h, true);
            this.syncHud(game, w, h, theme, lang);
            if (state === 'PLAYING' && game.currentHint) {
                const hint = game.currentHint;
                const y = h - ui.safe.bottom - 120;
                const near = Math.abs(game.player.y - y) < 60;
                this.hint.show();
                const key = `${hint.text}|${Math.round(Math.max(0, hint.alpha) * 20)}|${near}|${theme}`;
                this.hint.draw(key, { x: 0, y: y - 26, w, h: 52 }, (ctx) => ui.renderHint(ctx, hint, game.player));
            }
            const boss = game.waveManager.boss;
            if (boss && boss.state !== 'DEAD') {
                this.syncBossBar(boss, ui, w, theme, lang);
            }
            if (state === 'PAUSED') {
                this.pause.show();
                const counting = game.resumeCountdown > 0;
                const step = Math.ceil(game.resumeCountdown / 500);
                // The countdown digit grows and fades (redrawn at 30 Hz for 1.5 s); the pause card is static
                const pulse = counting ? Math.floor((game.resumeCountdown % 500) / 33) : '';
                const touch = game.touchControls.touchDevice;
                const key = `${step}|${pulse}|${touch}|${theme}|${lang}`;
                this.pause.draw(key, { x: 0, y: 0, w, h }, (ctx) => ui.renderPaused(ctx, game.resumeCountdown, touch, { skipResume: true }));
                if (!counting) {
                    // "Press to resume" line: its own sprite, pulsing with alpha only
                    this.pauseResume.show();
                    this.pauseResume.draw(`${touch}|${theme}|${lang}`, { x: w / 2 - 170, y: h / 2 - 14, w: 340, h: 32 },
                        (ctx) => ui.drawPausedResume(ctx, touch));
                    this.pauseResume.sprite.alpha = ui.pauseResumeAlpha();
                }
            }
            // Arena frame + the lit part near a wall (above the UI, like before)
            this.drawFrame(game, w, h);
            this.syncEdge(game, w, h, false);
            return;
        }

        if (state === 'DEAD') this.syncDead(game, w, h, now, theme, lang);
    }

    syncMenu(game, w, h, now, theme, lang) {
        const ui = game.ui;
        const L = ui.layout;
        const S = ui.lScale;
        const ox = ui.lOffX;
        const oy = ui.lOffY;
        const nowMs = now * 1000;
        const overlay = ui.settingsOpen || ui.infoOpen;
        const progress = ui.progress;
        // Shop feedback animates (shake / flash / confirm timeout): redraw at 30 Hz only then
        const busy = [ui.buyShakeUntil, ui.shopFlash && ui.shopFlash.until, ui.buyConfirm && ui.buyConfirm.until]
            .some((u) => u && nowMs < u);
        const geo = `${w | 0}x${h | 0}|${ox.toFixed(1)}|${oy.toFixed(1)}|${S.toFixed(3)}`;
        const state = [
            game.currentMode.id, ui.focusedItem, ui.skinIndex, ui.settingsOpen, ui.infoOpen,
            progress ? `${progress.candies}|${progress.selected}|${progress.unlocked.length}` : '',
            L.cards.map((c) => ui.getBestScore(c.id)).join(','),
            JSON.stringify(game.settings.values)
        ].join('|');
        const key = `${busy ? tick30(now) : ''}|${state}|${geo}|${theme}|${lang}`;
        // With a panel open the menu underneath is drawn in one piece (it sits under a scrim)
        ui.menuSplit = !overlay;
        this.menu.show();
        this.menu.draw(key, { x: 0, y: 0, w, h }, (ctx) => ui.renderMenu(ctx, game.currentMode.id));
        ui.menuSplit = false;
        if (overlay) return;

        const toScreen = (x, y, bw, bh) => ({ x: ox + x * S, y: oy + y * S, w: bw * S, h: bh * S });
        const menuDraw = (fn) => (ctx) => {
            ctx.save();
            ui.applyMenuTransform(ctx);
            fn(ctx);
            ctx.restore();
        };

        // Title (bobs)
        const ti = L.title;
        this.menuTitle.show();
        this.menuTitle.draw(`${geo}|${ti.x}|${ti.y}|${ti.size}|${theme}`,
            toScreen(ti.x - ti.size * 3.6, ti.y - ti.size * 1.1, ti.size * 7.2 + 60, ti.size * 1.1 + 44),
            menuDraw((ctx) => ui.drawMenuTitle(ctx, L, 0)));
        this.menuTitle.sprite.y += Math.sin(now * 2) * 2 * S;

        // PLAY button (bobs; the focus ring stays still in the static layer)
        const pb = L.play;
        const activeMode = game.currentMode;
        this.menuPlay.show();
        this.menuPlay.draw(`${geo}|${activeMode.label}|${theme}|${lang}`,
            toScreen(pb.x - 4, pb.y - 4, pb.w + 8, pb.h + 14),
            menuDraw((ctx) => ui.drawMenuPlay(ctx, L, activeMode, 0, false)));
        this.menuPlay.sprite.y += Math.sin(now * 3) * 2 * S;

        // Costume preview: bob + breathing squash + blink
        if (progress) {
            const sk = L.skin;
            const blink = (now % 3.2) < 0.12;
            const R = sk.r * 2.2;
            const b = toScreen(sk.cx - R, sk.cy - 4 - R, R * 2, R * 2);
            this.menuSkin.show();
            this.menuSkin.draw(`${geo}|${ui.skinIndex}|${progress.unlocked.length}|${blink}|${theme}`, b,
                menuDraw((ctx) => ui.drawMenuSkinBody(ctx, L, blink ? 0.25 : 1)));
            const sp = this.menuSkin.sprite;
            const res = 1 / sp.scale.x;
            const squash = 1 + Math.sin(now * 5) * 0.03;
            // Scale around the marshmallow centre
            sp.pivot.set((b.w / 2) * res, (b.h / 2) * res);
            sp.position.set(b.x + b.w / 2, b.y + b.h / 2 + Math.sin(now * 2.4) * 2 * S);
            sp.scale.set((1 / res) / squash, (1 / res) * squash);
        }
    }

    syncBossBar(boss, ui, w, theme, lang) {
        const top = ui.safe.top;
        const r = boss.healthBarRect(top);
        const fill = boss.healthBarFill;
        this.bossBar.show();
        this.bossBar.draw(`${boss.kind}|${boss.stage}|${theme}|${lang}|${top}|${w | 0}`,
            { x: r.x - 20, y: top + 88, w: r.w + 40, h: 36 }, (ctx) => boss.renderHealthBar(ctx, top, 'base'));
        // Fill: native shapes clipped to the rounded track
        this.bossFill.visible = true;
        this.bossFillMask.clear().roundRect(r.x, r.y, r.w, r.h, r.h / 2).fill({ color: 0xffffff });
        this.bossFill.clear();
        if (fill > 0) {
            this.bossFill.rect(r.x, r.y, r.w * fill, r.h).fill({ color: toTint(boss.hitFlash > 0.05 ? THEME.LAVENDER : THEME.PINK) });
            this.bossFill.rect(r.x, r.y + 2, r.w * fill, 2).fill({ color: 0xffffff, alpha: 0.5 });
        }
        this.bossBarTop.show();
        this.bossBarTop.draw(`${theme}|${top}|${w | 0}`, { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 },
            (ctx) => boss.renderHealthBar(ctx, top, 'overlay'));
    }

    syncHud(game, w, h, theme, lang) {
        const ui = game.ui;
        const p = game.player;
        const compact = !!game.barVisible;
        const top = ui.safe.top;
        this.hudLeft.show();
        this.hudLeft.draw(`${game.currentMode.label}|${p.grazeCount}|${game.runCandies}|${theme}|${lang}|${top}`,
            { x: 0, y: 0, w: Math.min(w, 280), h: top + 90 },
            (ctx) => ui.renderHudLeft(ctx, game.currentMode, p, game.runCandies));
        if (!compact) {
            this.hudCenter.show();
            this.hudCenter.draw(`${ui.getBestScore(game.currentMode.id)}|${theme}|${lang}|${top}|${w | 0}`,
                { x: w / 2 - 160, y: top + 56, w: 320, h: 28 },
                (ctx) => ui.renderHudCenter(ctx, game.elapsedMs, game.currentMode, { skipTime: true }));
            this.timeText.show();
            this.timeText.set(UIManager.formatTime(game.elapsedMs), w / 2, top + 42, {
                size: Math.min(36, w * 0.085), weight: 700, fill: THEME.TEXT, halo: THEME.TEXT_HALO, haloWidth: 6
            });
            // Score pill: background baked per width, digits as glyphs
            const text = `★ ${formatScore(game.score.total)}`;
            const right = w - 18 - ui.safe.right;
            const pw = Math.ceil(textWidth(text, font(13, 700)) + 16);
            applyBaked(this.scorePill, scorePillEntry(pw));
            this.scorePill.visible = true;
            this.scorePill.position.set(right - pw, top + 24);
            this.scoreText.show();
            this.scoreText.set(text, right - pw / 2, top + 25, { size: 13, weight: 700, fill: THEME.INK });
        }
        const pm = game.pickupManager;
        const rightKey = [compact, p.shieldCharges,
            pm.isSlowmoActive() ? (pm.slowmoTimer / 1000).toFixed(1) : '', p.slowTimer > 0 ? (p.slowTimer / 1000).toFixed(1) : '',
            p.growTimer > 0 ? (p.growTimer / 1000).toFixed(1) : '', theme, lang, top, w | 0].join('|');
        this.hudRight.show();
        this.hudRight.draw(rightKey, { x: w - 300, y: 0, w: 300, h: top + 160 },
            (ctx) => ui.renderHudRight(ctx, p, pm, game.score, compact, { skipScore: true }));
        if (ui.hasDashBar()) {
            this.hudDash.show();
            const ratio = p.getDashReadyRatio();
            this.hudDash.draw(`${Math.round(ratio * 60)}|${theme}|${lang}|${ui.safe.bottom}`,
                { x: w / 2 - 140, y: h - ui.safe.bottom - 60, w: 280, h: 60 },
                (ctx) => ui.renderHudDash(ctx, p));
        }
    }

    /** Arena frame stroke (top-only rounded when the touch bar continues it below). */
    framePath(g, game, w, h) {
        const lw = this.frameWidth(game, h);
        if (game.barVisible) g.roundRect(lw / 2, lw / 2, w - lw, h + 60, 18);
        else g.roundRect(lw / 2, lw / 2, w - lw, h - lw, 18);
        return lw;
    }

    frameWidth(game, h) {
        const cssH = game.canvas && game.canvas.clientHeight;
        return cssH ? 6 * h / cssH : 6;
    }

    drawFrame(game, w, h) {
        const lw = this.framePath(this.frame, game, w, h);
        this.frame.stroke({ width: lw, color: toTint(THEME.FRAME) });
    }

    /**
     * Wall warning: only the spot nearest to the player lights up.
     * glowPass: soft glow inside the frame (under the HUD); otherwise the frame segment (over it).
     */
    syncEdge(game, w, h, glowPass) {
        const p = game.player;
        if (!p.alive) return;
        const edges = [
            [p.x - p.radius, 0, p.y],
            [w - p.x - p.radius, w, p.y],
            [p.y - p.radius, p.x, 0],
            [h - p.y - p.radius, p.x, h]
        ].filter(([dist]) => dist < EDGE_RANGE);
        if (!edges.length) return;
        const pulse = 0.8 + Math.sin(performance.now() * 0.01) * 0.2;
        const soften = edges.length > 1 ? 0.65 : 1;
        const glow = glowEntry();
        const sprites = glowPass ? this.edgeGlowSprites : this.edgeLineSprites;
        const mask = glowPass ? this.edgeGlowMask : this.edgeLineMask;
        mask.clear();
        const lw = this.framePath(mask, game, w, h);
        if (glowPass) mask.fill({ color: 0xffffff });
        else mask.stroke({ width: lw, color: 0xffffff });
        (glowPass ? this.edgeGlows : this.edgeLines).visible = true;
        sprites.forEach((s) => { s.visible = false; });
        edges.forEach(([dist, ex, ey], i) => {
            const k = Math.max(0, 1 - dist / EDGE_RANGE) * pulse * soften;
            const s = sprites[i];
            s.visible = true;
            s.texture = glow.texture;
            s.anchor.set(0.5);
            const radius = glowPass ? 120 : 85;
            s.scale.set(glow.scale * (radius / GLOW_RADIUS));
            s.position.set(ex, ey);
            s.tint = glowPass ? 0xf0468f : 0xff6fae;
            s.alpha = glowPass ? 0.42 * k : Math.min(1, 1.2 * k);
        });
    }

    syncDead(game, w, h, now, theme, lang) {
        const ui = game.ui;
        const reveal = game.deathReveal();
        if (reveal <= 0) return;
        const info = {
            reveal,
            cause: game.deathCause,
            bossTitle: game.waveManager.boss ? game.waveManager.boss.title : '',
            score: game.score,
            waves: game.waveManager,
            unlocked: game.lastUnlocked,
            candies: game.lastCandies || 0
        };
        const revealKey = Math.round(reveal * 20);
        // Base: scrim + card panel + body
        this.deadBase.show();
        this.deadBase.draw(`${revealKey}|${theme}|${w | 0}x${h | 0}`, { x: 0, y: 0, w, h },
            (ctx) => ui.renderDead(ctx, game.elapsedMs, game.currentMode, game.player, { ...info, pass: 'base' }));
        // Interactive backdrop inside the card body
        if (reveal > 0.6) {
            const r = ui.getDeadBodyRect(reveal);
            this.cardMask.clear().roundRect(r.x, r.y, r.w, r.h + r.r, r.r).fill({ color: 0xffffff });
            this.cardBackdrop.container.visible = true;
            this.cardBackdrop.sync(game.menuBackdrop, 0.6);
        }
        // Content: header band, score, chips, buttons (+ info panel)
        this.deadContent.show();
        // Only the "new record" pill bounces; everything else is static once revealed
        const anim = ui.isNewRecord ? tick30(now) : '';
        const key = `${anim}|${revealKey}|${ui.isNewRecord}|${ui.infoOpen}|${ui.focusedItem}|${theme}|${lang}|${w | 0}x${h | 0}`;
        this.deadContent.draw(key, { x: 0, y: 0, w, h },
            (ctx) => ui.renderDead(ctx, game.elapsedMs, game.currentMode, game.player, { ...info, pass: 'content', skipStars: true }));
        // Dizzy stars circling the marshmallow
        const D = ui.getDeadLayout();
        const oy = D.cy + ui.deadSlide(reveal);
        const star = dizzyStarEntry();
        this.deadStarLayer.visible = !ui.infoOpen;
        this.deadStarLayer.alpha = reveal;
        this.deadStars.begin();
        for (const st of ui.deadStars(now)) {
            const sp = this.deadStars.next();
            applyBaked(sp, star, st.r * D.s);
            sp.position.set(D.cx + st.x * D.s, oy + (st.y + D.top + 35) * D.s);
        }
        this.deadStars.end();
    }
}
