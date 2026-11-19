// ============================================================
// ux-preview/new-main.js — ÖNERİLEN arayüz (sadece önizleme)
// Orijinal dosyalara dokunmaz: oyun sınıflarını bu sayfada,
// çalışma anında yamalar. Klasör silinince öneri de kaybolur.
//
// Öneriler (rapordaki kimliklerle):
//  K1  Boş alana tıklayınca oyun başlamaz (sadece OYNA)
//  K2  Ekrana göre menü yerleşimi (kare / geniş / dikey) → telefonda okunur metin ve ≥44 px hedef
//  K3  Kontrast: ikincil metin #9C86B8 → #6F5A8C, pembe üstünde koyu metin
//  K4  Menüde klavye ile gezinme (↑ ↓ Tab, Enter) + görünür odak çerçevesi
//  K5  Ölüm nedeni ("kenara çarptın" / "şekere çarptın")
//  K6  Sonuç ekranında açık "TEKRAR OYNA" butonu (rastgele tıkla yeniden başlamaz)
//  D1  Fare ile üzerine gelme (hover) ve işaretçi imleci
//  D2  Cihaza göre kontrol ipuçları (dokunmatikte klavye tuşları yazmaz)
//  D3  Ayarlar paneli telefonda büyür
//  D4  Küçük ekranlarda HUD ölçeklenir
//  D5  Masaüstünde "cihazı çevir" ipucu gizlenir (new.css)
// ============================================================

import { Game, GAME_STATE } from '../js/game.js';
import { UIManager } from '../js/ui.js';
import { THEME, font, candyPanel, outlinedText } from '../js/theme.js';
import { GAME_CONFIG } from '../js/config.js';
import { ModeRegistry } from '../js/modes.js';
import { SKINS, drawMarshmallow } from '../js/skins.js';
import { formatScore } from '../js/score.js';
import { dateLabel } from '../js/rng.js';
import { t, getLang } from '../js/i18n.js';
import { CollisionSystem } from '../js/collision.js';
import { installSandbox } from './sandbox.js';

// ---------- K3: kontrast jetonları ----------
THEME.MUTED = '#6F5A8C';          // 3.04:1 → 5.63:1 (zemin üstünde)
THEME.TEXT_ACCENT = '#C2185B';    // küçük pembe metinler için (3.51:1 → 5.87:1)
THEME.TEXT_PRIMARY = '#6A3FC8';   // küçük mor metinler için

const originalPill = UIManager.pill;
UIManager.pill = function (ctx, text, x, y, fill, color = THEME.INK, align = 'left', size = 11) {
    // Açık pembe dolgu üstünde beyaz metin okunmuyor (2.58:1) → koyu mürekkep (4.39:1)
    if (fill === THEME.PINK && color === THEME.WHITE) color = THEME.INK;
    return originalPill.call(this, ctx, text, x, y, fill, color, align, size);
};

// ---------- Önizlemeye özel metinler ----------
const TEXT = {
    tr: {
        mouse1: 'fare veya WASD → hareket   ·   sağ tık / shift / space → DASH',
        mouse2: 'P duraklat · O ayarlar · ← → kostüm · ↑ ↓ Tab menüde gezin',
        touch1: 'joystick → hareket   ·   DASH butonu → kısa dokunulmazlık',
        touch2: 'kenarlara ve şekerlere değme!',
        retry: 'TEKRAR OYNA',
        deadKeys: 'Enter → tekrar · M → menü · C → paylaş',
        causeWall: '🧱 kenara çarptın',
        causeBullet: '🍬 şekere çarptın',
        causeBoss: '👑 {boss} ile çarpıştın',
        fresh: 'henüz oynanmadı'
    },
    en: {
        mouse1: 'mouse or WASD → move   ·   right click / shift / space → DASH',
        mouse2: 'P pause · O settings · ← → costume · ↑ ↓ Tab to navigate',
        touch1: 'joystick → move   ·   DASH button → brief invincibility',
        touch2: 'avoid the edges and the candies!',
        retry: 'PLAY AGAIN',
        deadKeys: 'Enter → again · M → menu · C → share',
        causeWall: '🧱 you hit the edge',
        causeBullet: '🍬 a candy hit you',
        causeBoss: '👑 you bumped into {boss}',
        fresh: 'not played yet'
    }
};
const tx = (k, p = {}) => {
    let s = (TEXT[getLang()] || TEXT.tr)[k] || TEXT.tr[k];
    for (const [a, b] of Object.entries(p)) s = s.replace(`{${a}}`, b);
    return s;
};

