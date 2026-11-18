// ============================================================
// ui.js — Kullanıcı Arayüzü Yöneticisi
// Şeker temalı menü (modlar, günlük meydan okuma, kostüm seçici),
// HUD (skor, seri, dash), ipuçları, ayarlar, duraklatma ve ölüm ekranı
// ============================================================

import { GAME_CONFIG } from './config.js';
import { ModeRegistry } from './modes.js';
import { THEME, font, candyPanel, outlinedText } from './theme.js';
import { formatScore } from './score.js';
import { SKINS, drawMarshmallow } from './skins.js';
import { SETTING_ROWS } from './settings.js';
import { dateLabel } from './rng.js';
import { t } from './i18n.js';

const SETTINGS_LAYOUT = { x: 110, y: 104, w: 380, rowTop: 160, rowH: 42 };

export class UIManager {
    constructor() {
        this.currentMode = ModeRegistry.get('classic');
        this.highScores = {};  // En iyi süre (ms)
        this.bestScores = {};  // En iyi skor
        this.loadAllHighScores();
        this.isNewRecord = false;      // Skor rekoru
        this.isNewTimeRecord = false;  // Süre rekoru
        this.safe = { left: 0, right: 0, top: 0, bottom: 0 };

        // Game tarafından bağlanır
        this.progress = null;
        this.settings = null;
        this.skinIndex = 0;
        this.settingsOpen = false;
        this.settingsRow = 0;

        // Menü düzeni (600x600 menü alanında)
        this.modeButtons = [
            { id: 'classic', label: 'CLASSIC', x: 90, y: 118, w: 200, h: 60 },
            { id: 'endless', label: 'ENDLESS', x: 310, y: 118, w: 200, h: 60 },
            { id: 'hardcore', label: 'HARDCORE', x: 90, y: 188, w: 200, h: 60 },
            { id: 'chaos', label: 'CHAOS', x: 310, y: 188, w: 200, h: 60 },
            { id: 'daily', label: 'GÜNLÜK', x: 90, y: 258, w: 420, h: 46, wide: true }
        ];
        this.playButton = { x: 170, y: 398, w: 260, h: 64 };
        this.settingsButton = { x: 478, y: 14, w: 108, h: 34 };
        this.skinPrev = { x: 222, y: 522, r: 20 };
        this.skinNext = { x: 378, y: 522, r: 20 };
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
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }

    // ------------------------------------------------------------
    // REKORLAR
    // ------------------------------------------------------------

    loadAllHighScores() {
        for (const m of ModeRegistry.getAll()) {
            try {
                let saved = localStorage.getItem(m.storageKey);
                if (!saved && m.legacyKey) {
                    saved = localStorage.getItem(m.legacyKey);
                    if (saved) localStorage.setItem(m.storageKey, saved);
                }
                this.highScores[m.id] = saved ? parseFloat(saved) : 0;
                const score = localStorage.getItem(m.scoreKey);
                this.bestScores[m.id] = score ? parseFloat(score) : 0;
            } catch (e) {
                this.highScores[m.id] = 0;
                this.bestScores[m.id] = 0;
            }
        }
    }

    getHighScore(modeId = this.currentMode.id) {
        return this.highScores[modeId] || 0;
    }

    getBestScore(modeId = this.currentMode.id) {
        return this.bestScores[modeId] || 0;
    }

    /** Süre rekoru (ms) */
    checkAndSaveHighScore(finalTimeMs, mode = this.currentMode) {
        this.isNewTimeRecord = finalTimeMs > this.getHighScore(mode.id);
        if (!this.isNewTimeRecord) return false;
        this.highScores[mode.id] = finalTimeMs;
        try {
            localStorage.setItem(mode.storageKey, finalTimeMs.toString());
        } catch (e) {
            // kaydedilemedi
        }
        return true;
    }

    /** Skor rekoru: ölüm ekranındaki "yeni rekor" bunu gösterir */
    checkAndSaveBestScore(score, mode = this.currentMode) {
        this.isNewRecord = score > this.getBestScore(mode.id);
        if (!this.isNewRecord) return false;
        this.bestScores[mode.id] = score;
        try {
            localStorage.setItem(mode.scoreKey, String(score));
        } catch (e) {
            // kaydedilemedi
        }
        return true;
    }

