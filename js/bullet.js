// ============================================================
// bullet.js — Tekil Mermi Sınıfı (Object Pool Uyumlu)
// Fizik hareketi, duvar sekmesi, iz (trail), şekil çeşitliliği
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME } from './theme.js';

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
            this.trail.unshift({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) {
                this.trail.pop();
            }
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

        // 1. Yumuşak iz (varsa): solan pastel noktalar
        if (this.trail.length > 1) {
            ctx.fillStyle = this.color;
            for (let i = 1; i < this.trail.length; i += 2) {
                const pt = this.trail[i];
                const ratio = 1 - i / this.trail.length;
                ctx.globalAlpha = ratio * 0.4;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, this.radius * ratio * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        ctx.lineWidth = 1.6;
        ctx.strokeStyle = THEME.INK;
        ctx.lineJoin = 'round';

        // 2. Şekere göre gövde
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
     * Sakız topu: dolgun daire + parlak nokta
     */
    renderCircle(ctx) {
        const r = this.radius * 1.15;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(this.x - r * 0.35, this.y - r * 0.35, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = THEME.WHITE;
        ctx.fill();
    }

    /**
     * Nişanlı şeker kristali: yönlü damla
     */
    renderDiamond(ctx) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        const r = this.radius * 1.1;

        ctx.beginPath();
        ctx.moveTo(r * 2, 0);
        ctx.quadraticCurveTo(r * 0.4, -r * 1.1, -r, 0);
        ctx.quadraticCurveTo(r * 0.4, r * 1.1, r * 2, 0);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(r * 0.2, -r * 0.3, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
    }

    /**
     * Seken çizgili şeker çubuğu
     */
    renderCapsule(ctx) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        const length = this.radius * 3.6;
        const width = this.radius * 1.9;
        const x = -length / 2;
        const y = -width / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, length, width, width / 2);
        ctx.fillStyle = THEME.WHITE;
        ctx.fill();

        // Çapraz şeker şeritleri
        ctx.save();
        ctx.clip();
        ctx.fillStyle = this.color;
        for (let sx = x - width; sx < length / 2 + width; sx += width * 0.9) {
            ctx.beginPath();
            ctx.moveTo(sx, y + width);
            ctx.lineTo(sx + width * 0.45, y + width);
            ctx.lineTo(sx + width * 0.45 + width, y);
            ctx.lineTo(sx + width, y);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(x, y, length, width, width / 2);
        ctx.stroke();
    }

    /**
     * Spiral fazı için lavanta donut
     */
    renderRing(ctx) {
        const r = this.radius * 1.35;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();

        // Krema parlaması ve küçük delik
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.66, Math.PI * 1.05, Math.PI * 1.55);
        ctx.strokeStyle = THEME.WHITE;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = THEME.BG;
        ctx.fill();
    }
}
