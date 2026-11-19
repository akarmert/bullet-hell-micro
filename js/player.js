// ============================================================
// player.js — Oyuncu Varlık Sınıfı
// 1:1 Fare takibi, Klavye/Gamepad desteği, Dash (I-Frame), Graze & Shield
// ============================================================

import { GAME_CONFIG } from './config.js';
import { THEME } from './theme.js';
import { getSkin, drawMarshmallow } from './skins.js';

export class Player {
    constructor() {
        this.radius = GAME_CONFIG.PLAYER.RADIUS;
        this.hitboxRadius = GAME_CONFIG.PLAYER.HITBOX_RADIUS;
        this.grazeRadius = GAME_CONFIG.PLAYER.GRAZE_RADIUS || 16;

        // Ekşi şeker etkileri (oyuncunun zararına)
        this.slowTimer = 0;      // Ağırlaşma kalan süre (ms)
        this.growTimer = 0;      // Şişme kalan süre (ms)
        this.sizeScale = 1;      // Görünen + çarpışma boyutu çarpanı (yumuşak geçişli)
        this.mouseTarget = null; // Ağırken fare imleci hedefi (anında ışınlanmaz)
        this.color = GAME_CONFIG.PLAYER.COLOR;
        this.glow = GAME_CONFIG.PLAYER.GLOW;

        this.x = GAME_CONFIG.PLAYER.START_X;
        this.y = GAME_CONFIG.PLAYER.START_Y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.vx = 0;
        this.vy = 0;

        this.alive = true;
        this.grazeCount = 0;
        this.shieldCharges = 0;   // Kalan kalkan hakkı (0-3)
        this.invulnTimer = 0;     // Engellenen darbeden sonraki dokunulmazlık (ms)

        // Dash (I-Frame) Durumu
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.dashDuration = GAME_CONFIG.PLAYER.DASH.DURATION;
        this.dashCooldown = GAME_CONFIG.PLAYER.DASH.COOLDOWN;
        this.afterImages = [];

        // Kontrol Girdisi (Klavye / Gamepad için)
        this.moveInput = { x: 0, y: 0 };
        this.inputMode = 'mouse'; // 'mouse' veya 'keyboard'

        // Görsel rotasyon / kalkan animasyon fazı
        this.shieldAngle = 0;

        // Kostüm (Progress'ten seçilir)
        this.skin = getSkin('classic');
    }

    /**
     * Fare veya dokunmatik girdiden gelen koordinatları anında uygular (1:1 takip)
     */
    moveTo(targetX, targetY) {
        if (!this.alive) return;
        this.inputMode = 'mouse';
        // Ağırken imleci anında izlemez, sınırlı hızla ona doğru yürür (update)
        if (this.slowTimer > 0) {
            this.mouseTarget = { x: targetX, y: targetY };
            return;
        }
        this.mouseTarget = null;
        this.prevX = this.x;
        this.prevY = this.y;
        this.x = targetX;
        this.y = targetY;

        this.vx = this.x - this.prevX;
        this.vy = this.y - this.prevY;
    }

    /**
     * Klavye / Gamepad yön vektörünü ayarlar
     */
    setMoveInput(x, y) {
        this.moveInput.x = x;
        this.moveInput.y = y;
        if (x !== 0 || y !== 0) {
            this.inputMode = 'keyboard';
        }
    }

    /**
     * Dash (I-Frame / Dokunulmazlık Sıyrılması) tetikler
     * @returns {boolean} Başarılı olduysa true
     */
    triggerDash() {
        if (!this.alive || this.dashCooldownTimer > 0 || this.isDashing) {
            return false;
        }

        this.isDashing = true;
        this.dashTimer = this.dashDuration;
        this.dashCooldownTimer = this.dashCooldown;

        // Klavye/Gamepad yönünde veya son hareket yönünde ek itme
        let dirX = this.moveInput.x;
        let dirY = this.moveInput.y;

        if (dirX === 0 && dirY === 0) {
            const mag = Math.hypot(this.vx, this.vy) || 1;
            dirX = this.vx / mag;
            dirY = this.vy / mag;
        }

        // Eğer fare de tamamen duruyorsa yukarı fırlar
        if (dirX === 0 && dirY === 0) {
            dirY = -1;
        }

        const boost = 35;
        this.x += dirX * boost;
        this.y += dirY * boost;

        // Arena sınırları içine hapset
        this.clampToArena();

        return true;
    }

    /**
     * Oyuncuyu başlangıç durumuna döndürür
     */
    /** Kalkan var mı? (eski kodlarla uyumluluk için) */
    get hasShield() {
        return this.shieldCharges > 0;
    }

    set hasShield(value) {
        this.shieldCharges = value ? Math.max(this.shieldCharges, 1) : 0;
    }

    /** Kalkan güçlendirmesi: +1 hak (en fazla MAX) */
    addShield() {
        const S = GAME_CONFIG.PLAYER.SHIELD;
        this.shieldCharges = Math.min(S.MAX, this.shieldCharges + S.PER_PICKUP);
        return this.shieldCharges;
    }

