// ============================================================
// ui.js — Kullanıcı Arayüzü Yöneticisi
// Şeker temalı menü, HUD (Graze, Dash Bar, Kalkan), duraklatma ve ölüm ekranı
// ============================================================

import { GAME_CONFIG } from './config.js';
import { ModeRegistry } from './modes.js';
import { THEME, font, candyPanel, outlinedText } from './theme.js';

export class UIManager {
    constructor() {
        this.currentMode = ModeRegistry.get('classic');
        this.highScores = {};
        this.loadAllHighScores();
        this.isNewRecord = false;

        // Menü Buton Koordinatları (2x2 Izgara)
        this.modeButtons = [
            { id: 'classic', label: 'CLASSIC', x: 90, y: 140, w: 200, h: 68 },
            { id: 'endless', label: 'ENDLESS', x: 310, y: 140, w: 200, h: 68 },
            { id: 'hardcore', label: 'HARDCORE', x: 90, y: 218, w: 200, h: 68 },
            { id: 'chaos', label: 'CHAOS', x: 310, y: 218, w: 200, h: 68 }
        ];

        // Başlat Butonu Koordinatları
        this.playButton = { x: 170, y: 440, w: 260, h: 74 };
    }

    setLayout(width, height, safe = { left: 0, right: 0, top: 0, bottom: 0 }) {
        this.safe = safe;
        this.menuScale = Math.min(1, (width - safe.left - safe.right) / 600, (height - safe.top - safe.bottom) / 600);
        this.menuOffsetX = safe.left + (width - safe.left - safe.right - 600 * this.menuScale) / 2;
        this.menuOffsetY = safe.top + (height - safe.top - safe.bottom - 600 * this.menuScale) / 2;
    }

    setMode(mode) {
        this.currentMode = mode;
        this.isNewRecord = false;
    }

    static formatTime(ms) {
        if (!ms || ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor(ms % 1000);

        const mStr = String(minutes).padStart(2, '0');
        const sStr = String(seconds).padStart(2, '0');
        const msStr = String(milliseconds).padStart(3, '0');

        return `${mStr}:${sStr}.${msStr}`;
    }

    loadAllHighScores() {
        const modes = ModeRegistry.getAll();
        for (const m of modes) {
            try {
                let saved = localStorage.getItem(m.storageKey);
                if (!saved && m.legacyKey) {
                    saved = localStorage.getItem(m.legacyKey);
                    if (saved) {
                        localStorage.setItem(m.storageKey, saved);
                    }
                }
                this.highScores[m.id] = saved ? parseFloat(saved) : 0;
            } catch (e) {
                console.warn(`${m.id} rekoru okunamadı:`, e);
                this.highScores[m.id] = 0;
            }
        }
    }

    getHighScore(modeId = this.currentMode.id) {
        return this.highScores[modeId] || 0;
    }

    checkAndSaveHighScore(finalTimeMs, mode = this.currentMode) {
        const currentBest = this.getHighScore(mode.id);
        if (finalTimeMs > currentBest) {
            this.highScores[mode.id] = finalTimeMs;
            this.isNewRecord = true;
            try {
                localStorage.setItem(mode.storageKey, finalTimeMs.toString());
            } catch (e) {
                console.warn(`${mode.id} rekoru kaydedilemedi:`, e);
            }
            return true;
        }
        this.isNewRecord = false;
        return false;
    }

    resetGameSession() {
        this.isNewRecord = false;
    }

    getClickedMode(x, y) {
        x = (x - this.menuOffsetX) / this.menuScale;
        y = (y - this.menuOffsetY) / this.menuScale;
        for (const btn of this.modeButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return btn.id;
            }
        }
        return null;
    }

    isPlayButtonClicked(x, y) {
        x = (x - this.menuOffsetX) / this.menuScale;
        y = (y - this.menuOffsetY) / this.menuScale;
        const btn = this.playButton;
        return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
    }

