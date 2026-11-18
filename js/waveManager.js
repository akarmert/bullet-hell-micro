// ============================================================
// waveManager.js — Dalga ve Mermi Üretim Yöneticisi
// Parametrik Mermi Deseni Motoru & Lazer Telegraf (Ön Uyarı) Sistemi
// ============================================================

import { GAME_CONFIG } from './config.js';
import { ModeRegistry } from './modes.js';

export class WaveManager {
    constructor(bulletManager, mode = null) {
        this.bulletManager = bulletManager;
        this.mode = mode || ModeRegistry.get('classic');
        this.currentPhaseName = 'WARM UP';
        this.spiralAngle = 0;
        
        // Aktif telegraf (ön uyarı lazer) çizgileri
        this.telegraphs = [];

        // Spawn zamanlayıcıları (ms cinsinden birikim)
        this.timers = {
            warmup: 0,
            spiral: 0,
            aim: 0,
            chaos: 0
        };

        this.onPhaseChange = null; // Faz geçişlerinde tetiklenecek callback
    }

    /**
     * Aktif oyun modunu belirler
     * @param {BaseMode} mode 
     */
    setMode(mode) {
        this.mode = mode;
        this.reset();
    }

    /**
     * Mod aralık çarpanı × arena yoğunluk telafisi.
     * Yatay telefonda arena genişler; aynı mermi sıklığı daha seyrek hissettirir.
     * Alan oranının karekökü kadar sık mermi üretilerek zorluk kare arenaya yakın tutulur.
     */
    getIntervalMult(elapsedMs) {
        let mult = this.mode.getIntervalMultiplier(elapsedMs);
        if (GAME_CONFIG.LAYOUT.DENSITY_COMPENSATION) {
            const base = GAME_CONFIG.CANVAS.BASE_SIZE;
            const areaRatio = (base * base) / (GAME_CONFIG.CANVAS.WIDTH * GAME_CONFIG.CANVAS.HEIGHT);
            if (areaRatio < 1) mult *= Math.sqrt(areaRatio);
        }
        return mult;
    }

    /**
     * Tüm zamanlayıcıları, telegraf çizgilerini ve faz durumunu sıfırlar
     */
    reset() {
        this.currentPhaseName = this.mode && this.mode.isSimultaneous() ? 'CHAOS ALL' : 'WARM UP';
        this.spiralAngle = 0;
        this.telegraphs.length = 0;
        this.timers.warmup = 0;
        this.timers.spiral = 0;
        this.timers.aim = 0;
        this.timers.chaos = 0;
    }

    /**
     * Yeni bir telegraf (ön uyarı) çizgisi kaydeder
     */
    addTelegraph(telegraph) {
        this.telegraphs.push({
            ...telegraph,
            remaining: telegraph.duration
        });
    }

    /**
     * Telegraf çizgilerini günceller ve süresi dolanları ateşler
     */
    updateTelegraphs(dtMs) {
        let activeCount = 0;
        const len = this.telegraphs.length;

        for (let i = 0; i < len; i++) {
            const t = this.telegraphs[i];
            t.remaining -= dtMs;
            if (t.remaining <= 0) {
                if (typeof t.onFire === 'function') {
                    t.onFire();
                }
            } else {
                this.telegraphs[activeCount++] = t;
            }
        }
        this.telegraphs.length = activeCount;
    }

