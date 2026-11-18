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
        this.hasShield = false;

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
    reset() {
        this.x = GAME_CONFIG.PLAYER.START_X;
        this.y = GAME_CONFIG.PLAYER.START_Y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;
        this.grazeCount = 0;
        this.hasShield = false;
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldownTimer = 0;
        this.afterImages.length = 0;
        this.moveInput.x = 0;
        this.moveInput.y = 0;
        this.inputMode = 'mouse';
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

            const baseSpeed = GAME_CONFIG.PLAYER.KEYBOARD_SPEED;
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

        // 2. Graze alanı: kesikli lavanta halka
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.grazeRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this.isDashing ? THEME.PINK : 'rgba(142, 91, 232, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Kalkan: dönen sabun köpüğü
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
