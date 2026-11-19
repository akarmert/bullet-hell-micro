// ============================================================
// effects.js — Görsel Efektler, Reaktif Benekli Zemin ve Prosedürel Müzik
// Şeker serpintisi parçacıkları, pastel bulutlar, yaylı benek zemini,
// marimba/pop sesleri ve faza göre katmanlanan neşeli müzik
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font, candyPanel } from './theme.js';
import { SoundSystem } from './audio.js';
import { t, upper } from './i18n.js';

/**
 * Şeker serpintisi parçacığı (dönen yuvarlak çubuk veya minik top)
 */
class Particle {
    constructor(x, y, color, speedScale = 1.0, lifeScale = 1.0) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = (GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MIN +
            Math.random() * (GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MAX - GAME_CONFIG.EFFECTS.PARTICLE_SPEED_MIN)) * speedScale;

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        const scale = Math.min(speedScale, 1.5);
        this.length = (5 + Math.random() * 5) * scale;
        this.width = 2.6 * Math.max(0.7, scale);
        this.round = Math.random() < 0.3; // Bazıları minik şeker topu
        this.rotation = Math.random() * Math.PI;
        this.spin = (Math.random() * 2 - 1) * 10;
        this.maxLife = GAME_CONFIG.EFFECTS.PARTICLE_LIFETIME * lifeScale * 1.3;
        this.life = this.maxLife;
    }

    update(dt) {
        this.life -= dt * 1000;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.94;
        this.vy = this.vy * 0.94 + 160 * dt; // Hafif yerçekimi: konfeti gibi düşer
        this.rotation += this.spin * dt;
    }

    render(ctx) {
        if (this.life <= 0) return;
        const alpha = Math.min(1, (this.life / this.maxLife) * 1.8);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        if (this.round) {
            ctx.arc(0, 0, this.width * 0.9, 0, Math.PI * 2);
        } else {
            ctx.roundRect(-this.length / 2, -this.width / 2, this.length, this.width, this.width / 2);
        }
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = THEME.INK_SOFT;
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Reaktif / Esnek Yaylı Arena Izgarası (Verlet / Spring Grid)
 * Oyuncu, dash ve patlamalarda fiziksel olarak esner
 */
class SpringGrid {
    constructor(width, height, step = 50) {
        this.width = width;
        this.height = height;
        this.step = step;
        this.cols = Math.ceil(width / step) + 1;
        this.rows = Math.floor(height / step) + 1;

        this.points = [];
        for (let c = 0; c < this.cols; c++) {
            this.points[c] = [];
            for (let r = 0; r < this.rows; r++) {
                const bx = c * step;
                const by = r * step;
                this.points[c][r] = {
                    x: bx,
                    y: by,
                    baseX: bx,
                    baseY: by,
                    vx: 0,
                    vy: 0
                };
            }
        }
    }

    /**
     * Izgara üzerine belirli bir noktadan dairesel kuvvet uygular
     */
    applyForce(cx, cy, force, radius = 90) {
        const radSq = radius * radius;
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                const dx = pt.x - cx;
                const dy = pt.y - cy;
                const distSq = dx * dx + dy * dy;

                if (distSq < radSq && distSq > 1) {
                    const dist = Math.sqrt(distSq);
                    const factor = (1 - dist / radius) * force;
                    pt.vx += (dx / dist) * factor;
                    pt.vy += (dy / dist) * factor;
                }
            }
        }
    }

    /**
     * Yay fiziği denklemleri ile noktaları denge konumuna çeker
     */
    update(dt) {
        const springK = 38; // Yay sertliği
        const damping = 0.91; // Sönüm katsayısı

        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];

                const ax = (pt.baseX - pt.x) * springK;
                const ay = (pt.baseY - pt.y) * springK;

                pt.vx = (pt.vx + ax * dt) * damping;
                pt.vy = (pt.vy + ay * dt) * damping;

                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
            }
        }
    }

    /**
     * Esneyen benekli zemin: itilen benekler büyür ve pembeleşir
     */
    render(ctx) {
        ctx.save();
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                const d = Math.min(24, Math.abs(pt.x - pt.baseX) + Math.abs(pt.y - pt.baseY));
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2 + d * 0.14, 0, Math.PI * 2);
                ctx.fillStyle = d > 3 ? 'rgba(255, 111, 174, 0.55)' : THEME.GRID_DOT;
                ctx.fill();
            }
        }
        ctx.restore();
    }

    reset() {
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                const pt = this.points[c][r];
                pt.x = pt.baseX;
                pt.y = pt.baseY;
                pt.vx = 0;
                pt.vy = 0;
            }
        }
    }
}