    /**
     * Bir darbeyi kalkanla engeller. Dokunulmazlık sadece SON kalkan kırılınca başlar.
     * @returns {number} Kalan hak
     */
    useShield() {
        if (this.shieldCharges <= 0) return 0;
        this.shieldCharges--;
        if (this.shieldCharges === 0) this.invulnTimer = GAME_CONFIG.PLAYER.SHIELD.IFRAME_MS;
        return this.shieldCharges;
    }

    /** Boss gövdesine çarpma: bütün kalkanlar birden gider, dokunulmazlık başlar */
    breakAllShields() {
        this.shieldCharges = 0;
        this.invulnTimer = GAME_CONFIG.PLAYER.SHIELD.IFRAME_MS;
    }

    /** Kalan kalkan sayısı kadar 🛡️ (her yazı tipinde aynı boyutta görünür) */
    shieldPips() {
        return '🛡️'.repeat(this.shieldCharges);
    }

    /** Ekşi şeker: bir süre ağırlaşır (klavye/joystick yavaşlar, fare imleci geriden izler) */
    applySlow(ms = GAME_CONFIG.DEBUFFS.TYPES.HEAVY.duration) {
        this.slowTimer = Math.max(this.slowTimer, ms);
    }

    /** Ekşi şeker: bir süre şişip büyür (gövde, hitbox ve graze alanı birlikte) */
    applyGrow(ms = GAME_CONFIG.DEBUFFS.TYPES.BIG.duration) {
        this.growTimer = Math.max(this.growTimer, ms);
    }

    /** Boyut çarpanını uygular; büyüyünce duvara gömülmesin diye içeri itilir */
    setSizeScale(scale) {
        this.sizeScale = scale;
        const P = GAME_CONFIG.PLAYER;
        this.radius = P.RADIUS * scale;
        this.hitboxRadius = P.HITBOX_RADIUS * scale;
        this.grazeRadius = (P.GRAZE_RADIUS || 16) * scale;
        this.clampToArena();
    }

    /** Darbe almıyor mu? (dash ya da kalkan sonrası dokunulmazlık) */
    get isInvulnerable() {
        return this.isDashing || this.invulnTimer > 0;
    }

    reset() {
        this.x = GAME_CONFIG.PLAYER.START_X;
        this.y = GAME_CONFIG.PLAYER.START_Y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;
        this.grazeCount = 0;
        this.shieldCharges = 0;
        this.invulnTimer = 0;
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.afterImages.length = 0;
        this.moveInput.x = 0;
        this.moveInput.y = 0;
        this.inputMode = 'mouse';
        this.slowTimer = 0;
        this.growTimer = 0;
        this.mouseTarget = null;
        this.setSizeScale(1);
    }

    /**
     * Delta-time bazlı oyuncu mantığı (Klavye hareketi, Dash & Cooldown, Afterimages)
     * @param {number} dt Saniye cinsinden
     */
    update(dt) {
        const dtMs = dt * 1000;

        // Kalkan dönme animasyonu
        if (this.hasShield) {
            this.shieldAngle += dt * 3.5;
        }

        // Kalkan sonrası dokunulmazlık
        if (this.invulnTimer > 0) {
            this.invulnTimer = Math.max(0, this.invulnTimer - dtMs);
        }

        // Ekşi şeker etkileri
        // (ağırlık bitince imleç hedefi kalmışsa oraya hızlıca yürünür, ışınlanılmaz)
        if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dtMs);
        if (this.growTimer > 0) this.growTimer = Math.max(0, this.growTimer - dtMs);
        const targetScale = this.growTimer > 0 ? GAME_CONFIG.DEBUFFS.TYPES.BIG.scale : 1;
        if (Math.abs(this.sizeScale - targetScale) > 0.001) {
            const k = Math.min(1, dt * 6);
            this.setSizeScale(this.sizeScale + (targetScale - this.sizeScale) * k);
        }

        // Ağırken (ya da etki yeni bittiyse) fare hedefine sınırlı hızla yürü
        if (this.inputMode === 'mouse' && this.mouseTarget) {
            const H = GAME_CONFIG.DEBUFFS.TYPES.HEAVY;
            const dx = this.mouseTarget.x - this.x;
            const dy = this.mouseTarget.y - this.y;
            const d = Math.hypot(dx, dy);
            const step = (this.slowTimer > 0 ? H.mouseSpeed : H.mouseSpeed * 3) * (this.isDashing ? GAME_CONFIG.PLAYER.DASH.SPEED_MULT : 1) * dt;
            this.prevX = this.x;
            this.prevY = this.y;
            if (d <= step) {
                this.x = this.mouseTarget.x;
                this.y = this.mouseTarget.y;
                if (this.slowTimer === 0) this.mouseTarget = null;
            } else {
                this.x += (dx / d) * step;
                this.y += (dy / d) * step;
            }
            this.vx = this.x - this.prevX;
            this.vy = this.y - this.prevY;
        }

        // Dash durumları
        if (this.isDashing) {
            this.dashTimer -= dtMs;
            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }

