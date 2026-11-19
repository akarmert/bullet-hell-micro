// ============================================================
// waveManager.js — Dalga ve Mermi Üretim Yöneticisi
// Parametrik Mermi Deseni Motoru & Lazer Telegraf (Ön Uyarı) Sistemi
// ============================================================

import { GAME_CONFIG } from './config.js';
import { ModeRegistry } from './modes.js';
import { Boss, BOSS_STATE } from './boss.js';
import { random } from './rng.js';
import { THEME } from './theme.js';

export class WaveManager {
    constructor(bulletManager, mode = null) {
        this.bulletManager = bulletManager;
        this.mode = mode || ModeRegistry.get('classic');
        this.currentPhaseName = 'WARM UP';
        this.spiralAngle = 0;
        
        // Aktif telegraf (ön uyarı lazer) çizgileri
        this.telegraphs = [];

        // Spawn zamanlayıcıları (ms cinsinden birikim)
        this.touchAssist = false;              // Dokunmatik oynanış dengesi (game.startGame ayarlar)
        this.timers = {
            warmup: 0,
            spiral: 0,
            aim: 0,
            chaos: 0,
            saw: 0
        };

        this.onPhaseChange = null; // Faz geçişlerinde tetiklenecek callback

        // Boss durumu
        this.boss = null;
        this.bossActive = false;
        this.bossCount = 0;                    // Bu turda gelen boss sayısı
        this.bossKills = 0;
        this.bossesBeaten = [];                // Yenilen boss türleri ('jelly', 'cloud')
        this.bossDefeatedAt = null;            // Son boss'un yenildiği simülasyon zamanı (ms)
        this.nextBossAt = GAME_CONFIG.BOSS.START_TIME;
        this.chaosStartMs = GAME_CONFIG.BOSS.START_TIME;
        this.onBossStageChange = null;
        this.onBossDefeated = null;
        this.onBossRam = null;
    }

    /**
     * Bu mod boss içeriyor mu? (CHAOS modu tüm sistemleri baştan açtığı için boss'suz)
     */
    /**
     * Dar arenada (dikey telefon) aynı mermi sayısı çok daha sıkışık olur:
     * alan küçüldükçe kaos/boss atış aralıkları uzar (1 = değişiklik yok).
     */
    densityScale() {
        const A = GAME_CONFIG.ARENA_DENSITY;
        const area = GAME_CONFIG.CANVAS.WIDTH * GAME_CONFIG.CANVAS.HEIGHT;
        return Math.max(A.MIN_SCALE, Math.min(1, area / A.REFERENCE_AREA));
    }

    /** Dokunmatik oynanışta kaos/boss mermileri biraz yavaş */
    touchSpeedScale() {
        return this.touchAssist ? GAME_CONFIG.ARENA_DENSITY.TOUCH_SPEED : 1;
    }

    hasBoss() {
        return !(this.mode && this.mode.isSimultaneous());
    }

    /**
     * Boss fazında mıyız? (giriş, savaş veya ölüm animasyonu)
     */
    isBossPhase(elapsedMs) {
        if (!this.hasBoss()) return false;
        return this.bossActive || (elapsedMs >= this.nextBossAt && elapsedMs >= GAME_CONFIG.PHASE_3.END_TIME);
    }

