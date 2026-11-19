// ============================================================
// pickup.js — Geçici Saha Güçlendirmeleri (Pick-Up Sistemi)
// Shield, Slow-Mo ve EMP güçlendirmeleri ve yönetimi
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font } from './theme.js';
import { random } from './rng.js';
import { t } from './i18n.js';

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
            alpha = (Math.sin(this.lifetime * 0.02) + 1) * 0.35 + 0.3;
        }

        const bob = Math.sin(this.pulsePhase) * 2.5;
        const r = this.radius;
        const wiggle = Math.sin(this.pulsePhase * 0.8) * 0.25;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y + bob);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2;

        // Gölge
        ctx.beginPath();
        ctx.ellipse(0, r + 6 - bob, r * 0.9, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.SHADOW;
        ctx.fill();

        // Ambalaj kanatları (paketli şeker)
        ctx.save();
        ctx.rotate(wiggle);
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * r * 0.8, 0);
            ctx.lineTo(side * r * 1.75, -r * 0.65);
            ctx.lineTo(side * r * 1.75, r * 0.65);
            ctx.closePath();
            ctx.fillStyle = THEME.WHITE;
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        // Şeker gövdesi
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();

        // İkon
        ctx.fillStyle = THEME.WHITE;
        ctx.strokeStyle = THEME.WHITE;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        if (this.type === 'shield') {
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.55);
            ctx.lineTo(r * 0.45, -r * 0.35);
            ctx.lineTo(r * 0.35, r * 0.2);
            ctx.lineTo(0, r * 0.55);
            ctx.lineTo(-r * 0.35, r * 0.2);
            ctx.lineTo(-r * 0.45, -r * 0.35);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'slowmo') {
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -r * 0.35);
            ctx.moveTo(0, 0);
            ctx.lineTo(r * 0.25, r * 0.1);
            ctx.stroke();
        } else {
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 5;
                const rr = i % 2 ? r * 0.25 : r * 0.6;
                ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Etiket
        ctx.font = font(10, 700);
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = THEME.WHITE;
        const label = t(`pickup.${this.type}`, null, this.label);
        ctx.strokeText(label, 0, -r * 1.55);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(label, 0, -r * 1.55);

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
    /**
     * Belirli bir güçlendirmeyi belirli bir yere bırakır (ör. boss ödülü)
     * @param {string} typeId 'shield' | 'slowmo' | 'emp'
     */
    spawnAt(typeId, x, y) {
        const typeConfig = Object.values(GAME_CONFIG.PICKUPS.TYPES).find(tc => tc.id === typeId);
        if (!typeConfig) return null;
        const margin = 40;
        const pickup = new Pickup({
            x: Math.max(margin, Math.min(GAME_CONFIG.CANVAS.WIDTH - margin, x)),
            y: Math.max(160, Math.min(GAME_CONFIG.CANVAS.HEIGHT - margin, y)),
            typeConfig
        });
        this.pickups.push(pickup);
        return pickup;
    }

    spawnRandom() {
        const types = Object.values(GAME_CONFIG.PICKUPS.TYPES);
        const selectedType = types[Math.floor(random() * types.length)];

        const margin = 70;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        const x = margin + random() * (w - margin * 2);
        const top = 150; // HUD ve boss barının altında kalsın
        const y = top + random() * (h - top - margin);

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
            this.spawnTimer = GAME_CONFIG.PICKUPS.SPAWN_INTERVAL + (random() * 2000 - 1000);
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
        effects.sound.playPickup(pickup.x);
        if (pickup.type === 'slowmo') effects.sound.playSlowmo();
        effects.triggerPickupEffect(pickup.x, pickup.y, pickup.color);

        switch (pickup.type) {
            case 'shield':
                player.addShield();
                effects.triggerBanner(t('banner.shieldPicked', { pips: player.shieldPips() }), pickup.color);
                break;

            case 'slowmo':
                this.slowmoTimer = GAME_CONFIG.PICKUPS.TYPES.SLOWMO.duration;
                effects.triggerBanner(t('banner.slowmo'), pickup.color);
                break;

            case 'emp': {
                const destroyedBullets = bulletManager.destroyAll();
                effects.triggerEMP(player.x, player.y, destroyedBullets);
                effects.triggerBanner(t('banner.emp', { n: destroyedBullets.length }), pickup.color);
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
