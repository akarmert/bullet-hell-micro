// ============================================================
// main.js — Uygulama Başlatıcı (Entry Point)
// Canvas başlatma, oyun nesnesi ve requestAnimationFrame döngüsü
// ============================================================

import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Oyun canvas elementi bulunamadı!');
        return;
    }

    const game = new Game(canvas);
    window.game = game;

    let lastTime = performance.now();

    /**
     * Ana oyun döngüsü (60Hz, 120Hz, 144Hz+ monitörlerle tam uyumlu)
     */
    function gameLoop(currentTime) {
        // Delta time hesaplama (saniye)
        let dt = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Sekme değişimi veya ani FPS düşüşlerinde mermilerin zıplamasını önlemek için tavan sınırlama
        if (dt > 0.05) {
            dt = 0.05;
        }

        game.update(dt);
        game.render();

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame((timestamp) => {
        lastTime = timestamp;
        requestAnimationFrame(gameLoop);
    });
});
