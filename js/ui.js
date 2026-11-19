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

// K2: Ekran oranına göre üç menü yerleşimi; ekrana en büyük ölçekte sığan seçilir.
export const MENU_LAYOUTS = {
    square: {
        name: 'square', W: 600, H: 600,
        settings: { x: 470, y: 14, w: 116, h: 40 },
        title: { x: 300, y: 72, size: 42 },
        pick: { x: 300, y: 108 },
        cards: [
            { id: 'classic', x: 90, y: 118, w: 200, h: 60 }, { id: 'endless', x: 310, y: 118, w: 200, h: 60 },
            { id: 'hardcore', x: 90, y: 188, w: 200, h: 60 }, { id: 'chaos', x: 310, y: 188, w: 200, h: 60 },
            { id: 'daily', x: 90, y: 258, w: 420, h: 48, wide: true }
        ],
        desc: { x: 300, y: 334, maxW: 560 },
        hints: { x: 300, y: 360, gap: 20, maxW: 580 },
        play: { x: 160, y: 396, w: 280, h: 68 },
        skin: { cx: 300, cy: 520, dx: 82, r: 24 }
    },
    wide: {
        name: 'wide', W: 920, H: 470,
        settings: { x: 774, y: 12, w: 132, h: 54 },
        title: { x: 250, y: 64, size: 44 },
        pick: { x: 250, y: 104 },
        cards: [
            { id: 'classic', x: 30, y: 116, w: 212, h: 62 }, { id: 'endless', x: 258, y: 116, w: 212, h: 62 },
            { id: 'hardcore', x: 30, y: 190, w: 212, h: 62 }, { id: 'chaos', x: 258, y: 190, w: 212, h: 62 },
            { id: 'daily', x: 30, y: 264, w: 440, h: 56, wide: true }
        ],
        desc: { x: 250, y: 354, maxW: 450 },
        hints: { x: 250, y: 384, gap: 21, maxW: 460 },
        play: { x: 540, y: 118, w: 300, h: 78 },
        skin: { cx: 690, cy: 290, dx: 104, r: 30 }
    },
    tall: {
        name: 'tall', W: 420, H: 790,
        settings: { x: 286, y: 10, w: 124, h: 50 },
        title: { x: 210, y: 104, size: 40 },
        pick: { x: 210, y: 152 },
        cards: [
            { id: 'classic', x: 10, y: 166, w: 195, h: 66 }, { id: 'endless', x: 215, y: 166, w: 195, h: 66 },
            { id: 'hardcore', x: 10, y: 244, w: 195, h: 66 }, { id: 'chaos', x: 215, y: 244, w: 195, h: 66 },
            { id: 'daily', x: 10, y: 322, w: 400, h: 56, wide: true }
        ],
        desc: { x: 210, y: 404, maxW: 400 },
        hints: { x: 210, y: 434, gap: 21, maxW: 404 },
        play: { x: 40, y: 530, w: 340, h: 78 },
        skin: { cx: 210, cy: 676, dx: 104, r: 28 }
    }
};
const MAX_MENU_SCALE = 1.3;

// K4: klavye odak sırası
export const MENU_FOCUS_ORDER = ['classic', 'endless', 'hardcore', 'chaos', 'daily', 'play', 'skin', 'settings'];

/**
 * Uzun ipucu metnini sıkıştırmadan " · " ayraçlarından bölerek satırlara dağıtır.
 * @returns {number} Çizilen satır sayısı
 */
function drawWrapped(ctx, text, x, y, maxW, gap) {
    const parts = text.split(' · ');
    const lines = [];
    let line = '';
    for (const part of parts) {
        const next = line ? `${line} · ${part}` : part;
        if (line && ctx.measureText(next).width > maxW) {
            lines.push(line);
            line = part;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * gap, maxW));
    return lines.length;
}

