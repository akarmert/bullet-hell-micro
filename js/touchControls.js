// ============================================================
// touchControls.js — Mobil Dokunmatik Kontrol Sistemi
// İki şema:
//   'joystick' : PUBG / FIFA tarzı yüzen sanal joystick + sağ altta DASH butonu
//   'drag'     : Göreli sürükleme (parmak ne kadar kayarsa gemi o kadar gider)
// Kontroller tam ekran bir overlay canvas'a çizilir; böylece dikey ekranda
// arenanın altındaki boş alan da başparmak bölgesi olarak kullanılabilir.
// ============================================================

import { GAME_CONFIG } from './config.js';
import { getSafeInsets, getViewport, toVirtual } from './layout.js';
import { Quality } from './quality.js';

export class TouchControls {
    /**
     * @param {Object} opts
     * @param {(clientX:number, clientY:number) => {x:number, y:number}} opts.toCanvas
     * @param {() => void} opts.onDash
     * @param {(dx:number, dy:number) => void} opts.onDragDelta  Mantıksal px cinsinden
     */
    constructor({ toCanvas, onDash, onDragDelta }) {
        this.toCanvas = toCanvas;
        this.onDash = onDash;
        this.onDragDelta = onDragDelta;

        this.scheme = this.loadScheme();

        // Joystick durumu (CSS piksel, ekran uzayı)
        this.joyPointerId = null;
        this.joyBase = { x: 0, y: 0 };
        this.joyKnob = { x: 0, y: 0 };
        this.vector = { x: 0, y: 0 };

        // Dash butonu basılı tutma görseli
        this.dashPointerId = null;
        this.dashPressedAt = 0;

        // Sürükleme şeması durumu
        this.dragPointerId = null;
        this.dragLast = null;
        this.lastDragUpTime = 0;

        this.activePointers = new Set();

        // Tam ekran overlay canvas (dokunmaları engellemez)
        this.overlay = document.createElement('canvas');
        this.overlay.className = 'touch-overlay';
        // Kapsayıcıya eklenir: görünüm döndürüldüğünde overlay de onunla birlikte döner
        (document.querySelector('.game-container') || document.body).appendChild(this.overlay);
        this.overlayDirty = true;
        this.octx = this.overlay.getContext('2d');
        this.dpr = 1;
        this.layout = null; // Game.applyLayout tarafından atanır (yatay/dikey, tam ekran)
        this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    // ------------------------------------------------------------
    // Şema yönetimi
    // ------------------------------------------------------------

    loadScheme() {
        try {
            const saved = localStorage.getItem(GAME_CONFIG.TOUCH.SCHEME_STORAGE_KEY);
            if (saved === 'joystick' || saved === 'drag') return saved;
        } catch (e) { /* yok say */ }
        return GAME_CONFIG.TOUCH.DEFAULT_SCHEME;
    }

    toggleScheme() {
        this.scheme = this.scheme === 'joystick' ? 'drag' : 'joystick';
        try {
            localStorage.setItem(GAME_CONFIG.TOUCH.SCHEME_STORAGE_KEY, this.scheme);
        } catch (e) { /* yok say */ }
        this.reset();
        return this.scheme;
    }

    get isJoystick() {
        return this.scheme === 'joystick';
    }

    // ------------------------------------------------------------
    // Yerleşim
    // ------------------------------------------------------------

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, Quality.settings.dpr);
        const vp = getViewport();
        this.vw = vp.w;
        this.vh = vp.h;
        this.overlay.style.width = `${this.vw}px`;
        this.overlay.style.height = `${this.vh}px`;
        this.overlay.width = Math.round(this.vw * this.dpr);
        this.overlay.height = Math.round(this.vh * this.dpr);
        this.overlayDirty = true;
        this.insets = getSafeInsets();
    }

    setLayout(layout) {
        this.layout = layout;
        this.resize();
    }

    get isLandscape() {
        return !!(this.layout && this.layout.landscape);
    }

    getDashButton() {
        const J = GAME_CONFIG.JOYSTICK;
        const ins = this.insets;
        const r = J.DASH_BUTTON_RADIUS;
        // Yatayda biraz daha yukarı: başparmak doğal olarak ekranın alt-orta kısmında durur
        const lift = this.isLandscape ? 30 : 16;
        return {
            x: this.vw - ins.right - J.DASH_BUTTON_MARGIN - r,
            y: this.vh - ins.bottom - J.DASH_BUTTON_MARGIN - r - lift,
            r
        };
    }

    getJoystickHint() {
        const J = GAME_CONFIG.JOYSTICK;
        const ins = this.insets;
        const lift = this.isLandscape ? 30 : 16;
        return {
            x: ins.left + J.DASH_BUTTON_MARGIN + J.BASE_RADIUS,
            y: this.vh - ins.bottom - J.DASH_BUTTON_MARGIN - J.BASE_RADIUS - lift,
            r: J.BASE_RADIUS
        };
    }

    isOnDashButton(x, y) {
        const b = this.getDashButton();
        const hit = b.r + 14; // Parmak için cömert dokunma alanı
        return (x - b.x) ** 2 + (y - b.y) ** 2 <= hit * hit;
    }

    // ------------------------------------------------------------
    // Girdi olayları (oyun sırasında çağrılır)
    // ------------------------------------------------------------

    /**
     * Pointer olayını sanal görünüm koordinatlarıyla sarar (döndürülmüş görünüm desteği)
     */
    norm(e) {
        const v = toVirtual(e.clientX, e.clientY);
        return { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, x: v.x, y: v.y };
    }

    down(ev) {
        const e = this.norm(ev);
        this.activePointers.add(e.pointerId);
        if (this.isJoystick) {
            this.joystickDown(e);
        } else {
            this.dragDown(e);
        }
    }

    move(ev) {
        if (!this.activePointers.has(ev.pointerId)) return;
        const e = this.norm(ev);

        if (e.pointerId === this.joyPointerId) {
            this.updateKnob(e.x, e.y);
        } else if (e.pointerId === this.dragPointerId && this.dragLast) {
            const c = this.toCanvas(e.clientX, e.clientY);
            const sens = GAME_CONFIG.TOUCH.SENSITIVITY;
            const dx = (c.x - this.dragLast.x) * sens;
            const dy = (c.y - this.dragLast.y) * sens;
            this.dragLast = c;
            if (dx !== 0 || dy !== 0) this.onDragDelta(dx, dy);
        }
    }

    up(e) {
        this.activePointers.delete(e.pointerId);

        if (e.pointerId === this.joyPointerId) {
            this.joyPointerId = null;
            this.vector.x = 0;
            this.vector.y = 0;
        }
        if (e.pointerId === this.dashPointerId) {
            this.dashPointerId = null;
        }
        if (e.pointerId === this.dragPointerId) {
            this.dragPointerId = null;
            this.dragLast = null;
            this.lastDragUpTime = performance.now();
        }
    }

    /**
     * Tur başı / duraklatma / ölümde tüm dokunmatik durumu sıfırlar
     */
    reset() {
        this.joyPointerId = null;
        this.vector.x = 0;
        this.vector.y = 0;
        this.dashPointerId = null;
        this.dragPointerId = null;
        this.dragLast = null;
        this.activePointers.clear();
    }

    // --- Joystick şeması ---

    joystickDown(e) {
        const x = e.x, y = e.y;

        // 1. Sağ alt DASH butonu
        if (this.isOnDashButton(x, y)) {
            this.dashPointerId = e.pointerId;
            this.dashPressedAt = performance.now();
            this.onDash();
            return;
        }

        // 2. Joystick zaten aktifse, ekranın başka bir yerine 2. parmak = DASH
        if (this.joyPointerId !== null) {
            this.dashPressedAt = performance.now();
            this.onDash();
            return;
        }

        // 3. Yüzen joystick: parmağın değdiği yerde belirir
        this.joyPointerId = e.pointerId;
        this.joyBase.x = x;
        this.joyBase.y = y;
        this.joyKnob.x = x;
        this.joyKnob.y = y;
        this.vector.x = 0;
        this.vector.y = 0;
    }

    updateKnob(x, y) {
        const J = GAME_CONFIG.JOYSTICK;
        const R = J.BASE_RADIUS;
        let dx = x - this.joyBase.x;
        let dy = y - this.joyBase.y;
        let dist = Math.hypot(dx, dy);

        // Parmak tabanın dışına taşarsa taban parmağı takip eder (yön değiştirmek kolaylaşır)
        if (dist > R) {
            if (J.FOLLOW) {
                const k = (dist - R) / dist;
                this.joyBase.x += dx * k;
                this.joyBase.y += dy * k;
                dx = x - this.joyBase.x;
                dy = y - this.joyBase.y;
            } else {
                dx *= R / dist;
                dy *= R / dist;
            }
            dist = R;
        }

        this.joyKnob.x = this.joyBase.x + dx;
        this.joyKnob.y = this.joyBase.y + dy;

        // Ölü bölge + hassasiyet eğrisi
        const raw = dist / R;
        if (raw < J.DEADZONE || dist === 0) {
            this.vector.x = 0;
            this.vector.y = 0;
            return;
        }
        const t = (raw - J.DEADZONE) / (1 - J.DEADZONE);
        const mag = Math.pow(t, J.CURVE);
        this.vector.x = (dx / dist) * mag;
        this.vector.y = (dy / dist) * mag;
    }

    /**
     * Oyuncuya uygulanacak analog hareket vektörü (büyüklük 0..1)
     */
    getVector() {
        return this.vector;
    }

    get joystickActive() {
        return this.joyPointerId !== null;
    }

    // --- Sürükleme şeması ---

    dragDown(e) {
        const c = this.toCanvas(e.clientX, e.clientY);

        // Sürükleyen parmak varken yeni parmak = DASH
        if (this.dragPointerId !== null && this.dragPointerId !== e.pointerId) {
            this.onDash();
            return;
        }

        const sinceUp = performance.now() - this.lastDragUpTime;
        this.dragPointerId = e.pointerId;
        this.dragLast = c;

        // Çift dokunma = DASH
        if (sinceUp < GAME_CONFIG.TOUCH.DOUBLE_TAP_MS) {
            this.onDash();
        }
    }

    // ------------------------------------------------------------
    // Çizim (overlay)
    // ------------------------------------------------------------

    /**
     * @param {boolean} visible  Oyun sırasında ve dokunmatik kullanımda true
     * @param {number} dashRatio 0..1 dash şarjı
     */
    render(visible, dashRatio) {
        const ctx = this.octx;
        const show = visible && this.isJoystick;
        // Görünmezken her karede tam ekran temizleme yapma (mobilde gereksiz piksel işi)
        if (!show && !this.overlayDirty) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.vw, this.vh);
        this.overlayDirty = show;
        if (!show) return;

        const J = GAME_CONFIG.JOYSTICK;
        // Tüm kontroller yarı şeffaf: mermiler kontrollerin altından görünür kalır
        const op = GAME_CONFIG.CONTROLS_OPACITY;
        const a = (v) => (v * op).toFixed(3);

        ctx.save();

        // --- Joystick ---
        if (this.joystickActive) {
            // Taban: neredeyse görünmez dolgu, ince halka
            ctx.beginPath();
            ctx.arc(this.joyBase.x, this.joyBase.y, J.BASE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${a(0.06)})`;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = `rgba(255, 255, 255, ${a(0.45)})`;
            ctx.stroke();

            // Yön göstergesi (itiş gücüyle parlayan yay)
            const mag = Math.hypot(this.vector.x, this.vector.y);
            if (mag > 0) {
                const ang = Math.atan2(this.vector.y, this.vector.x);
                ctx.beginPath();
                ctx.arc(this.joyBase.x, this.joyBase.y, J.BASE_RADIUS, ang - 0.5, ang + 0.5);
                ctx.lineWidth = 3;
                ctx.strokeStyle = `rgba(0, 255, 255, ${a(0.5 + mag * 0.5)})`;
                ctx.stroke();
            }

            // Topuz: cam görünümü
            ctx.beginPath();
            ctx.arc(this.joyKnob.x, this.joyKnob.y, J.KNOB_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${a(0.18)})`;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = `rgba(255, 255, 255, ${a(0.7)})`;
            ctx.stroke();
        } else {
            // Boşta: sol altta silik kesikli ipucu halkası
            const hint = this.getJoystickHint();
            ctx.setLineDash([5, 7]);
            ctx.beginPath();
            ctx.arc(hint.x, hint.y, hint.r, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(255, 255, 255, ${a(0.3)})`;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = `rgba(255, 255, 255, ${a(0.4)})`;
            ctx.fillText('HAREKET', hint.x, hint.y);
        }

        // --- DASH Butonu ---
        const b = this.getDashButton();
        const ready = dashRatio >= 1;
        const pressed = this.dashPointerId !== null || performance.now() - this.dashPressedAt < 120;
        const r = pressed ? b.r * 0.92 : b.r;

        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = pressed
            ? `rgba(255, 255, 255, ${a(0.3)})`
            : `rgba(255, 255, 255, ${a(ready ? 0.08 : 0.03)})`;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ready
            ? `rgba(0, 255, 255, ${a(0.75)})`
            : `rgba(255, 255, 255, ${a(0.25)})`;
        ctx.stroke();

        // Şarj halkası
        if (!ready) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashRatio);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = `rgba(0, 255, 255, ${a(0.6)})`;
            ctx.stroke();
        }

        ctx.font = '800 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255, 255, 255, ${a(ready ? 0.9 : 0.4)})`;
        ctx.fillText('DASH', b.x, b.y);

        ctx.restore();
    }
}
