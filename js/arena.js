import { GAME_CONFIG } from './config.js';

// Boyutların tek kaynağı: 600 birim yükseklik, ekran oranına bağlı genişlik.
export function resizeArena(game) {
    const rect = game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Remembered so the renderer never reads layout (clientHeight) in the middle of a frame:
    // right after the touch bar appears that read forced a synchronous page layout
    game.canvasCssHeight = rect.height;
    const oldWidth = GAME_CONFIG.CANVAS.WIDTH;
    const height = 600;
    const width = height * rect.width / rect.height;
    GAME_CONFIG.CANVAS.WIDTH = width;
    GAME_CONFIG.CANVAS.HEIGHT = height;
    GAME_CONFIG.PLAYER.START_X = width / 2;
    GAME_CONFIG.PLAYER.START_Y = height / 2;
    // Dokunmatik cihazlarda (telefon) çözünürlük tavanı daha düşük: çizim yükü ciddi azalır
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const P = GAME_CONFIG.PERFORMANCE;
    const touchCap = rect.width > rect.height ? (P.MAX_DPR_TOUCH_LANDSCAPE || P.MAX_DPR_TOUCH) : P.MAX_DPR_TOUCH;
    let dpr = Math.min(window.devicePixelRatio || 1, coarse ? touchCap : P.MAX_DPR);
    // Adaptive quality may lower the resolution cap on devices that miss frames
    if (game.quality) dpr = Math.min(dpr, Math.max(1, game.quality.settings.dprCap));
    // PixiJS owns the drawing buffer: it sizes the canvas and scales the logical stage
    if (game.renderer) game.renderer.resize(rect.width, rect.height, dpr);
    if (game.player) {
        // Mid-run width change (phone rotated: ~360 ↔ ~940 units): everything keeps its place
        if (game.state === 'PLAYING' || game.state === 'PAUSED') remapWorldX(game, width / oldWidth);
        game.player.x *= width / oldWidth;
        game.player.clampToArena();
        game.player.prevX = game.player.x;
        game.player.prevY = game.player.y;
        game.effects.resize(width, height);
        game.touchControls.reset();
    }
    const style = getComputedStyle(game.canvas.parentElement);
    const scale = height / rect.height;
    game.ui?.setLayout(width, height, {
        left: (parseFloat(style.getPropertyValue('--safe-left')) || 0) * scale,
        right: (parseFloat(style.getPropertyValue('--safe-right')) || 0) * scale,
        top: (parseFloat(style.getPropertyValue('--safe-top')) || 0) * scale,
        bottom: (parseFloat(style.getPropertyValue('--safe-bottom')) || 0) * scale
    });
}

/**
 * Moves every world object horizontally by `f` (new width / old width). The arena is always
 * 600 units tall but its width follows the screen, so rotating a phone mid-run changed the
 * width ~2.6× while bullets, candies, coins and the boss kept their old coordinates: in
 * landscape they were bunched on the left while new ones arrived from the right.
 * Velocities are left alone (difficulty does not change). The player is handled by the caller.
 * Pure data, no rendering: unit-tested.
 */
export function remapWorldX(game, f) {
    if (!(f > 0) || f === 1 || !Number.isFinite(f)) return;
    const scale = (o) => {
        if (o && Number.isFinite(o.x)) o.x *= f;
    };
    const each = (list, fn) => {
        if (list) for (const o of list) fn(o);
    };
    each(game.bulletManager && game.bulletManager.bullets, (b) => {
        scale(b);
        each(b.trail, scale);
    });
    each(game.pickupManager && game.pickupManager.pickups, scale);
    each(game.coins && game.coins.coins, scale);
    const waves = game.waveManager;
    if (waves) {
        // Warning lines: walls that span the arena (horizontal) stretch with it; aimed lines keep
        // their direction and move with their origin, like the bullets they will fire
        each(waves.telegraphs, (t) => {
            if (t.y1 === t.y2) {
                t.x1 *= f;
                t.x2 *= f;
            } else {
                const dx = t.x1 * f - t.x1;
                t.x1 += dx;
                t.x2 += dx;
            }
        });
        if (waves.boss) {
            scale(waves.boss);
            if (Number.isFinite(waves.boss.rainGap)) waves.boss.rainGap *= f;
        }
    }
    each(game.score && game.score.popups, scale);
    each(game.effects && game.effects.particles, scale);
    each(game.effects && game.effects.shockwaves, scale);
    if (game.player) {
        each(game.player.afterImages, scale);
        scale(game.player.mouseTarget);
    }
}