/** Kesikli odak çerçevesi */
function focusRing(ctx, x, y, w, h, r) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, w + 12, h + 12, r + 6);
    ctx.strokeStyle = THEME.TEXT_ACCENT;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.restore();
}

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

        // Menü yerleşimi (setLayout seçer) ve klavye odağı
        this.layout = MENU_LAYOUTS.square;
        this.lScale = 1;
        this.lOffX = 0;
        this.lOffY = 0;
        this.focusIndex = -1;
        this.keyboardFocus = false;
    }

    setLayout(width, height, safe = { left: 0, right: 0, top: 0, bottom: 0 }) {
        this.safe = safe;
        this.width = width;
        this.height = height;
        const aw = width - safe.left - safe.right;
        const ah = height - safe.top - safe.bottom;

        // Ayarlar paneli 600x600 alanında çizilir
        this.menuScale = Math.min(1, aw / 600, ah / 600);
        this.menuOffsetX = safe.left + (aw - 600 * this.menuScale) / 2;
        this.menuOffsetY = safe.top + (ah - 600 * this.menuScale) / 2;

        // K2: menü için en büyük ölçeği veren yerleşim
        let best = null;
        for (const L of Object.values(MENU_LAYOUTS)) {
            const sc = Math.min(aw / L.W, ah / L.H, MAX_MENU_SCALE);
            if (!best || sc > best.sc) best = { L, sc };
        }
        this.layout = best.L;
        this.lScale = best.sc;
        this.lOffX = safe.left + (aw - best.L.W * best.sc) / 2;
        this.lOffY = safe.top + (ah - best.L.H * best.sc) / 2;
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
     * Menüde tıklanan öğe (K1: boş alan için null — oyunu başlatmaz)
     * @returns {{type:'mode', id:string}|{type:'play'|'settings'|'skinPrev'|'skinNext'}|null}
     */
    getMenuAction(px, py) {
        const L = this.layout;
        const x = (px - this.lOffX) / this.lScale;
        const y = (py - this.lOffY) / this.lScale;
        const inRect = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        for (const c of L.cards) if (inRect(c)) return { type: 'mode', id: c.id };
        if (inRect(L.settings)) return { type: 'settings' };
        if (inRect(L.play)) return { type: 'play' };
        const s = L.skin;
        if (Math.hypot(x - (s.cx - s.dx), y - s.cy) <= s.r + 10) return { type: 'skinPrev' };
        if (Math.hypot(x - (s.cx + s.dx), y - s.cy) <= s.r + 10) return { type: 'skinNext' };
        return null;
    }

    /** K4: klavye odağını taşır */
    moveFocus(dir) {
        const n = MENU_FOCUS_ORDER.length;
        this.keyboardFocus = true;
        this.focusIndex = this.focusIndex < 0 ? (dir > 0 ? 0 : n - 1) : (this.focusIndex + dir + n) % n;
        return MENU_FOCUS_ORDER[this.focusIndex];
    }

    /** Odaktaki öğe (klavye kullanılmıyorsa null) */
    get focusedItem() {
        return this.keyboardFocus && this.focusIndex >= 0 ? MENU_FOCUS_ORDER[this.focusIndex] : null;
    }

    /**
     * K6: sonuç kartının yerleşimi (çizim ve tıklama aynı hesabı kullanır).
     * Önce yüksekliğe göre ölçeklenir; dar ekranda ölçek yerine kart daralır (en az 260).
     */
    getDeadLayout() {
        const w = this.width || GAME_CONFIG.CANVAS.WIDTH;
        const h = this.height || GAME_CONFIG.CANVAS.HEIGHT;
        const aw = w - this.safe.left - this.safe.right;
        const ah = h - this.safe.top - this.safe.bottom;
        let s = Math.min(ah * 0.94 / 430, 1.3);
        let cw = Math.min(360, aw * 0.92 / s);
        if (cw < 260) { s = aw * 0.92 / 260; cw = 260; }
        const rbw = Math.min(250, cw - 30);
        return {
            cx: this.safe.left + aw / 2,
            cy: this.safe.top + ah / 2,
            s,
            cw,
            retry: { x: -rbw / 2, y: 122, w: rbw, h: 54 }
        };
    }

    /** K6: sonuç ekranında nokta "tekrar oyna" butonunun üstünde mi? */
    hitsRetry(px, py) {
        const L = this.getDeadLayout();
        const x = (px - L.cx) / L.s;
        const y = (py - L.cy) / L.s;
        const r = L.retry;
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
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
        const L = this.layout;
        const now = performance.now() / 1000;
        const focus = this.focusedItem;

        ctx.save();
        ctx.translate(this.lOffX, this.lOffY);
        ctx.scale(this.lScale, this.lScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';

        // Ayarlar butonu
        const sb = L.settings;
        candyPanel(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2, THEME.WHITE, { depth: 3, lineWidth: 2 });
        ctx.font = font(15, 700);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(t('menu.settings'), sb.x + sb.w / 2, sb.y + sb.h / 2 + 1);
        if (focus === 'settings') focusRing(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2);

        // Başlık
        const ti = L.title;
        const titleY = ti.y + Math.sin(now * 2) * 2;
        ctx.font = font(ti.size, 700);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = THEME.PINK;
        ctx.fillText('BULLET HELL', ti.x + 3, titleY + 4);
        outlinedText(ctx, 'BULLET HELL', ti.x, titleY, THEME.INK, THEME.WHITE, 6);
        const titleW = ctx.measureText('BULLET HELL').width;
        ctx.save();
        ctx.translate(ti.x + titleW / 2 - 18, titleY + 14);
        ctx.rotate(-0.08);
        UIManager.pill(ctx, 'micro', 0, 0, THEME.PINK, THEME.INK, 'center', 14);
        ctx.restore();

        ctx.textBaseline = 'middle';
        ctx.font = font(14, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('menu.pickMode'), L.pick.x, L.pick.y);

        // Mod kartları (K3: pembe seçili kartta koyu metin + ✓)
        for (const c of L.cards) {
            const selected = c.id === activeModeId;
            const y = c.y + (selected ? -2 : 0);
            candyPanel(ctx, c.x, y, c.w, c.h, 18, selected ? THEME.PINK : THEME.WHITE, { depth: selected ? 6 : 4, lineWidth: 2 });
            const best = t('menu.best', { score: formatScore(this.getBestScore(c.id)) });
            const label = ModeRegistry.get(c.id).label;
            if (c.wide) {
                ctx.textAlign = 'left';
                ctx.font = font(18, 700);
                ctx.fillStyle = THEME.INK;
                ctx.fillText(`☀ ${label} · ${dateLabel()}`, c.x + 20, y + c.h / 2 + 1, c.w * 0.62);
                ctx.textAlign = 'right';
                ctx.font = font(13, 600);
                ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
                ctx.fillText(best, c.x + c.w - 20, y + c.h / 2 + 1, c.w * 0.34);
                ctx.textAlign = 'center';
            } else {
                ctx.font = font(19, 700);
                ctx.fillStyle = THEME.INK;
                ctx.fillText(label, c.x + c.w / 2, y + c.h / 2 - 9, c.w - 16);
                ctx.font = font(13, 600);
                ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
                ctx.fillText(best, c.x + c.w / 2, y + c.h / 2 + 14, c.w - 16);
            }
            if (selected) {
                ctx.font = font(14, 700);
                ctx.fillStyle = THEME.INK;
                ctx.fillText('✓', c.x + c.w - 16, y + 14);
            }
            if (focus === c.id) focusRing(ctx, c.x, c.y, c.w, c.h, 18);
        }

        // Açıklama ve kontrol ipuçları
        const activeMode = ModeRegistry.get(activeModeId);
        ctx.font = font(15, 600);
        ctx.fillStyle = THEME.INK;
        ctx.fillText(activeMode.description, L.desc.x, L.desc.y, L.desc.maxW);
        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;
        const used = drawWrapped(ctx, t('menu.controls1'), L.hints.x, L.hints.y, L.hints.maxW, L.hints.gap);
        drawWrapped(ctx, t('menu.controls2'), L.hints.x, L.hints.y + used * L.hints.gap, L.hints.maxW, L.hints.gap);

        // OYNA
        const pb = L.play;
        const bob = Math.sin(now * 3) * 2;
        candyPanel(ctx, pb.x, pb.y + bob, pb.w, pb.h, pb.h / 2, THEME.PURPLE, { depth: 6, lineWidth: 2.5 });
        ctx.beginPath();
        ctx.roundRect(pb.x + 20, pb.y + bob + 9, pb.w - 40, 8, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fill();
        ctx.font = font(24, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.fillText(t('menu.play', { mode: activeMode.label }), pb.x + pb.w / 2, pb.y + bob + pb.h / 2 + 2, pb.w - 30);
        if (focus === 'play') focusRing(ctx, pb.x, pb.y, pb.w, pb.h, pb.h / 2);

        this.renderSkinPicker(ctx, now, L, focus === 'skin');

        ctx.restore();

        if (this.settingsOpen) this.renderSettings(ctx);
    }

    renderSkinPicker(ctx, time, L = this.layout, focused = false) {
        if (!this.progress) return;
        const s = L.skin;
        const skin = SKINS[this.skinIndex] || SKINS[0];
        const locked = !this.progress.isUnlocked(skin.id);

        UIManager.roundButton(ctx, s.cx - s.dx, s.cy, s.r, '‹');
        UIManager.roundButton(ctx, s.cx + s.dx, s.cy, s.r, '›');

        const blink = (time % 3.2) < 0.12 ? 0.25 : 1;
        drawMarshmallow(ctx, s.cx, s.cy - 4 + Math.sin(time * 2.4) * 2, s.r, skin, { locked, blink, squash: 1 + Math.sin(time * 5) * 0.03 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(16, 700);
        ctx.fillStyle = locked ? THEME.MUTED : THEME.INK;
        const count = `${this.progress.unlocked.length}/${SKINS.length}`;
        ctx.fillText(`${t(`skin.${skin.id}.name`, null, skin.name)}${this.progress.selected === skin.id ? ' ✓' : ''}`, s.cx, s.cy + s.r + 22);
        ctx.font = font(13, 600);
        ctx.fillStyle = locked ? THEME.TEXT_ACCENT : THEME.MUTED;
        ctx.fillText(locked ? `🔒 ${t('menu.locked', { hint: t(`skin.${skin.id}.hint`, null, skin.hint) })}` : t('menu.costumes', { count }), s.cx, s.cy + s.r + 42, L.W - 20);
        if (focused) focusRing(ctx, s.cx - s.dx - s.r, s.cy - s.r, s.dx * 2 + s.r * 2, s.r * 2, s.r);
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
                ctx.fillStyle = row.id === 'close' ? THEME.TEXT_ACCENT : THEME.INK;
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
                ctx.fillStyle = THEME.TEXT_PRIMARY;
                const snd = this.sound;
                const muted = snd && ((row.id === 'sfxVolume' && !snd.enabled) || (row.id === 'musicVolume' && !snd.bgmEnabled));
                if (muted) {
                    ctx.fillStyle = THEME.TEXT_ACCENT;
                    ctx.fillText(t(row.id === 'sfxVolume' ? 'settings.mutedSfx' : 'settings.mutedMusic'), vx, cy);
                } else {
                    ctx.fillText(S.display(row.id), vx, cy);
                }
            } else {
                const on = S.get(row.id);
                UIManager.pill(ctx, S.display(row.id), vx, cy, on ? THEME.PINK : THEME.WHITE, THEME.INK, 'center', 12);
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
        UIManager.pill(ctx, `★ ${formatScore(score ? score.total : 0)}`, right, 24, THEME.PINK, THEME.INK, 'right', 13);
        let rowY = 54;
        if (player && player.hasShield) {
            UIManager.pill(ctx, t('hud.shield'), right, rowY, THEME.TEXT_PRIMARY, THEME.WHITE, 'right', 10);
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
            ctx.fillStyle = isReady ? THEME.TEXT_ACCENT : THEME.MUTED;
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
            ctx.fillStyle = THEME.INK;
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
     * @param {object} info { score, waves, unlocked: Skin[], reveal, cause, bossTitle }
     */
    renderDead(ctx, finalTimeMs, mode = this.currentMode, player = null, info = {}) {
        const { score = null, waves = null, unlocked = [], reveal = 1, cause = 'bullet', bossTitle = '' } = info;
        if (reveal <= 0) return; // Önce ölüm patlaması görünsün
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const D = this.getDeadLayout();
        const cw = D.cw;

        ctx.save();
        ctx.globalAlpha = reveal;
        ctx.fillStyle = 'rgba(255, 246, 250, 0.85)';
        ctx.fillRect(0, 0, w, h);
        ctx.translate(D.cx, D.cy + (1 - reveal) * 24); // Kart hafifçe yukarı kayarak gelir
        ctx.scale(D.s, D.s);

        candyPanel(ctx, -cw / 2, -205, cw, 410, 26, THEME.WHITE, { depth: 7, lineWidth: 2.5 });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = font(30, 700);
        ctx.fillStyle = THEME.PINK_SOFT;
        ctx.fillText(t('dead.title'), 2, -170);
        ctx.fillStyle = THEME.TEXT_ACCENT;
        ctx.fillText(t('dead.title'), 0, -172);

        const modeLabel = mode.id === 'daily' ? `${mode.label} · ${dateLabel()}` : mode.label;
        UIManager.pill(ctx, modeLabel, 0, -138, THEME.LAVENDER, THEME.INK, 'center', 12);

        // K5: ölüm nedeni
        UIManager.pill(ctx, t(`dead.cause.${cause}`, { boss: bossTitle }), 0, -108, THEME.PINK_SOFT, THEME.INK, 'center', 13);

        if (this.isNewRecord) {
            const bounce = Math.abs(Math.sin(performance.now() * 0.005)) * 3;
            UIManager.pill(ctx, t('dead.newRecord'), 0, -78 - bounce, THEME.TEXT_PRIMARY, THEME.WHITE, 'center', 13);
        }

        // Skor
        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('dead.score'), 0, -50);
        ctx.font = font(38, 700);
        outlinedText(ctx, formatScore(score ? score.total : 0), 0, -20, THEME.TEXT_ACCENT, THEME.WHITE, 5);

        // Süre · graze · seri
        const cols = [
            [t('dead.time'), UIManager.formatTime(finalTimeMs)],
            [t('dead.graze'), player ? String(player.grazeCount) : '0'],
            [t('dead.combo'), score ? String(score.bestCombo) : '0']
        ];
        const colGap = Math.min(112, (cw - 24) / 3);
        cols.forEach(([label, value], i) => {
            const x = (i - 1) * colGap;
            ctx.font = font(13, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText(label, x, 18, colGap - 4);
            ctx.font = font(18, 700);
            ctx.fillStyle = THEME.INK;
            ctx.fillText(value, x, 40, colGap - 4);
        });

        ctx.font = font(13, 700);
        ctx.fillStyle = THEME.TEXT_PRIMARY;
        ctx.fillText(t('dead.best', { score: formatScore(this.getBestScore(mode.id)), time: UIManager.formatTime(this.getHighScore(mode.id)) }), 0, 68, cw - 24);

        let lineY = 92;
        if (waves && waves.boss) {
            const parts = [];
            if (waves.bossKills > 0) parts.push(t('dead.bossKills', { n: waves.bossKills }));
            if (waves.bossActive) parts.push(t('dead.bossHp', { title: waves.boss.title, hp: Math.ceil(waves.boss.hpRatio * 100) }));
            ctx.font = font(13, 700);
            ctx.fillStyle = waves.bossActive ? THEME.TEXT_ACCENT : THEME.TEXT_PRIMARY;
            ctx.fillText(parts.join(' · '), 0, lineY, cw - 24);
            lineY += 22;
        }
        if (unlocked.length) {
            UIManager.pill(ctx, t('dead.unlocked', { names: unlocked.map(k => t(`skin.${k.id}.name`, null, k.name)).join(', ') }), 0, lineY, THEME.PINK, THEME.INK, 'center', 12);
        }

        // K6: açık "tekrar oyna" butonu (sadece bu buton, Enter ve Space yeniden başlatır)
        const rb = D.retry;
        candyPanel(ctx, rb.x, rb.y, rb.w, rb.h, rb.h / 2, THEME.PURPLE, { depth: 5, lineWidth: 2.5 });
        ctx.font = font(21, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.fillText(t('dead.retryBtn'), 0, rb.y + rb.h / 2 + 1, rb.w - 20);

        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('dead.menu'), 0, 194, cw - 24);

        ctx.restore();
    }
}
