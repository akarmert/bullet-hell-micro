// ============================================================
// boss.js — "NEXUS" Boss Varlığı
// Oyuncu ateş etmez: boss'un enerjisi zamanla söner; Graze ve
// Dash ile gövdesinden geçmek (ram) enerjisini hızla düşürür.
// Üç saldırı aşaması: BLOOM → FANG → VORTEX
// ============================================================

import { GAME_CONFIG } from './config.js';

export const BOSS_STATE = {
    ENTERING: 'ENTERING',
    FIGHTING: 'FIGHTING',
    DYING: 'DYING',
    DEAD: 'DEAD'
};

export class Boss {
    /**
     * @param {WaveManager} waves Mermi/telegraf yardımcılarına erişim
     * @param {number} startMs Boss'un geldiği simülasyon zamanı
     */
    constructor(waves, startMs) {
        const cfg = GAME_CONFIG.BOSS;
        this.cfg = cfg;
        this.waves = waves;
        this.startMs = startMs;

        // Endless ölçeklemesi boss sırasında tırmanmasın: çarpanlar geliş anında sabitlenir
        this.speedMult = waves.mode.getSpeedMultiplier(startMs);
        this.intervalMult = waves.mode.getIntervalMultiplier(startMs);

        this.x = GAME_CONFIG.CANVAS.WIDTH / 2;
        this.y = -cfg.RADIUS * 2;
        this.radius = cfg.RADIUS;
        this.maxHp = cfg.MAX_HP;
        this.hp = cfg.MAX_HP;

        this.state = BOSS_STATE.ENTERING;
        this.stateTimer = 0;
        this.age = 0;            // Hareket ve animasyon zamanı (s)
        this.stage = 0;          // 0: BLOOM, 1: FANG, 2: VORTEX
        this.stageCooldown = 0;  // Aşama geçişinde kısa ateşkes (ms)
        this.hitFlash = 0;       // Hasar alınca beyaz parlama (0-1)
        this.ramLocked = false;  // Her dash yalnızca bir kez ram hasarı verir
        this.timers = { a: 0, b: 0 };
        this.angle = 0;          // Desen dönüş açısı

        // Olay geri bildirimleri (WaveManager → Game)
        this.onStageChange = null;
        this.onDefeated = null;
    }

    get alive() {
        return this.state === BOSS_STATE.ENTERING || this.state === BOSS_STATE.FIGHTING;
    }

    get hpRatio() {
        return Math.max(0, this.hp / this.maxHp);
    }

    get stageName() {
        return this.cfg.STAGES[this.stage].NAME;
    }

    /**
     * @param {number} dt Saniye (slow-mo uygulanmış)
     * @param {Player} player
     */
    update(dt, player) {
        const dtMs = dt * 1000;
        this.age += dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt * 5);

        if (this.state === BOSS_STATE.ENTERING) {
            this.stateTimer += dtMs;
            const t = Math.min(1, this.stateTimer / this.cfg.ENTRY_TIME);
            const eased = 1 - Math.pow(1 - t, 3);
            this.x = GAME_CONFIG.CANVAS.WIDTH / 2;
            this.y = -this.radius * 2 + (this.cfg.HOVER_Y + this.radius * 2) * eased;
            if (t >= 1) {
                this.state = BOSS_STATE.FIGHTING;
                this.stateTimer = 0;
                this.age = 0;
            }
            return;
        }

        if (this.state === BOSS_STATE.DYING) {
            this.stateTimer += dtMs;
            this.x += (Math.random() * 2 - 1) * 2;
            if (this.stateTimer >= this.cfg.DEATH_TIME) {
                this.state = BOSS_STATE.DEAD;
                if (this.onDefeated) this.onDefeated(this);
            }
            return;
        }

        if (this.state !== BOSS_STATE.FIGHTING) return;

        // Yavaş sekiz çizen süzülme hareketi
        const w = GAME_CONFIG.CANVAS.WIDTH;
        this.x = w / 2 + Math.sin(this.age * 0.7) * w * 0.22;
        this.y = this.cfg.HOVER_Y + Math.sin(this.age * 1.4) * 22;

        // Enerji zamanla söner
        this.damage(this.maxHp * dtMs / this.cfg.DURATION, false);
        if (this.state !== BOSS_STATE.FIGHTING) return;

        // Ram: dash ile gövdeden geçmek tek seferlik büyük hasar
        if (!player.isDashing) {
            this.ramLocked = false;
        } else if (!this.ramLocked && this.touches(player, this.cfg.RAM_REACH)) {
            this.ramLocked = true;
            this.damage(this.cfg.RAM_DAMAGE);
        }