    /** Sıradaki (veya sahnedeki) boss'un tanımı */
    nextBossDef() {
        if (this.bossActive && this.boss) return this.boss.cfg;
        const rotation = GAME_CONFIG.BOSS_ROTATION;
        return GAME_CONFIG[rotation[this.bossCount % rotation.length]];
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
        this.timers.saw = 0;
        this.boss = null;
        this.bossActive = false;
        this.bossCount = 0;
        this.bossKills = 0;
        this.bossesBeaten = [];
        this.bossDefeatedAt = null;
        this.nextBossAt = GAME_CONFIG.BOSS.START_TIME;
        this.chaosStartMs = GAME_CONFIG.BOSS.START_TIME;
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
        ctx.lineCap = 'round';
        for (let i = 0; i < this.telegraphs.length; i++) {
            const t = this.telegraphs[i];
            const progress = 1 - Math.max(0, t.remaining / t.duration);

            // Geniş yumuşak şerit: ateşlemeye yaklaştıkça koyulaşır
            ctx.beginPath();
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.strokeStyle = t.color;
            ctx.globalAlpha = 0.12 + progress * 0.2;
            ctx.lineWidth = 10;
            ctx.setLineDash([]);
            ctx.stroke();

            // Noktalı şeker çizgisi
            ctx.beginPath();
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.globalAlpha = 0.45 + progress * 0.55;
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([1, 9]);
            ctx.lineDashOffset = -progress * 40;
            ctx.stroke();

            // Başlangıçta küçülen halka
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(t.x1, t.y1, 4 + (1 - progress) * 10, 0, Math.PI * 2);
            ctx.strokeStyle = THEME.INK;
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
        } else if (this.isBossPhase(elapsedMs)) {
            // --- BOSS: NEXUS (30s - yenilene kadar) ---
            this.updateBoss(elapsedMs, dt, player);
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
        if (this.isBossPhase(elapsedMs)) return GAME_CONFIG.BOSS.NAME;
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

        const intervalMult = this.mode.getIntervalMultiplier(elapsedMs);
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
        const edge = Math.floor(random() * 4); // 0: üst, 1: sağ, 2: alt, 3: sol

        let x, y;
        const margin = 10;

        switch (edge) {
            case 0:
                x = random() * w;
                y = -margin;
                break;
            case 1:
                x = w + margin;
                y = random() * h;
                break;
            case 2:
                x = random() * w;
                y = h + margin;
                break;
            case 3:
                x = -margin;
                y = random() * h;
                break;
        }

        const targetX = w * 0.2 + random() * w * 0.6;
        const targetY = h * 0.2 + random() * h * 0.6;

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

        const intervalMult = this.mode.getIntervalMultiplier(elapsedMs);
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

        const intervalMult = this.mode.getIntervalMultiplier(elapsedMs);
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

        // Şeker testereler ilk kez burada görünür
        this.updateSaws(dtMs, GAME_CONFIG.SAW.AIM_EVERY * intervalMult, elapsedMs);
    }

    /**
     * Belirli aralıklarla şeker testere üretir
     */
    updateSaws(dtMs, everyMs, elapsedMs) {
        this.timers.saw += dtMs;
        while (this.timers.saw >= everyMs) {
            this.timers.saw -= everyMs;
            this.spawnSaw(elapsedMs);
        }
    }

    /**
     * Kenarın hemen içinden, arenanın ortasına doğru (oyuncuya değil) yavaş testere
     */
    spawnSaw(elapsedMs = 0) {
        const S = GAME_CONFIG.SAW;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const r = S.RADIUS;
        const pad = r + 2;
        const edge = Math.floor(random() * 4);
        let x;
        let y;
        switch (edge) {
            case 0: x = pad + 20 + random() * (w - 2 * pad - 40); y = pad; break;
            case 1: x = w - pad; y = pad + 20 + random() * (h - 2 * pad - 40); break;
            case 2: x = pad + 20 + random() * (w - 2 * pad - 40); y = h - pad; break;
            default: x = pad; y = pad + 20 + random() * (h - 2 * pad - 40); break;
        }
        const tx = w / 2 + (random() - 0.5) * w * 0.4;
        const ty = h / 2 + (random() - 0.5) * h * 0.4;
        const a = Math.atan2(ty - y, tx - x);
        const speed = S.SPEED * this.mode.getSpeedMultiplier(elapsedMs) * (0.9 + random() * 0.2);
        return this.bulletManager.spawn({
            x,
            y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            radius: r,
            speed,
            color: random() < 0.5 ? S.COLOR : S.ALT_COLOR,
            glow: S.GLOW,
            shape: 'saw',
            type: 'saw',
            maxBounces: S.BOUNCES,
            wobble: S.WOBBLE,
            wobbleFreq: S.WOBBLE_FREQ,
            spin: S.SPIN * (random() < 0.5 ? -1 : 1)
        });
    }

    /**
     * Nişanlı mermi için önceden telegraf (lazer çizgisi) çizer ve süre bitince ateşler
     */
    spawnAimedTelegraph(cfg, player, elapsedMs = 0) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const edge = Math.floor(random() * 4);
        let sx, sy;
        const margin = 12;

        switch (edge) {
            case 0: sx = random() * w; sy = -margin; break;
            case 1: sx = w + margin; sy = random() * h; break;
            case 2: sx = random() * w; sy = h + margin; break;
            case 3: sx = -margin; sy = random() * h; break;
        }

        const targetX = player.x;
        const targetY = player.y;

        const dx = targetX - sx;
        const dy = targetY - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Ekran sonuna uzanan telegraf çizgisi
        const rayLen = Math.hypot(w, h) + 24;
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
    // BOSS: NEXUS — Boss kendi desenlerini ateşler
    // ------------------------------------------------------------
    updateBoss(elapsedMs, dt, player) {
        if (!this.bossActive) {
            const rotation = GAME_CONFIG.BOSS_ROTATION;
            const def = GAME_CONFIG[rotation[this.bossCount % rotation.length]];
            const level = Math.floor(this.bossCount / rotation.length);
            this.boss = new Boss(this, elapsedMs, def, level);
            this.bossActive = true;
            this.bossCount++;
            this.boss.onStageChange = (boss) => {
                if (this.onBossStageChange) this.onBossStageChange(boss);
            };
            this.boss.onRam = (boss) => {
                if (this.onBossRam) this.onBossRam(boss);
            };
            this.boss.onDefeated = (boss) => {
                if (this.bossKills === 0) this.chaosStartMs = this.lastElapsedMs; // Kaos rampası ilk zaferde başlar
                this.bossActive = false;
                this.bossKills++;
                if (!this.bossesBeaten.includes(boss.kind)) this.bossesBeaten.push(boss.kind);
                this.bossDefeatedAt = this.lastElapsedMs;
                // Sıradaki boss: sabit saati varsa o saatte, ama en az BOSS_INTERVAL mola sonra
                const scheduled = (GAME_CONFIG.BOSS_SCHEDULE || [])[this.bossCount] ?? 0;
                this.nextBossAt = Math.max(this.lastElapsedMs + GAME_CONFIG.BOSS_INTERVAL, scheduled);
                this.telegraphs.length = 0; // Bekleyen boss atışları iptal
                this.timers.chaos = 0;
                this.timers.aim = 0;
                this.timers.spiral = 0;
                if (this.onBossDefeated) this.onBossDefeated(boss);
            };
        }
        this.lastElapsedMs = elapsedMs;
        this.boss.update(dt, player);
    }

    /**
     * Boss'u çizer (yenildiyse hiçbir şey çizmez)
     */
    renderBoss(ctx) {
        if (this.boss && this.boss.state !== BOSS_STATE.DEAD) this.boss.render(ctx);
    }

    // ------------------------------------------------------------
    // FAZ 4: CHAOS & ENDLESS — Duvarlardan seken telegraflı lazer kapsüller
    // ------------------------------------------------------------
    /**
     * İlk boss'tan sonraki, ikinci boss'a kadar süren kolaylaştırılmış mola mı?
     */
    isBreakRelief() {
        return this.hasBoss() && this.bossKills === 1 && !this.bossActive;
    }

    /** Kaos ayarı (mola / dokunmatik sekme sınırı); her karede yeni nesne üretmesin diye önbellekli */
    chaosConfig(relief) {
        const base = GAME_CONFIG.PHASE_4;
        let bounces = relief ? relief.BOUNCES : base.MAX_BOUNCES;
        if (this.touchAssist) bounces = Math.min(bounces, GAME_CONFIG.ARENA_DENSITY.TOUCH_BOUNCES);
        if (bounces === base.MAX_BOUNCES) return base;
        this.chaosCfgCache = this.chaosCfgCache || {};
        return (this.chaosCfgCache[bounces] = this.chaosCfgCache[bounces] || { ...base, MAX_BOUNCES: bounces });
    }

    updateChaos(elapsedMs, dt, dtMs, player) {
        const relief = this.isBreakRelief() ? GAME_CONFIG.BOSS_BREAK : null;
        // Zaferden hemen sonra kısa bir nefes payı: hiç mermi yok
        if (relief && this.bossDefeatedAt !== null && elapsedMs - this.bossDefeatedAt < relief.CALM_MS) return;

        const cfg = this.chaosConfig(relief);
        const chaosTime = elapsedMs - this.chaosStartMs;
        let progress = Math.min(1, chaosTime / 20000);
        if (relief) progress = Math.min(progress, relief.PROGRESS_CAP);

        // Dar ekranda atışlar seyrekleşir (mermi yoğunluğu alana göre)
        const modeInterval = this.mode.getIntervalMultiplier(elapsedMs) / this.densityScale();
        const intervalMult = modeInterval * (relief ? relief.INTERVAL_MULT : 1);
        const currentInterval = (cfg.BASE_INTERVAL - progress * (cfg.BASE_INTERVAL - cfg.MIN_INTERVAL)) * intervalMult;

        this.timers.chaos += dtMs;
        while (this.timers.chaos >= currentInterval) {
            this.timers.chaos -= currentInterval;
            this.spawnChaosBulletWithTelegraph(cfg, progress, elapsedMs, (relief ? relief.SPEED_MULT : 1) * this.touchSpeedScale());
        }

        // Periyodik nişanlı mermi desteği
        this.timers.aim += dtMs;
        if (this.timers.aim >= (relief ? relief.AIM_INTERVAL : 1000) * modeInterval) {
            this.timers.aim = 0;
            this.spawnAimedTelegraph(GAME_CONFIG.PHASE_3, player, elapsedMs);
        }

        // Şeker testereler (molada daha seyrek)
        this.updateSaws(dtMs, (relief ? GAME_CONFIG.SAW.BREAK_EVERY : GAME_CONFIG.SAW.CHAOS_EVERY) * modeInterval, elapsedMs);

        // ENDLESS Modu: Süre uzadıkça periyodik spiral dalgası da eklenir (molada yok)
        if (!relief && this.mode.id === 'endless' && chaosTime > 5000) {
            this.spiralAngle += (GAME_CONFIG.PHASE_2.BASE_ROT_SPEED * 1.2) * dt;
            this.timers.spiral += dtMs;
            if (this.timers.spiral >= 1400 * intervalMult) {
                this.timers.spiral = 0;
                this.spawnSpiralBurst(GAME_CONFIG.PHASE_2, elapsedMs);
            }
        }
    }

    spawnChaosBulletWithTelegraph(cfg, progress, elapsedMs = 0, speedScale = 1) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const edge = Math.floor(random() * 4);
        let x, y;
        let angle;

        switch (edge) {
            case 0:
                x = 50 + random() * (w - 100);
                y = 10;
                angle = Math.PI * 0.2 + random() * Math.PI * 0.6;
                break;
            case 1:
                x = w - 10;
                y = 50 + random() * (h - 100);
                angle = Math.PI * 0.7 + random() * Math.PI * 0.6;
                break;
            case 2:
                x = 50 + random() * (w - 100);
                y = h - 10;
                angle = -Math.PI * 0.2 - random() * Math.PI * 0.6;
                break;
            case 3:
                x = 10;
                y = 50 + random() * (h - 100);
                angle = -Math.PI * 0.3 + random() * Math.PI * 0.6;
                break;
        }

        const speedMult = this.mode.getSpeedMultiplier(elapsedMs);
        const speed = (cfg.SPEED + progress * (cfg.MAX_SPEED - cfg.SPEED)) * speedMult * speedScale;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        this.addTelegraph({
            x1: x,
            y1: y,
            x2: x + Math.cos(angle) * Math.hypot(w, h),
            y2: y + Math.sin(angle) * Math.hypot(w, h),
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
        const intervalMult = this.mode.getIntervalMultiplier(elapsedMs);

        // 0. Şeker testereler
        this.updateSaws(dtMs, GAME_CONFIG.SAW.ALL_EVERY * intervalMult, elapsedMs);

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
