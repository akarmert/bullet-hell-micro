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
import { THEME } from '../theme.js';
import { UIManager } from '../ui.js';
import { formatScore } from '../score.js';
import { getLang } from '../i18n.js';
import { LiveCanvasSprite, toTint } from './textures.js';
import { glowEntry, GLOW_RADIUS } from './shapes.js';
import { BackdropView } from './backdropView.js';
import { tick30 } from './worldView.js';

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
        this.hudLeft = new LiveCanvasSprite();
        this.hudCenter = new LiveCanvasSprite();
        this.hudRight = new LiveCanvasSprite();
        this.hudDash = new LiveCanvasSprite();
        this.hint = new LiveCanvasSprite();
        this.bossBar = new LiveCanvasSprite();

        // Full-screen overlays
        this.menu = new LiveCanvasSprite();
        this.pause = new LiveCanvasSprite();
        this.deadBase = new LiveCanvasSprite();
        this.cardBackdrop = new BackdropView();
        this.cardMask = new Graphics();
        this.cardBackdrop.container.mask = this.cardMask;
        this.deadContent = new LiveCanvasSprite();

        // Arena frame + the part of it that lights up near a wall
        this.frame = new Graphics();
        this.edgeLines = new Container();
        this.edgeLineMask = new Graphics();
        this.edgeLines.mask = this.edgeLineMask;
        this.edgeLineSprites = [0, 1, 2, 3].map(() => this.edgeLines.addChild(new Sprite()));

        this.container.addChild(
            this.edgeGlowMask, this.edgeGlows,
            this.hudLeft.sprite, this.hudCenter.sprite, this.hudRight.sprite, this.hudDash.sprite,
            this.hint.sprite, this.bossBar.sprite,
            this.menu.sprite, this.pause.sprite,
            this.deadBase.sprite, this.cardMask, this.cardBackdrop.container, this.deadContent.sprite,
            this.frame, this.edgeLineMask, this.edgeLines
        );
        this.all = [this.hudLeft, this.hudCenter, this.hudRight, this.hudDash, this.hint, this.bossBar, this.menu, this.pause, this.deadBase, this.deadContent];
    }

    sync(game, w, h) {
        const ui = game.ui;
        const state = game.state;
        const now = performance.now() / 1000;
        const lang = getLang();
        const theme = `${THEME.mode}|${THEME.highContrast}`;
        for (const l of this.all) l.hide();
        this.cardBackdrop.container.visible = false;
        this.edgeGlows.visible = false;
        this.edgeLines.visible = false;
        this.frame.clear();

        if (state === 'MENU') {
            this.menu.show();
            const key = `${tick30(now)}|${game.currentMode.id}|${ui.settingsOpen}|${ui.infoOpen}|${theme}|${lang}`;
            this.menu.draw(key, { x: 0, y: 0, w, h }, (ctx) => ui.renderMenu(ctx, game.currentMode.id));
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
                const barW = Math.min(280, w - 80);
                this.bossBar.show();
                const fill = boss.state === 'ENTERING' ? Math.min(1, boss.stateTimer / boss.cfg.ENTRY_TIME) : boss.hpRatio;
                const key = `${boss.kind}|${boss.stage}|${Math.round(fill * 400)}|${boss.hitFlash > 0.05}|${theme}|${lang}|${ui.safe.top}`;
                this.bossBar.draw(key, { x: (w - barW) / 2 - 20, y: ui.safe.top + 88, w: barW + 40, h: 36 }, (ctx) => boss.renderHealthBar(ctx, ui.safe.top));
            }
            if (state === 'PAUSED') {
                this.pause.show();
                const step = Math.ceil(game.resumeCountdown / 500);
                const pulse = game.resumeCountdown > 0 ? Math.floor((game.resumeCountdown % 500) / 33) : Math.floor(now * 15);
                const touch = game.touchControls.touchDevice;
                const key = `${step}|${pulse}|${touch}|${theme}|${lang}`;
                this.pause.draw(key, { x: 0, y: 0, w, h }, (ctx) => ui.renderPaused(ctx, game.resumeCountdown, touch));
            }
            // Arena frame + the lit part near a wall (above the UI, like before)
            this.drawFrame(game, w, h);
            this.syncEdge(game, w, h, false);
            return;
        }

        if (state === 'DEAD') this.syncDead(game, w, h, now, theme, lang);
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
            this.hudCenter.draw(`${UIManager.formatTime(game.elapsedMs)}|${ui.getBestScore(game.currentMode.id)}|${theme}|${lang}|${top}|${w | 0}`,
                { x: w / 2 - 160, y: 0, w: 320, h: top + 84 },
                (ctx) => ui.renderHudCenter(ctx, game.elapsedMs, game.currentMode));
        }
        const pm = game.pickupManager;
        const rightKey = [compact ? '' : formatScore(game.score.total), p.shieldCharges,
            pm.isSlowmoActive() ? (pm.slowmoTimer / 1000).toFixed(1) : '', p.slowTimer > 0 ? (p.slowTimer / 1000).toFixed(1) : '',
            p.growTimer > 0 ? (p.growTimer / 1000).toFixed(1) : '', theme, lang, top, w | 0].join('|');
        this.hudRight.show();
        this.hudRight.draw(rightKey, { x: w - 300, y: 0, w: 300, h: top + 160 },
            (ctx) => ui.renderHudRight(ctx, p, pm, game.score, compact));
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
        const key = `${tick30(now)}|${revealKey}|${ui.isNewRecord}|${ui.infoOpen}|${theme}|${lang}`;
        this.deadContent.draw(key, { x: 0, y: 0, w, h },
            (ctx) => ui.renderDead(ctx, game.elapsedMs, game.currentMode, game.player, { ...info, pass: 'content' }));
    }
}
