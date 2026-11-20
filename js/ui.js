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
import { t, upper } from './i18n.js';

const SETTINGS_LAYOUT = { x: 110, y: 104, w: 380, rowTop: 160, rowH: 42 };

// K2: Ekran oranına göre üç menü yerleşimi; ekrana en büyük ölçekte sığan seçilir.
export const MENU_LAYOUTS = {
    square: {
        name: 'square', W: 600, H: 600,
        settings: { x: 542, y: 12, w: 44, h: 44 },   // Sağ üst yuvarlak çark ("i"nin aynası)
        candies: { x: 300, y: 21, size: 13 },          // Şeker bakiyesi: üstte ortada (başlığa değmez)
        info: { cx: 36, cy: 34, r: 22 },
        title: { x: 300, y: 72, size: 42 },
        pick: { x: 300, y: 108 },
        cards: [
            { id: 'classic', x: 90, y: 118, w: 200, h: 60 }, { id: 'endless', x: 310, y: 118, w: 200, h: 60 },
            { id: 'hardcore', x: 90, y: 188, w: 200, h: 60 }, { id: 'chaos', x: 310, y: 188, w: 200, h: 60 },
            { id: 'daily', x: 90, y: 258, w: 420, h: 48, wide: true }
        ],
        desc: { x: 300, y: 334, maxW: 560 },
        play: { x: 160, y: 396, w: 280, h: 68 },
        skin: { cx: 300, cy: 504, dx: 82, r: 24 }
    },
    wide: {
        name: 'wide', W: 920, H: 470,
        settings: { x: 850, y: 12, w: 56, h: 56 },
        candies: { x: 460, y: 40 },
        info: { cx: 42, cy: 40, r: 28 },
        title: { x: 250, y: 64, size: 44 },
        pick: { x: 250, y: 104 },
        cards: [
            { id: 'classic', x: 30, y: 116, w: 212, h: 62 }, { id: 'endless', x: 258, y: 116, w: 212, h: 62 },
            { id: 'hardcore', x: 30, y: 190, w: 212, h: 62 }, { id: 'chaos', x: 258, y: 190, w: 212, h: 62 },
            { id: 'daily', x: 30, y: 264, w: 440, h: 56, wide: true }
        ],
        desc: { x: 250, y: 354, maxW: 450 },
        play: { x: 540, y: 118, w: 300, h: 78 },
        skin: { cx: 690, cy: 290, dx: 104, r: 30 }
    },
    tall: {
        name: 'tall', W: 420, H: 790,
        settings: { x: 359, y: 10, w: 50, h: 50 },
        candies: { x: 210, y: 35 },
        info: { cx: 36, cy: 35, r: 25 },
        title: { x: 210, y: 100, size: 40 },
        pick: { x: 210, y: 146 },
        // Telefon: kenarlardan 22, kartlar arası 14 boşluk; dokunması ve okuması rahat
        cards: [
            { id: 'classic', x: 22, y: 164, w: 181, h: 70 }, { id: 'endless', x: 217, y: 164, w: 181, h: 70 },
            { id: 'hardcore', x: 22, y: 248, w: 181, h: 70 }, { id: 'chaos', x: 217, y: 248, w: 181, h: 70 },
            { id: 'daily', x: 22, y: 332, w: 376, h: 60, wide: true }
        ],
        desc: { x: 210, y: 424, maxW: 376 },
        play: { x: 40, y: 484, w: 340, h: 78 },
        skin: { cx: 210, cy: 662, dx: 104, r: 28 },
        textScale: 1.15
    }
};
const MAX_MENU_SCALE = 1.3;

// K4: klavye odak sırası
export const MENU_FOCUS_ORDER = ['info', 'classic', 'endless', 'hardcore', 'chaos', 'daily', 'play', 'skin', 'settings'];

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

