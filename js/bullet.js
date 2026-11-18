// ============================================================
// bullet.js — Tekil Mermi Sınıfı (Object Pool Uyumlu)
// Fizik hareketi, duvar sekmesi, iz (trail), şekil çeşitliliği
// ============================================================

import { GAME_CONFIG } from './config.js';

// ============================================================
// Mermi Sprite Önbelleği
// Her (şekil, renk, yarıçap) için ışımalı mermi bir kez offscreen canvas'a
// gerçek shadowBlur ile çizilir; her karede yalnızca drawImage yapılır.
// Bu, mobilde en büyük kare süresi kalemini (mermi başına shadowBlur) ortadan kaldırır.
// ============================================================
export const BulletSprites = {
    scale: 2,          // Mantıksal birim → cihaz pikseli (Game.applyLayout ayarlar)
    cache: new Map(),

    setScale(scale) {
        const s = Math.max(0.5, Math.round(scale * 4) / 4); // Ufak oynamalarda önbellek bozulmasın
        if (s !== this.scale) {
            this.scale = s;
            this.cache.clear();
        }
    },

    get(bullet) {
        const key = `${bullet.shape}|${bullet.color}|${bullet.glow}|${bullet.radius}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.build(bullet);
            this.cache.set(key, sprite);
        }
        return sprite;
    },

    build(bullet) {
        const S = this.scale;
        // Kapsül en uzun şekil (~3.2r) + gölge payı
        const half = bullet.radius * 3.4 + 12;
        const px = Math.ceil(half * 2 * S);
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d');
        ctx.scale(S, S);

        // Sahte mermi: merkezde, rotasyon 0 (döndürme çizim anında uygulanır)
        const proxy = {
            x: half, y: half, radius: bullet.radius,
            color: bullet.color, glow: bullet.glow, rotation: 0
        };
        const draw = {
            diamond: Bullet.prototype.renderDiamond,
            capsule: Bullet.prototype.renderCapsule,
            ring: Bullet.prototype.renderRing,
            circle: Bullet.prototype.renderCircle
        }[bullet.shape] || Bullet.prototype.renderCircle;
        draw.call(proxy, ctx);

        return { canvas, half, rotates: bullet.shape === 'diamond' || bullet.shape === 'capsule' };
    }
};

export class Bullet {
    constructor(params = {}) {
        this.trail = [];
        this.init(params);
    }

    /**
     * Havuzdan çekilen mermiyi yeni parametrelerle hazırlar
     */
    init({
        x = 0,
        y = 0,
        vx = 0,
        vy = 0,
        radius = 4,
        speed = 150,
        color = '#ff3366',
        glow = 'rgba(255, 51, 102, 0.5)',
        type = 'standard',
        maxBounces = 0,
        trailLength = 0,
        shape = 'circle'
    } = {}) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.speed = speed;
        this.color = color;
        this.glow = glow;
        this.type = type;
        this.bouncesRemaining = maxBounces;
        this.trailLength = trailLength;
        this.trail.length = 0;
        this.shape = shape; // 'circle', 'diamond', 'capsule', 'ring'
        this.active = true;
        this.hasGrazed = false; // Teğet geçme sayacı için tek seferlik kilit
        this.rotation = Math.atan2(vy, vx);
    }

    /**
     * Mermi konumunu ve iz geçmişini delta time bazlı günceller
     * @param {number} dt Saniye cinsinden geçen süre
     * @param {number} speedFactor Slow-mo gibi global hız çarpanı
     */
    update(dt, speedFactor = 1.0) {
        if (!this.active) return;

        const effectiveDt = dt * speedFactor;

        // Trail kaydı
        if (this.trailLength > 0) {
            // Nesne yeniden kullanımı: her karede yeni nesne oluşturup çöp üretmez
            const pt = this.trail.length >= this.trailLength ? this.trail.pop() : { x: 0, y: 0 };
            pt.x = this.x;
            pt.y = this.y;
            this.trail.unshift(pt);
        }

        // Hareket
        this.x += this.vx * effectiveDt;
        this.y += this.vy * effectiveDt;
        this.rotation = Math.atan2(this.vy, this.vx);

        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        // Sekme mantığı (CHAOS fazı için)
        if (this.bouncesRemaining > 0) {
            let bounced = false;
            if (this.x - this.radius <= 0) {
                this.x = this.radius;
                this.vx = -this.vx;
                bounced = true;
            } else if (this.x + this.radius >= w) {
                this.x = w - this.radius;
                this.vx = -this.vx;
                bounced = true;
            }

            if (this.y - this.radius <= 0) {
                this.y = this.radius;
                this.vy = -this.vy;
                bounced = true;
            } else if (this.y + this.radius >= h) {
                this.y = h - this.radius;
                this.vy = -this.vy;
                bounced = true;
            }

            if (bounced) {
                this.bouncesRemaining--;
                this.rotation = Math.atan2(this.vy, this.vx);
            }
        } else {
            // Ekran sınırından yeterince uzaklaşınca pasifleştir
            const margin = 50;
            if (
                this.x < -margin ||
                this.x > w + margin ||
                this.y < -margin ||
                this.y > h + margin
            ) {
                this.active = false;
            }
        }
    }

    /**
     * Mermiyi, izini (trail) ve geometrik şekline göre çizer
     * @param {CanvasRenderingContext2D} ctx 
     */
    render(ctx) {
        if (!this.active) return;

        ctx.save();

        // 1. Trail çizimi (varsa)
        if (this.trail.length > 1) {
            for (let i = 0; i < this.trail.length; i++) {
                const pt = this.trail[i];
                const ratio = 1 - i / this.trail.length;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, this.radius * ratio * 0.75, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = ratio * 0.35;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1.0;

        // 2. Mermi Gövdesi: önbellekteki ışımalı sprite
        const sprite = BulletSprites.get(this);
        const size = sprite.half * 2;
        if (sprite.rotates) {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half, size, size);
        } else {
            ctx.drawImage(sprite.canvas, this.x - sprite.half, this.y - sprite.half, size, size);
        }

        ctx.restore();
    }

    /**
     * Doğrudan vektör çizim (sprite üretiminde ve referans için kullanılır)
     */
    renderVector(ctx) {
        ctx.save();
        switch (this.shape) {
            case 'diamond':
                this.renderDiamond(ctx);
                break;
            case 'capsule':
                this.renderCapsule(ctx);
                break;
            case 'ring':
                this.renderRing(ctx);
                break;
            case 'circle':
            default:
                this.renderCircle(ctx);
                break;
        }

        ctx.restore();
    }

    /**
     * Klasik dairesel mermi
     */
    renderCircle(ctx) {
        // Dış neon ışıma
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fillStyle = this.glow;
        ctx.fill();

        // Mermi çekirdeği
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fill();

        // Merkez beyaz parlaklık
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    /**
     * Aim mermileri için sivri elmas / yönlü ok
     */
    renderDiamond(ctx) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const r = this.radius;

        // Dış ışıma
        ctx.beginPath();
        ctx.moveTo(r * 2.5, 0);
        ctx.lineTo(0, -r * 1.5);
        ctx.lineTo(-r * 1.5, 0);
        ctx.lineTo(0, r * 1.5);
        ctx.closePath();
        ctx.fillStyle = this.glow;
        ctx.fill();

        // Ana gövde
        ctx.beginPath();
        ctx.moveTo(r * 2, 0);
        ctx.lineTo(0, -r);
        ctx.lineTo(-r, 0);
        ctx.lineTo(0, r);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fill();

        // Beyaz keskin merkez
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(0, -r * 0.4);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(0, r * 0.4);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    /**
     * Seken lazer / kaos mermileri için kapsül ışın formu
     */
    renderCapsule(ctx) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const length = this.radius * 3.5;
        const width = this.radius * 1.6;

        // Dış neon glow
        ctx.strokeStyle = this.glow;
        ctx.lineWidth = width * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-length / 2, 0);
        ctx.lineTo(length / 2, 0);
        ctx.stroke();

        // Ana renkli kapsül
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(-length / 2, 0);
        ctx.lineTo(length / 2, 0);
        ctx.stroke();

        // Beyaz parlak iç lazer çekirdeği
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = width * 0.4;
        ctx.beginPath();
        ctx.moveTo(-length / 2 + 2, 0);
        ctx.lineTo(length / 2 - 2, 0);
        ctx.stroke();
    }

    /**
     * Spiral dalgalar için halkalı enerji küresi
     */
    renderRing(ctx) {
        // Dış ışıma
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = this.glow;
        ctx.fill();

        // İnce parlak dış halka
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.3, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Orta renkli çekirdek
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // Merkez beyaz nokta
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}