// ---------- K2: üç menü yerleşimi; ekrana en büyük ölçekte sığan seçilir ----------
const LAYOUTS = {
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
        settings: { x: 790, y: 14, w: 116, h: 42 },
        title: { x: 250, y: 64, size: 44 },
        pick: { x: 250, y: 104 },
        cards: [
            { id: 'classic', x: 30, y: 116, w: 212, h: 62 }, { id: 'endless', x: 258, y: 116, w: 212, h: 62 },
            { id: 'hardcore', x: 30, y: 190, w: 212, h: 62 }, { id: 'chaos', x: 258, y: 190, w: 212, h: 62 },
            { id: 'daily', x: 30, y: 264, w: 440, h: 52, wide: true }
        ],
        desc: { x: 250, y: 350, maxW: 450 },
        hints: { x: 250, y: 380, gap: 21, maxW: 460 },
        play: { x: 540, y: 118, w: 300, h: 78 },
        skin: { cx: 690, cy: 286, dx: 98, r: 26 }
    },
    tall: {
        name: 'tall', W: 420, H: 790,
        settings: { x: 292, y: 12, w: 116, h: 44 },
        title: { x: 210, y: 104, size: 40 },
        pick: { x: 210, y: 152 },
        cards: [
            { id: 'classic', x: 10, y: 166, w: 195, h: 66 }, { id: 'endless', x: 215, y: 166, w: 195, h: 66 },
            { id: 'hardcore', x: 10, y: 244, w: 195, h: 66 }, { id: 'chaos', x: 215, y: 244, w: 195, h: 66 },
            { id: 'daily', x: 10, y: 322, w: 400, h: 56, wide: true }
        ],
        desc: { x: 210, y: 410, maxW: 400 },
        hints: { x: 210, y: 442, gap: 23, maxW: 404 },
        play: { x: 40, y: 486, w: 340, h: 78 },
        skin: { cx: 210, cy: 650, dx: 104, r: 28 }
    }
};
const MAX_MENU_SCALE = 1.15;
const FOCUS_ORDER = ['classic', 'endless', 'hardcore', 'chaos', 'daily', 'play', 'skin', 'settings'];

/** Tuvalin 1 mantıksal pikseli kaç CSS pikseli? (yazıların gerçek boyutu için) */
function cssPerLogical() {
    const c = document.getElementById('gameCanvas');
    return c ? c.getBoundingClientRect().height / GAME_CONFIG.CANVAS.HEIGHT : 1;
}

const originalSetLayout = UIManager.prototype.setLayout;
UIManager.prototype.setLayout = function (width, height, safe = { left: 0, right: 0, top: 0, bottom: 0 }) {
    originalSetLayout.call(this, width, height, safe);
    const aw = width - safe.left - safe.right;
    const ah = height - safe.top - safe.bottom;
    let best = null;
    for (const L of Object.values(LAYOUTS)) {
        const s = Math.min(aw / L.W, ah / L.H, MAX_MENU_SCALE);
        if (!best || s > best.s) best = { L, s };
    }
    this.layout = best.L;
    this.lScale = best.s;
    this.lOffX = safe.left + (aw - best.L.W * best.s) / 2;
    this.lOffY = safe.top + (ah - best.L.H * best.s) / 2;

    // D3: ayarlar paneli kendi ölçeğiyle ortalanır (600 alanında x110..490, y104..~520)
    const ss = Math.min(aw * 0.94 / 380, ah * 0.94 / 420, 1.35);
    this.setScale = ss;
    this.setOffX = safe.left + aw / 2 - 300 * ss;
    this.setOffY = safe.top + ah / 2 - 312 * ss;
};