    resetGameSession() {
        this.isNewRecord = false;
        this.isNewTimeRecord = false;
    }

    // ------------------------------------------------------------
    // GİRDİ EŞLEME
    // ------------------------------------------------------------

    toMenuSpace(x, y) {
        return { x: (x - this.menuOffsetX) / this.menuScale, y: (y - this.menuOffsetY) / this.menuScale };
    }

    /**
     * Menüde tıklanan öğe
     * @returns {{type:'mode', id:string}|{type:'play'|'settings'|'skinPrev'|'skinNext'}|null}
     */
    getMenuAction(px, py) {
        const { x, y } = this.toMenuSpace(px, py);
        const inRect = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        const inCircle = (c) => Math.hypot(x - c.x, y - c.y) <= c.r + 8;
        for (const btn of this.modeButtons) if (inRect(btn)) return { type: 'mode', id: btn.id };
        if (inRect(this.settingsButton)) return { type: 'settings' };
        if (inCircle(this.skinPrev)) return { type: 'skinPrev' };
        if (inCircle(this.skinNext)) return { type: 'skinNext' };
        if (inRect(this.playButton)) return { type: 'play' };
        return null;
    }

    /** Geriye dönük uyumluluk */
    getClickedMode(x, y) {
        const a = this.getMenuAction(x, y);
        return a && a.type === 'mode' ? a.id : null;
    }

    /**
     * Ayarlar panelinde tıklanan satır ve yön
     * @returns {{row:number, dir:number}|null}
     */
    getSettingsAction(px, py) {
        const { x, y } = this.toMenuSpace(px, py);
        const L = SETTINGS_LAYOUT;
        if (x < L.x || x > L.x + L.w) return { row: SETTING_ROWS.length - 1, dir: 0, outside: true };
        const row = Math.floor((y - L.rowTop) / L.rowH);
        if (row < 0 || row >= SETTING_ROWS.length) return y < L.rowTop ? null : { row: SETTING_ROWS.length - 1, dir: 0, outside: true };
        return { row, dir: x < L.x + L.w - 100 ? -1 : 1 };
    }

    // ------------------------------------------------------------
    // ORTAK ÇİZİM PARÇALARI
    // ------------------------------------------------------------