    /**
     * Telegraf çizgilerini canvas üzerine çizer (kesikli lazer uyarısı)
     * @param {CanvasRenderingContext2D} ctx 
     */
    renderTelegraphs(ctx) {
        if (this.telegraphs.length === 0) return;

        ctx.save();
        for (let i = 0; i < this.telegraphs.length; i++) {
            const t = this.telegraphs[i];
            const progress = 1 - Math.max(0, t.remaining / t.duration);
            const alpha = 0.2 + progress * 0.7; // Ateşlemeye yaklaştıkça parlar
            const pulse = (Math.sin(t.remaining * 0.03) + 1) * 0.5;

            // Dış kesikli uyarı lazeri
            ctx.beginPath();
            ctx.setLineDash([10, 6]);
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.strokeStyle = t.color;
            ctx.globalAlpha = alpha * 0.5;
            ctx.lineWidth = 3 + pulse * 2;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 10;
            ctx.stroke();

            // Keskin merkez uyarı ışını
            ctx.beginPath();
            ctx.setLineDash([14, 4]);
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Başlangıç noktasında enerji şarj halkası
            ctx.beginPath();
            ctx.setLineDash([]);
            ctx.arc(t.x1, t.y1, 4 + (1 - progress) * 8, 0, Math.PI * 2);
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Her frame'de geçen süreye göre mermi üretimini yönetir
     * @param {number} elapsedMs Oyun başlangıcından bu yana geçen milisaniye
     * @param {number} dt Saniye cinsinden delta time
     * @param {Player} player Oyuncu referansı (Aim fazı için)
     */
    update(elapsedMs, dt, player) {
        const dtMs = dt * 1000;

        // Bekleyen telegraf atışlarını güncelle
        this.updateTelegraphs(dtMs);

        // CHAOS modu: Tüm sistemler eşzamanlı aktif
        if (this.mode && this.mode.isSimultaneous()) {
            this.updateSimultaneousChaos(elapsedMs, dt, dtMs, player);
            return;
        }

        // Sıralı Faz Sistemi (Classic, Hardcore, Endless)
        const newPhase = this.getPhaseName(elapsedMs);

        if (newPhase !== this.currentPhaseName) {
            this.currentPhaseName = newPhase;
            if (this.onPhaseChange) {
                this.onPhaseChange(newPhase);
            }
        }

        if (elapsedMs < GAME_CONFIG.PHASE_1.END_TIME) {
            // --- FAZ 1: WARM UP (0 - 10s) ---
            this.updateWarmUp(elapsedMs, dtMs);
        } else if (elapsedMs < GAME_CONFIG.PHASE_2.END_TIME) {
            // --- FAZ 2: SPIRAL (10 - 20s) ---
            this.updateSpiral(elapsedMs, dt, dtMs);
        } else if (elapsedMs < GAME_CONFIG.PHASE_3.END_TIME) {
            // --- FAZ 3: AIM (20 - 30s) ---
            this.updateAim(elapsedMs, dtMs, player);
        } else {
            // --- FAZ 4: CHAOS (30s+) / ENDLESS ---
            this.updateChaos(elapsedMs, dt, dtMs, player);
        }
    }

    /**
     * Geçen süreye göre geçerli faz adını döner
     */
    getPhaseName(elapsedMs) {
        if (this.mode && this.mode.isSimultaneous()) return 'ALL SYSTEMS';
        if (elapsedMs < GAME_CONFIG.PHASE_1.END_TIME) return GAME_CONFIG.PHASE_1.NAME;
        if (elapsedMs < GAME_CONFIG.PHASE_2.END_TIME) return GAME_CONFIG.PHASE_2.NAME;
        if (elapsedMs < GAME_CONFIG.PHASE_3.END_TIME) return GAME_CONFIG.PHASE_3.NAME;
        return GAME_CONFIG.PHASE_4.NAME;
    }

    // ------------------------------------------------------------
    // PARAMETRİK DESEN ÜRETİCİLERİ (Pattern DSL / Helpers)
    // ------------------------------------------------------------

    /**
     * Dairesel halka deseni (Ring Burst)
     */
    spawnRing({
        x,
        y,
        count = 12,
        speed = 140,
        radius = 4,
        color = '#cc33ff',
        glow = 'rgba(204, 51, 255, 0.5)',
        shape = 'ring',
        offsetAngle = 0
    }) {
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            const angle = offsetAngle + i * step;
            this.bulletManager.spawn({
                x: x + Math.cos(angle) * 10,
                y: y + Math.sin(angle) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius,
                speed,
                color,
                glow,
                shape,
                type: 'ring'
            });
        }
    }

    // ------------------------------------------------------------
    // FAZ 1: WARM UP — Kenarlardan içeri doğrusal akan kırmızı mermiler
    // ------------------------------------------------------------
    updateWarmUp(elapsedMs, dtMs) {
        const cfg = GAME_CONFIG.PHASE_1;
        const progress = Math.min(1, elapsedMs / cfg.END_TIME);

        const intervalMult = this.getIntervalMult(elapsedMs);
        const currentInterval = (cfg.BASE_INTERVAL - progress * (cfg.BASE_INTERVAL - cfg.MIN_INTERVAL)) * intervalMult;

        this.timers.warmup += dtMs;
        while (this.timers.warmup >= currentInterval) {
            this.timers.warmup -= currentInterval;
            this.spawnBorderBullet(cfg, progress, elapsedMs);
        }
    }

    spawnBorderBullet(cfg, progress, elapsedMs = 0) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const edge = Math.floor(Math.random() * 4); // 0: üst, 1: sağ, 2: alt, 3: sol

        let x, y;
        const margin = 10;

        switch (edge) {
            case 0:
                x = Math.random() * w;
                y = -margin;
                break;
            case 1:
                x = w + margin;
                y = Math.random() * h;
                break;
            case 2:
                x = Math.random() * w;
                y = h + margin;
                break;
            case 3:
                x = -margin;
                y = Math.random() * h;
                break;
        }

        const targetX = w * 0.2 + Math.random() * w * 0.6;
        const targetY = h * 0.2 + Math.random() * h * 0.6;

        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.hypot(dx, dy) || 1;

        const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
        const speed = (cfg.SPEED_MIN + progress * (cfg.SPEED_MAX - cfg.SPEED_MIN)) * speedMult;
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;

        this.bulletManager.spawn({
            x,
            y,
            vx,
            vy,
            radius: cfg.RADIUS,
            speed,
            color: cfg.COLOR,
            glow: cfg.GLOW,
            shape: cfg.SHAPE || 'circle',
            type: 'warmup'
        });
    }

