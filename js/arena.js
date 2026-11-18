import { GAME_CONFIG } from './config.js';

// Boyutların tek kaynağı: 600 birim yükseklik, ekran oranına bağlı genişlik.
export function resizeArena(game) {
    const rect = game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldWidth = GAME_CONFIG.CANVAS.WIDTH;
    const height = 600;
    const width = height * rect.width / rect.height;
    GAME_CONFIG.CANVAS.WIDTH = width;
    GAME_CONFIG.CANVAS.HEIGHT = height;
    GAME_CONFIG.PLAYER.START_X = width / 2;
    GAME_CONFIG.PLAYER.START_Y = height / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    game.canvas.width = Math.round(rect.width * dpr);
    game.canvas.height = Math.round(rect.height * dpr);
    game.ctx.setTransform(game.canvas.width / width, 0, 0, game.canvas.height / height, 0, 0);
    if (game.player) {
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