    /** Küçük hap etiketi */
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
        return pw;
    }

    static roundButton(ctx, x, y, r, label) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y + 3, r, 0, Math.PI * 2);
        ctx.fillStyle = THEME.INK;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = THEME.WHITE;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
        ctx.font = font(r, 700);
        ctx.fillStyle = THEME.INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + 1);
        ctx.restore();
    }

    // ------------------------------------------------------------
    // MENÜ
    // ------------------------------------------------------------

    renderMenu(ctx, activeModeId = this.currentMode.id) {
        const w = 600;
        const now = performance.now() / 1000;

        ctx.save();
        ctx.translate(this.menuOffsetX, this.menuOffsetY);
        ctx.scale(this.menuScale, this.menuScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        // Ayarlar butonu
        const sb = this.settingsButton;
        candyPanel(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2, THEME.WHITE, { depth: 3, lineWidth: 2 });
        ctx.font = font(14, 700);
        ctx.fillStyle = THEME.INK;
        ctx.textBaseline = 'middle';
        ctx.fillText(t('menu.settings'), sb.x + sb.w / 2, sb.y + sb.h / 2 + 1);
        ctx.textBaseline = 'alphabetic';

        // Başlık
        ctx.font = font(42, 700);
        const titleY = 70 + Math.sin(now * 2) * 2;
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
        ctx.fillText(t('menu.pickMode'), w / 2, 108);

        // Mod butonları
        for (const btn of this.modeButtons) {
            const isSelected = btn.id === activeModeId;
            const lift = isSelected ? -2 : 0;
            const y = btn.y + lift;
            candyPanel(ctx, btn.x, y, btn.w, btn.h, 18, isSelected ? THEME.PINK : THEME.WHITE,
                { depth: isSelected ? 6 : 4, lineWidth: 2 });
            const best = t('menu.best', { score: formatScore(this.getBestScore(btn.id)) });
            const label = ModeRegistry.get(btn.id).label;
            ctx.textBaseline = 'middle';
            if (btn.wide) {
                ctx.textAlign = 'left';
                ctx.font = font(17, 700);
                ctx.fillStyle = isSelected ? THEME.WHITE : THEME.INK;
                ctx.fillText(`☀ ${label} · ${dateLabel()}`, btn.x + 20, y + btn.h / 2 + 1);
                ctx.textAlign = 'right';
                ctx.font = font(12, 600);
                ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.9)' : THEME.MUTED;
                ctx.fillText(best, btn.x + btn.w - 20, y + btn.h / 2 + 1);
            } else {
                ctx.textAlign = 'center';
                ctx.font = font(18, 700);
                ctx.fillStyle = isSelected ? THEME.WHITE : THEME.INK;
                ctx.fillText(label, btn.x + btn.w / 2, y + btn.h / 2 - 8);
                ctx.font = font(11, 600);
                ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.9)' : THEME.MUTED;
                ctx.fillText(best, btn.x + btn.w / 2, y + btn.h / 2 + 13);
            }
        }

        // Açıklama ve ipuçları
        const activeMode = ModeRegistry.get(activeModeId);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = font(14, 500);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(activeMode.description, w / 2, 334);
        ctx.font = font(12, 500);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('menu.controls1'), w / 2, 360, 580);
        ctx.fillText(t('menu.controls2'), w / 2, 380, 580);

        // OYNA
        const pb = this.playButton;
        const bob = Math.sin(now * 3) * 2;
        candyPanel(ctx, pb.x, pb.y + bob, pb.w, pb.h, pb.h / 2, THEME.PURPLE, { depth: 6, lineWidth: 2.5 });
        ctx.beginPath();
        ctx.roundRect(pb.x + 18, pb.y + bob + 8, pb.w - 36, 8, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fill();
        ctx.font = font(22, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.textBaseline = 'middle';
        ctx.fillText(t('menu.play', { mode: activeMode.label }), w / 2, pb.y + bob + pb.h / 2 + 2);

        // Kostüm seçici
        this.renderSkinPicker(ctx, now);

        ctx.restore();

        if (this.settingsOpen) this.renderSettings(ctx);
    }

    renderSkinPicker(ctx, time) {
        if (!this.progress) return;
        const skin = SKINS[this.skinIndex] || SKINS[0];
        const locked = !this.progress.isUnlocked(skin.id);
        const cx = 300;
        const cy = this.skinPrev.y;

        UIManager.roundButton(ctx, this.skinPrev.x, cy, this.skinPrev.r, '‹');
        UIManager.roundButton(ctx, this.skinNext.x, cy, this.skinNext.r, '›');

        const bob = Math.sin(time * 2.4) * 2;
        const blink = (time % 3.2) < 0.12 ? 0.25 : 1;
        drawMarshmallow(ctx, cx, cy - 4 + bob, 22, skin, { locked, blink, squash: 1 + Math.sin(time * 5) * 0.03 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = font(15, 700);
        ctx.fillStyle = locked ? THEME.MUTED : THEME.INK;
        const count = `${this.progress.unlocked.length}/${SKINS.length}`;
        ctx.fillText(`${t(`skin.${skin.id}.name`, null, skin.name)}${this.progress.selected === skin.id ? ' ✓' : ''}`, cx, cy + 44);
        ctx.font = font(11, 600);
        ctx.fillStyle = locked ? THEME.PINK_DEEP : THEME.MUTED;
        ctx.fillText(locked ? t('menu.locked', { hint: t(`skin.${skin.id}.hint`, null, skin.hint) }) : t('menu.costumes', { count }), cx, cy + 62);
    }

    // ------------------------------------------------------------
    // AYARLAR PANELİ
    // ------------------------------------------------------------

    renderSettings(ctx) {
        const S = this.settings;
        if (!S) return;
        const L = SETTINGS_LAYOUT;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 246, 250, 0.8)';
        ctx.fillRect(0, 0, w, h);
        ctx.translate(this.menuOffsetX, this.menuOffsetY);
        ctx.scale(this.menuScale, this.menuScale);

        const height = L.rowTop - L.y + SETTING_ROWS.length * L.rowH + 18;
        candyPanel(ctx, L.x, L.y, L.w, height, 26, THEME.WHITE, { depth: 7, lineWidth: 2.5 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(26, 700);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(t('settings.title'), 300, L.y + 30);

        SETTING_ROWS.forEach((row, i) => {
            const y = L.rowTop + i * L.rowH;
            const cy = y + L.rowH / 2;
            const selected = i === this.settingsRow;
            if (selected) {
                ctx.beginPath();
                ctx.roundRect(L.x + 14, y + 4, L.w - 28, L.rowH - 8, 14);
                ctx.fillStyle = 'rgba(205, 184, 255, 0.45)';
                ctx.fill();
            }
            if (row.type === 'action') {
                ctx.textAlign = 'center';
                ctx.font = font(15, 700);
                ctx.fillStyle = row.id === 'close' ? THEME.PINK_DEEP : THEME.INK;
                ctx.fillText(t(`settings.${row.id}`), 300, cy);
                return;
            }
            ctx.textAlign = 'left';
            ctx.font = font(15, 600);
            ctx.fillStyle = THEME.INK;
            ctx.fillText(t(`settings.${row.id}`), L.x + 30, cy);

            const vx = L.x + L.w - 70;
            if (row.type === 'volume' || row.type === 'choice') {
                ctx.textAlign = 'center';
                ctx.font = font(16, 700);
                ctx.fillStyle = THEME.MUTED;
                ctx.fillText('‹', vx - 46, cy);
                ctx.fillText('›', vx + 46, cy);
                ctx.fillStyle = THEME.PURPLE;
                const snd = this.sound;
                const muted = snd && ((row.id === 'sfxVolume' && !snd.enabled) || (row.id === 'musicVolume' && !snd.bgmEnabled));
                if (muted) {
                    ctx.fillStyle = THEME.PINK_DEEP;
                    ctx.fillText(t(row.id === 'sfxVolume' ? 'settings.mutedSfx' : 'settings.mutedMusic'), vx, cy);
                } else {
                    ctx.fillText(S.display(row.id), vx, cy);
                }
            } else {
                const on = S.get(row.id);
                UIManager.pill(ctx, S.display(row.id), vx, cy, on ? THEME.PINK : THEME.WHITE, on ? THEME.WHITE : THEME.INK, 'center', 12);
            }
        });

        ctx.font = font(11, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.textAlign = 'center';
        ctx.fillText(t('settings.help'), 300, L.y + height - 14);
        ctx.restore();
    }

    // ------------------------------------------------------------
    // OYUN İÇİ
    // ------------------------------------------------------------

    /**
     * HUD: mod, süre, skor, graze, güçlendirmeler ve dash çubuğu
     */
    renderHUD(ctx, elapsedMs, mode = this.currentMode, player = null, pickupManager = null, score = null) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const left = 18 + this.safe.left;
        const right = w - 18 - this.safe.right;

        ctx.save();
        ctx.translate(0, this.safe.top);
        ctx.textBaseline = 'middle';

        // Sol üst: mod ve graze
        UIManager.pill(ctx, mode.label, left, 24, THEME.LAVENDER, THEME.INK, 'left', 11);
        ctx.font = font(12, 600);
        ctx.textAlign = 'left';
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('hud.graze', { n: player ? player.grazeCount : 0 }), left + 2, 50);

        // Orta: süre ve rekor
        ctx.textAlign = 'center';
        ctx.font = font(Math.min(36, w * 0.085), 700);
        outlinedText(ctx, UIManager.formatTime(elapsedMs), w / 2, 42, THEME.INK, THEME.WHITE, 6);
        ctx.font = font(11, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('hud.best', { score: formatScore(this.getBestScore(mode.id)) }), w / 2, 70);

        // Sağ üst: skor ve aktif güçlendirmeler
        UIManager.pill(ctx, `★ ${formatScore(score ? score.total : 0)}`, right, 24, THEME.PINK, THEME.WHITE, 'right', 13);
        let rowY = 54;
        if (player && player.hasShield) {
            UIManager.pill(ctx, t('hud.shield'), right, rowY, THEME.PURPLE, THEME.WHITE, 'right', 10);
            rowY += 24;
        }
        if (pickupManager && pickupManager.isSlowmoActive()) {
            const remaining = (pickupManager.slowmoTimer / 1000).toFixed(1);
            UIManager.pill(ctx, t('hud.slowmo', { s: remaining }), right, rowY, THEME.LAVENDER, THEME.INK, 'right', 10);
        }

        // Alt orta: dash çubuğu (dokunmatikte buton halkası gösterir)
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
            ctx.fillText(isReady ? t('hud.dashReady') : t('hud.dashCharging'), w / 2, barY - 11);
        }

        ctx.restore();
    }

    /**
     * Oyuncunun yanındaki seri göstergesi ve süzülen puan yazıları (dünya koordinatı)
     */
    renderComboAndPopups(ctx, player, score) {
        if (!score) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const p of score.popups) {
            const k = p.age / 700;
            ctx.globalAlpha = 1 - k;
            ctx.font = font(p.big ? 20 : 11 + p.multiplier, 700);
            outlinedText(ctx, p.text, p.x, p.y - 18 - k * 26, p.multiplier > 1 ? THEME.PINK_DEEP : THEME.PURPLE, THEME.WHITE, 3);
        }
        ctx.globalAlpha = 1;

        if (player && player.alive && score.combo >= 2) {
            const x = player.x;
            const y = player.y - 30;
            const label = score.multiplier > 1 ? `x${score.multiplier} · ${score.combo}` : t('hud.combo', { n: score.combo });
            ctx.font = font(11, 700);
            const tw = ctx.measureText(label).width + 16;
            candyPanel(ctx, x - tw / 2, y - 9, tw, 18, 9, score.multiplier > 1 ? THEME.PINK : THEME.WHITE, { lineWidth: 1.5, depth: 2 });
            // Kalan seri süresi
            ctx.fillStyle = score.multiplier > 1 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(205, 184, 255, 0.7)';
            ctx.fillRect(x - tw / 2 + 6, y + 5, (tw - 12) * score.comboRatio, 2);
            ctx.fillStyle = score.multiplier > 1 ? THEME.WHITE : THEME.INK;
            ctx.fillText(label, x, y);
        }
        ctx.restore();
    }

    /** İlk oyun ipucu balonu */
    renderHint(ctx, hint, player = null) {
        if (!hint) return;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const y = h - this.safe.bottom - 120;
        ctx.save();
        // Oyuncu balonun yakınındaysa saydamlaşır, oyunu kapatmaz
        const near = player && Math.abs(player.y - y) < 60;
        ctx.globalAlpha = Math.max(0, hint.alpha) * (near ? 0.25 : 1);
        ctx.font = font(14, 700);
        const tw = Math.min(w - 40, ctx.measureText(hint.text).width + 36);
        candyPanel(ctx, w / 2 - tw / 2, y - 18, tw, 36, 18, THEME.WHITE, { depth: 4, shadow: THEME.PURPLE });
        ctx.fillStyle = THEME.INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`💡 ${hint.text}`, w / 2, y + 1, tw - 20);
        ctx.restore();
    }

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
        ctx.fillText(t('pause.title'), w / 2, h / 2 - 36);

        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.font = font(14, 600);
        ctx.globalAlpha = 0.65 + pulse * 0.35;
        ctx.fillStyle = THEME.INK;
        ctx.fillText(touch ? t('pause.resumeTouch') : t('pause.resume'), w / 2, h / 2 + 2);
        ctx.globalAlpha = 1;

        if (!touch) {
            ctx.font = font(12, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText(t('pause.menu'), w / 2, h / 2 + 28);
        }
        ctx.restore();
    }

    /**
     * Ölüm ekranı
     * @param {object} info { score, waves, unlocked: Skin[] }
     */
    renderDead(ctx, finalTimeMs, mode = this.currentMode, player = null, info = {}) {
        const { score = null, waves = null, unlocked = [], reveal = 1 } = info;
        if (reveal <= 0) return; // Önce ölüm patlaması görünsün
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const cx = w / 2;
        const cy = h / 2;

        ctx.save();
        ctx.globalAlpha = reveal;
        ctx.fillStyle = 'rgba(255, 246, 250, 0.82)';
        ctx.fillRect(0, 0, w, h);
        ctx.translate(0, (1 - reveal) * 24); // Kart hafifçe yukarı kayarak gelir

        const cw = Math.min(360, w - 32);
        candyPanel(ctx, cx - cw / 2, cy - 160, cw, 350, 26, THEME.WHITE, { depth: 7, lineWidth: 2.5 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = font(30, 700);
        ctx.fillStyle = THEME.PINK_SOFT;
        ctx.fillText(t('dead.title'), cx + 2, cy - 122 + 3);
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fillText(t('dead.title'), cx, cy - 122);

        const modeLabel = mode.id === 'daily' ? `${mode.label} · ${dateLabel()}` : mode.label;
        UIManager.pill(ctx, modeLabel, cx, cy - 90, THEME.LAVENDER, THEME.INK, 'center', 11);

        if (this.isNewRecord) {
            const bounce = Math.abs(Math.sin(performance.now() * 0.005)) * 3;
            UIManager.pill(ctx, t('dead.newRecord'), cx, cy - 62 - bounce, THEME.PURPLE, THEME.WHITE, 'center', 13);
        }

        // Skor
        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('dead.score'), cx, cy - 36);
        ctx.font = font(36, 700);
        outlinedText(ctx, formatScore(score ? score.total : 0), cx, cy - 8, THEME.PINK_DEEP, THEME.WHITE, 5);

        // Süre · graze · seri
        const cols = [
            [t('dead.time'), UIManager.formatTime(finalTimeMs)],
            [t('dead.graze'), player ? String(player.grazeCount) : '0'],
            [t('dead.combo'), score ? String(score.bestCombo) : '0']
        ];
        const colW = Math.min(110, (cw - 20) / 3);
        cols.forEach(([label, value], i) => {
            const x = cx + (i - 1) * colW;
            ctx.font = font(11, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText(label, x, cy + 26);
            ctx.font = font(17, 700);
            ctx.fillStyle = THEME.INK;
            ctx.fillText(value, x, cy + 46);
        });

        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(t('dead.best', { score: formatScore(this.getBestScore(mode.id)), time: UIManager.formatTime(this.getHighScore(mode.id)) }), cx, cy + 74);

        let lineY = cy + 96;
        if (waves && waves.boss) {
            ctx.font = font(12, 700);
            const parts = [];
            if (waves.bossKills > 0) parts.push(t('dead.bossKills', { n: waves.bossKills }));
            if (waves.bossActive) parts.push(t('dead.bossHp', { title: waves.boss.title, hp: Math.ceil(waves.boss.hpRatio * 100) }));
            ctx.fillStyle = waves.bossActive ? THEME.PINK_DEEP : THEME.PURPLE_DEEP;
            ctx.fillText(parts.join(' · '), cx, lineY);
            lineY += 20;
        }
        if (unlocked.length) {
            UIManager.pill(ctx, t('dead.unlocked', { names: unlocked.map(s => t(`skin.${s.id}.name`, null, s.name)).join(', ') }), cx, lineY + 2, THEME.PINK, THEME.WHITE, 'center', 12);
        }

        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.font = font(15, 700);
        ctx.globalAlpha = (0.7 + pulse * 0.3) * reveal;
        ctx.fillStyle = THEME.INK;
        ctx.fillText(t('dead.retry'), cx, cy + 146);
        ctx.globalAlpha = reveal;
        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('dead.menu'), cx, cy + 168, cw - 20);

        ctx.restore();
    }
}