    // ------------------------------------------------------------
    // FAZ 2: SPIRAL — Merkezden dönen çok kollu halka mermi fıskiyesi
    // ------------------------------------------------------------
    updateSpiral(elapsedMs, dt, dtMs) {
        const cfg = GAME_CONFIG.PHASE_2;
        const phaseDuration = cfg.END_TIME - cfg.START_TIME;
        const progress = Math.min(1, (elapsedMs - cfg.START_TIME) / phaseDuration);

        // Açısal dönüş hızı
        const rotMult = this.mode.getSpiralRotMultiplier(elapsedMs);
        const rotSpeed = (cfg.BASE_ROT_SPEED + progress * 0.8) * rotMult;
        this.spiralAngle += rotSpeed * dt;

        const intervalMult = this.getIntervalMult(elapsedMs);
        const currentInterval = (cfg.BASE_INTERVAL - progress * (cfg.BASE_INTERVAL - cfg.MIN_INTERVAL)) * intervalMult;

        this.timers.spiral += dtMs;
        while (this.timers.spiral >= currentInterval) {
            this.timers.spiral -= currentInterval;

            const centerX = GAME_CONFIG.CANVAS.WIDTH / 2;
            const centerY = GAME_CONFIG.CANVAS.HEIGHT / 2;
            const arms = cfg.ARMS;
            const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
            const speed = cfg.SPEED * speedMult;

            for (let i = 0; i < arms; i++) {
                const angle = this.spiralAngle + (i * Math.PI * 2) / arms;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;

                this.bulletManager.spawn({
                    x: centerX + Math.cos(angle) * 15,
                    y: centerY + Math.sin(angle) * 15,
                    vx,
                    vy,
                    radius: cfg.RADIUS,
                    speed,
                    color: cfg.COLOR,
                    glow: cfg.GLOW,
                    shape: cfg.SHAPE || 'ring',
                    type: 'spiral'
                });
            }
        }
    }

    // ------------------------------------------------------------
    // FAZ 3: AIM — Telegraflı (ön uyarı lazerli) nişan alan elmas mermiler
    // ------------------------------------------------------------
    updateAim(elapsedMs, dtMs, player) {
        const cfg = GAME_CONFIG.PHASE_3;
        const phaseDuration = cfg.END_TIME - cfg.START_TIME;
        const progress = Math.min(1, (elapsedMs - cfg.START_TIME) / phaseDuration);

        const intervalMult = this.getIntervalMult(elapsedMs);
        const currentInterval = (cfg.BASE_INTERVAL - progress * (cfg.BASE_INTERVAL - cfg.MIN_INTERVAL)) * intervalMult;

        this.timers.aim += dtMs;
        while (this.timers.aim >= currentInterval) {
            this.timers.aim -= currentInterval;
            this.spawnAimedTelegraph(cfg, player, elapsedMs);
        }

        // Baskıyı korumak için hafif aralıklarla kenar mermisi desteği
        this.timers.warmup += dtMs;
        if (this.timers.warmup >= 800 * intervalMult) {
            this.timers.warmup = 0;
            this.spawnBorderBullet(GAME_CONFIG.PHASE_1, 0.6, elapsedMs);
        }
    }