UIManager.prototype.isTouch = function () {
    return !!(this.game && this.game.touchControls.touchDevice);
};

// ---------- K1 + K2: tıklama eşlemesi ----------
UIManager.prototype.getMenuAction = function (px, py) {
    const L = this.layout || LAYOUTS.square;
    const x = (px - this.lOffX) / this.lScale;
    const y = (py - this.lOffY) / this.lScale;
    const inRect = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    for (const c of L.cards) if (inRect(c)) return { type: 'mode', id: c.id, key: c.id };
    if (inRect(L.settings)) return { type: 'settings', key: 'settings' };
    if (inRect(L.play)) return { type: 'play', key: 'play' };
    const s = L.skin;
    if (Math.hypot(x - (s.cx - s.dx), y - s.cy) <= s.r + 10) return { type: 'skinPrev', key: 'skin' };
    if (Math.hypot(x - (s.cx + s.dx), y - s.cy) <= s.r + 10) return { type: 'skinNext', key: 'skin' };
    return { type: 'none' }; // K1: boş alana tıklamak artık oyunu başlatmaz
};

// ---------- D3: ayarlar paneli kendi ölçeğinde ----------
function withSettingsTransform(ui, fn) {
    const saved = [ui.menuOffsetX, ui.menuOffsetY, ui.menuScale];
    ui.menuOffsetX = ui.setOffX;
    ui.menuOffsetY = ui.setOffY;
    ui.menuScale = ui.setScale;
    try { return fn(); } finally { [ui.menuOffsetX, ui.menuOffsetY, ui.menuScale] = saved; }
}
const originalRenderSettings = UIManager.prototype.renderSettings;
UIManager.prototype.renderSettings = function (ctx) {
    return withSettingsTransform(this, () => originalRenderSettings.call(this, ctx));
};
const originalSettingsAction = UIManager.prototype.getSettingsAction;
UIManager.prototype.getSettingsAction = function (px, py) {
    return withSettingsTransform(this, () => originalSettingsAction.call(this, px, py));
};

// ---------- K2 + K3 + K4 + D1 + D2: yeni menü çizimi ----------
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

