// Bağımsız pointer sahipliği, joystick ve Dash'in iki parmakla kullanılmasını sağlar.
export class TouchControls {
    constructor(onDash) {
        this.layer = document.getElementById('touchControls');
        this.stick = document.getElementById('joystick');
        this.knob = document.getElementById('joystickKnob');
        this.dash = document.getElementById('dashButton');
        this.ring = document.getElementById('dashRing');
        this.input = { x: 0, y: 0 };
        this.pointers = new Map();
        this.visible = false;
        this.pressedUntil = 0;
        this.touchDevice = matchMedia('(any-pointer: coarse)').matches;
        const isolate = (event) => { event.preventDefault(); event.stopPropagation(); };
        for (const element of [this.stick, this.dash]) {
            element.addEventListener('pointerdown', (event) => {
                isolate(event);
                if (!this.visible || this.pointers.has(element)) return;
                this.pointers.set(element, event.pointerId);
                element.setPointerCapture(event.pointerId);
                if (element === this.stick) {
                    this.stick.classList.add('active');
                    this.move(event);
                } else {
                    this.pressedUntil = performance.now() + 180;
                    onDash();
                }
            });
            element.addEventListener('pointermove', (event) => {
                isolate(event);
                if (element === this.stick && this.pointers.get(element) === event.pointerId) this.move(event);
            });
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
                element.addEventListener(type, (event) => {
                    isolate(event);
                    if (this.pointers.get(element) !== event.pointerId) return;
                    this.release(element);
                });
            }
            element.addEventListener('click', isolate);
            element.addEventListener('contextmenu', isolate);
        }
        this.dash.addEventListener('keydown', (event) => {
            if (event.code !== 'Space' && event.code !== 'Enter') return;
            isolate(event);
            if (!event.repeat && this.visible) onDash();
        });
        window.addEventListener('blur', () => this.reset());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
        window.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch') this.touchDevice = true;
        }, { capture: true });
    }

    move(event) {
        const rect = this.stick.getBoundingClientRect();
        const radius = rect.width * .32;
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        const length = Math.hypot(dx, dy);
        const fraction = Math.min(1, length / radius);
        const strength = Math.max(0, (fraction - .15) / .85);
        this.input.x = length ? dx / length * strength : 0;
        this.input.y = length ? dy / length * strength : 0;
        this.knob.style.transform = `translate(${length ? dx / length * fraction * radius : 0}px, ${length ? dy / length * fraction * radius : 0}px)`;
    }

    release(element) {
        const id = this.pointers.get(element);
        this.pointers.delete(element);
        if (id !== undefined && element.hasPointerCapture(id)) element.releasePointerCapture(id);
        if (element === this.stick) {
            this.input.x = this.input.y = 0;
            this.knob.style.transform = '';
            this.stick.classList.remove('active');
        }
    }

    reset() {
        this.release(this.stick);
        this.release(this.dash);
        this.pressedUntil = 0;
    }

    /**
     * @param {boolean} showBar Şerit görünsün mü (dokunmatik + oyun/duraklatma/oyun bitti)
     * @param {boolean} interactive Joystick ve DASH girdi alsın mı (sadece oynarken)
     */
    update(showBar, interactive, player) {
        if (this.layer.hidden === showBar) this.layer.hidden = !showBar;
        const visible = showBar && interactive;
        if (this.visible !== visible) {
            this.reset();
            this.visible = visible;
        }
        const ratio = player.getDashReadyRatio();
        this.ring.style.strokeDashoffset = String(1 - ratio);
        this.dash.classList.toggle('ready', ratio >= 1);
        this.dash.classList.toggle('pressed', performance.now() < this.pressedUntil);
    }
}
