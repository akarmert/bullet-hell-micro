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
    // Dokunmatik cihazlarda (telefon) çözünürlük tavanı daha düşük: çizim yükü ciddi azalır
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const P = GAME_CONFIG.PERFORMANCE;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? P.MAX_DPR_TOUCH : P.MAX_DPR);
    // PixiJS owns the drawing buffer: it sizes the canvas and scales the logical stage
    if (game.renderer) game.renderer.resize(rect.width, rect.height, dpr);
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
