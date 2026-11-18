// ============================================================
// boss.js — "NEXUS" Boss Varlığı
// Oyuncu ateş etmez: boss'un enerjisi zamanla söner; Graze ve
// Dash ile gövdesinden geçmek (ram) enerjisini hızla düşürür.
// Üç saldırı aşaması: BLOOM → FANG → VORTEX
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font } from './theme.js';

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
        const t = performance.now() / 1000;
        const r = this.radius * (1 + dyingT * 0.5);
        const angry = this.stage >= 1;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.lineJoin = 'round';
        if (dying) ctx.globalAlpha = 1 - dyingT * 0.7;

        // Ram menzili ipucu
        if (this.state === BOSS_STATE.FIGHTING) {
            ctx.beginPath();
            ctx.arc(0, 0, r + c.RAM_REACH, 0, Math.PI * 2);
            ctx.setLineDash([2, 7]);
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(142, 91, 232, 0.45)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Gölge
        ctx.beginPath();
        ctx.ellipse(0, r * 1.15, r * 1.05, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();

        // Titreşen jöle gövde
        ctx.beginPath();
        const N = 28;
        for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            const wob = 1 + Math.sin(a * 3 + t * 4) * 0.05 + Math.sin(a * 5 - t * 3) * 0.03 + this.hitFlash * 0.08;
            const x = Math.cos(a) * r * 1.1 * wob;
            const y = Math.sin(a) * r * wob * (a > 0 && a < Math.PI ? 1.0 : 0.95);
            ctx[i ? 'lineTo' : 'moveTo'](x, y);
        }
        ctx.closePath();
        ctx.fillStyle = this.hitFlash > 0.05 ? THEME.WHITE : (this.stage === 2 ? THEME.PINK_DEEP : THEME.PINK);
        ctx.fill();
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 3;
        ctx.stroke();

        // İç enerji jölesi: kalan enerjiyle küçülen mor çekirdek
        ctx.beginPath();
        ctx.arc(0, r * 0.25, r * (0.2 + this.hpRatio * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(142, 91, 232, 0.45)';
        ctx.fill();

        // Parlama
        ctx.beginPath();
        ctx.ellipse(-r * 0.45, -r * 0.5, r * 0.28, r * 0.14, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        // Yüz
        ctx.fillStyle = THEME.INK;
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const eyeY = -r * 0.1;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            if (dying) {
                // X gözler
                const ex = side * r * 0.38;
                ctx.moveTo(ex - 4, eyeY - 4); ctx.lineTo(ex + 4, eyeY + 4);
                ctx.moveTo(ex + 4, eyeY - 4); ctx.lineTo(ex - 4, eyeY + 4);
                ctx.stroke();
            } else {
                ctx.ellipse(side * r * 0.38, eyeY, 3.2, 4.5, 0, 0, Math.PI * 2);
                ctx.fill();
                if (angry) {
                    ctx.beginPath();
                    ctx.moveTo(side * r * 0.6, eyeY - 10);
                    ctx.lineTo(side * r * 0.2, eyeY - 6);
                    ctx.stroke();
                }
            }
        }
        // Ağız
        ctx.beginPath();
        if (dying) {
            ctx.arc(0, r * 0.35, 5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (angry) {
            ctx.moveTo(-r * 0.25, r * 0.38);
            ctx.quadraticCurveTo(0, r * 0.22, r * 0.25, r * 0.38);
            ctx.stroke();
        } else {
            ctx.moveTo(-r * 0.22, r * 0.25);
            ctx.quadraticCurveTo(0, r * 0.42, r * 0.22, r * 0.25);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Üst orta enerji barı (şeker çubuğu)
     * @param {number} topOffset Safe-area üst boşluğu
     */
    renderHealthBar(ctx, topOffset = 0) {
        if (this.state === BOSS_STATE.DEAD) return;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const barW = Math.min(280, w - 80);
        const barH = 10;
        const x = (w - barW) / 2;
        const y = topOffset + 110;
        const fill = this.state === BOSS_STATE.ENTERING
            ? Math.min(1, this.stateTimer / this.cfg.ENTRY_TIME)
            : this.hpRatio;

        ctx.save();
        ctx.font = font(11, 700);
        ctx.textAlign = 'left';
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fillText(`JÖLE KRAL · ${this.stageName}`, x, y - 6);
        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.MUTED;
        ctx.font = font(10, 600);
        ctx.fillText('graze + dash = hasar', x + barW, y - 6);

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barH / 2);
        ctx.fillStyle = THEME.WHITE;
        ctx.fill();
        if (fill > 0) {
            ctx.save();
            ctx.clip();
            ctx.fillStyle = this.hitFlash > 0.05 ? THEME.LAVENDER : THEME.PINK;
            ctx.fillRect(x, y, barW * fill, barH);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(x, y + 2, barW * fill, 2);
            ctx.restore();
        }
        ctx.fillStyle = THEME.INK_SOFT;
        for (const mark of [0.33, 0.66]) ctx.fillRect(x + barW * mark - 1, y + 2, 2, barH - 4);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barH / 2);
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}