            // Dash sırasında ghost after-image oluştur
            this.afterImages.push({
                x: this.x,
                y: this.y,
                alpha: 0.6,
                color: '#ffffff'
            });
        }

        if (this.dashCooldownTimer > 0) {
            this.dashCooldownTimer -= dtMs;
            if (this.dashCooldownTimer < 0) {
                this.dashCooldownTimer = 0;
            }
        }

        // After-image sönümlemesi
        for (let i = this.afterImages.length - 1; i >= 0; i--) {
            this.afterImages[i].alpha -= dt * 4;
            if (this.afterImages[i].alpha <= 0) {
                this.afterImages.splice(i, 1);
            }
        }

        // Klavye / Gamepad hareketi
        if (this.inputMode === 'keyboard' && (this.moveInput.x !== 0 || this.moveInput.y !== 0)) {
            const mag = Math.max(1, Math.hypot(this.moveInput.x, this.moveInput.y));
            const normX = this.moveInput.x / mag;
            const normY = this.moveInput.y / mag;

            const baseSpeed = GAME_CONFIG.PLAYER.KEYBOARD_SPEED * (this.slowTimer > 0 ? GAME_CONFIG.DEBUFFS.TYPES.HEAVY.factor : 1);
            const speed = this.isDashing ? baseSpeed * GAME_CONFIG.PLAYER.DASH.SPEED_MULT : baseSpeed;

            this.prevX = this.x;
            this.prevY = this.y;
            this.x += normX * speed * dt;
            this.y += normY * speed * dt;
            this.vx = this.x - this.prevX;
            this.vy = this.y - this.prevY;

            this.clampToArena();
        }
    }

    /**
     * Arena sınırları içinde tutma
     */
    clampToArena() {
        const pad = this.radius + 1;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        if (this.x < pad) this.x = pad;
        if (this.x > w - pad) this.x = w - pad;
        if (this.y < pad) this.y = pad;
        if (this.y > h - pad) this.y = h - pad;
    }

    /**
     * Dash hazır olma yüzdesi (0.0 - 1.0)
     */
    getDashReadyRatio() {
        if (this.dashCooldownTimer <= 0) return 1.0;
        return 1.0 - (this.dashCooldownTimer / this.dashCooldown);
    }

    /**
     * Marşmelov oyuncu: beyaz yumuşak gövde, minik yüz, pembe hitbox çekirdeği
     */
    render(ctx) {
        if (!this.alive) return;
        const r = this.radius * 1.9;
        const t = performance.now() / 1000;

        ctx.save();
        ctx.lineJoin = 'round';
        // Kalkan sonrası dokunulmazlıkta yanıp söner
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer / 90) % 2 === 0) ctx.globalAlpha = 0.35;

        // Koyu tema: marşmelovun altında pembe "gece lambası" (en parlak nesne oyuncu)
        if (THEME.dark && this.alive) {
            const g = ctx.createRadialGradient(this.x, this.y, r * 0.5, this.x, this.y, r * 4.2);
            g.addColorStop(0, 'rgba(255, 141, 192, 0.32)');
            g.addColorStop(1, 'rgba(255, 141, 192, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(this.x - r * 4.2, this.y - r * 4.2, r * 8.4, r * 8.4);
        }

        // 1. Dash hayalet izleri (pembe yumuşak kopyalar)
        for (let i = 0; i < this.afterImages.length; i++) {
            const img = this.afterImages[i];
            ctx.globalAlpha = img.alpha * 0.7;
            ctx.beginPath();
            ctx.arc(img.x, img.y, r, 0, Math.PI * 2);
            ctx.fillStyle = THEME.PINK_SOFT;
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 2. Kalkan: dönen sabun köpüğü
        if (this.hasShield) {
            const sr = this.radius * 3.9;
            ctx.beginPath();
            ctx.arc(this.x, this.y, sr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(205, 184, 255, 0.22)';
            ctx.fill();
            ctx.strokeStyle = THEME.PURPLE;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x, this.y, sr - 4, this.shieldAngle, this.shieldAngle + 0.9);
            ctx.strokeStyle = THEME.WHITE;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
            // Kalan hak sayısı kadar köpük üstünde dönen nokta
            for (let i = 0; i < this.shieldCharges; i++) {
                const a = -this.shieldAngle * 0.6 + (i * Math.PI * 2) / 3;
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(a) * sr, this.y + Math.sin(a) * sr, 3, 0, Math.PI * 2);
                ctx.fillStyle = THEME.PINK;
                ctx.fill();
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = THEME.INK;
                ctx.stroke();
            }
        }

        // 4-7. Kostümlü marşmelov gövde, yüz ve hitbox çekirdeği
        const squash = this.isDashing ? 0.82 : 1 + Math.sin(t * 5) * 0.03;
        const blink = (t % 3.2) < 0.12 ? 0.25 : 1;
        drawMarshmallow(ctx, this.x, this.y, r, this.skin, {
            squash,
            blink,
            hitboxRadius: this.hitboxRadius * 0.6,
            body: this.isDashing ? THEME.PINK_SOFT : null
        });

        ctx.restore();
    }
}
