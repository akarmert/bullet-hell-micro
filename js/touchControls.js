// ============================================================
// touchControls.js — Mobil Dokunmatik Kontrol Sistemi
// İki şema:
//   'joystick' : PUBG / FIFA tarzı yüzen sanal joystick + sağ altta DASH butonu
//   'drag'     : Göreli sürükleme (parmak ne kadar kayarsa gemi o kadar gider)
// Kontroller tam ekran bir overlay canvas'a çizilir; böylece dikey ekranda
// arenanın altındaki boş alan da başparmak bölgesi olarak kullanılabilir.
// ============================================================

import { GAME_CONFIG } from './config.js';

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
        document.body.appendChild(this.overlay);
        this.octx = this.overlay.getContext('2d');
        this.dpr = 1;
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
        this.dpr = Math.min(window.devicePixelRatio || 1, GAME_CONFIG.DISPLAY.MAX_DPR);
        this.vw = window.innerWidth;
        this.vh = window.innerHeight;
        this.overlay.width = Math.round(this.vw * this.dpr);
        this.overlay.height = Math.round(this.vh * this.dpr);
    }

    getDashButton() {
        const J = GAME_CONFIG.JOYSTICK;
        const r = J.DASH_BUTTON_RADIUS;
        return {
            x: this.vw - J.DASH_BUTTON_MARGIN - r,
            y: this.vh - J.DASH_BUTTON_MARGIN - r - 16,
            r
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

    down(e) {
        this.activePointers.add(e.pointerId);
        if (this.isJoystick) {
            this.joystickDown(e);
        } else {
            this.dragDown(e);
        }
    }

    move(e) {
        if (!this.activePointers.has(e.pointerId)) return;

        if (e.pointerId === this.joyPointerId) {
            this.updateKnob(e.clientX, e.clientY);
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
        const x = e.clientX, y = e.clientY;

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
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.vw, this.vh);
        if (!visible || !this.isJoystick) return;

        const J = GAME_CONFIG.JOYSTICK;
        ctx.save();

        // --- Joystick ---
        if (this.joystickActive) {
            // Taban
            ctx.beginPath();
            ctx.arc(this.joyBase.x, this.joyBase.y, J.BASE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.06)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
            ctx.stroke();

            // Yön göstergesi (itiş gücüne göre parlayan yay)
            const mag = Math.hypot(this.vector.x, this.vector.y);
            if (mag > 0) {
                const ang = Math.atan2(this.vector.y, this.vector.x);
                ctx.beginPath();
                ctx.arc(this.joyBase.x, this.joyBase.y, J.BASE_RADIUS, ang - 0.5, ang + 0.5);
                ctx.lineWidth = 4;
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.35 + mag * 0.6})`;
                ctx.stroke();
            }

            // Topuz
            ctx.beginPath();
            ctx.arc(this.joyKnob.x, this.joyKnob.y, J.KNOB_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.28)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(200, 255, 255, 0.85)';
            ctx.stroke();
        } else {
            // Boşta: sol altta silik ipucu halkası
            const hx = J.DASH_BUTTON_MARGIN + J.BASE_RADIUS;
            const hy = this.vh - J.DASH_BUTTON_MARGIN - J.BASE_RADIUS - 16;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(hx, hy, J.BASE_RADIUS, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.18)';
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '600 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 255, 255, 0.35)';
            ctx.fillText('HAREKET', hx, hy);
        }

        // --- DASH Butonu ---
        const b = this.getDashButton();
        const ready = dashRatio >= 1;
        const pressed = this.dashPointerId !== null || performance.now() - this.dashPressedAt < 120;
        const r = pressed ? b.r * 0.92 : b.r;

        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = ready
            ? (pressed ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 255, 255, 0.18)')
            : 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ready ? 'rgba(0, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.18)';
        ctx.stroke();

        // Şarj halkası
        if (!ready) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashRatio);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.55)';
            ctx.stroke();
        } else {
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(b.x, b.y, r + 5, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.font = '800 14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ready ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
        ctx.fillText('DASH', b.x, b.y);

        ctx.restore();
    }
}