UIManager.prototype.renderMenu = function (ctx, activeModeId = this.currentMode.id) {
    const L = this.layout || LAYOUTS.square;
    const now = performance.now() / 1000;
    const focusKey = this.keyboardFocus ? FOCUS_ORDER[this.focusIndex] : null;
    const hoverKey = this.hoverKey;

    ctx.save();
    ctx.translate(this.lOffX, this.lOffY);
    ctx.scale(this.lScale, this.lScale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Ayarlar
    const sb = L.settings;
    const sbLift = hoverKey === 'settings' ? -2 : 0;
    candyPanel(ctx, sb.x, sb.y + sbLift, sb.w, sb.h, sb.h / 2, THEME.WHITE, { depth: 3 - sbLift, lineWidth: 2 });
    ctx.font = font(15, 700);
    ctx.fillStyle = THEME.INK;
    ctx.fillText(t('menu.settings'), sb.x + sb.w / 2, sb.y + sbLift + sb.h / 2 + 1);
    if (focusKey === 'settings') focusRing(ctx, sb.x, sb.y, sb.w, sb.h, sb.h / 2);

    // Başlık
    const ti = L.title;
    const titleY = ti.y + Math.sin(now * 2) * 2;
    ctx.font = font(ti.size, 700);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.PINK;
    ctx.fillText('BULLET HELL', ti.x + 3, titleY + 4);
    outlinedText(ctx, 'BULLET HELL', ti.x, titleY, THEME.INK, THEME.WHITE, 6);
    const tw = ctx.measureText('BULLET HELL').width;
    ctx.save();
    ctx.translate(ti.x + tw / 2 - 18, titleY + 14);
    ctx.rotate(-0.08);
    UIManager.pill(ctx, 'micro', 0, 0, THEME.PINK, THEME.INK, 'center', 14);
    ctx.restore();

    ctx.font = font(14, 600);
    ctx.fillStyle = THEME.MUTED;
    ctx.textBaseline = 'middle';
    ctx.fillText(t('menu.pickMode'), L.pick.x, L.pick.y);

    // Mod kartları
    for (const c of L.cards) {
        const selected = c.id === activeModeId;
        const hovered = hoverKey === c.id;
        const lift = selected ? -2 : hovered ? -1 : 0;
        const y = c.y + lift;
        candyPanel(ctx, c.x, y, c.w, c.h, 18, selected ? THEME.PINK : THEME.WHITE,
            { depth: (selected ? 6 : 4) - (hovered && !selected ? -1 : 0), lineWidth: hovered ? 2.5 : 2 });
        const best = this.getBestScore(c.id);
        const sub = best > 0 ? t('menu.best', { score: formatScore(best) }) : tx('fresh');
        const label = ModeRegistry.get(c.id).label;
        if (c.wide) {
            ctx.textAlign = 'left';
            ctx.font = font(18, 700);
            ctx.fillStyle = THEME.INK;
            ctx.fillText(`☀ ${label} · ${dateLabel()}`, c.x + 20, y + c.h / 2 + 1, c.w * 0.62);
            ctx.textAlign = 'right';
            ctx.font = font(13, 600);
            ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
            ctx.fillText(sub, c.x + c.w - 20, y + c.h / 2 + 1, c.w * 0.34);
            ctx.textAlign = 'center';
        } else {
            ctx.font = font(19, 700);
            ctx.fillStyle = THEME.INK; // K3: pembe üstünde de koyu metin
            ctx.fillText(label, c.x + c.w / 2, y + c.h / 2 - 9, c.w - 16);
            ctx.font = font(13, 600);
            ctx.fillStyle = selected ? THEME.INK : THEME.MUTED;
            ctx.fillText(sub, c.x + c.w / 2, y + c.h / 2 + 14, c.w - 16);
        }
        if (selected) {
            // Renk dışı seçili işareti
            ctx.font = font(14, 700);
            ctx.fillStyle = THEME.INK;
            ctx.fillText('✓', c.x + c.w - 16, c.y + lift + 14);
        }
        if (focusKey === c.id) focusRing(ctx, c.x, c.y, c.w, c.h, 18);
    }

    // Açıklama ve cihaza göre ipuçları
    const mode = ModeRegistry.get(activeModeId);
    ctx.font = font(15, 600);
    ctx.fillStyle = THEME.INK;
    ctx.fillText(mode.description, L.desc.x, L.desc.y, L.desc.maxW);
    ctx.font = font(13, 600);
    ctx.fillStyle = THEME.MUTED;
    const touch = this.isTouch();
    ctx.fillText(tx(touch ? 'touch1' : 'mouse1'), L.hints.x, L.hints.y, L.hints.maxW);
    ctx.fillText(tx(touch ? 'touch2' : 'mouse2'), L.hints.x, L.hints.y + L.hints.gap, L.hints.maxW);

    // OYNA
    const pb = L.play;
    const bob = Math.sin(now * 3) * 2 + (hoverKey === 'play' ? -2 : 0);
    candyPanel(ctx, pb.x, pb.y + bob, pb.w, pb.h, pb.h / 2, THEME.PURPLE, { depth: hoverKey === 'play' ? 8 : 6, lineWidth: 2.5 });
    ctx.beginPath();
    ctx.roundRect(pb.x + 20, pb.y + bob + 9, pb.w - 40, 8, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();
    ctx.font = font(24, 700);
    ctx.fillStyle = THEME.WHITE;
    ctx.fillText(t('menu.play', { mode: mode.label }), pb.x + pb.w / 2, pb.y + bob + pb.h / 2 + 2, pb.w - 30);
    if (focusKey === 'play') focusRing(ctx, pb.x, pb.y, pb.w, pb.h, pb.h / 2);

    // Kostüm seçici
    if (this.progress) {
        const s = L.skin;
        const skin = SKINS[this.skinIndex] || SKINS[0];
        const locked = !this.progress.isUnlocked(skin.id);
        UIManager.roundButton(ctx, s.cx - s.dx, s.cy, s.r, '‹');
        UIManager.roundButton(ctx, s.cx + s.dx, s.cy, s.r, '›');
        const blink = (now % 3.2) < 0.12 ? 0.25 : 1;
        drawMarshmallow(ctx, s.cx, s.cy - 4 + Math.sin(now * 2.4) * 2, s.r, skin, { locked, blink });
        ctx.font = font(16, 700);
        ctx.fillStyle = locked ? THEME.MUTED : THEME.INK;
        const name = t(`skin.${skin.id}.name`, null, skin.name);
        ctx.fillText(`${name}${this.progress.selected === skin.id ? ' ✓' : ''}`, s.cx, s.cy + s.r + 22);
        ctx.font = font(13, 600);
        ctx.fillStyle = locked ? THEME.TEXT_ACCENT : THEME.MUTED;
        const count = `${this.progress.unlocked.length}/${SKINS.length}`;
        ctx.fillText(locked ? `🔒 ${t(`skin.${skin.id}.hint`, null, skin.hint)}` : t('menu.costumes', { count }), s.cx, s.cy + s.r + 42, L.W - 20);
        if (focusKey === 'skin') focusRing(ctx, s.cx - s.dx - s.r, s.cy - s.r, s.dx * 2 + s.r * 2, s.r * 2, s.r);
    }

    ctx.restore();
    if (this.settingsOpen) this.renderSettings(ctx);
};

// ---------- K5 + K6 + D2: yeni sonuç ekranı ----------
UIManager.prototype.renderDead = function (ctx, finalTimeMs, mode = this.currentMode, player = null, info = {}) {
    const { score = null, waves = null, unlocked = [], reveal = 1 } = info;
    if (reveal <= 0) return;
    const W = GAME_CONFIG.CANVAS.WIDTH;
    const H = GAME_CONFIG.CANVAS.HEIGHT;
    const aw = W - this.safe.left - this.safe.right;
    const ah = H - this.safe.top - this.safe.bottom;
    // Önce yüksekliğe göre ölçek; dar ekranda ölçeği küçültmek yerine kartı daraltırız (min 260)
    let s = Math.min(ah * 0.94 / 430, 1.3);
    let cw = Math.min(360, aw * 0.92 / s);
    if (cw < 260) { s = aw * 0.92 / 260; cw = 260; }
    const colGap = Math.min(112, (cw - 24) / 3);
    const cx = this.safe.left + aw / 2;
    const cy = this.safe.top + ah / 2 + (1 - reveal) * 24;
    this.deadLayout = { cx, cy, s };

    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.fillStyle = 'rgba(255, 246, 250, 0.85)';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy);
    ctx.scale(s, s);
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

    // K5: neden öldün?
    const g = this.game;
    const cause = g && g.deathCause;
    const causeText = cause === 'wall' ? tx('causeWall')
        : cause === 'boss' ? tx('causeBoss', { boss: g.waveManager.boss ? g.waveManager.boss.title : 'boss' })
        : tx('causeBullet');
    UIManager.pill(ctx, causeText, 0, -108, THEME.PINK_SOFT, THEME.INK, 'center', 13);

    let y = -78;
    if (this.isNewRecord) {
        UIManager.pill(ctx, t('dead.newRecord'), 0, y - Math.abs(Math.sin(performance.now() * 0.005)) * 3, THEME.PURPLE, THEME.WHITE, 'center', 13);
    }
    ctx.font = font(13, 600);
    ctx.fillStyle = THEME.MUTED;
    ctx.fillText(t('dead.score'), 0, -50);
    ctx.font = font(38, 700);
    outlinedText(ctx, formatScore(score ? score.total : 0), 0, -20, THEME.TEXT_ACCENT, THEME.WHITE, 5);

    const cols = [
        [t('dead.time'), UIManager.formatTime(finalTimeMs)],
        [t('dead.graze'), player ? String(player.grazeCount) : '0'],
        [t('dead.combo'), score ? String(score.bestCombo) : '0']
    ];
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

    y = 92;
    if (waves && waves.boss) {
        const parts = [];
        if (waves.bossKills > 0) parts.push(t('dead.bossKills', { n: waves.bossKills }));
        if (waves.bossActive) parts.push(t('dead.bossHp', { title: waves.boss.title, hp: Math.ceil(waves.boss.hpRatio * 100) }));
        ctx.font = font(13, 700);
        ctx.fillStyle = waves.bossActive ? THEME.TEXT_ACCENT : THEME.TEXT_PRIMARY;
        ctx.fillText(parts.join(' · '), 0, y, cw - 24);
        y += 22;
    }
    if (unlocked.length) {
        UIManager.pill(ctx, t('dead.unlocked', { names: unlocked.map(k => t(`skin.${k.id}.name`, null, k.name)).join(', ') }), 0, y, THEME.PINK, THEME.INK, 'center', 12);
    }

    // K6: açık yeniden başlatma butonu
    const hovered = this.hoverKey === 'retry';
    const rbw = Math.min(250, cw - 30);
    const rb = { x: -rbw / 2, y: 122, w: rbw, h: 54 };
    this.retryRect = rb;
    candyPanel(ctx, rb.x, rb.y + (hovered ? -2 : 0), rb.w, rb.h, rb.h / 2, THEME.PURPLE, { depth: hovered ? 7 : 5, lineWidth: 2.5 });
    ctx.font = font(21, 700);
    ctx.fillStyle = THEME.WHITE;
    ctx.fillText(`↻ ${tx('retry')}`, 0, rb.y + rb.h / 2 + 1 + (hovered ? -2 : 0));
    if (this.keyboardFocus && g && g.state === GAME_STATE.DEAD) focusRing(ctx, rb.x, rb.y, rb.w, rb.h, rb.h / 2);

    if (!this.isTouch()) {
        ctx.font = font(13, 600);
        ctx.fillStyle = THEME.MUTED;
        ctx.fillText(tx('deadKeys'), 0, 194, cw - 24);
    }
    ctx.restore();
};

/** Sonuç ekranında bir nokta yeniden başlat butonunun üstünde mi? */
UIManager.prototype.hitsRetry = function (x, y) {
    if (!this.deadLayout || !this.retryRect) return false;
    const { cx, cy, s } = this.deadLayout;
    const lx = (x - cx) / s;
    const ly = (y - cy) / s;
    const r = this.retryRect;
    return lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
};

// ---------- D4: küçük ekranda HUD ölçeği ----------
const originalRenderHUD = UIManager.prototype.renderHUD;
UIManager.prototype.renderHUD = function (ctx, ...args) {
    const k = Math.min(1.6, Math.max(1, 0.95 / cssPerLogical()));
    if (k <= 1.01) return originalRenderHUD.call(this, ctx, ...args);
    const C = GAME_CONFIG.CANVAS;
    const saved = { w: C.WIDTH, h: C.HEIGHT, safe: this.safe };
    C.WIDTH = saved.w / k;
    C.HEIGHT = saved.h / k;
    this.safe = { left: saved.safe.left / k, right: saved.safe.right / k, top: saved.safe.top / k, bottom: saved.safe.bottom / k };
    ctx.save();
    ctx.scale(k, k);
    try { originalRenderHUD.call(this, ctx, ...args); } finally {
        ctx.restore();
        C.WIDTH = saved.w;
        C.HEIGHT = saved.h;
        this.safe = saved.safe;
    }
};

// ---------- K5: ölüm nedenini kaydet ----------
const originalTriggerDeath = Game.prototype.triggerDeath;
Game.prototype.triggerDeath = function () {
    if (this.state === GAME_STATE.PLAYING) {
        const boss = this.waveManager.boss;
        this.deathCause = CollisionSystem.checkPlayerArena(this.player) ? 'wall'
            : (boss && boss.alive && boss.touches(this.player)) ? 'boss' : 'bullet';
    }
    return originalTriggerDeath.call(this);
};

// ============================================================
// Başlatma (main.js ile aynı döngü)
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);
    window.game = game;
    game.ui.game = game;
    game.ui.focusIndex = -1;
    game.ui.keyboardFocus = false;
    installSandbox(game);

    const toCanvas = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * GAME_CONFIG.CANVAS.WIDTH / r.width, y: (e.clientY - r.top) * GAME_CONFIG.CANVAS.HEIGHT / r.height };
    };

    // D1: üzerine gelme ve işaretçi
    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const p = toCanvas(e);
        const ui = game.ui;
        let key = null;
        if (game.state === GAME_STATE.MENU && !ui.settingsOpen) {
            const a = ui.getMenuAction(p.x, p.y);
            key = a.type === 'none' ? null : a.key;
        } else if (game.state === GAME_STATE.DEAD && ui.hitsRetry(p.x, p.y)) {
            key = 'retry';
        } else if (ui.settingsOpen) {
            key = ui.getSettingsAction(p.x, p.y) ? 'settings-row' : null;
        }
        ui.hoverKey = key;
        if (key) ui.keyboardFocus = false;
        canvas.style.cursor = game.state === GAME_STATE.PLAYING ? 'crosshair' : key ? 'pointer' : 'default';
    });

    // K6: sonuç ekranında sadece butona tıklamak yeniden başlatır
    window.addEventListener('pointerdown', (e) => {
        if (e.target !== canvas || game.state !== GAME_STATE.DEAD || e.button === 2) return;
        const p = toCanvas(e);
        if (!game.ui.hitsRetry(p.x, p.y)) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    // K4: menüde klavye ile gezinme (oyunun kendi tuş işleyicisinden önce çalışır)
    window.addEventListener('keydown', (e) => {
        const ui = game.ui;
        if (game.state !== GAME_STATE.MENU || ui.settingsOpen) return;
        const n = FOCUS_ORDER.length;
        const move = (d) => {
            ui.keyboardFocus = true;
            ui.focusIndex = ui.focusIndex < 0 ? (d > 0 ? 0 : n - 1) : (ui.focusIndex + d + n) % n;
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        if (e.code === 'ArrowDown' || (e.code === 'Tab' && !e.shiftKey)) return move(1);
        if (e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey)) return move(-1);
        if ((e.code === 'Enter' || e.code === 'Space') && ui.keyboardFocus && ui.focusIndex >= 0) {
            const key = FOCUS_ORDER[ui.focusIndex];
            e.preventDefault();
            e.stopImmediatePropagation();
            if (key === 'play') game.startGame();
            else if (key === 'settings') game.openSettings();
            else if (key === 'skin') game.cycleSkin(1);
            else game.selectMode(key);
        }
    }, true);

    let last = performance.now();
    const loop = (now) => {
        let dt = (now - last) / 1000;
        last = now;
        if (dt > 0.05) dt = 0.05;
        game.update(dt);
        game.render();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame((t0) => { last = t0; requestAnimationFrame(loop); });
});
