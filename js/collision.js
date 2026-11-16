// ============================================================
// collision.js — Çarpışma ve Graze (Teğet Geçme) Tespit Sistemi
// Daire-daire mesafe kontrolü, I-Frame (Dash), Kalkan ve Arena Sınırı
// ============================================================

import { GAME_CONFIG } from './config.js';

export class CollisionSystem {
    /**
     * Oyuncu ile arena sınırları arasındaki teması denetler.
     * Oyuncu duvara değdiği anda ölüm gerçekleşir.
     * @param {Player} player 
     * @returns {boolean}
     */
    static checkPlayerArena(player) {
        const r = player.radius;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        return (
            player.x - r <= 0 ||
            player.x + r >= w ||
            player.y - r <= 0 ||
            player.y + r >= h
        );
    }

    /**
     * Oyuncu ile tekil bir mermi arasındaki ölümcül çarpışmayı denetler
     * Dash (I-Frame) anında oyuncu tamamen dokunulmazdır.
     * @param {Player} player 
     * @param {Bullet} bullet 
     * @returns {boolean}
     */
    static checkPlayerBullet(player, bullet) {
        if (!player.alive || player.isDashing || !bullet.active) {
            return false;
        }

        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const distSq = dx * dx + dy * dy;

        // Hitbox adil hissettirmek için player.hitboxRadius kullanılır
        const totalRadius = player.hitboxRadius + bullet.radius;
        return distSq < (totalRadius * totalRadius);
    }

    /**
     * Merminin oyuncunun hitbox'ına çarpmadan Graze (teğet) alanından geçip geçmediğini denetler
     * @param {Player} player 
     * @param {Bullet} bullet 
     * @returns {boolean}
     */
    static checkPlayerGraze(player, bullet) {
        if (!player.alive || bullet.hasGrazed || !bullet.active) {
            return false;
        }

        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const distSq = dx * dx + dy * dy;

        const hitDist = player.hitboxRadius + bullet.radius;
        const grazeDist = player.grazeRadius + bullet.radius;

        // Hitbox sınırının dışında ama graze çemberinin içinde mi?
        if (distSq <= grazeDist * grazeDist && distSq > hitDist * hitDist) {
            bullet.hasGrazed = true;
            return true;
        }

        return false;
    }

    /**
     * Tüm aktif mermilerle oyuncu arasındaki çarpışma ve graze etkileşimlerini çözer
     * Kalkan varsa ölümü engeller ve kalkanı kırar.
     * @param {Player} player 
     * @param {Bullet[]} bullets 
     * @param {Function} onGraze 
     * @param {Function} onShieldBreak 
     * @returns {Bullet|null} Ölümcül mermi veya null
     */
    static processInteractions(player, bullets, onGraze, onShieldBreak) {
        const len = bullets.length;

        for (let i = 0; i < len; i++) {
            const bullet = bullets[i];
            if (!bullet.active) continue;

            // 1. Graze Kontrolü
            if (this.checkPlayerGraze(player, bullet)) {
                player.grazeCount++;
                if (onGraze) onGraze(bullet);
            }

            // 2. Ölümcül Hitbox Kontrolü
            if (this.checkPlayerBullet(player, bullet)) {
                // Kalkan koruması
                if (player.hasShield) {
                    player.hasShield = false;
                    bullet.active = false;
                    if (onShieldBreak) onShieldBreak(bullet);
                    continue; // Ölümü engelle ve devam et
                }

                // Kalkan yoksa ölümcül çarpışma gerçekleşti
                return bullet;
            }
        }

        return null;
    }

    /**
     * Geriye dönük uyumluluk için eski metod
     */
    static checkPlayerBullets(player, bullets) {
        return this.processInteractions(player, bullets, null, null);
    }
}