export class EffectsManager {
    constructor() {
        this.sound = new SoundSystem();
        this.grid = new SpringGrid(GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT, 50);
        this.particles = [];
        
        // Screen shake değişkenleri
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        this.shakeX = 0;
        this.shakeY = 0;

        // Flash efekti
        this.flashAlpha = 0;

        // Bildirim metin banner'ı
        this.bannerText = '';
        this.bannerColor = '#ffffff';
        this.bannerTimer = 0;

        // EMP Şok Dalgası Halka Efekti
        this.shockwaves = [];

        // Ayarlar: sarsıntı ve flaş
        this.motionEnabled = true;

        // Arka planda süzülen pastel bulutlar
        this.blobs = this.createBlobs(GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
    }

    createBlobs(width, height) {
        const colors = ['255, 196, 222', '205, 184, 255', '255, 214, 232'];
        const blobs = [];
        const count = Math.max(5, Math.round(width / 140));
        for (let i = 0; i < count; i++) {
            blobs.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: 90 + Math.random() * 110,
                vx: (Math.random() * 2 - 1) * 8,
                vy: (Math.random() * 2 - 1) * 6,
                color: colors[i % colors.length]
            });
        }
        return blobs;
    }

    resize(width, height) {
        this.grid = new SpringGrid(width, height, 50);
        this.blobs = this.createBlobs(width, height);
    }

    initAudio() {
        this.sound.init();
    }

    /**
     * Oyuncu öldüğünde patlama, sarsıntı ve ses efektini tetikler
     */
    triggerDeath(x, y) {
        this.shakeTimer = GAME_CONFIG.EFFECTS.SHAKE_DURATION;
        this.shakeIntensity = GAME_CONFIG.EFFECTS.SHAKE_INTENSITY;
        this.flashAlpha = 0.45;

        this.particles = [];
        const count = GAME_CONFIG.EFFECTS.PARTICLE_COUNT * 2;
        const colors = THEME.SPRINKLES;

        // Geniş saçılan şeker serpintisi
        for (let i = 0; i < count; i++) {
            const color = colors[i % colors.length];
            this.particles.push(new Particle(x, y, color, 1.6, 1.6));
        }
        // Marşmelovdan kopan beyaz ponponlar
        for (let i = 0; i < 10; i++) {
            const puff = new Particle(x, y, THEME.WHITE, 1.1, 1.8);
            puff.round = true;
            puff.width = 4 + Math.random() * 3;
            this.particles.push(puff);
        }

        // Çift pembe şok dalgası
        this.shockwaves.push({ x, y, radius: 6, maxRadius: 240, color: THEME.PINK, alpha: 1.0 });
        this.shockwaves.push({ x, y, radius: 2, maxRadius: 150, color: THEME.PURPLE, alpha: 1.0 });

        this.grid.applyForce(x, y, 260, 220);
        this.sound.playDeath(x);
    }

    /**
     * Faz değişimini bildirir
     */
    triggerPhase(phaseName) {
        this.triggerBanner(t('banner.phase', { name: phaseName }), THEME.PURPLE);
        this.sound.playPhase();
    }

    /**
     * Genel amaçlı ekran üstü neon bildirim
     */
    triggerBanner(text, color = THEME.PINK) {
        this.bannerText = text;
        this.bannerColor = color;
        this.bannerTimer = 1600;
    }

    /**
     * Graze (teğet geçme) anında minik sarı kıvılcım parçacığı
     */
    triggerGraze(x, y, combo = null) {
        this.sound.playGraze(x, combo);
        const colors = [THEME.PINK, THEME.LAVENDER];
        for (let i = 0; i < 3; i++) {
            this.particles.push(new Particle(x, y, colors[i % 2], 0.4, 0.4));
        }
        this.grid.applyForce(x, y, 20, 45);
    }

    /**
     * Dash anında beyaz hız parçacıkları ve ızgara itmesi
     */
    triggerDash(x, y) {
        this.sound.playDash(x);
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(x, y, i % 2 ? THEME.WHITE : THEME.PINK_SOFT, 0.6, 0.5));
        }
        this.grid.applyForce(x, y, 120, 100);
    }

    /**
     * Kalkan darbeyi emip kırıldığında yeşil parça patlaması
     */
    triggerShieldBreak(x, y) {
        this.sound.playShieldBreak(x);
        this.shakeTimer = 180;
        this.shakeIntensity = 8;
        this.flashAlpha = 0.25;

        for (let i = 0; i < 16; i++) {
            this.particles.push(new Particle(x, y, i % 2 ? THEME.PURPLE : THEME.LAVENDER, 0.9, 0.8));
        }
        this.grid.applyForce(x, y, 160, 130);
    }

    /**
     * Güçlendirme alındığında renkli ışıma
     */
    triggerPickupEffect(x, y, color) {
        for (let i = 0; i < 14; i++) {
            this.particles.push(new Particle(x, y, color, 0.7, 0.6));
        }
        this.grid.applyForce(x, y, 80, 80);
    }

    /**
     * EMP patlaması: Ekranı temizleyen şok dalgası ve mermi parçacıkları
     */
    triggerEMP(x, y, destroyedBullets) {
        this.sound.playEmp(x);
        this.shakeTimer = 250;
        this.shakeIntensity = 10;
        this.flashAlpha = 0.35;

        this.shockwaves.push({
            x,
            y,
            radius: 10,
            maxRadius: 450,
            color: THEME.PINK,
            alpha: 1.0
        });

        // Yok edilen her merminin yerinde minik patlama
        for (let i = 0; i < destroyedBullets.length; i++) {
            const b = destroyedBullets[i];
            for (let k = 0; k < 3; k++) {
                this.particles.push(new Particle(b.x, b.y, b.color, 0.5, 0.5));
            }
        }

        this.grid.applyForce(x, y, 280, 250);
    }

    /**
     * Boss geliyor uyarısı
     */
    triggerBossIncoming(title = 'Jöle Kral') {
        this.triggerBanner(t('banner.bossIncoming', { title: upper(title) }), THEME.PINK_DEEP);
        this.bannerTimer = 2200;
        this.shakeTimer = 600;
        this.shakeIntensity = 4;
        this.sound.playBossAlarm();
    }

    /**
     * Boss aşama değişimi: turuncu şok dalgası
     */
    triggerBossStage(x, y, stageName, title = 'Jöle Kral') {
        this.triggerBanner(t('banner.bossStage', { title: upper(title), stage: stageName }), THEME.PINK_DEEP);
        this.sound.playBossStage(x);
        this.shakeTimer = 220;
        this.shakeIntensity = 6;
        this.shockwaves.push({ x, y, radius: 10, maxRadius: 220, color: THEME.PINK, alpha: 1.0 });
        for (let i = 0; i < 16; i++) {
            this.particles.push(new Particle(x, y, i % 2 ? THEME.LAVENDER : THEME.PINK, 0.8, 0.7));
        }
        this.grid.applyForce(x, y, 200, 160);
    }

    /**
     * Boss yenildi: büyük patlama ve ekran temizliği
     */
    triggerBossDefeated(x, y, destroyedBullets, title = 'Jöle Kral') {
        this.triggerEMP(x, y, destroyedBullets);
        this.shockwaves[this.shockwaves.length - 1].color = THEME.PINK_DEEP;
        this.shockwaves.push({ x, y, radius: 4, maxRadius: 700, color: THEME.PURPLE, alpha: 1.0 });
        this.shakeTimer = 500;
        this.shakeIntensity = 14;
        this.flashAlpha = 0.6;
        const colors = THEME.SPRINKLES;
        for (let i = 0; i < 60; i++) {
            this.particles.push(new Particle(x, y, colors[i % colors.length], 1.3, 1.4));
        }
        this.triggerBanner(t('banner.bossDefeated', { title: upper(title) }), THEME.PURPLE);
        this.bannerTimer = 2200;
        this.sound.playBossDefeat(x);
    }

    /**
     * Dash ile boss'tan geçiş: jöle sıçraması
     */
    triggerBossRam(x, y) {
        this.sound.playBossRam(x);
        this.shakeTimer = 160;
        this.shakeIntensity = 5;
        for (let i = 0; i < 12; i++) {
            this.particles.push(new Particle(x, y, i % 3 ? THEME.PINK : THEME.WHITE, 0.9, 0.6));
        }
        this.grid.applyForce(x, y, 150, 120);
    }

    /**
     * Tüm efektleri günceller
     * @param {number} dt Delta time (saniye)
     * @param {number} elapsedMs Oyun süresi (BGM gerilimi için)
     */
    update(dt, elapsedMs = 0) {
        const dtMs = dt * 1000;

        // Reaktif benek fiziği
        this.grid.update(dt);

        // Pastel bulut süzülmesi (kenarlardan dolanır)
        const W = GAME_CONFIG.CANVAS.WIDTH;
        const H = GAME_CONFIG.CANVAS.HEIGHT;
        for (const b of this.blobs) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -b.r) b.x = W + b.r;
            if (b.x > W + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = H + b.r;
            if (b.y > H + b.r) b.y = -b.r;
        }

        // BGM Filtresi gerilim güncellemesi
        if (this.sound.bgmPlaying) {
            this.sound.updateBGMTension(elapsedMs);
        }

        // Screen shake sönümleme
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dtMs;
            const progress = this.shakeTimer / GAME_CONFIG.EFFECTS.SHAKE_DURATION;
            const currentMag = this.shakeIntensity * Math.max(0, progress);
            this.shakeX = (Math.random() * 2 - 1) * currentMag;
            this.shakeY = (Math.random() * 2 - 1) * currentMag;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        // Flash sönümleme
        if (this.flashAlpha > 0) {
            this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
        }

        // Banner sönümleme
        if (this.bannerTimer > 0) {
            this.bannerTimer = Math.max(0, this.bannerTimer - dtMs);
        }

        // Şok dalgası halkaları
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += dt * 650;
            sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
            if (sw.radius >= sw.maxRadius) {
                this.shockwaves.splice(i, 1);
            }
        }

        // Parçacık güncellemesi
        let activeCount = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.update(dt);
            if (p.life > 0) {
                this.particles[activeCount++] = p;
            }
        }
        this.particles.length = activeCount;
    }

    /**
     * Çizim başlamadan önce canvas'a sarsıntı ofsetini uygular
     */
    preRender(ctx) {
        ctx.save();
        if (this.motionEnabled && (this.shakeX !== 0 || this.shakeY !== 0)) {
            ctx.translate(this.shakeX, this.shakeY);
        }
    }

    /**
     * Reaktif ızgarayı çizer
     */
    renderGrid(ctx, { dots = true } = {}) {
        if (THEME.highContrast) {
            if (dots) this.grid.render(ctx);
            return;
        }
        for (const b of this.blobs) {
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            g.addColorStop(0, `rgba(${b.color}, ${THEME.BLOB_ALPHA})`);
            g.addColorStop(1, `rgba(${b.color}, 0)`);
            ctx.fillStyle = g;
            ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
        if (dots) this.grid.render(ctx);
    }

    /**
     * Çizim bittikten sonra parçacıkları, şok dalgalarını, flaşı ve banner'ı çizer
     */
    postRender(ctx) {
        // Şok dalgaları: kalın yumuşak halkalar
        for (let i = 0; i < this.shockwaves.length; i++) {
            const sw = this.shockwaves[i];
            ctx.save();
            ctx.globalAlpha = sw.alpha * 0.8;
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 6 * sw.alpha + 1;
            ctx.stroke();
            ctx.restore();
        }

        // Şeker serpintisi
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].render(ctx);
        }

        // Pembe flaş
        if (this.motionEnabled && this.flashAlpha > 0.01) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 196, 222, ${this.flashAlpha})`;
            ctx.fillRect(0, 0, GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
            ctx.restore();
        }

        // Bildirim: şeker etiketi
        if (this.bannerTimer > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.bannerTimer / 300);
            ctx.font = font(16, 700);
            const tw = ctx.measureText(this.bannerText).width;
            const cx = GAME_CONFIG.CANVAS.WIDTH / 2;
            const cy = 148; // Sayaç ve boss barının altında
            ctx.translate(cx, cy);
            candyPanel(ctx, -tw / 2 - 16, -15, tw + 32, 30, 15, THEME.SURFACE, { depth: 3, shadow: this.bannerColor });
            ctx.fillStyle = THEME.TEXT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.bannerText, 0, 1);
            ctx.restore();
        }

        ctx.restore(); // preRender'daki ctx.save'i kapatır
    }

    /**
     * Yeni tur başladığında efektleri temizler
     */
    reset() {
        this.shakeTimer = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.flashAlpha = 0;
        this.particles = [];
        this.shockwaves = [];
        this.bannerTimer = 0;
        this.grid.reset();
    }
}