    /**
     * Nişanlı mermi için önceden telegraf (lazer çizgisi) çizer ve süre bitince ateşler
     */
    spawnAimedTelegraph(cfg, player, elapsedMs = 0) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const edge = Math.floor(Math.random() * 4);
        let sx, sy;
        const margin = 12;

        switch (edge) {
            case 0: sx = Math.random() * w; sy = -margin; break;
            case 1: sx = w + margin; sy = Math.random() * h; break;
            case 2: sx = Math.random() * w; sy = h + margin; break;
            case 3: sx = -margin; sy = Math.random() * h; break;
        }

        const targetX = player.x;
        const targetY = player.y;

        const dx = targetX - sx;
        const dy = targetY - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Ekran sonuna uzanan telegraf çizgisi
        const rayLen = 950;
        const ex = sx + ux * rayLen;
        const ey = sy + uy * rayLen;

        const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
        const speed = cfg.SPEED * speedMult;
        const vx = ux * speed;
        const vy = uy * speed;

        this.addTelegraph({
            x1: sx,
            y1: sy,
            x2: ex,
            y2: ey,
            color: cfg.COLOR,
            duration: cfg.TELEGRAPH_TIME || 360,
            onFire: () => {
                this.bulletManager.spawn({
                    x: sx,
                    y: sy,
                    vx,
                    vy,
                    radius: cfg.RADIUS,
                    speed,
                    color: cfg.COLOR,
                    glow: cfg.GLOW,
                    shape: cfg.SHAPE || 'diamond',
                    type: 'aim',
                    trailLength: cfg.TRAIL_LENGTH
                });
            }
        });
    }

    // ------------------------------------------------------------
    // FAZ 4: CHAOS & ENDLESS — Duvarlardan seken telegraflı lazer kapsüller
    // ------------------------------------------------------------
    updateChaos(elapsedMs, dt, dtMs, player) {
        const cfg = GAME_CONFIG.PHASE_4;
        const chaosTime = elapsedMs - cfg.START_TIME;
        const progress = Math.min(1, chaosTime / 20000);

        const intervalMult = this.getIntervalMult(elapsedMs);
        const currentInterval = (cfg.BASE_INTERVAL - progress * (cfg.BASE_INTERVAL - cfg.MIN_INTERVAL)) * intervalMult;

        this.timers.chaos += dtMs;
        while (this.timers.chaos >= currentInterval) {
            this.timers.chaos -= currentInterval;
            this.spawnChaosBulletWithTelegraph(cfg, progress, elapsedMs);
        }

        // Periyodik nişanlı mermi desteği
        this.timers.aim += dtMs;
        if (this.timers.aim >= 1000 * intervalMult) {
            this.timers.aim = 0;
            this.spawnAimedTelegraph(GAME_CONFIG.PHASE_3, player, elapsedMs);
        }

        // ENDLESS Modu: Süre uzadıkça periyodik spiral dalgası da eklenir
        if (this.mode.id === 'endless' && elapsedMs > 35000) {
            this.spiralAngle += (GAME_CONFIG.PHASE_2.BASE_ROT_SPEED * 1.2) * dt;
            this.timers.spiral += dtMs;
            if (this.timers.spiral >= 1400 * intervalMult) {
                this.timers.spiral = 0;
                this.spawnSpiralBurst(GAME_CONFIG.PHASE_2, elapsedMs);
            }
        }
    }

    spawnChaosBulletWithTelegraph(cfg, progress, elapsedMs = 0) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const edge = Math.floor(Math.random() * 4);
        let x, y;
        let angle;

        switch (edge) {
            case 0:
                x = 50 + Math.random() * (w - 100);
                y = 10;
                angle = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
                break;
            case 1:
                x = w - 10;
                y = 50 + Math.random() * (h - 100);
                angle = Math.PI * 0.7 + Math.random() * Math.PI * 0.6;
                break;
            case 2:
                x = 50 + Math.random() * (w - 100);
                y = h - 10;
                angle = -Math.PI * 0.2 - Math.random() * Math.PI * 0.6;
                break;
            case 3:
                x = 10;
                y = 50 + Math.random() * (h - 100);
                angle = -Math.PI * 0.3 + Math.random() * Math.PI * 0.6;
                break;
        }

        const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
        const speed = (cfg.SPEED + progress * (cfg.MAX_SPEED - cfg.SPEED)) * speedMult;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        this.addTelegraph({
            x1: x,
            y1: y,
            x2: x + Math.cos(angle) * 700,
            y2: y + Math.sin(angle) * 700,
            color: cfg.COLOR,
            duration: cfg.TELEGRAPH_TIME || 300,
            onFire: () => {
                this.bulletManager.spawn({
                    x,
                    y,
                    vx,
                    vy,
                    radius: cfg.RADIUS,
                    speed,
                    color: cfg.COLOR,
                    glow: cfg.GLOW,
                    shape: cfg.SHAPE || 'capsule',
                    type: 'chaos',
                    maxBounces: cfg.MAX_BOUNCES,
                    trailLength: cfg.TRAIL_LENGTH
                });
            }
        });
    }

    spawnSpiralBurst(cfg, elapsedMs = 0) {
        const centerX = GAME_CONFIG.CANVAS.WIDTH / 2;
        const centerY = GAME_CONFIG.CANVAS.HEIGHT / 2;
        const arms = cfg.ARMS;
        const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
        const speed = cfg.SPEED * speedMult;

        for (let i = 0; i < arms; i++) {
            const angle = this.spiralAngle + (i * Math.PI * 2) / arms;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            this.bulletManager.spawn({
                x: centerX + Math.cos(angle) * 15,
                y: centerY + Math.sin(angle) * 15,
                vx,
                vy,
                radius: cfg.RADIUS,
                speed,
                color: cfg.COLOR,
                glow: cfg.GLOW,
                shape: cfg.SHAPE || 'ring',
                type: 'spiral'
            });
        }
    }

    // ------------------------------------------------------------
    // CHAOS MODU: Tüm mermi türleri eşzamanlı aktif (Kontrollü & Adil)
    // ------------------------------------------------------------
    updateSimultaneousChaos(elapsedMs, dt, dtMs, player) {
        const intervalMult = this.getIntervalMult(elapsedMs);

        // 1. Kenar mermileri (Her 500ms)
        this.timers.warmup += dtMs;
        if (this.timers.warmup >= 500 * intervalMult) {
            this.timers.warmup = 0;
            this.spawnBorderBullet(GAME_CONFIG.PHASE_1, 0.4, elapsedMs);
        }

        // 2. Spiral fıskiye (Açısal dönüşlü, her 700ms)
        this.spiralAngle += (GAME_CONFIG.PHASE_2.BASE_ROT_SPEED * 1.1) * dt;
        this.timers.spiral += dtMs;
        if (this.timers.spiral >= 700 * intervalMult) {
            this.timers.spiral = 0;
            this.spawnSpiralBurst(GAME_CONFIG.PHASE_2, elapsedMs);
        }

        // 3. Nişanlı sarı mermiler (Her 1100ms) - Telegraflı
        this.timers.aim += dtMs;
        if (this.timers.aim >= 1100 * intervalMult) {
            this.timers.aim = 0;
            this.spawnAimedTelegraph(GAME_CONFIG.PHASE_3, player, elapsedMs);
        }

        // 4. Seken lazer mermiler (Her 1300ms) - Telegraflı
        this.timers.chaos += dtMs;
        if (this.timers.chaos >= 1300 * intervalMult) {
            this.timers.chaos = 0;
            this.spawnChaosBulletWithTelegraph(GAME_CONFIG.PHASE_4, 0.3, elapsedMs);
        }
    }
}