/** Metni kelimelerden bölerek satırlara ayırır */
function wrapWords(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxW) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/** Dört köşeli minik ışıltı (sersemleme yıldızları) */
function drawSparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
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
        if (Math.hypot(x - L.info.cx, y - L.info.cy) <= L.info.r + 8) return { type: 'info' };
        if (inRect(L.play)) return { type: 'play' };
        const s = L.skin;
        const buy = this.getBuyRect(L);
        if (buy && inRect(buy)) return { type: 'buy' };
        if (Math.hypot(x - (s.cx - s.dx), y - s.cy) <= s.r + 10) return { type: 'skinPrev' };
        if (Math.hypot(x - (s.cx + s.dx), y - s.cy) <= s.r + 10) return { type: 'skinNext' };
        return null;
    }

    /**
     * Seçicideki kostüm şekerle alınabiliyorsa satın alma butonunun alanı (menü koordinatı)
     */
    getBuyRect(L = this.layout) {
        if (!this.progress) return null;
        const skin = SKINS[this.skinIndex];
        if (!skin || !this.progress.isForSale(skin.id)) return null;
        const s = L.skin;
        return { x: s.cx - 92, y: s.cy + s.r + 32, w: 184, h: 38 };
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
        // Kart ekranı kaplar: telefonda neredeyse tam ekran, büyük ekranda ortada sınırlı
        const MIN_W = 270;
        const MIN_H = 500;
        const s = Math.min(1.25, aw * 0.94 / MIN_W, ah * 0.95 / MIN_H);
        const cw = Math.min(400, aw * 0.94 / s);
        const ch = Math.min(620, ah * 0.95 / s);
        const top = -ch / 2;
        const pad = 18;
        const rowH = 46;
        const rowY = ch / 2 - 20 - rowH;
        const half = (cw - pad * 2 - 12) / 2;
        const retryH = 58;
        return {
            cx: this.safe.left + aw / 2,
            cy: this.safe.top + ah / 2,
            s,
            cw,
            ch,
            top,
            headerH: 121,
            retry: { x: -cw / 2 + pad, y: rowY - 14 - retryH, w: cw - pad * 2, h: retryH },
            menu: { x: -cw / 2 + pad, y: rowY, w: half, h: rowH },
            share: { x: -cw / 2 + pad + half + 12, y: rowY, w: half, h: rowH },
            info: { cx: cw / 2 - 28, cy: top + 28, r: 20 }  // Başlık bandının sağ üst köşesinde, ekrandan taşmaz
        };
    }

    /** Dizzy stars circling the result-card marshmallow (card coordinates, y relative to the marshmallow) */
    deadStars(now) {
        const out = [];
        for (let i = 0; i < 3; i++) {
            const a = now * 2.4 + (i * Math.PI * 2) / 3;
            const depth = 0.75 + Math.sin(a) * 0.25;
            out.push({ x: Math.cos(a) * 30, y: -16 + Math.sin(a) * 7, r: 4.5 * depth });
        }
        return out;
    }

    /** Vertical slide of the result card while it fades in (logical units) */
    deadSlide(reveal) {
        return (1 - reveal) * 24;
    }

    /** Result card body (below the header band) in arena coordinates, for masking the backdrop */
    getDeadBodyRect(reveal = 1) {
        const D = this.getDeadLayout();
        const x = D.cx + (-D.cw / 2 + 1.25) * D.s;
        const y = D.cy + this.deadSlide(reveal) + (D.top + D.headerH) * D.s;
        return { x, y, w: (D.cw - 2.5) * D.s, h: (D.ch - D.headerH - 1.25) * D.s, r: 25 * D.s };
    }

    /** Sonuç kartında dokunulan eylem: 'info' | 'retry' | 'menu' | 'share' | null */
    deadAction(px, py) {
        const L = this.getDeadLayout();
        const x = (px - L.cx) / L.s;
        const y = (py - L.cy) / L.s;
        if (Math.hypot(x - L.info.cx, y - L.info.cy) <= L.info.r + 8) return 'info';
        const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        if (inside(L.retry)) return 'retry';
        if (inside(L.menu)) return 'menu';
        if (inside(L.share)) return 'share';
        return null;
    }

    /** Sonuç kartındaki "i" butonuna mı dokunuldu? */
    hitsDeadInfo(px, py) {
        const L = this.getDeadLayout();
        const x = (px - L.cx) / L.s;
        const y = (py - L.cy) / L.s;
        return Math.hypot(x - L.info.cx, y - L.info.cy) <= L.info.r + 8;
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
        ctx.fillStyle = THEME.SURFACE;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
        ctx.font = font(r, 700);
        ctx.fillStyle = THEME.TEXT;
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

        // Ayarlar: "i" butonunun aynası, sağ üstte yuvarlak çark
        const sb = L.settings;
        UIManager.roundButton(ctx, sb.x + sb.w / 2, sb.y + sb.h / 2, sb.w / 2, '⚙');
        if (focus === 'settings') focusRing(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2);

        // Şeker bakiyesi: üstte ortada
        if (this.progress) {
            UIManager.pill(ctx, `🍬 ${formatScore(this.progress.candies)}`, L.candies.x, L.candies.y, THEME.SURFACE, THEME.TEXT, 'center', L.candies.size || 15);
        }

        // Bilgi butonu (nasıl oynanır)
        UIManager.roundButton(ctx, L.info.cx, L.info.cy, L.info.r, 'i');
        if (focus === 'info') focusRing(ctx, L.info.cx - L.info.r, L.info.cy - L.info.r, L.info.r * 2, L.info.r * 2, L.info.r);

        // Title (the renderer draws it as its own sprite when menuSplit is on)
        if (!this.menuSplit) this.drawMenuTitle(ctx, L, Math.sin(now * 2) * 2);

        ctx.textBaseline = 'middle';
        const fs = L.textScale || 1; // Telefonda kart yazıları biraz daha büyük
        ctx.font = font(14 * fs, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('menu.pickMode'), L.pick.x, L.pick.y);

        // Mod kartları (K3: pembe seçili kartta koyu metin + ✓)
        for (const c of L.cards) {
            const selected = c.id === activeModeId;
            const y = c.y + (selected ? -2 : 0);
            candyPanel(ctx, c.x, y, c.w, c.h, 18, selected ? THEME.PINK : THEME.SURFACE, { depth: selected ? 6 : 4, lineWidth: 2 });
            const best = t('menu.best', { score: formatScore(this.getBestScore(c.id)) });
            const label = ModeRegistry.get(c.id).label;
            if (c.wide) {
                ctx.textAlign = 'left';
                ctx.font = font(18 * fs, 700);
                ctx.fillStyle = selected ? THEME.INK : THEME.TEXT;
                ctx.fillText(`☀ ${label} · ${dateLabel()}`, c.x + 20, y + c.h / 2 + 1, c.w * 0.62);
                ctx.textAlign = 'right';
                ctx.font = font(13 * fs, 600);
                ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
                ctx.fillText(best, c.x + c.w - 20, y + c.h / 2 + 1, c.w * 0.34);
                ctx.textAlign = 'center';
            } else {
                ctx.font = font(19 * fs, 700);
                ctx.fillStyle = selected ? THEME.INK : THEME.TEXT;
                ctx.fillText(label, c.x + c.w / 2, y + c.h / 2 - 10 * fs, c.w - 16);
                ctx.font = font(13 * fs, 600);
                ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
                ctx.fillText(best, c.x + c.w / 2, y + c.h / 2 + 14 * fs, c.w - 16);
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
        ctx.fillStyle = THEME.TEXT;
        ctx.fillText(activeMode.description, L.desc.x, L.desc.y, L.desc.maxW);
        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;

        // PLAY button (own sprite when menuSplit is on)
        if (!this.menuSplit) this.drawMenuPlay(ctx, L, activeMode, Math.sin(now * 3) * 2, focus === 'play');

        this.renderSkinPicker(ctx, now, L, focus === 'skin');

        ctx.restore();

        if (this.settingsOpen) this.renderSettings(ctx);
        if (this.infoOpen) this.renderInfo(ctx);
    }

    /**
     * "Nasıl oynanır" paneli: cihaza göre kontroller, kurallar ve (masaüstünde) kısayollar
     */
    renderInfo(ctx) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const touch = !!this.touch;
        const rows = [
            ['🕹️', t('info.move.title'), t(touch ? 'info.move.touch' : 'info.move.mouse')],
            ['✨', t('info.dash.title'), t(touch ? 'info.dash.touch' : 'info.dash.mouse')],
            ['🍬', t('info.graze.title'), t('info.graze.text')],
            ['🧱', t('info.edge.title'), t('info.edge.text')],
            ['👑', t('info.boss.title'), t('info.boss.text')]
        ];
        rows.push(['😖', t('info.sour.title'), t('info.sour.text')]);
        rows.push(['🍭', t('info.candy.title'), t('info.candy.text')]);
        if (!touch) rows.push(['⌨️', t('info.keys.title'), t('info.keys.text')]);

        const aw = w - this.safe.left - this.safe.right;
        const ah = h - this.safe.top - this.safe.bottom;
        // Dar ekranda paneli küçültmek yerine daralt (yazı büyük kalsın)
        let s = 1.15;
        let PW = Math.min(400, aw * 0.94 / s);
        if (PW < 300) { PW = 300; s = aw * 0.94 / PW; }
        const textX = -PW / 2 + 64;
        const textW = PW - 84;
        // Satırları önce ölç (yükseklik metne göre)
        ctx.save();
        ctx.font = font(13, 500);
        const wrapped = rows.map(([, , text]) => wrapWords(ctx, text, textW));
        ctx.restore();
        const rowHeights = wrapped.map(lines => 24 + lines.length * 18);
        const PH = 74 + rowHeights.reduce((a, b) => a + b, 0) + 34;
        s = Math.min(s, ah * 0.94 / PH);

        ctx.save();
        ctx.fillStyle = `rgba(${THEME.SCRIM}, 0.85)`;
        ctx.fillRect(0, 0, w, h);
        ctx.translate(this.safe.left + aw / 2, this.safe.top + ah / 2);
        ctx.scale(s, s);
        candyPanel(ctx, -PW / 2, -PH / 2, PW, PH, 26, THEME.SURFACE, { depth: 7, lineWidth: 2.5 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(26, 700);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(t('info.title'), 0, -PH / 2 + 36);

        let y = -PH / 2 + 74;
        rows.forEach(([icon, title, ], i) => {
            ctx.textAlign = 'center';
            ctx.font = font(20, 600);
            ctx.fillText(icon, -PW / 2 + 34, y + 10);
            ctx.textAlign = 'left';
            ctx.font = font(15, 700);
            ctx.fillStyle = THEME.TEXT;
            ctx.fillText(title, textX, y + 8);
            ctx.font = font(13, 500);
            ctx.fillStyle = THEME.MUTED;
            wrapped[i].forEach((line, j) => ctx.fillText(line, textX, y + 28 + j * 18, textW));
            y += rowHeights[i];
        });

        ctx.textAlign = 'center';
        ctx.font = font(12, 600);
        ctx.fillStyle = THEME.TEXT_PRIMARY;
        ctx.fillText(t(touch ? 'info.closeTouch' : 'info.close'), 0, PH / 2 - 20);
        ctx.restore();
    }

    /** Menu title "BULLET HELL" + "micro" pill, in menu (layout) coordinates */
    drawMenuTitle(ctx, L, bob = 0) {
        const ti = L.title;
        const titleY = ti.y + bob;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = font(ti.size, 700);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = THEME.PINK;
        ctx.fillText('BULLET HELL', ti.x + 3, titleY + 4);
        outlinedText(ctx, 'BULLET HELL', ti.x, titleY, THEME.TEXT, THEME.TEXT_HALO, 6);
        const titleW = ctx.measureText('BULLET HELL').width;
        ctx.translate(ti.x + titleW / 2 - 18, titleY + 14);
        ctx.rotate(-0.08);
        UIManager.pill(ctx, 'micro', 0, 0, THEME.PINK, THEME.INK, 'center', 14);
        ctx.restore();
    }

    /** PLAY button with its gloss stripe and focus ring, in menu (layout) coordinates */
    drawMenuPlay(ctx, L, activeMode, bob = 0, focused = false) {
        const pb = L.play;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        candyPanel(ctx, pb.x, pb.y + bob, pb.w, pb.h, pb.h / 2, THEME.PURPLE, { depth: 6, lineWidth: 2.5 });
        ctx.beginPath();
        ctx.roundRect(pb.x + 20, pb.y + bob + 9, pb.w - 40, 8, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fill();
        ctx.font = font(24, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.fillText(t('menu.play', { mode: activeMode.label }), pb.x + pb.w / 2, pb.y + bob + pb.h / 2 + 2, pb.w - 30);
        if (focused) focusRing(ctx, pb.x, pb.y, pb.w, pb.h, pb.h / 2);
        ctx.restore();
    }

    /** Costume marshmallow of the skin picker at rest (no bob / squash), in menu coordinates */
    drawMenuSkinBody(ctx, L, blink = 1) {
        if (!this.progress) return;
        const s = L.skin;
        const skin = SKINS[this.skinIndex] || SKINS[0];
        const locked = !this.progress.isUnlocked(skin.id);
        const forSale = this.progress.isForSale(skin.id);
        drawMarshmallow(ctx, s.cx, s.cy - 4, s.r, skin, { locked: locked && !forSale, blink, squash: 1 });
    }

    /** Applies the menu layout transform (offset + scale) */
    applyMenuTransform(ctx) {
        ctx.translate(this.lOffX, this.lOffY);
        ctx.scale(this.lScale, this.lScale);
    }

    renderSkinPicker(ctx, time, L = this.layout, focused = false) {
        if (!this.progress) return;
        const s = L.skin;
        const skin = SKINS[this.skinIndex] || SKINS[0];
        const locked = !this.progress.isUnlocked(skin.id);

        UIManager.roundButton(ctx, s.cx - s.dx, s.cy, s.r, '‹');
        UIManager.roundButton(ctx, s.cx + s.dx, s.cy, s.r, '›');

        const blink = (time % 3.2) < 0.12 ? 0.25 : 1;
        // Satılık kostüm görünür (ne aldığını gör); başarım kostümü kilitli sürpriz kalır
        const forSale = this.progress.isForSale(skin.id);
        if (!this.menuSplit) drawMarshmallow(ctx, s.cx, s.cy - 4 + Math.sin(time * 2.4) * 2, s.r, skin, { locked: locked && !forSale, blink, squash: 1 + Math.sin(time * 5) * 0.03 });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(16, 700);
        ctx.fillStyle = locked ? THEME.MUTED : THEME.TEXT;
        const count = `${this.progress.unlocked.length}/${SKINS.length}`;
        ctx.fillText(`${t(`skin.${skin.id}.name`, null, skin.name)}${this.progress.selected === skin.id ? ' ✓' : ''}`, s.cx, s.cy + s.r + 22);
        const buy = this.getBuyRect(L);
        const flash = this.shopFlash && this.shopFlash.id === skin.id && performance.now() < this.shopFlash.until;
        if (flash) {
            // Satın alındı geri bildirimi butonun yerinde
            ctx.font = font(16, 700);
            ctx.fillStyle = THEME.TEXT_PRIMARY;
            ctx.fillText(`✨ ${this.shopFlash.text}`, s.cx, s.cy + s.r + 51, L.W - 20);
        } else if (buy) {
            // Şekerle alınabilir: iki dokunuşlu satın alma butonu
            const price = skin.price;
            const have = this.progress.candies;
            const confirming = this.buyConfirm && this.buyConfirm.id === skin.id && performance.now() < this.buyConfirm.until;
            let fill = THEME.SURFACE;
            let color = THEME.MUTED;
            let label = t('shop.need', { price, need: price - have });
            if (confirming) { fill = THEME.PURPLE_DEEP; color = THEME.WHITE; label = t('shop.confirm', { price }); }
            else if (have >= price) { fill = THEME.PINK; color = THEME.INK; label = t('shop.buy', { price }); }
            const shake = this.buyShakeUntil && performance.now() < this.buyShakeUntil ? Math.sin(performance.now() * 0.06) * 5 : 0;
            candyPanel(ctx, buy.x + shake, buy.y, buy.w, buy.h, buy.h / 2, fill, { depth: 4, lineWidth: 2 });
            ctx.font = font(15, 700);
            ctx.fillStyle = color;
            ctx.fillText(label, buy.x + shake + buy.w / 2, buy.y + buy.h / 2 + 1, buy.w - 16);
        } else {
            ctx.font = font(13, 600);
            ctx.fillStyle = locked ? THEME.TEXT_ACCENT : THEME.MUTED;
            ctx.fillText(locked ? `🔒 ${t('menu.locked', { hint: t(`skin.${skin.id}.hint`, null, skin.hint) })}` : t('menu.costumes', { count }), s.cx, s.cy + s.r + 42, L.W - 20);
        }
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
        ctx.fillStyle = `rgba(${THEME.SCRIM}, 0.8)`;
        ctx.fillRect(0, 0, w, h);
        ctx.translate(this.menuOffsetX, this.menuOffsetY);
        ctx.scale(this.menuScale, this.menuScale);

        const height = L.rowTop - L.y + SETTING_ROWS.length * L.rowH + 18;
        candyPanel(ctx, L.x, L.y, L.w, height, 26, THEME.SURFACE, { depth: 7, lineWidth: 2.5 });

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
                ctx.fillStyle = THEME.ROW_HIGHLIGHT;
                ctx.fill();
            }
            if (row.type === 'action') {
                ctx.textAlign = 'center';
                ctx.font = font(15, 700);
                ctx.fillStyle = row.id === 'close' ? THEME.TEXT_ACCENT : THEME.TEXT;
                ctx.fillText(t(`settings.${row.id}`), 300, cy);
                return;
            }
            ctx.textAlign = 'left';
            ctx.font = font(15, 600);
            ctx.fillStyle = THEME.TEXT;
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
                UIManager.pill(ctx, S.display(row.id), vx, cy, on ? THEME.PINK : THEME.SURFACE, on ? THEME.INK : THEME.TEXT, 'center', 12);
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
    /**
     * @param {boolean} compact Dokunmatik şerit açıkken süre ve puan şeritte gösterilir; tuvalde tekrar edilmez
     */
    renderHUD(ctx, elapsedMs, mode = this.currentMode, player = null, pickupManager = null, score = null, compact = false, runCandies = 0) {
        this.renderHudLeft(ctx, mode, player, runCandies);
        if (!compact) this.renderHudCenter(ctx, elapsedMs, mode);
        this.renderHudRight(ctx, player, pickupManager, score, compact);
        this.renderHudDash(ctx, player);
    }

    /** HUD top-left: mode pill, graze count, candies collected this run */
    renderHudLeft(ctx, mode, player, runCandies = 0) {
        const left = 18 + this.safe.left;
        ctx.save();
        ctx.translate(0, this.safe.top);
        ctx.textBaseline = 'middle';
        UIManager.pill(ctx, mode.label, left, 24, THEME.LAVENDER, THEME.INK, 'left', 11);
        ctx.font = font(12, 600);
        ctx.textAlign = 'left';
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('hud.graze', { n: player ? player.grazeCount : 0 }), left + 2, 50);
        if (runCandies > 0) {
            ctx.font = font(13, 700);
            ctx.fillStyle = THEME.TEXT_ACCENT;
            ctx.fillText(t('hud.candies', { n: formatScore(runCandies) }), left + 2, 70);
        }
        ctx.restore();
    }

    /** HUD top-centre: run time and best score (hidden when the touch bar shows the time) */
    renderHudCenter(ctx, elapsedMs, mode, opts = {}) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        ctx.save();
        ctx.translate(0, this.safe.top);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        if (!opts.skipTime) {
            ctx.font = font(Math.min(36, w * 0.085), 700);
            outlinedText(ctx, UIManager.formatTime(elapsedMs), w / 2, 42, THEME.TEXT, THEME.TEXT_HALO, 6);
        }
        ctx.font = font(11, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(t('hud.best', { score: formatScore(this.getBestScore(mode.id)) }), w / 2, 70);
        ctx.restore();
    }

    /** HUD top-right: score and active power-up / sour candy timers */
    renderHudRight(ctx, player, pickupManager, score, compact = false, opts = {}) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const right = w - 18 - this.safe.right;
        ctx.save();
        ctx.translate(0, this.safe.top);
        ctx.textBaseline = 'middle';
        let rowY = 24;
        if (!compact) {
            if (!opts.skipScore) UIManager.pill(ctx, `★ ${formatScore(score ? score.total : 0)}`, right, 24, THEME.PINK, THEME.INK, 'right', 13);
            rowY = 54;
        }
        if (player && player.hasShield) {
            UIManager.pill(ctx, t('hud.shield', { pips: player.shieldPips() }), right, rowY, THEME.PURPLE_DEEP, THEME.WHITE, 'right', 10);
            rowY += 24;
        }
        if (pickupManager && pickupManager.isSlowmoActive()) {
            const remaining = (pickupManager.slowmoTimer / 1000).toFixed(1);
            UIManager.pill(ctx, t('hud.slowmo', { s: remaining }), right, rowY, THEME.LAVENDER, THEME.INK, 'right', 10);
            rowY += 24;
        }
        // Sour candy effects (dark plum pill: a bad state)
        if (player && player.slowTimer > 0) {
            UIManager.pill(ctx, t('hud.heavy', { s: (player.slowTimer / 1000).toFixed(1) }), right, rowY, '#5B3A86', '#FFFFFF', 'right', 10);
            rowY += 24;
        }
        if (player && player.growTimer > 0) {
            UIManager.pill(ctx, t('hud.big', { s: (player.growTimer / 1000).toFixed(1) }), right, rowY, '#7A3E78', '#FFFFFF', 'right', 10);
        }
        ctx.restore();
    }

    /** Whether the bottom dash bar is shown (touch devices use the DASH button ring instead) */
    hasDashBar() {
        return typeof matchMedia !== 'function' || !matchMedia('(any-pointer: coarse)').matches;
    }

    /** HUD bottom-centre: dash cooldown bar */
    renderHudDash(ctx, player) {
        if (!player || !this.hasDashBar()) return;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const barW = 140;
        const barH = 10;
        const barX = (w - barW) / 2;
        const barY = h - this.safe.bottom - 26;
        const ratio = player.getDashReadyRatio();
        const isReady = ratio >= 1.0;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, barH / 2);
        ctx.fillStyle = THEME.SURFACE;
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
        ctx.restore();
    }

    /**
     * Oyuncunun yanındaki seri göstergesi ve süzülen puan yazıları (dünya koordinatı)
     */
    renderComboAndPopups(ctx, player, score, opts = {}) {
        if (!score) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const p of score.popups) {
            const k = p.age / 700;
            ctx.globalAlpha = 1 - k;
            ctx.font = font(p.big ? 20 : 11 + p.multiplier, 700);
            outlinedText(ctx, p.text, p.x, p.y - 18 - k * 26, p.multiplier > 1 ? THEME.PINK_DEEP : THEME.PURPLE, THEME.TEXT_HALO, 3);
        }
        ctx.globalAlpha = 1;

        if (player && player.alive && score.combo >= 2) {
            const x = player.x;
            const y = player.y - 30;
            const label = score.multiplier > 1 ? `x${score.multiplier} · ${score.combo}` : t('hud.combo', { n: score.combo });
            ctx.font = font(11, 700);
            const tw = ctx.measureText(label).width + 16;
            candyPanel(ctx, x - tw / 2, y - 9, tw, 18, 9, score.multiplier > 1 ? THEME.PINK : THEME.SURFACE, { lineWidth: 1.5, depth: 2 });
            // Kalan seri süresi
            if (!opts.skipBar) {
                ctx.fillStyle = score.multiplier > 1 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(205, 184, 255, 0.7)';
                ctx.fillRect(x - tw / 2 + 6, y + 5, (tw - 12) * score.comboRatio, 2);
            }
            ctx.fillStyle = score.multiplier > 1 ? THEME.INK : THEME.TEXT;
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
        candyPanel(ctx, w / 2 - tw / 2, y - 18, tw, 36, 18, THEME.SURFACE, { depth: 4, shadow: THEME.PURPLE });
        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`💡 ${hint.text}`, w / 2, y + 1, tw - 20);
        ctx.restore();
    }

    /** Pause overlay. opts.skipResume leaves out the pulsing "tap to resume" line. */
    renderPaused(ctx, countdownMs = 0, touch = false, opts = {}) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (countdownMs > 0) {
            const step = Math.ceil(countdownMs / 500);
            const frac = (countdownMs % 500) / 500;
            ctx.fillStyle = `rgba(${THEME.SCRIM}, 0.35)`;
            ctx.fillRect(0, 0, w, h);
            ctx.font = font(64 + frac * 26, 700);
            ctx.globalAlpha = 0.5 + frac * 0.5;
            ctx.fillStyle = THEME.PINK;
            ctx.fillText(String(step), w / 2 + 3, h / 2 + 5);
            outlinedText(ctx, String(step), w / 2, h / 2, THEME.TEXT, THEME.TEXT_HALO, 7);
            ctx.restore();
            return;
        }

        ctx.fillStyle = `rgba(${THEME.SCRIM}, 0.78)`;
        ctx.fillRect(0, 0, w, h);

        const cw = Math.min(320, w - 40);
        const ch = touch ? 120 : 140;
        candyPanel(ctx, w / 2 - cw / 2, h / 2 - ch / 2 - 10, cw, ch, 22, THEME.SURFACE, { depth: 6, lineWidth: 2.5 });

        ctx.font = font(28, 700);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fillText(t('pause.title'), w / 2, h / 2 - 36);

        if (!opts.skipResume) {
            ctx.globalAlpha = this.pauseResumeAlpha();
            this.drawPausedResume(ctx, touch);
            ctx.globalAlpha = 1;
        }

        if (!touch) {
            ctx.font = font(12, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText(t('pause.menu'), w / 2, h / 2 + 28);
        }
        ctx.restore();
    }

    /** Pulse of the pause screen's resume hint (0.65..1) */
    pauseResumeAlpha() {
        return 0.65 + ((Math.sin(performance.now() * 0.006) + 1) * 0.5) * 0.35;
    }

    drawPausedResume(ctx, touch = false) {
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(14, 600);
        ctx.fillStyle = THEME.TEXT;
        ctx.fillText(touch ? t('pause.resumeTouch') : t('pause.resume'), w / 2, h / 2 + 2);
        ctx.restore();
    }

    /**
     * Ölüm ekranı
     * @param {object} info { score, waves, unlocked: Skin[], reveal, cause, bossTitle }
     */
    renderDead(ctx, finalTimeMs, mode = this.currentMode, player = null, info = {}) {
        // pass: 'base' = scrim + card panel + body, 'content' = everything on top of the body.
        // The renderer draws the interactive backdrop between the two passes, masked to the card body.
        const { score = null, waves = null, unlocked = [], reveal = 1, cause = 'bullet', bossTitle = '', candies = 0, pass = 'all', skipStars = false } = info;
        const drawBase = pass !== 'content';
        const drawContent = pass !== 'base';
        if (reveal <= 0) return; // Önce ölüm patlaması görünsün
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;
        const D = this.getDeadLayout();
        const cw = D.cw;

        ctx.save();
        ctx.globalAlpha = reveal;
        if (drawBase) {
            ctx.fillStyle = `rgba(${THEME.SCRIM}, 0.85)`;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.translate(D.cx, D.cy + this.deadSlide(reveal)); // Card slides up slightly as it appears
        ctx.scale(D.s, D.s);

        const top = D.top;
        const ch = D.ch;
        if (drawBase) candyPanel(ctx, -cw / 2, top, cw, ch, 26, THEME.SURFACE, { depth: 7, lineWidth: 2.5 });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const now = performance.now() / 1000;
        const bandH = D.headerH;
        const yb = top + bandH;

        // Gövde: aşağı doğru pembeleşen zemin ve çok soluk serpintiler (kartın içine kırpılı)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-cw / 2 + 1.25, top + 1.25, cw - 2.5, ch - 2.5, 25);
        ctx.clip();
        if (drawBase) {
            const body = ctx.createLinearGradient(0, yb, 0, top + ch);
            body.addColorStop(0, THEME.SURFACE);
            body.addColorStop(1, THEME.SURFACE_SOFT);
            ctx.fillStyle = body;
            ctx.fillRect(-cw / 2, yb, cw, ch - bandH);
        }
        if (!drawContent) {
            ctx.restore();
            ctx.restore();
            return;
        }
        const sprinkleColors = [THEME.PINK, THEME.PURPLE, THEME.LAVENDER];
        for (let i = 0; i < (pass === 'content' ? 0 : 26); i++) {
            const sx = -cw / 2 + ((i * 61 + 23) % 100) / 100 * cw;
            const sy = yb + 16 + ((i * 43 + 7) % 100) / 100 * (ch - bandH - 24);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(i * 0.9);
            ctx.globalAlpha = THEME.dark ? 0.12 : 0.16;
            ctx.fillStyle = sprinkleColors[i % 3];
            ctx.beginPath();
            ctx.roundRect(-4, -1.5, 8, 3, 1.5);
            ctx.fill();
            ctx.restore();
        }

        // Başlık bandı: pembe→mor, alt kenarı krema damlası gibi dalgalı
        const n = Math.max(8, Math.round(cw / 26));
        const r = cw / (n * 2);
        const bandPath = () => {
            ctx.beginPath();
            ctx.moveTo(-cw / 2, top);
            ctx.lineTo(cw / 2, top);
            ctx.lineTo(cw / 2, yb);
            for (let i = n - 1; i >= 0; i--) ctx.arc(-cw / 2 + r + i * 2 * r, yb, r, 0, Math.PI, false);
            ctx.closePath();
        };
        const band = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
        band.addColorStop(0, THEME.PINK);
        band.addColorStop(1, THEME.PURPLE);
        bandPath();
        ctx.fillStyle = band;
        ctx.fill();
        ctx.save();
        bandPath();
        ctx.clip();
        for (let i = 0; i < 16; i++) {
            const sx = -cw / 2 + ((i * 53 + 17) % 100) / 100 * cw;
            const sy = top + 7 + ((i * 37 + 11) % 100) / 100 * (bandH - 14);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(i * 1.3);
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = i % 3 ? '#FFFFFF' : THEME.LAVENDER;
            ctx.beginPath();
            ctx.roundRect(-4, -1.5, 8, 3, 1.5);
            ctx.fill();
            ctx.restore();
        }
        // Bandın üstünde yumuşak parlama
        const shine = ctx.createLinearGradient(0, top, 0, top + bandH * 0.5);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
        shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = shine;
        ctx.fillRect(-cw / 2, top, cw, bandH * 0.5);
        ctx.restore();
        // Dalgalı kenarın konturu
        ctx.beginPath();
        for (let i = 0; i < n; i++) ctx.arc(-cw / 2 + r + i * 2 * r, yb, r, Math.PI, 0, true);
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();

        // Sersemlemiş marşmelov: arkasında yumuşak ışık halesi, başında dönen yıldızlar
        const my = top + 35;
        const halo = ctx.createRadialGradient(0, my, 6, 0, my, 46);
        halo.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-46, my - 46, 92, 92);
        drawMarshmallow(ctx, 0, my, 19, (player && player.skin) || SKINS[0], { blink: 0.12, squash: 1.06 });
        ctx.fillStyle = '#FFFFFF';
        if (!skipStars) {
            for (const st of this.deadStars(now)) drawSparkle(ctx, st.x, st.y + my, st.r);
        }

        ctx.font = font(30, 700);
        outlinedText(ctx, t('dead.title'), 0, top + 77, '#FFFFFF', THEME.INK, 6);
        const modeLabel = mode.id === 'daily' ? `${mode.label} · ${dateLabel()}` : mode.label;
        ctx.font = font(13, 700);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillText(`${modeLabel} · ${t(`dead.cause.${cause}`, { boss: bossTitle })}`, 0, top + 102, cw - 40);

        // --- Gövde: başlık ile "tekrar oyna" arasındaki alana ortalanan blok ---
        // Uzun ekranda boşluk skora, satırlar arasına ve kenarlara paylaştırılır
        const extraLines = (waves && waves.boss ? 1 : 0) + (unlocked.length ? 1 : 0);
        const blockH = 140 + (extraLines ? 8 + extraLines * 18 : 0);
        const areaTop = top + bandH;
        const free = Math.max(28, D.retry.y - areaTop - blockH);
        const scoreSize = Math.min(68, 50 + Math.max(0, free - 60) * 0.12);
        const grow = scoreSize - 50;
        const inner = Math.min(40, Math.max(0, free - grow - 28) * 0.18);
        const b = areaTop + Math.max(14, (free - grow - inner * 2) * 0.45);

        // Büyük skor: arkasında yumuşak pembe hale, üstünde ince çizgili küçük başlık
        const scoreY = b + 26 + grow / 2;
        const glowR = scoreSize * 1.6;
        const glow = ctx.createRadialGradient(0, scoreY, 4, 0, scoreY, glowR);
        glow.addColorStop(0, THEME.dark ? 'rgba(255, 141, 192, 0.16)' : 'rgba(255, 111, 174, 0.14)');
        glow.addColorStop(1, 'rgba(255, 111, 174, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-glowR, scoreY - glowR, glowR * 2, glowR * 2);
        if (free > 70) {
            const ly = scoreY - scoreSize * 0.62 - 6;
            ctx.font = font(11, 700);
            ctx.fillStyle = THEME.MUTED;
            const label = upper(t('dead.score'));
            ctx.fillText(label, 0, ly);
            const lw = ctx.measureText(label).width / 2 + 8;
            ctx.strokeStyle = THEME.MUTED;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-lw - 22, ly); ctx.lineTo(-lw, ly);
            ctx.moveTo(lw, ly); ctx.lineTo(lw + 22, ly);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.font = font(scoreSize, 700);
        ctx.fillStyle = THEME.dark ? THEME.INK : THEME.PINK_SOFT; // Koyu temada gölge koyu, açıkta pembe
        ctx.fillText(formatScore(score ? score.total : 0), 3, b + 29 + grow / 2);
        ctx.fillStyle = THEME.TEXT_ACCENT;
        ctx.fillText(formatScore(score ? score.total : 0), 0, b + 26 + grow / 2);

        // Yeni rekor rozeti ya da en iyi skor + bu turun şekeri
        const parts = [this.isNewRecord ? t('dead.newRecord') : t('menu.best', { score: formatScore(this.getBestScore(mode.id)) })];
        if (candies > 0) parts.push(t('dead.candies', { n: candies }));
        if (this.isNewRecord) {
            const bounce = Math.abs(Math.sin(now * 5)) * 2;
            UIManager.pill(ctx, parts.join('  ·  '), 0, b + 64 + grow + inner - bounce, THEME.PURPLE_DEEP, '#FFFFFF', 'center', 13);
        } else {
            ctx.font = font(14, 700);
            ctx.fillStyle = THEME.TEXT_PRIMARY;
            ctx.fillText(parts.join('   ·   '), 0, b + 64 + grow + inner, cw - 40);
        }

        // Süre · graze · seri: üç küçük şeker çipi
        const cols = [
            ['⏱', t('dead.time'), UIManager.formatTime(finalTimeMs)],
            ['✨', t('dead.graze'), player ? String(player.grazeCount) : '0'],
            ['🔥', t('dead.combo'), score ? String(score.bestCombo) : '0']
        ];
        const gap = 8;
        const chipW = (cw - 36 - gap * 2) / 3;
        const valueSize = chipW < 84 ? 15 : 18; // Dar kartta süre sığsın
        const chipY = b + 86 + grow + inner * 2;
        // Her çip kendi şeker tonunda: lavanta, pembe, şeftali; altta ince "kalınlık"
        const tints = THEME.dark
            ? [['rgba(205, 184, 255, 0.16)', 'rgba(205, 184, 255, 0.30)'], ['rgba(255, 141, 192, 0.16)', 'rgba(255, 141, 192, 0.32)'], ['rgba(255, 196, 140, 0.14)', 'rgba(255, 196, 140, 0.28)']]
            : [['#F1EAFF', '#DCCBFF'], ['#FFE6F1', '#FFC4DE'], ['#FFF0E2', '#FFD7B5']];
        cols.forEach(([icon, label, value], i) => {
            const x = -cw / 2 + 18 + i * (chipW + gap);
            ctx.beginPath();
            ctx.roundRect(x, chipY + 3, chipW, 54, 16);
            ctx.fillStyle = tints[i][1];
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(x, chipY, chipW, 54, 16);
            ctx.fillStyle = tints[i][0];
            ctx.fill();
            const cx = x + chipW / 2;
            ctx.font = font(valueSize, 700);
            ctx.fillStyle = THEME.TEXT;
            ctx.fillText(value, cx, chipY + 18, chipW - 10);
            ctx.font = font(11, 600);
            ctx.fillStyle = THEME.MUTED;
            ctx.fillText(`${icon} ${label}`, cx, chipY + 39, chipW - 8);
        });

        // İsteğe bağlı tek satırlar: boss sonucu, açılan kostüm
        let lineY = chipY + 54 + 18;
        if (waves && waves.boss) {
            const bits = [];
            if (waves.bossKills > 0) bits.push(t('dead.bossKills', { n: waves.bossKills }));
            if (waves.bossActive) bits.push(t('dead.bossHp', { title: waves.boss.title, hp: Math.ceil(waves.boss.hpRatio * 100) }));
            ctx.font = font(12, 700);
            ctx.fillStyle = waves.bossActive ? THEME.TEXT_ACCENT : THEME.TEXT_PRIMARY;
            ctx.fillText(bits.join(' · '), 0, lineY, cw - 40);
            lineY += 18;
        }
        if (unlocked.length) {
            ctx.font = font(12, 700);
            ctx.fillStyle = THEME.TEXT_ACCENT;
            ctx.fillText(t('dead.unlocked', { names: unlocked.map(k => t(`skin.${k.id}.name`, null, k.name)).join(', ') }), 0, lineY, cw - 40);
        }

        // K6: büyük "tekrar oyna" (sadece bu buton, Enter ve Space yeniden başlatır)
        const rb = D.retry;
        candyPanel(ctx, rb.x, rb.y, rb.w, rb.h, rb.h / 2, THEME.PURPLE, { depth: 5, lineWidth: 2.5 });
        ctx.beginPath();
        ctx.roundRect(rb.x + 22, rb.y + 8, rb.w - 44, 7, 3.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fill();
        ctx.font = font(21, 700);
        ctx.fillStyle = THEME.WHITE;
        ctx.fillText(t('dead.retryBtn'), 0, rb.y + rb.h / 2 + 1, rb.w - 20);

        // Kartın içinde: ana menü ve paylaş
        const mb = D.menu;
        candyPanel(ctx, mb.x, mb.y, mb.w, mb.h, mb.h / 2, THEME.SURFACE_SOFT, { depth: 4, lineWidth: 2 });
        ctx.font = font(15, 700);
        ctx.fillStyle = THEME.TEXT;
        ctx.fillText(`⌂ ${t('dom.menu')}`, mb.x + mb.w / 2, mb.y + mb.h / 2 + 1, mb.w - 16);
        const sb = D.share;
        candyPanel(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2, THEME.PINK, { depth: 4, lineWidth: 2 });
        ctx.fillStyle = THEME.INK;
        ctx.fillText(`↗ ${t('dom.share')}`, sb.x + sb.w / 2, sb.y + sb.h / 2 + 1, sb.w - 16);

        // Bilgi butonu (kartın sağ üst köşesi)
        UIManager.roundButton(ctx, D.info.cx, D.info.cy, D.info.r, 'i');

        ctx.restore();
        if (this.infoOpen) this.renderInfo(ctx);
    }
}
