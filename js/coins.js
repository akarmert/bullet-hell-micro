// ============================================================
// coins.js — Sahada Beliren Şeker Paralar
// 1, 5, 10, 50 ve 100 değerinde toplanabilir şekerler.
// Değer arttıkça hem daha nadir çıkar hem de sahada daha kısa kalır:
// yüksek değerli şeker için mermilerin arasına hızlı dalmak gerekir.
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font } from './theme.js';
import { random } from './rng.js';

/**
 * Ağırlığa göre rastgele bir değer kademesi seçer
 * @param {Array} tiers GAME_CONFIG.COINS.TIERS
 * @param {number} roll 0 ≤ roll < 1
 */
export function pickTier(tiers, roll) {
    const total = tiers.reduce((a, t) => a + t.WEIGHT, 0);
    let acc = 0;
    for (const t of tiers) {
        acc += t.WEIGHT / total;
        if (roll < acc) return t;
    }
    return tiers[tiers.length - 1];
}

export class Coin {
    constructor(x, y, tier) {
        this.x = x;
        this.y = y;
        this.value = tier.VALUE;
        this.radius = tier.RADIUS;
        this.color = tier.COLOR;
        this.textColor = tier.TEXT;
        this.sparkle = !!tier.SPARKLE;
        this.life = tier.LIFE;
        this.maxLife = tier.LIFE;
        this.age = 0;
        this.active = true;
    }

    /** Kalan süre oranı (1 → yeni, 0 → kayboldu) */
    get remaining() {
        return Math.max(0, this.life / this.maxLife);
    }

    update(dtMs) {
        this.age += dtMs;
        this.life -= dtMs;
        if (this.life <= 0) this.active = false;
    }

    render(ctx) {
        if (!this.active) return;
        const k = this.remaining;
        // Son %30'da yanıp söner
        const blink = k < 0.3 ? 0.45 + 0.55 * Math.abs(Math.sin(this.age * 0.018)) : 1;
        const pop = Math.min(1, this.age / 200);
        const r = this.radius * (0.5 + 0.5 * pop) * (1 + Math.sin(this.age * 0.006) * 0.04);
        const bob = Math.sin(this.age * 0.004) * 2;

        ctx.save();
        ctx.globalAlpha = blink;
        ctx.translate(this.x, this.y + bob);

        // Gölge
        ctx.beginPath();
        ctx.ellipse(0, r + 5 - bob, r * 0.85, 2.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();

        // Kalan süre halkası (saat yönünde erir)
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Şeker para gövdesi
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Değer
        ctx.font = font(this.value >= 100 ? r * 0.8 : r * 0.95, 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.textColor;
        ctx.fillText(String(this.value), 0, 1, r * 1.5);

        // Değerli şekerde ışıltı
        if (this.sparkle) {
            const a = this.age * 0.005;
            ctx.fillStyle = THEME.SPARKLE; // Altın ışıltı (temaya göre ton)
            for (let i = 0; i < 3; i++) {
                const ang = a + (i * Math.PI * 2) / 3;
                const sx = Math.cos(ang) * (r + 9);
                const sy = Math.sin(ang) * (r + 9);
                const sr = 2.2 + Math.sin(this.age * 0.02 + i) * 0.8;
                ctx.beginPath();
                ctx.moveTo(sx, sy - sr * 1.6);
                ctx.lineTo(sx + sr * 0.5, sy);
                ctx.lineTo(sx, sy + sr * 1.6);
                ctx.lineTo(sx - sr * 0.5, sy);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

export class CoinManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.coins = [];
        this.timer = GAME_CONFIG.COINS.START_AFTER;
    }

    /** Oyuncudan, kenarlardan ve HUD'dan uzak rastgele bir yer */
    spawn(player = null) {
        const C = GAME_CONFIG.COINS;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const tier = pickTier(C.TIERS, random());
        let x = w / 2;
        let y = h / 2;
        for (let tries = 0; tries < 8; tries++) {
            x = C.MARGIN + random() * (w - C.MARGIN * 2);
            y = C.TOP + random() * (h - C.TOP - C.MARGIN);
            if (!player || Math.hypot(x - player.x, y - player.y) >= C.MIN_PLAYER_DIST) break;
        }
        const coin = new Coin(x, y, tier);
        this.coins.push(coin);
        return coin;
    }

    /**
     * @param {number} dtMs
     * @param {Player} player
     * @returns {Coin[]} Bu karede toplanan paralar
     */
    update(dtMs, player) {
        const C = GAME_CONFIG.COINS;
        this.timer -= dtMs;
        if (this.timer <= 0) {
            this.timer = C.SPAWN_EVERY * (0.6 + random() * 0.8);
            if (this.coins.length < C.MAX_ON_FIELD) this.spawn(player);
        }

        const collected = [];
        for (const coin of this.coins) {
            coin.update(dtMs);
            if (!coin.active || !player || !player.alive) continue;
            const reach = player.radius + coin.radius + C.PICK_REACH;
            if (Math.hypot(player.x - coin.x, player.y - coin.y) <= reach) {
                coin.active = false;
                collected.push(coin);
            }
        }
        // In-place compaction (no new array every step)
        let n = 0;
        for (let i = 0; i < this.coins.length; i++) if (this.coins[i].active) this.coins[n++] = this.coins[i];
        this.coins.length = n;
        return collected;
    }

}
