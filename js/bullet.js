// ============================================================
// bullet.js — Tekil Mermi Sınıfı (Object Pool Uyumlu)
// Fizik hareketi, duvar sekmesi, iz (trail), şekil çeşitliliği
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME } from './theme.js';

/**
 * Çizgili şeker çubuğu (merkez orijinde, x ekseni boyunca)
 */
export function drawCapsule(ctx, color, radius) {
    const length = radius * 3.6;
    const width = radius * 1.9;
    const x = -length / 2;
    const y = -width / 2;

    ctx.beginPath();
    ctx.roundRect(x, y, length, width, width / 2);
    ctx.fillStyle = THEME.WHITE;
    ctx.fill();

    // Çapraz şeker şeritleri
    ctx.save();
    ctx.clip();
    ctx.fillStyle = color;
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

const capsuleCache = new Map();
const haloCache = new Map();

/** Koyu temada mermi etrafındaki yumuşak renkli hale (önbellekli); DOM yoksa null */
function haloSprite(color, radius) {
    const key = `${color}|${radius}`;
    const cached = haloCache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined' || !/^#[0-9a-f]{6}$/i.test(color)) return null;
    const n = parseInt(color.slice(1), 16);
    const rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
    const size = Math.ceil(radius * 2.6);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * 2;
    const c = canvas.getContext('2d');
    const g = c.createRadialGradient(size, size, radius * 0.6, size, size, size);
    g.addColorStop(0, `rgba(${rgb}, 0.5)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, size * 2, size * 2);
    const sprite = { canvas, size };
    if (haloCache.size > 48) haloCache.clear();
    haloCache.set(key, sprite);
    return sprite;
}
const SPRITE_SCALE = 3; // Yüksek DPI ekranlarda da keskin kalsın

/** Önbellekli şeker çubuğu görseli; DOM yoksa (testler) null */
function capsuleSprite(color, radius, outline) {
    const key = `${color}|${radius}|${outline}|${THEME.INK}`;
    const cached = capsuleCache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const pad = outline + 1;
    const w = radius * 3.6 + pad * 2;
    const h = radius * 1.9 + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * SPRITE_SCALE);
    canvas.height = Math.ceil(h * SPRITE_SCALE);
    const c = canvas.getContext('2d');
    c.scale(SPRITE_SCALE, SPRITE_SCALE);
    c.translate(w / 2, h / 2);
    c.lineWidth = outline;
    c.strokeStyle = THEME.INK;
    c.lineJoin = 'round';
    drawCapsule(c, color, radius);

    const sprite = { canvas, w, h };
    if (capsuleCache.size > 32) capsuleCache.clear();
    capsuleCache.set(key, sprite);
    return sprite;
}

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
        shape = 'circle',
        wobble = 0,
        wobbleFreq = 0,
        spin = 0,
        tag = null
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
        // Testere: yan salınım ve dönüş
        this.wobble = wobble;
        this.wobbleFreq = wobbleFreq;
        this.wobblePhase = 0;
        this.spin = spin;
        this.spinAngle = 0;
        this.age = 0;
        this.tag = tag; // Boss'un takip ettiği mermiler (ör. patlayacak sakız balonu)
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

        // Hareket (salınım varsa ana yöne dik küçük bir dalga eklenir)
        this.age += effectiveDt;
        let mx = this.vx;
        let my = this.vy;
        if (this.wobble) {
            this.wobblePhase += effectiveDt * this.wobbleFreq;
            const sp = Math.hypot(this.vx, this.vy) || 1;
            const o = Math.cos(this.wobblePhase) * this.wobble;
            mx += (-this.vy / sp) * o;
            my += (this.vx / sp) * o;
        }
        if (this.spin) this.spinAngle += this.spin * effectiveDt;
        this.x += mx * effectiveDt;
        this.y += my * effectiveDt;
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

        // Koyu tema: mermi ay ışığında parlar (zeminden ilk bakışta seçilsin)
        if (THEME.dark) {
            const halo = haloSprite(this.color, this.radius);
            if (halo) ctx.drawImage(halo.canvas, this.x - halo.size, this.y - halo.size);
        }

        ctx.lineWidth = THEME.BULLET_OUTLINE;
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
            case 'saw':
                this.renderSaw(ctx);
                break;
            case 'bubble':
                this.renderBubble(ctx);
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
        // Kırpma + şeritler pahalı: her renk/boyut için bir kez çizilen hazır görsel kullan
        const sprite = capsuleSprite(this.color, this.radius, THEME.BULLET_OUTLINE);
        if (sprite) {
            ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
            return;
        }
        drawCapsule(ctx, this.color, this.radius);
    }

    /**
     * Şeker testere: dönen eğik dişler, beyaz göbek ve dik duran minik yüz.
     * İlk 0.25 sn'de "pıt" diye büyüyerek belirir.
     */
    renderSaw(ctx) {
        const r = this.sawRadius();
        ctx.translate(this.x, this.y);
        ctx.save();
        ctx.rotate(this.spinAngle);
        Bullet.drawSawBody(ctx, r, this.color);
        ctx.restore();
        Bullet.drawSawFace(ctx, r);
    }

    /** Pop-in radius: grows with a small overshoot during the first 0.25 s */
    sawRadius() {
        const pop = Math.min(1, this.age / 0.25);
        const c1 = 1.70158;
        const back = 1 + (c1 + 1) * Math.pow(pop - 1, 3) + c1 * Math.pow(pop - 1, 2);
        return this.radius * (0.4 + 0.6 * back);
    }

    /** Spinning toothed body, white hub and a notch that shows the rotation (origin-centred) */
    static drawSawBody(ctx, r, color) {
        const teeth = 6;           // Few, chunky teeth: colour stays readable at small sizes
        const outer = r * 1.55;
        const inner = r * 1.08;
        const step = (Math.PI * 2) / teeth;
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a = i * step;
            const p0 = [Math.cos(a) * inner, Math.sin(a) * inner];
            const tip = [Math.cos(a + step * 0.55) * outer, Math.sin(a + step * 0.55) * outer];
            const p1 = [Math.cos(a + step * 0.8) * inner, Math.sin(a + step * 0.8) * inner];
            if (i === 0) ctx.moveTo(p0[0], p0[1]); else ctx.lineTo(p0[0], p0[1]);
            ctx.lineTo(tip[0], tip[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.arc(0, 0, inner, a + step * 0.8, a + step, false);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = THEME.BULLET_OUTLINE * 0.75; // Thin outline so it does not drown the colour
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
        ctx.fillStyle = THEME.WHITE;
        ctx.fill();
        ctx.lineWidth = Math.max(0.8, THEME.BULLET_OUTLINE * 0.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r * 0.48, 0, r * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    /** Upright cute face (does not spin) */
    static drawSawFace(ctx, r) {
        ctx.fillStyle = THEME.INK;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(side * r * 0.26, -r * 0.08, Math.max(0.7, r * 0.11), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, r * 0.12, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = Math.max(0.8, r * 0.09);
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    /**
     * Spiral fazı için lavanta donut
     */
    /** Sakız balonu: yarı saydam pembe balon; patlamaya yaklaştıkça titreyerek şişer */
    /** Bubble swell factor: trembles and grows as it gets close to popping */
    bubbleWobble() {
        return this.age > 1.0 ? 1 + Math.sin(this.age * 22) * 0.07 + (this.age - 1.0) * 0.12 : 1;
    }

    renderBubble(ctx) {
        const wob = this.bubbleWobble();
        const r = this.radius * wob;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 140, 190, 0.55)';
        ctx.fill();
        ctx.lineWidth = THEME.BULLET_OUTLINE;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.x - r * 0.35, this.y - r * 0.35, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
    }

    renderRing(ctx) {
        const r = this.radius * 1.35;
        ctx.lineWidth = THEME.BULLET_OUTLINE * 0.85;
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
