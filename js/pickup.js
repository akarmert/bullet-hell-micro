// ============================================================
// pickup.js — Geçici Saha Güçlendirmeleri (Pick-Up Sistemi)
// Shield, Slow-Mo ve EMP güçlendirmeleri ve yönetimi
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME, font } from './theme.js';
import { random } from './rng.js';
import { t } from './i18n.js';

export class Pickup {
    constructor({ x, y, typeConfig, bad = false }) {
        this.x = x;
        this.y = y;
        this.type = typeConfig.id; // 'shield', 'slowmo', 'emp'
        this.label = typeConfig.label;
        this.color = typeConfig.color;
        this.glow = typeConfig.glow;
        this.radius = GAME_CONFIG.PICKUPS.RADIUS;
        this.bad = bad; // Ekşi şeker: oyuncunun zararına
        this.maxLifetime = bad ? GAME_CONFIG.DEBUFFS.LIFETIME : GAME_CONFIG.PICKUPS.LIFETIME;
        this.lifetime = this.maxLifetime;
        this.active = true;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    /** Ekşi şeker oyuncuya doğru yavaşça süzülür (kaçmak gerekir) */
    drift(player, dt) {
        if (!this.bad || !player || !player.alive) return;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = GAME_CONFIG.DEBUFFS.DRIFT;
        this.x += (dx / d) * v * dt;
        this.y += (dy / d) * v * dt;
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

        if (this.bad) {
            this.renderSour(ctx, r, wiggle);
            ctx.restore();
            return;
        }

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

        this.renderLabel(ctx, r);
        ctx.restore();
    }

    /**
     * Ekşi şeker: koyu erik gövde, dikenli ambalaj, somurtkan yüz, etrafında uyarı halkası.
     * İyi şekerlerden ilk bakışta ayrılsın diye renk, şekil ve yüz farklı.
     */
    renderSour(ctx, r, wiggle) {
        const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase * 1.6);
        // Uyarı halkası: düz, nabız gibi
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.9 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(240, 70, 143, ${0.35 + pulse * 0.35})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2;

        // Dikenli ambalaj (zikzak kanatlar)
        ctx.save();
        ctx.rotate(wiggle * 1.6);
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * r * 0.8, -r * 0.2);
            for (let i = 0; i <= 4; i++) {
                const yy = -r * 0.75 + (i * r * 1.5) / 4;
                ctx.lineTo(side * (i % 2 ? r * 1.35 : r * 1.85), yy);
            }
            ctx.lineTo(side * r * 0.8, r * 0.2);
            ctx.closePath();
            ctx.fillStyle = '#B9A3D6';
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        // Gövde
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();

        // Somurtkan yüz: çatık kaşlar, ters ağız
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * r * 0.55, -r * 0.42);
            ctx.lineTo(s * r * 0.15, -r * 0.25);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(s * r * 0.32, -r * 0.05, r * 0.11, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, r * 0.48, r * 0.26, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();

        this.renderLabel(ctx, r, true);
    }

    renderLabel(ctx, r, bad = false) {
        // Etiket
        ctx.font = font(10, 700);
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = THEME.TEXT_HALO;
        const label = t(`pickup.${this.type}`, null, this.label);
        const ly = bad ? -r * 2.35 : -r * 1.55;
        ctx.strokeText(label, 0, ly);
        ctx.fillStyle = bad ? THEME.TEXT_ACCENT : THEME.TEXT;
        ctx.fillText(label, 0, ly);
    }
}

export class PickupManager {
    constructor() {
        this.pickups = [];
        this.spawnTimer = 4000; // İlk güçlendirme 4. saniyede gelir
        this.slowmoTimer = 0;   // Slow-mo kalan milisaniye
        this.debuffTimer = GAME_CONFIG.DEBUFFS.START_AFTER; // İlk ekşi şeker
        this.onPickupCollect = null;
    }

    reset() {
        this.pickups.length = 0;
        this.spawnTimer = 4000;
        this.slowmoTimer = 0;
        this.debuffTimer = GAME_CONFIG.DEBUFFS.START_AFTER;
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

    /** Sahadaki iyi (bad=false) ya da ekşi (bad=true) şeker sayısı (dizi üretmeden) */
    countPickups(bad) {
        let n = 0;
        for (const p of this.pickups) if (!!p.bad === bad) n++;
        return n;
    }

    /**
     * Ekşi şeker bırakır: oyuncudan uzakta, HUD'un altında
     * @param {string|null} typeId 'heavy' | 'big' (yoksa rastgele)
     */
    spawnDebuff(player = null, typeId = null) {
        const D = GAME_CONFIG.DEBUFFS;
        const types = Object.values(D.TYPES);
        const typeConfig = typeId ? types.find(tc => tc.id === typeId) : types[Math.floor(random() * types.length)];
        if (!typeConfig) return null;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const margin = 50;
        let x = w / 2;
        let y = h / 2;
        for (let i = 0; i < 8; i++) {
            x = margin + random() * Math.max(1, w - margin * 2);
            y = 150 + random() * Math.max(1, h - 150 - margin);
            if (!player || Math.hypot(player.x - x, player.y - y) >= Math.min(D.MIN_PLAYER_DIST, w * 0.4)) break;
        }
        const pickup = new Pickup({ x, y, typeConfig, bad: true });
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
            if (this.countPickups(false) < 2) {
                this.spawnRandom();
            }
        }

        // Ekşi şeker zamanlayıcısı (sahada en fazla MAX_ON_FIELD)
        this.debuffTimer -= dtMs;
        if (this.debuffTimer <= 0) {
            const D = GAME_CONFIG.DEBUFFS;
            this.debuffTimer = D.SPAWN_INTERVAL + (random() * 3000 - 1500);
            if (this.countPickups(true) < D.MAX_ON_FIELD) this.spawnDebuff(player);
        }

        // Aktif güçlendirmeleri güncelle & toplama kontrolü
        let activeCount = 0;
        const len = this.pickups.length;

        for (let i = 0; i < len; i++) {
            const p = this.pickups[i];
            p.update(dt);
            p.drift(player, dt);

            if (p.active) {
                // Oyuncu ile toplama kontrolü
                const dx = player.x - p.x;
                const dy = player.y - p.y;
                // Ekşi şekerde tolerans yok (sadece gerçek temas); iyi şekerde cömert
                const collectDist = p.bad ? player.hitboxRadius + p.radius : player.radius + p.radius + 6;

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
        if (pickup.bad) {
            // Ekşi şeker: kalkan engellemez
            if (effects.sound.playDebuff) effects.sound.playDebuff(pickup.x);
            effects.triggerPickupEffect(pickup.x, pickup.y, pickup.color);
            if (pickup.type === 'heavy') {
                player.applySlow(GAME_CONFIG.DEBUFFS.TYPES.HEAVY.duration);
                effects.triggerBanner(t('banner.heavy'), THEME.PURPLE_DEEP);
            } else if (pickup.type === 'big') {
                player.applyGrow(GAME_CONFIG.DEBUFFS.TYPES.BIG.duration);
                effects.triggerBanner(t('banner.big'), THEME.PURPLE_DEEP);
            }
            if (this.onPickupCollect) this.onPickupCollect(pickup);
            return;
        }
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

}