        // Aşama geçişi
        const nextStage = this.hpRatio <= 0.33 ? 2 : this.hpRatio <= 0.66 ? 1 : 0;
        if (nextStage !== this.stage) {
            this.stage = nextStage;
            this.stageCooldown = this.cfg.STAGE_COOLDOWN;
            this.timers.a = 0;
            this.timers.b = 0;
            if (this.onStageChange) this.onStageChange(this);
        }

        if (this.stageCooldown > 0) {
            this.stageCooldown -= dtMs;
            return;
        }

        if (this.stage === 0) this.patternBloom(dt, dtMs);
        else if (this.stage === 1) this.patternFang(dtMs, player);
        else this.patternVortex(dt, dtMs);
    }

    /**
     * Enerjiyi düşürür; sıfırlanırsa ölüm animasyonunu başlatır
     * @param {number} amount
     * @param {boolean} flash Görsel hasar parlaması
     */
    damage(amount, flash = true) {
        if (this.state !== BOSS_STATE.FIGHTING) return;
        this.hp = Math.max(0, this.hp - amount);
        if (flash) this.hitFlash = 1;
        if (this.hp <= 0) {
            this.state = BOSS_STATE.DYING;
            this.stateTimer = 0;
        }
    }

    /** Oyuncu boss'un yakınından teğet geçti */
    onGraze() {
        this.damage(this.cfg.GRAZE_DAMAGE);
    }

    /**
     * Oyuncu gövdeye (veya ek menzile) temas ediyor mu?
     */
    touches(player, extra = 0) {
        if (!this.alive) return false;
        const r = this.radius + player.hitboxRadius + extra;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        return dx * dx + dy * dy < r * r;
    }

    /**
     * Gövde teması: dash dokunulmazdır, kalkan kırılır ve oyuncu geri itilir.
     * @returns {'none'|'shield'|'fatal'}
     */
    resolveBodyContact(player) {
        if (this.state !== BOSS_STATE.FIGHTING || player.isDashing || !this.touches(player)) return 'none';
        if (player.hasShield) {
            player.hasShield = false;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const len = Math.hypot(dx, dy) || 1;
            const push = this.radius + player.radius + 40;
            player.x = this.x + (dx / len) * push;
            player.y = this.y + (dy / len) * push;
            player.clampToArena();
            return 'shield';
        }
        return 'fatal';
    }

    // ------------------------------------------------------------
    // SALDIRI DESENLERİ
    // ------------------------------------------------------------

    spawn(params) {
        const c = this.cfg;
        this.waves.bulletManager.spawn({
            color: c.COLOR,
            glow: c.GLOW,
            radius: c.BULLET_RADIUS,
            type: 'boss',
            ...params
        });
    }

    /** Aşama 1 — BLOOM: Her atışta biraz dönen çiçek halkaları */
    patternBloom(dt, dtMs) {
        const s = this.cfg.STAGES[0];
        this.timers.a += dtMs;
        while (this.timers.a >= s.INTERVAL * this.intervalMult) {
            this.timers.a -= s.INTERVAL * this.intervalMult;
            this.angle += s.ROTATE_STEP;
            const speed = s.SPEED * this.speedMult;
            for (let i = 0; i < s.COUNT; i++) {
                const a = this.angle + (i * Math.PI * 2) / s.COUNT;
                this.spawn({
                    x: this.x + Math.cos(a) * this.radius,
                    y: this.y + Math.sin(a) * this.radius,
                    vx: Math.cos(a) * speed,
                    vy: Math.sin(a) * speed,
                    speed,
                    shape: 'ring'
                });
            }
        }
    }

    /** Aşama 2 — FANG: Telegraflı nişanlı yelpaze + yavaş destek halkası */
    patternFang(dtMs, player) {
        const s = this.cfg.STAGES[1];
        this.timers.a += dtMs;
        if (this.timers.a >= s.INTERVAL * this.intervalMult) {
            this.timers.a = 0;
            const ox = this.x;
            const oy = this.y;
            const aim = Math.atan2(player.y - oy, player.x - ox);
            const reach = Math.hypot(GAME_CONFIG.CANVAS.WIDTH, GAME_CONFIG.CANVAS.HEIGHT);
            const speed = s.SPEED * this.speedMult;
            this.waves.addTelegraph({
                x1: ox,
                y1: oy,
                x2: ox + Math.cos(aim) * reach,
                y2: oy + Math.sin(aim) * reach,
                color: this.cfg.COLOR,
                duration: s.TELEGRAPH_TIME,
                onFire: () => {
                    const half = (s.FAN_COUNT - 1) / 2;
                    for (let i = 0; i < s.FAN_COUNT; i++) {
                        const a = aim + (i - half) * s.FAN_SPREAD;
                        this.spawn({
                            x: ox, y: oy,
                            vx: Math.cos(a) * speed,
                            vy: Math.sin(a) * speed,
                            speed,
                            shape: 'diamond',
                            trailLength: 6
                        });
                    }
                }
            });
        }

        this.timers.b += dtMs;
        if (this.timers.b >= s.RING_INTERVAL * this.intervalMult) {
            this.timers.b = 0;
            this.angle += 0.3;
            const speed = s.RING_SPEED * this.speedMult;
            for (let i = 0; i < s.RING_COUNT; i++) {
                const a = this.angle + (i * Math.PI * 2) / s.RING_COUNT;
                this.spawn({
                    x: this.x, y: this.y,
                    vx: Math.cos(a) * speed,
                    vy: Math.sin(a) * speed,
                    speed,
                    shape: 'circle'
                });
            }
        }
    }

    /** Aşama 3 — VORTEX: Ters yönlerde dönen çift spiral */
    patternVortex(dt, dtMs) {
        const s = this.cfg.STAGES[2];
        this.angle += s.ROT_SPEED * dt;
        this.timers.a += dtMs;
        while (this.timers.a >= s.INTERVAL * this.intervalMult) {
            this.timers.a -= s.INTERVAL * this.intervalMult;
            const speed = s.SPEED * this.speedMult;
            for (let i = 0; i < s.ARMS; i++) {
                const step = (i * Math.PI * 2) / s.ARMS;
                for (const a of [this.angle + step, -this.angle * 0.8 + step + Math.PI / s.ARMS]) {
                    this.spawn({
                        x: this.x + Math.cos(a) * this.radius,
                        y: this.y + Math.sin(a) * this.radius,
                        vx: Math.cos(a) * speed,
                        vy: Math.sin(a) * speed,
                        speed,
                        shape: 'ring'
                    });
                }
            }
        }
    }

    // ------------------------------------------------------------
    // ÇİZİM
    // ------------------------------------------------------------

    render(ctx) {
        if (this.state === BOSS_STATE.DEAD) return;
        const c = this.cfg;
        const dying = this.state === BOSS_STATE.DYING;
        const dyingT = dying ? this.stateTimer / c.DEATH_TIME : 0;
        const r = this.radius * (1 + dyingT * 0.4);
        const t = performance.now() / 1000;

        ctx.save();
        ctx.translate(this.x, this.y);
        if (dying) ctx.globalAlpha = 1 - dyingT * 0.6;

        // Dış dönen altıgen kabuk
        ctx.save();
        ctx.rotate(t * 0.8);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
        }
        ctx.closePath();
        ctx.strokeStyle = c.COLOR;
        ctx.lineWidth = 2;
        ctx.shadowColor = c.COLOR;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();

        // İç ters dönen üçgen
        ctx.save();
        ctx.rotate(-t * 1.6);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI * 2) / 3;
            ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        }
        ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha *= 0.7;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Enerji çekirdeği: kalan enerjiyle küçülür, hasar alınca beyaz parlar
        const pulse = (Math.sin(t * 6) + 1) * 0.5;
        const coreR = r * (0.35 + this.hpRatio * 0.3) + pulse * 2;
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fillStyle = this.hitFlash > 0.05 ? '#ffffff' : c.COLOR;
        ctx.shadowColor = c.COLOR;
        ctx.shadowBlur = 24 + this.hitFlash * 20;
        ctx.fill();

        // Ram menzili ipucu (dash hazırken hafif halka)
        if (this.state === BOSS_STATE.FIGHTING) {
            ctx.beginPath();
            ctx.setLineDash([4, 6]);
            ctx.arc(0, 0, r + c.RAM_REACH, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.shadowBlur = 0;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    /**
     * Üst orta enerji barı
     * @param {number} topOffset Safe-area üst boşluğu
     */
    renderHealthBar(ctx, topOffset = 0) {
        if (this.state === BOSS_STATE.DEAD) return;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const barW = Math.min(280, w - 80);
        const barH = 6;
        const x = (w - barW) / 2;
        const y = topOffset + 112;
        const fill = this.state === BOSS_STATE.ENTERING
            ? Math.min(1, this.stateTimer / this.cfg.ENTRY_TIME)
            : this.hpRatio;

        ctx.save();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.cfg.COLOR;
        ctx.fillText(`NEXUS · ${this.stageName}`, x, y - 6);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9090a8';
        ctx.fillText('GRAZE + DASH = HASAR', x + barW, y - 6);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = this.hitFlash > 0.05 ? '#ffffff' : this.cfg.COLOR;
        ctx.shadowColor = this.cfg.COLOR;
        ctx.shadowBlur = 8;
        ctx.fillRect(x, y, barW * fill, barH);

        // Aşama eşikleri
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(8, 8, 17, 0.9)';
        for (const mark of [0.33, 0.66]) ctx.fillRect(x + barW * mark - 1, y, 2, barH);
        ctx.restore();
    }
}
