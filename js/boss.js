// ============================================================
// boss.js — Boss Varlıkları (Jöle Kral, Pamuk Bulut, Sakız Balon)
// Oyuncu ateş etmez: boss'un enerjisi zamanla söner; Graze ve
// Dash ile gövdesinden geçmek (ram) enerjisini hızla düşürür.
// Her boss config'teki üç aşamayı (PATTERN) sırayla oynar.
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font } from './theme.js';
import { random } from './rng.js';
import { t, upper } from './i18n.js';

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
     * @param {object} def Boss tanımı (GAME_CONFIG.BOSS, GAME_CONFIG.BOSS_CLOUD …)
     * @param {number} level Rotasyon turu (0 = ilk karşılaşma); her tur zorlaştırır
     */
    constructor(waves, startMs, def = GAME_CONFIG.BOSS, level = 0) {
        const cfg = def;
        this.cfg = cfg;
        this.kind = cfg.KIND || 'jelly';
        this.level = level;
        this.waves = waves;
        this.startMs = startMs;

        // Endless ölçeklemesi boss sırasında tırmanmasın: çarpanlar geliş anında sabitlenir
        this.speedMult = waves.mode.getSpeedMultiplier(startMs) * (1 + level * (GAME_CONFIG.BOSS_LEVEL_SPEED || 0));
        this.intervalMult = waves.mode.getIntervalMultiplier(startMs) / (1 + level * (GAME_CONFIG.BOSS_LEVEL_DENSITY || 0));
        // Dar ekran / dokunmatik dengesi (bkz. GAME_CONFIG.ARENA_DENSITY)
        if (waves.densityScale) this.intervalMult /= waves.densityScale();
        if (waves.touchSpeedScale) this.speedMult *= waves.touchSpeedScale();
        this.wallDir = 0;
        this.rainGap = GAME_CONFIG.CANVAS.WIDTH / 2;
        this.pulling = false;
        this.bubbles = [];       // Sakız Balon: patlayacak balon mermileri {tag, bullet, popAt}
        this.bubbleSerial = 0;
        this.inflate = 0;        // Sakız Balon PATLAMA: 0 → 1 şişme
        this.burstPhase = 'rest';
        this.burstTimer = 0;

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
        this.onRam = null;
    }

    get alive() {
        return this.state === BOSS_STATE.ENTERING || this.state === BOSS_STATE.FIGHTING;
    }

    get hpRatio() {
        return Math.max(0, this.hp / this.maxHp);
    }

    get stageName() {
        return t(`boss.${this.kind}.stage${this.stage}`, null, this.cfg.STAGES[this.stage].NAME);
    }

    get title() {
        return t(`boss.${this.kind}.title`, null, this.cfg.TITLE || 'Boss');
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

        // Süzülme hareketi: jöle sekiz çizer, bulut geniş ve yavaş salınır
        const w = GAME_CONFIG.CANVAS.WIDTH;
        if (this.kind === 'cloud') {
            this.x = w / 2 + Math.sin(this.age * 0.45) * w * 0.28;
            this.y = this.cfg.HOVER_Y + Math.sin(this.age * 0.9) * 12;
        } else if (this.kind === 'gum') {
            // Balon gibi hafif sallanır; şişerken yerinde durur (patlama yönü okunsun)
            const sway = this.burstPhase === 'inflate' ? 0.15 : 1;
            this.x = w / 2 + Math.sin(this.age * 0.6) * w * 0.2 * sway;
            this.y = this.cfg.HOVER_Y + Math.sin(this.age * 1.8) * 10;
        } else {
            this.x = w / 2 + Math.sin(this.age * 0.7) * w * 0.22;
            this.y = this.cfg.HOVER_Y + Math.sin(this.age * 1.4) * 22;
        }
        this.pulling = false;

        // Enerji zamanla söner
        this.damage(this.maxHp * dtMs / this.cfg.DURATION, false);
        if (this.state !== BOSS_STATE.FIGHTING) return;

        // Ram: dash ile gövdeden geçmek tek seferlik büyük hasar
        if (!player.isDashing) {
            this.ramLocked = false;
        } else if (!this.ramLocked && this.touches(player, this.cfg.RAM_REACH)) {
            this.ramLocked = true;
            this.damage(this.cfg.RAM_DAMAGE);
            if (this.onRam) this.onRam(this);
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

        this.runPattern(this.cfg.STAGES[this.stage], dt, dtMs, player);
    }

    runPattern(stage, dt, dtMs, player) {
        switch (stage.PATTERN) {
            case 'bloom': return this.patternBloom(dt, dtMs);
            case 'fang': return this.patternFang(dtMs, player);
            case 'vortex': return this.patternVortex(dt, dtMs);
            case 'rain': return this.patternRain(stage, dtMs);
            case 'walls':
                if (stage.DRIZZLE) this.patternRain(stage.DRIZZLE, dtMs, 'b');
                return this.patternWalls(stage, dtMs);
            case 'pull': return this.patternPull(stage, dt, dtMs, player);
            case 'bubbles': return this.patternBubbles(stage, dtMs, player);
            case 'bounce': return this.patternBounce(stage, dtMs, player);
            case 'burst': return this.patternBurst(stage, dtMs, player);
            default: return undefined;
        }
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
        if (this.state !== BOSS_STATE.FIGHTING || player.isDashing || player.invulnTimer > 0 || !this.touches(player)) return 'none';
        if (player.hasShield) {
            player.breakAllShields(); // Boss'a çarpmak bütün kalkanları birden kırar
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

    /** Pamuk Bulut 1 — YAĞMUR: tüm ekrana yağan damlalar, aralarında kayan güvenli koridor */
    patternRain(s, dtMs, timer = 'a') {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        this.rainGap = w / 2 + Math.sin(this.age * 0.55) * w * 0.32;
        const interval = s.INTERVAL * this.intervalMult;
        this.timers[timer] += dtMs;
        while (this.timers[timer] >= interval) {
            this.timers[timer] -= interval;
            const x = 12 + random() * (w - 24);
            if (Math.abs(x - this.rainGap) < s.GAP / 2) continue;
            const speed = s.SPEED * this.speedMult * (0.9 + random() * 0.25);
            this.spawn({ x, y: -10, vx: Math.sin(this.age * 1.3) * 18, vy: speed, speed, shape: 'diamond', trailLength: 4 });
        }
    }

    /** Pamuk Bulut 2 — DUVAR: tek geçitli şeker çubuğu duvarları; geçit önceden lazerle gösterilir */
    patternWalls(s, dtMs) {
        const interval = s.INTERVAL * this.intervalMult;
        this.timers.a += dtMs;
        if (this.timers.a < interval) return;
        this.timers.a = 0;

        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const dir = this.wallDir++ % 3; // 0: yukarıdan, 1: soldan, 2: sağdan
        const speed = s.SPEED * this.speedMult;
        const half = s.GAP / 2;
        const vertical = dir === 0;
        const span = vertical ? w : h;
        const gap = 60 + random() * (span - 120);
        const color = this.cfg.COLOR;

        const fire = () => {
            for (let p = 10; p < span - 5; p += s.SPACING) {
                if (Math.abs(p - gap) < half) continue;
                if (vertical) this.spawn({ x: p, y: -12, vx: 0, vy: speed, speed, shape: 'capsule' });
                else if (dir === 1) this.spawn({ x: -12, y: p, vx: speed, vy: 0, speed, shape: 'capsule' });
                else this.spawn({ x: w + 12, y: p, vx: -speed, vy: 0, speed, shape: 'capsule' });
            }
        };

        // Geçidin orta çizgisini gösteren uyarı
        const line = vertical
            ? { x1: gap, y1: 0, x2: gap, y2: h }
            : dir === 1 ? { x1: 0, y1: gap, x2: w, y2: gap } : { x1: w, y1: gap, x2: 0, y2: gap };
        this.waves.addTelegraph({ ...line, color, duration: s.TELEGRAPH_TIME, onFire: fire });
    }

    /** Pamuk Bulut 3 — GİRDAP: oyuncuyu kendine çeker ve dönen donut halkaları atar (dash çekimi kırar) */
    patternPull(s, dt, dtMs, player) {
        if (player && player.alive && !player.isDashing) {
            const dx = this.x - player.x;
            const dy = this.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d > this.radius + 50) {
                player.x += (dx / d) * s.PULL * dt;
                player.y += (dy / d) * s.PULL * dt;
                player.clampToArena();
                this.pulling = true;
            }
        }
        this.angle += s.ROT_SPEED * dt;
        const interval = s.INTERVAL * this.intervalMult;
        this.timers.a += dtMs;
        while (this.timers.a >= interval) {
            this.timers.a -= interval;
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

    /** Sakız balonlarını zamanı gelince küçük halkaya patlatır (yok olmuşsa sessizce bırakır) */
    updateBubbles(s) {
        if (!this.bubbles.length) return;
        const now = this.age;
        const keep = [];
        for (const b of this.bubbles) {
            const alive = b.bullet.active && b.bullet.tag === b.tag;
            if (!alive) continue;
            if (now < b.popAt) { keep.push(b); continue; }
            const { x, y } = b.bullet;
            b.bullet.active = false;
            const speed = s.RING_SPEED * this.speedMult;
            const offset = random() * Math.PI;
            for (let i = 0; i < s.RING_COUNT; i++) {
                const a = offset + (i * Math.PI * 2) / s.RING_COUNT;
                this.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, shape: 'circle' });
            }
        }
        this.bubbles = keep;
    }

    /** Sakız Balon 1 — BALON: yavaş süzülen balonlar; titreyip şişer, sonra küçük halkaya patlar */
    patternBubbles(s, dtMs, player) {
        this.updateBubbles(s);
        const interval = s.INTERVAL * this.intervalMult;
        this.timers.a += dtMs;
        if (this.timers.a < interval) return;
        this.timers.a = 0;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const speed = s.SPEED * this.speedMult;
        for (let i = 0; i < s.COUNT; i++) {
            // Oyuncunun çevresine ama tam üstüne değil: sahanın farklı yerlerinde patlasın
            const tx = Math.max(30, Math.min(w - 30, (player ? player.x : w / 2) + (random() * 2 - 1) * w * 0.45));
            const ty = Math.max(this.y + 60, Math.min(h - 40, (player ? player.y : h / 2) + (random() * 2 - 1) * 120));
            const a = Math.atan2(ty - this.y, tx - this.x);
            const tag = `gum-${++this.bubbleSerial}`;
            const bullet = this.waves.bulletManager.spawn({
                x: this.x, y: this.y,
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed,
                radius: s.BUBBLE_RADIUS, color: '#FF8CBE', glow: this.cfg.GLOW,
                shape: 'bubble', type: 'boss', tag
            });
            this.bubbles.push({ tag, bullet, popAt: this.age + (s.POP_MS / 1000) * (0.85 + random() * 0.3) });
        }
    }

    /** Sakız Balon 2 — SEKME: duvarlardan seken sakız topları + seyrek yavaş halka */
    patternBounce(s, dtMs, player) {
        this.updateBubbles(this.cfg.STAGES[0]); // Önceki aşamadan kalan balonlar yine patlar
        const interval = s.INTERVAL * this.intervalMult;
        this.timers.a += dtMs;
        if (this.timers.a >= interval) {
            this.timers.a = 0;
            const speed = s.SPEED * this.speedMult;
            const aim = player ? Math.atan2(player.y - this.y, player.x - this.x) : Math.PI / 2;
            for (let i = 0; i < s.COUNT; i++) {
                // Doğrudan oyuncuya değil, iki yana açılarak: seker ve geri döner
                const a = aim + (i % 2 ? 1 : -1) * (0.55 + random() * 0.35);
                this.spawn({
                    x: this.x, y: this.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed,
                    radius: s.BALL_RADIUS, shape: 'circle', maxBounces: s.BOUNCES, trailLength: 5
                });
            }
        }
        this.timers.b += dtMs;
        if (this.timers.b >= s.RING_INTERVAL * this.intervalMult) {
            this.timers.b = 0;
            this.angle += 0.35;
            const speed = s.RING_SPEED * this.speedMult;
            for (let i = 0; i < s.RING_COUNT; i++) {
                const a = this.angle + (i * Math.PI * 2) / s.RING_COUNT;
                this.spawn({ x: this.x, y: this.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, shape: 'ring' });
            }
        }
    }

    /**
     * Sakız Balon 3 — PATLAMA: boss şişer (uyarı), sonra büyük bir halkaya patlar.
     * Halkada oyuncunun o anki yönünde GENİŞ bir boşluk vardır: yerinde kal ya da boşluğa gir.
     */
    patternBurst(s, dtMs, player) {
        this.updateBubbles(this.cfg.STAGES[0]);
        this.burstTimer += dtMs;
        if (this.burstPhase === 'rest') {
            this.inflate = Math.max(0, this.inflate - dtMs / 200);
            if (this.burstTimer >= s.REST_MS * this.intervalMult) {
                this.burstPhase = 'inflate';
                this.burstTimer = 0;
            }
            return;
        }
        this.inflate = Math.min(1, this.burstTimer / s.INFLATE_MS);
        if (this.burstTimer < s.INFLATE_MS) return;
        this.burstPhase = 'rest';
        this.burstTimer = 0;
        const speed = s.SPEED * this.speedMult;
        const aim = player ? Math.atan2(player.y - this.y, player.x - this.x) : Math.PI / 2;
        for (let i = 0; i < s.COUNT; i++) {
            const a = aim + (i * Math.PI * 2) / s.COUNT;
            let diff = Math.abs(a - aim) % (Math.PI * 2);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff < s.GAP / 2) continue; // Oyuncu tarafında güvenli boşluk
            this.spawn({
                x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius,
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, shape: 'circle'
            });
        }
    }

    // ------------------------------------------------------------
    // ÇİZİM
    // ------------------------------------------------------------

    render(ctx) {
        if (this.state === BOSS_STATE.DEAD) return;
        if (this.kind === 'gum') {
            this.renderGum(ctx);
            return;
        }
        if (this.kind === 'cloud') {
            this.renderCloud(ctx);
            return;
        }
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
     * Pamuk Bulut: birleşik konturlu kabarık bulut, uykulu/kızgın yüz, girdap halkaları
     */
    /** Sakız Balon: parlak pembe balon, düğümlü ip, sakız damlaları; PATLAMA'da şişip titrer */
    renderGum(ctx) {
        const t = this.age;
        const dying = this.state === BOSS_STATE.DYING;
        const inflate = this.stage === 2 ? this.inflate : 0;
        const shake = inflate > 0.6 ? (Math.random() * 2 - 1) * inflate * 2.5 : 0;
        const r = this.radius * (1 + inflate * 0.35) * (dying ? 1 + this.stateTimer / this.cfg.DEATH_TIME * 0.6 : 1);
        ctx.save();
        ctx.translate(this.x + shake, this.y);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (dying) ctx.globalAlpha = Math.max(0, 1 - this.stateTimer / this.cfg.DEATH_TIME);

        // Gölge
        ctx.beginPath();
        ctx.ellipse(0, r + 22, r * 0.75, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();

        // İp
        ctx.beginPath();
        ctx.moveTo(0, r + 4);
        ctx.quadraticCurveTo(Math.sin(t * 3) * 8, r + 14, Math.sin(t * 3 + 1) * 4, r + 24);
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Şişme uyarısı: düz pembe hale (kesik çizgi yok)
        if (inflate > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, r + 8 + inflate * 6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(240, 70, 143, ${0.25 + inflate * 0.5})`;
            ctx.lineWidth = 3 + inflate * 2;
            ctx.stroke();
        }

        // Gövde
        const fill = this.hitFlash > 0.05 ? THEME.PINK_SOFT : '#FF8CBE';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (1 + Math.sin(t * 2.4) * 0.03), r * (1 - Math.sin(t * 2.4) * 0.03), 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Düğüm
        ctx.beginPath();
        ctx.moveTo(-5, r - 1);
        ctx.lineTo(5, r - 1);
        ctx.lineTo(0, r + 6);
        ctx.closePath();
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();

        // Parlamalar
        ctx.beginPath();
        ctx.ellipse(-r * 0.42, -r * 0.45, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-r * 0.12, -r * 0.62, r * 0.06, 0, Math.PI * 2);
        ctx.fill();

        // Yüz: şişerken yanakları kızarır, gözleri sıkılır
        ctx.fillStyle = THEME.INK;
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2.5;
        for (const s of [-1, 1]) {
            if (inflate > 0.4) {
                ctx.beginPath();
                ctx.moveTo(s * r * 0.42, -r * 0.18);
                ctx.lineTo(s * r * 0.22, -r * 0.08);
                ctx.lineTo(s * r * 0.42, r * 0.02);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.ellipse(s * r * 0.3, -r * 0.1, r * 0.08, r * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        if (inflate > 0.4) {
            ctx.beginPath();
            ctx.ellipse(0, r * 0.28, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(0, r * 0.18, r * 0.14, 0.15, Math.PI - 0.15);
            ctx.stroke();
        }
        ctx.fillStyle = `rgba(240, 70, 143, ${0.45 + inflate * 0.4})`;
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(s * r * 0.55, r * 0.15, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    renderCloud(ctx) {
        const c = this.cfg;
        const dying = this.state === BOSS_STATE.DYING;
        const dyingT = dying ? this.stateTimer / c.DEATH_TIME : 0;
        const t = performance.now() / 1000;
        const r = this.radius * (1 + dyingT * 0.5);
        const puffs = [[-0.95, 0.2, 0.62], [-0.4, -0.3, 0.78], [0.35, -0.35, 0.74], [0.95, 0.15, 0.6], [0, 0.3, 0.8]];

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.lineJoin = 'round';
        if (dying) ctx.globalAlpha = 1 - dyingT * 0.7;

        // Girdap: çekimi anlatan, kesiksiz dönen yumuşak yaylar
        if (this.stage === 2 && this.state === BOSS_STATE.FIGHTING) {
            ctx.save();
            ctx.rotate(-t * 2);
            ctx.lineCap = 'round';
            ctx.strokeStyle = this.pulling ? 'rgba(142, 91, 232, 0.5)' : 'rgba(142, 91, 232, 0.22)';
            ctx.lineWidth = 3;
            for (const [k, offset] of [[1.9, 0], [2.6, Math.PI / 2]]) {
                for (const side of [0, Math.PI]) {
                    ctx.beginPath();
                    ctx.arc(0, 0, r * k, offset + side, offset + side + Math.PI * 0.55);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        // Gölge
        ctx.beginPath();
        ctx.ellipse(0, r * 1.25, r * 1.3, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();

        // Yağmur aşamasında altından düşen minik damlalar
        if (this.stage === 0 && this.state === BOSS_STATE.FIGHTING) {
            ctx.fillStyle = c.COLOR;
            for (let i = 0; i < 4; i++) {
                const k = ((t * 1.6 + i * 0.25) % 1);
                ctx.globalAlpha = 1 - k;
                ctx.beginPath();
                ctx.ellipse((i - 1.5) * r * 0.45, r * (0.8 + k * 0.9), 2, 3.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = dying ? 1 - dyingT * 0.7 : 1;
        }

        // Birleşik kontur: önce kalın kontur, sonra dolgu
        const wob = (i) => 1 + Math.sin(t * 3 + i) * 0.04 + this.hitFlash * 0.08;
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 6;
        puffs.forEach(([px, py, pr], i) => {
            ctx.beginPath();
            ctx.arc(px * r, py * r, pr * r * wob(i), 0, Math.PI * 2);
            ctx.stroke();
        });
        const fill = this.hitFlash > 0.05 ? THEME.PINK_SOFT : this.stage === 2 ? '#E3D6FF' : THEME.WHITE;
        ctx.fillStyle = fill;
        puffs.forEach(([px, py, pr], i) => {
            ctx.beginPath();
            ctx.arc(px * r, py * r, pr * r * wob(i), 0, Math.PI * 2);
            ctx.fill();
        });

        // Enerji: alttaki lavanta gölge küçülür
        ctx.beginPath();
        ctx.ellipse(0, r * 0.55, r * (0.4 + this.hpRatio * 0.5), r * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(183, 155, 255, 0.45)';
        ctx.fill();

        // Yüz
        ctx.fillStyle = THEME.INK;
        ctx.strokeStyle = THEME.INK;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.5;
        const eyeY = -r * 0.05;
        for (const side of [-1, 1]) {
            const ex = side * r * 0.36;
            ctx.beginPath();
            if (dying) {
                ctx.moveTo(ex - 4, eyeY - 4); ctx.lineTo(ex + 4, eyeY + 4);
                ctx.moveTo(ex + 4, eyeY - 4); ctx.lineTo(ex - 4, eyeY + 4);
                ctx.stroke();
            } else if (this.stage === 0) {
                // Uykulu yarım gözler
                ctx.arc(ex, eyeY, 4, 0, Math.PI);
                ctx.stroke();
            } else {
                ctx.ellipse(ex, eyeY, 3.2, 4.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(side * r * 0.58, eyeY - 10);
                ctx.lineTo(side * r * 0.18, eyeY - 6);
                ctx.stroke();
            }
        }
        ctx.fillStyle = 'rgba(255, 111, 174, 0.5)';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * r * 0.62, r * 0.2, 5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        if (this.stage === 2 && !dying) {
            ctx.arc(0, r * 0.3, 5, 0, Math.PI * 2); // "üüü" girdap ağzı
            ctx.stroke();
        } else {
            ctx.moveTo(-r * 0.18, r * 0.3);
            ctx.quadraticCurveTo(0, this.stage === 0 ? r * 0.42 : r * 0.2, r * 0.18, r * 0.3);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Üst orta enerji barı (şeker çubuğu)
     * @param {number} topOffset Safe-area üst boşluğu
     */
    /** Bar geometry (arena coordinates) */
    healthBarRect(topOffset = 0) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const barW = Math.min(280, w - 80);
        return { x: (w - barW) / 2, y: topOffset + 110, w: barW, h: 10 };
    }

    /** Fill ratio shown by the bar (entry animation, then remaining energy) */
    get healthBarFill() {
        return this.state === BOSS_STATE.ENTERING ? Math.min(1, this.stateTimer / this.cfg.ENTRY_TIME) : this.hpRatio;
    }

    /**
     * Boss energy bar. part: 'all' | 'base' (labels + empty bar) | 'overlay' (stage marks + outline);
     * the renderer draws the fill itself between 'base' and 'overlay'.
     */
    renderHealthBar(ctx, topOffset = 0, part = 'all') {
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
        if (part !== 'overlay') {
            ctx.font = font(11, 700);
            ctx.textAlign = 'left';
            ctx.fillStyle = THEME.TEXT_ACCENT;
            ctx.fillText(`${upper(this.title)} · ${this.stageName}`, x, y - 6);
            ctx.textAlign = 'right';
            ctx.fillStyle = THEME.MUTED;
            ctx.font = font(10, 600);
            ctx.fillText(t('boss.barHint'), x + barW, y - 6);

            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, barH / 2);
            ctx.fillStyle = THEME.SURFACE;
            ctx.fill();
        }
        if (part === 'base') {
            ctx.restore();
            return;
        }
        if (part === 'all' && fill > 0) {
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
