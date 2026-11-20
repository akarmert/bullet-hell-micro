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
import { THEME, font, candyPanel, outlinedText } from '../theme.js';
import { UIManager } from '../ui.js';
import { formatScore } from '../score.js';
import { getLang, t } from '../i18n.js';
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
        // Power-up / sour candy countdowns in the right HUD pills (digits only)
        this.timerTexts = [new GlyphText(), new GlyphText(), new GlyphText()];
        // Left HUD counters (graze / candies): change many times a run
        this.grazeText = new GlyphText();
        this.candyText = new GlyphText();
        this.rightSlots = [];
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
        // Resume countdown: scrim rectangle + one baked digit animated by scale / alpha
        this.countScrim = new Graphics();
        this.countDigit = new Sprite();
        this.deadScrim = new Graphics();
        this.deadBase = new LiveCanvasSprite('deadBase');
        this.recordPill = new Sprite();
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
            this.hudLeft.sprite, this.grazeText.container, this.candyText.container, this.hudCenter.sprite, this.timeText.container,
            this.hudRight.sprite, ...this.timerTexts.map((g) => g.container), this.scorePill, this.scoreText.container, this.hudDash.sprite,
            this.hint.sprite, this.bossBar.sprite, this.bossFillMask, this.bossFill, this.bossBarTop.sprite,
            this.menu.sprite, this.menuTitle.sprite, this.menuPlay.sprite, this.menuSkin.sprite,
            this.pause.sprite, this.pauseResume.sprite, this.countScrim, this.countDigit,
            this.deadScrim, this.deadBase.sprite, this.cardMask, this.cardBackdrop.container, this.deadContent.sprite,
            this.recordPill, this.deadStarLayer,
            this.frame, this.edgeLineMask, this.edgeLines
        );
        this.all = [this.hudLeft, this.hudCenter, this.hudRight, this.hudDash, this.hint, this.bossBar, this.bossBarTop,
            this.menu, this.menuTitle, this.menuPlay, this.menuSkin, this.pause, this.pauseResume, this.deadBase, this.deadContent];
        this.extras = [this.timeText.container, this.scorePill, this.scoreText.container, this.bossFill, this.deadStarLayer,
            this.deadScrim, this.recordPill, this.countScrim, this.countDigit, this.grazeText.container, this.candyText.container,
            ...this.timerTexts.map((g) => g.container)];
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
                const touch = game.touchControls.touchDevice;
                if (game.resumeCountdown > 0) {
                    // 3-2-1 before resuming. It used to redraw a full-screen texture 30×/s
                    // (~4 MB per upload on a phone; ~400 MB per measured session now that
                    // rotating the phone pauses the game). Same look, no uploads.
                    const step = Math.ceil(game.resumeCountdown / 500);
                    const frac = (game.resumeCountdown % 500) / 500;
                    const [sr, sg, sb] = String(THEME.SCRIM).split(',').map(Number);
                    this.countScrim.visible = true;
                    this.countScrim.clear().rect(0, 0, w, h).fill({ color: (sr << 16) | (sg << 8) | sb, alpha: 0.35 });
                    const SIZE = 90;
                    const entry = bake(`countdown:${step}:${theme}`, { x: -70, y: -70, w: 140, h: 145 }, (ctx) => {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.font = font(SIZE, 700);
                        ctx.fillStyle = THEME.PINK;
                        ctx.fillText(String(step), 3.5, 6);
                        outlinedText(ctx, String(step), 0, 0, THEME.TEXT, THEME.TEXT_HALO, 7);
                    });
                    applyBaked(this.countDigit, entry, (64 + frac * 26) / SIZE);
                    this.countDigit.position.set(w / 2, h / 2);
                    this.countDigit.alpha = 0.5 + frac * 0.5;
                    this.countDigit.visible = true;
                } else {
                    this.pause.show();
                    this.pause.draw(`${touch}|${theme}|${lang}`, { x: 0, y: 0, w, h },
                        (ctx) => ui.renderPaused(ctx, 0, touch, { skipResume: true }));
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
        this.hudLeft.draw(`${game.currentMode.label}|${theme}|${lang}|${top}`,
            { x: 0, y: 0, w: Math.min(w, 240), h: top + 40 },
            (ctx) => ui.renderHudLeft(ctx, game.currentMode, p, game.runCandies, { skipCounters: true }));
        const left = 18 + ui.safe.left + 2;
        this.grazeText.show();
        this.grazeText.set(t('hud.graze', { n: p.grazeCount }), left, top + 50, { size: 12, weight: 600, fill: THEME.MUTED, align: 'left' });
        if (game.runCandies > 0) {
            this.candyText.show();
            this.candyText.set(t('hud.candies', { n: formatScore(game.runCandies) }), left, top + 70,
                { size: 13, weight: 700, fill: THEME.TEXT_ACCENT, align: 'left' });
        }
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
        // Timer values: only their string length is in the key (digits are glyph sprites)
        const timers = {
            slowmo: pm.isSlowmoActive() ? (pm.slowmoTimer / 1000).toFixed(1) : '',
            heavy: p.slowTimer > 0 ? (p.slowTimer / 1000).toFixed(1) : '',
            big: p.growTimer > 0 ? (p.growTimer / 1000).toFixed(1) : ''
        };
        const rows = (p.hasShield ? 1 : 0) + (timers.slowmo ? 1 : 0) + (timers.heavy ? 1 : 0) + (timers.big ? 1 : 0);
        const rightKey = [compact, p.shieldCharges, timers.slowmo.length, timers.heavy.length, timers.big.length,
            theme, lang, top, w | 0].join('|');
        if (rows > 0 || !compact) {
            // Tight bounds: the whole canvas is uploaded on every redraw
            const hRight = top + (compact ? 24 : 54) + Math.max(0, rows - 1) * 24 + 20;
            this.hudRight.show();
            this.hudRight.draw(rightKey, { x: w - 230, y: 0, w: 230, h: hRight }, (ctx) => {
                const slots = [];
                ui.renderHudRight(ctx, p, pm, game.score, compact, { skipScore: true, timerSlots: slots });
                this.rightSlots = slots;
            });
        } else {
            this.rightSlots = [];
        }
        for (let i = 0; i < this.timerTexts.length; i++) {
            const slot = this.rightSlots[i];
            const g = this.timerTexts[i];
            if (!slot || !timers[slot.kind]) continue;
            g.show();
            g.set(timers[slot.kind], slot.x, slot.y, { size: 10, weight: 700, fill: slot.fill });
        }
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
        if (game.barBelow) g.roundRect(lw / 2, lw / 2, w - lw, h + 60, 18);
        else g.roundRect(lw / 2, lw / 2, w - lw, h - lw, 18);
        return lw;
    }

    frameWidth(game, h) {
        const cssH = game.canvasCssHeight || (game.canvas && game.canvas.clientHeight);
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
        // The card is drawn ONCE per death at full reveal; the fade-in and slide-up are sprite
        // alpha / position. Redrawing two full-screen textures for every reveal step (and the
        // whole content 30×/s for a bouncing "new record" pill) uploaded ~5 MB per redraw on a
        // phone: ~850 MB in one measured session with a few deaths.
        const slide = ui.deadSlide(reveal);
        const deathKey = `${game.deathTimestamp}|${theme}|${lang}|${w | 0}x${h | 0}`;
        const full = { ...info, reveal: 1 };
        // Scrim: a plain rectangle (does not slide)
        const [sr, sg, sb] = String(THEME.SCRIM).split(',').map(Number);
        this.deadScrim.visible = true;
        this.deadScrim.clear().rect(0, 0, w, h).fill({ color: (sr << 16) | (sg << 8) | sb, alpha: 0.85 * reveal });
        // Base: card panel + body
        this.deadBase.show();
        this.deadBase.draw(deathKey, { x: 0, y: 0, w, h },
            (ctx) => ui.renderDead(ctx, game.elapsedMs, game.currentMode, game.player, { ...full, pass: 'base', scrim: false }));
        this.deadBase.sprite.position.set(0, slide);
        this.deadBase.sprite.alpha = reveal;
        // Interactive backdrop inside the card body
        if (reveal > 0.6) {
            const r = ui.getDeadBodyRect(reveal);
            this.cardMask.clear().roundRect(r.x, r.y, r.w, r.h + r.r, r.r).fill({ color: 0xffffff });
            this.cardBackdrop.container.visible = true;
            this.cardBackdrop.sync(game.menuBackdrop, 0.6);
        }
        // Content: header band, score, chips, buttons (+ info panel)
        this.deadContent.show();
        const pill = {};
        const key = `${deathKey}|${ui.isNewRecord}|${ui.infoOpen}|${ui.focusedItem}`;
        this.deadContent.draw(key, { x: 0, y: 0, w, h }, (ctx) => {
            ui.renderDead(ctx, game.elapsedMs, game.currentMode, game.player, { ...full, pass: 'content', skipStars: true, recordPill: pill });
            this.recordPillInfo = pill.text ? pill : null;
        });
        this.deadContent.sprite.position.set(0, slide);
        this.deadContent.sprite.alpha = reveal;
        // "New record" pill: baked once, bounces as a sprite
        const D0 = ui.getDeadLayout();
        const rp = ui.isNewRecord && !ui.infoOpen ? this.recordPillInfo : null;
        if (rp) {
            const pw = textWidth(rp.text, font(13, 700)) + 16;
            const entry = bake(`deadpill:${rp.text}:${theme}`, { x: -pw / 2 - 4, y: -16, w: pw + 8, h: 34 },
                (ctx) => UIManager.pill(ctx, rp.text, 0, 0, THEME.PURPLE_DEEP, '#FFFFFF', 'center', 13));
            applyBaked(this.recordPill, entry, D0.s);
            const bounce = Math.abs(Math.sin(now * 5)) * 2;
            this.recordPill.position.set(D0.cx, D0.cy + slide + (rp.y - bounce) * D0.s);
            this.recordPill.alpha = reveal;
            this.recordPill.visible = true;
        }
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