    /**
     * Küçük hap etiketi (mod adı, durum bildirimleri)
     */
    static pill(ctx, text, x, y, fill, color = THEME.INK, align = 'left', size = 11) {
        ctx.save();
        ctx.font = font(size, 700);
        const tw = ctx.measureText(text).width;
        const pw = tw + 16;
        const ph = size + 9;
        const px = align === 'right' ? x - pw : align === 'center' ? x - pw / 2 : x;
        candyPanel(ctx, px, y - ph / 2, pw, ph, ph / 2, fill, { lineWidth: 1.5, depth: 2 });
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, px + pw / 2, y + 1);
        ctx.restore();
    }

    /**
     * Menü Ekranı (Mod Seçimi ve Kontrol İpuçları)
     */
    renderMenu(ctx, activeModeId = this.currentMode.id) {
        const w = 600;
        const t = performance.now() / 1000;

        ctx.save();
        ctx.translate(this.menuOffsetX, this.menuOffsetY);
        ctx.scale(this.menuScale, this.menuScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        // Başlık: pembe gölgeli çıkartma yazı
        ctx.font = font(42, 700);
        const titleY = 72 + Math.sin(t * 2) * 2;
        ctx.lineJoin = 'round';
        ctx.fillStyle = THEME.PINK;
        ctx.fillText('BULLET HELL', w / 2 + 3, titleY + 4);
        outlinedText(ctx, 'BULLET HELL', w / 2, titleY, THEME.INK, THEME.WHITE, 6);

        ctx.save();
        ctx.translate(w / 2 + 128, titleY + 14);
        ctx.rotate(-0.08);
        UIManager.pill(ctx, 'micro', 0, 0, THEME.PINK, THEME.WHITE, 'center', 14);
        ctx.restore();

        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText('mod seç', w / 2, 118);

        // Mod Seçim Butonları
        for (const btn of this.modeButtons) {
            const isSelected = btn.id === activeModeId;
            const lift = isSelected ? -2 : 0;
            candyPanel(ctx, btn.x, btn.y + lift, btn.w, btn.h, 18,
                isSelected ? THEME.PINK : THEME.WHITE,
                { depth: isSelected ? 6 : 4, lineWidth: 2 });

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = font(18, 700);
            ctx.fillStyle = isSelected ? THEME.WHITE : THEME.INK;
            ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + lift + btn.h / 2 - 8);

            ctx.font = font(11, 600);
            ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.9)' : THEME.MUTED;
            ctx.fillText(`en iyi ${UIManager.formatTime(this.getHighScore(btn.id))}`, btn.x + btn.w / 2, btn.y + lift + btn.h / 2 + 14);
        }

        // Mod Açıklaması
        const activeMode = ModeRegistry.get(activeModeId);
        ctx.textBaseline = 'alphabetic';
        ctx.font = font(14, 500);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(activeMode.description, w / 2, 318);

        // Kontrol İpuçları
        ctx.font = font(12, 500);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText('Joystick · Fare · WASD · Gamepad  →  hareket', w / 2, 356);
        ctx.fillText('DASH · Sağ tık · Shift · Space  →  dokunulmazlık', w / 2, 378);
        ctx.fillText('P / ESC  →  duraklat     B  →  müzik     N  →  efektler', w / 2, 400);

        // OYNA butonu: yavaşça süzülen mor şeker
        const pb = this.playButton;
        const bob = Math.sin(t * 3) * 2;
        candyPanel(ctx, pb.x, pb.y + bob, pb.w, pb.h, pb.h / 2, THEME.PURPLE, { depth: 6, lineWidth: 2.5 });
        ctx.beginPath();
        ctx.roundRect(pb.x + 18, pb.y + bob + 8, pb.w - 36, 8, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fill();
        ctx.font = font(22, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.textBaseline = 'middle';
        ctx.fillText(`OYNA ▶ ${activeMode.label}`, w / 2, pb.y + bob + pb.h / 2 + 2);

        ctx.restore();
    }

    /**
     * Oynanış HUD: Mod, Süre, Graze Sayacı, Kalkan ve Dash Şarj Çubuğu
     */
    renderHUD(ctx, elapsedMs, mode = this.currentMode, player = null, pickupManager = null) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const left = 18 + this.safe.left;
        const right = w - 18 - this.safe.right;

        ctx.save();
        ctx.translate(0, this.safe.top);
        ctx.textBaseline = 'middle';

        // Sol üst: mod ve rekor
        UIManager.pill(ctx, mode.label, left, 24, THEME.LAVENDER, THEME.INK, 'left', 11);
        // Orta: büyük sayaç ve altında rekor (dar ekranlarda küçülür)
        ctx.textAlign = 'center';
        ctx.font = font(Math.min(36, w * 0.085), 700);
        outlinedText(ctx, UIManager.formatTime(elapsedMs), w / 2, 42, THEME.INK, THEME.WHITE, 6);
        ctx.font = font(11, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(`rekor ${UIManager.formatTime(this.getHighScore(mode.id))}`, w / 2, 70);

        // Sağ üst: graze ve aktif güçlendirmeler
        const graze = player ? player.grazeCount : 0;
        UIManager.pill(ctx, `graze ${graze}`, right, 24, THEME.PINK, THEME.WHITE, 'right', 12);
        let rowY = 52;
        if (player && player.hasShield) {
            UIManager.pill(ctx, 'kalkan', right, rowY, THEME.PURPLE, THEME.WHITE, 'right', 10);
            rowY += 24;
        }
        if (pickupManager && pickupManager.isSlowmoActive()) {
            const remaining = (pickupManager.slowmoTimer / 1000).toFixed(1);
            UIManager.pill(ctx, `yavaş ${remaining}s`, right, rowY, THEME.LAVENDER, THEME.INK, 'right', 10);
        }

        // Alt orta: Dash şarj çubuğu (dokunmatikte buton halkası gösterir)
        if (player && !matchMedia('(any-pointer: coarse)').matches) {
            const barW = 140;
            const barH = 10;
            const barX = (w - barW) / 2;
            const barY = h - this.safe.top - this.safe.bottom - 26;
            const ratio = player.getDashReadyRatio();
            const isReady = ratio >= 1.0;

            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, barH / 2);
            ctx.fillStyle = THEME.WHITE;
            ctx.fill();
            if (ratio > 0) {
                ctx.save();
                ctx.clip();
                ctx.fillStyle = isReady ? THEME.PINK : THEME.LAVENDER;
                ctx.fillRect(barX, barY, barW * ratio, barH);
                ctx.restore();
            }
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, barH / 2);
            ctx.strokeStyle = THEME.INK;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.font = font(11, 700);
            ctx.fillStyle = isReady ? THEME.PINK_DEEP : THEME.MUTED;
            ctx.fillText(isReady ? 'DASH hazır · sağ tık / space / shift' : 'dash doluyor…', w / 2, barY - 11);
        }

        ctx.restore();
    }

    /**
     * Duraklatma Ekranı ve Devam Geri Sayımı
     */
    renderPaused(ctx, countdownMs = 0, touch = false) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (countdownMs > 0) {
            const step = Math.ceil(countdownMs / 500);
            const frac = (countdownMs % 500) / 500;
            ctx.fillStyle = 'rgba(255, 246, 250, 0.35)';
            ctx.fillRect(0, 0, w, h);
            ctx.font = font(64 + frac * 26, 700);
            ctx.globalAlpha = 0.5 + frac * 0.5;
            ctx.fillStyle = THEME.PINK;
            ctx.fillText(String(step), w / 2 + 3, h / 2 + 5);
            outlinedText(ctx, String(step), w / 2, h / 2, THEME.INK, THEME.WHITE, 7);
            ctx.restore();
            return;
        }

        ctx.fillStyle = 'rgba(255, 246, 250, 0.78)';
        ctx.fillRect(0, 0, w, h);

        const cw = Math.min(320, w - 40);
        const ch = touch ? 120 : 140;
        candyPanel(ctx, w / 2 - cw / 2, h / 2 - ch / 2 - 10, cw, ch, 22, THEME.WHITE, { depth: 6, lineWidth: 2.5 });

        ctx.font = font(28, 700);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText('duraklatıldı', w / 2, h / 2 - 36);

        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.font = font(14, 600);
        ctx.globalAlpha = 0.65 + pulse * 0.35;
        ctx.fillStyle = THEME.INK;
        ctx.fillText(touch ? 'devam etmek için dokun' : 'tıkla · space · P · ESC → devam', w / 2, h / 2 + 2);
        ctx.globalAlpha = 1;

        if (!touch) {
            ctx.font = font(12, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText('M → ana menü', w / 2, h / 2 + 28);
        }
        ctx.restore();
    }

    /**
     * Ölüm Ekranı
     */
    renderDead(ctx, finalTimeMs, mode = this.currentMode, player = null, waves = null) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const cx = w / 2;
        const cy = h / 2;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 246, 250, 0.82)';
        ctx.fillRect(0, 0, w, h);

        const cw = Math.min(360, w - 32);
        candyPanel(ctx, cx - cw / 2, cy - 152, cw, 332, 26, THEME.WHITE, { depth: 7, lineWidth: 2.5 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // OYUN BİTTİ
        ctx.font = font(32, 700);
        ctx.fillStyle = THEME.PINK_SOFT;
        ctx.fillText('OYUN BİTTİ', cx + 2, cy - 110 + 3);
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fillText('OYUN BİTTİ', cx, cy - 110);

        UIManager.pill(ctx, mode.label, cx, cy - 76, THEME.LAVENDER, THEME.INK, 'center', 11);

        if (this.isNewRecord) {
            const bounce = Math.abs(Math.sin(performance.now() * 0.005)) * 3;
            UIManager.pill(ctx, '★ yeni rekor! ★', cx, cy - 46 - bounce, THEME.PURPLE, THEME.WHITE, 'center', 13);
        }

        // İstatistikler
        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText('hayatta kalma', cx - 78, cy - 12);
        ctx.fillText('graze', cx + 92, cy - 12);

        ctx.font = font(28, 700);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(UIManager.formatTime(finalTimeMs), cx - 78, cy + 16);
        ctx.fillStyle = THEME.PINK;
        ctx.fillText(player ? player.grazeCount.toString() : '0', cx + 92, cy + 16);

        // En iyi
        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(`en iyi (${mode.label})`, cx, cy + 52);
        ctx.font = font(19, 700);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(UIManager.formatTime(this.getHighScore(mode.id)), cx, cy + 74);

        // Boss sonucu
        if (waves && waves.boss) {
            ctx.font = font(12, 700);
            if (waves.bossDefeatedAt !== null) {
                ctx.fillStyle = THEME.PURPLE_DEEP;
                ctx.fillText(`✓ Jöle Kral eridi (${UIManager.formatTime(waves.bossDefeatedAt)})`, cx, cy + 100);
            } else {
                ctx.fillStyle = THEME.PINK_DEEP;
                ctx.fillText(`Jöle Kral enerjisi: %${Math.ceil(waves.boss.hpRatio * 100)}`, cx, cy + 100);
            }
        }

        // Yeniden başlatma
        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.font = font(15, 700);
        ctx.globalAlpha = 0.7 + pulse * 0.3;
        ctx.fillStyle = THEME.INK;
        ctx.fillText('tıkla · space · enter → tekrar oyna', cx, cy + 132);
        ctx.globalAlpha = 1;

        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText('M / ESC → ana menü', cx, cy + 156);

        ctx.restore();
    }
}
