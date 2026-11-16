// ============================================================
// pickup.js — Geçici Saha Güçlendirmeleri (Pick-Up Sistemi)
// Shield, Slow-Mo ve EMP güçlendirmeleri ve yönetimi
// ============================================================

import { GAME_CONFIG } from './config.js';

export class Pickup {
    constructor({ x, y, typeConfig }) {
        this.x = x;
        this.y = y;
        this.type = typeConfig.id; // 'shield', 'slowmo', 'emp'
        this.label = typeConfig.label;
        this.color = typeConfig.color;
        this.glow = typeConfig.glow;
        this.radius = GAME_CONFIG.PICKUPS.RADIUS;
        this.maxLifetime = GAME_CONFIG.PICKUPS.LIFETIME;
        this.lifetime = this.maxLifetime;
        this.active = true;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(dt) {
        if (!this.active) return;
        this.lifetime -= dt * 1000;
        if (this.lifetime <= 0) {
            this.active = false;
        }
        this.pulsePhase += dt * 4;
    }

    render(ctx) {
        if (!this.active) return;

        // Son 1.5 saniyede yanıp sönerek kaybolma uyarısı
        let alpha = 1.0;
        if (this.lifetime < 1500) {
            alpha = (Math.sin(this.lifetime * 0.02) + 1) * 0.4 + 0.2;
        }

        const pulseScale = 1.0 + Math.sin(this.pulsePhase) * 0.18;
        const r = this.radius * pulseScale;

        ctx.save();
        ctx.globalAlpha = alpha;

        // 1. Dış parıldayan neon halo
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = this.glow;
        ctx.fill();

        // 2. Dış dönen geometrik halka
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.pulsePhase * 0.5);
        ctx.beginPath();
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 1.8;
        
        // Kare/Baklava çerçeve
        ctx.strokeRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        // 3. İç parlak çekirdek küre
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // 4. Merkez beyaz parlak nokta
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // 5. Küçük etiket metni
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fillText(this.label, this.x, this.y - r * 1.5);

        ctx.restore();
    }
}

export class PickupManager {
    constructor() {
        this.pickups = [];
        this.spawnTimer = 4000; // İlk güçlendirme 4. saniyede gelir
        this.slowmoTimer = 0;   // Slow-mo kalan milisaniye
        this.onPickupCollect = null;
    }

    reset() {
        this.pickups.length = 0;
        this.spawnTimer = 4000;
        this.slowmoTimer = 0;
    }

    /**
     * Rastgele güçlendirme tipi seçer ve arenaya yerleştirir
     */
    spawnRandom() {
        const types = Object.values(GAME_CONFIG.PICKUPS.TYPES);
        const selectedType = types[Math.floor(Math.random() * types.length)];

        const margin = 70;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const x = margin + Math.random() * (w - margin * 2);
        const y = margin + Math.random() * (h - margin * 2);

        this.pickups.push(new Pickup({
            x,
            y,
            typeConfig: selectedType
        }));
    }

    /**
     * Güncelleme: Spawn zamanlaması, pickup ömrü ve Slow-mo süresi
     * @param {number} dt Saniye cinsinden
     * @param {Player} player
     * @param {EffectsManager} effects
     * @param {BulletManager} bulletManager
     */
    update(dt, player, effects, bulletManager) {
        const dtMs = dt * 1000;

        // Slow-mo süresi yönetimi
        if (this.slowmoTimer > 0) {
            this.slowmoTimer -= dtMs;
            if (this.slowmoTimer < 0) this.slowmoTimer = 0;
        }

        // Spawn zamanlayıcısı
        this.spawnTimer -= dtMs;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = GAME_CONFIG.PICKUPS.SPAWN_INTERVAL + (Math.random() * 2000 - 1000);
            // Sahada en fazla 2 güçlendirme olabilir
            if (this.pickups.length < 2) {
                this.spawnRandom();
            }
        }

        // Aktif güçlendirmeleri güncelle & toplama kontrolü
        let activeCount = 0;
        const len = this.pickups.length;

        for (let i = 0; i < len; i++) {
            const p = this.pickups[i];
            p.update(dt);

            if (p.active) {
                // Oyuncu ile toplama kontrolü
                const dx = player.x - p.x;
                const dy = player.y - p.y;
                const collectDist = player.radius + p.radius + 6;

                if (player.alive && (dx * dx + dy * dy) <= (collectDist * collectDist)) {
                    // Toplandı!
                    p.active = false;
                    this.applyPickup(p, player, effects, bulletManager);
                } else {
                    this.pickups[activeCount++] = p;
                }
            }
        }
        this.pickups.length = activeCount;
    }

    /**
     * Güçlendirme etkisini oyuncuya / sahaya uygular
     */
    applyPickup(pickup, player, effects, bulletManager) {
        effects.sound.playPickup();
        effects.triggerPickupEffect(pickup.x, pickup.y, pickup.color);

        switch (pickup.type) {
            case 'shield':
                player.hasShield = true;
                effects.triggerBanner('KALKAN ALINDI (+1 CAN)', pickup.color);
                break;

            case 'slowmo':
                this.slowmoTimer = GAME_CONFIG.PICKUPS.TYPES.SLOWMO.duration;
                effects.triggerBanner('SLOW-MO AKTİF!', pickup.color);
                break;

            case 'emp': {
                const destroyedBullets = bulletManager.destroyAll();
                effects.triggerEMP(player.x, player.y, destroyedBullets);
                effects.triggerBanner(`EMP PATLAMASI! (${destroyedBullets.length} MERMİ)`, pickup.color);
                break;
            }
        }

        if (this.onPickupCollect) {
            this.onPickupCollect(pickup);
        }
    }

    /**
     * Slow-mo aktiflik kontrolü ve hız faktörü
     */
    isSlowmoActive() {
        return this.slowmoTimer > 0;
    }

    getSpeedFactor() {
        if (this.slowmoTimer > 0) {
            return GAME_CONFIG.PICKUPS.TYPES.SLOWMO.factor;
        }
        return 1.0;
    }

    render(ctx) {
        for (let i = 0; i < this.pickups.length; i++) {
            this.pickups[i].render(ctx);
        }
    }
}
