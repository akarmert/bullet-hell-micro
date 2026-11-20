// ============================================================
// telemetry.js — On-device performance recorder (perf builds only)
//
// Enabled by `npm run apk:perf` (VITE_PERF_TELEMETRY=true, see .env.perf) or, on the
// dev server, by adding ?perf to the address. Never part of a normal/release build:
// main.js imports this file only behind a compile-time flag.
//
// Records, from app start:
//   - every frame: interval, update/render CPU ms, sim steps, state, orientation,
//     quality level, bullets, particles, WebGL draw calls, texture uploads/bakes
//   - every second: JS heap, baked texture count, buffer size, battery
//   - events: resize/rotation, state, quality, boss, long tasks, slow input,
//     JS errors, WebGL context loss, visibility
// A small HUD shows how many seconds were PLAYED in portrait and in landscape.
// tools/perf/collect.mjs pulls everything over USB (adb + DevTools protocol)
// through `window.__perf`.
// ============================================================

import { THEME } from './theme.js';
import { getLang } from './i18n.js';

const CAP = 120000;                // frames (~16 min at 120 Hz)
const TARGET_S = 30;               // seconds of play wanted per orientation
const FIELDS = ['t', 'dt', 'upd', 'rnd', 'steps', 'state', 'orient', 'q', 'bullets', 'particles',
    'draws', 'texUp', 'upKB', 'bakes', 'boss'];
const STATES = { MENU: 0, PLAYING: 1, PAUSED: 2, DEAD: 3 };

function orientation() {
    return window.innerWidth > window.innerHeight ? 1 : 0; // 0 portrait, 1 landscape
}

export class PerfRecorder {
    /** @param {import('./game.js').Game} game */
    constructor(game) {
        this.game = game;
        this.t0 = performance.now();
        this.n = 0;
        this.truncated = false;
        this.cols = {};
        for (const f of FIELDS) this.cols[f] = new Float32Array(CAP);
        this.events = [];
        this.seconds = [];
        this.playS = [0, 0];       // played seconds per orientation
        this.lastState = '';
        this.lastQ = -1;
        this.lastBoss = false;
        // Per-frame counters filled by hooks
        this.fDraws = 0;
        this.fTex = 0;
        this.fUpKB = 0;
        this.fBakes = 0;
        this.device = this.collectDevice();
        this.hookTextures();
        this.hookGl();
        this.observe();
        this.buildHud();
        this.lastSecond = this.t0;
        setInterval(() => this.sampleSecond(), 1000);
        setInterval(() => this.updateHud(), 500);
        this.event('start', { orient: orientation(), w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
    }

    now() {
        return performance.now() - this.t0;
    }

    event(type, data = {}) {
        if (this.events.length < 20000) this.events.push({ t: +this.now().toFixed(1), type, ...data });
    }

    // ------------------------------------------------------------
    // Hooks
    // ------------------------------------------------------------

    hookTextures() {
        const perf = this.game.renderer.perf;
        if (!perf || perf.__hooked) return;
        perf.reset();
        const rec = this;
        const orig = perf.record;
        perf.record = function (name, bytes) {
            rec.fUpKB += bytes / 1024;
            return orig.call(this, name, bytes);
        };
        perf.__hooked = true;
        this.bakesBase = perf.bakes;
    }

    hookGl() {
        const r = this.game.renderer.app && this.game.renderer.app.renderer;
        const gl = r && r.gl;
        if (!gl) return;
        const rec = this;
        for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            const orig = gl[m];
            if (typeof orig !== 'function') continue;
            gl[m] = function (...a) { rec.fDraws++; return orig.apply(this, a); };
        }
        for (const m of ['texImage2D', 'texSubImage2D']) {
            const orig = gl[m];
            if (typeof orig !== 'function') continue;
            gl[m] = function (...a) { rec.fTex++; return orig.apply(this, a); };
        }
    }

    observe() {
        const PO = window.PerformanceObserver;
        const supported = (PO && PO.supportedEntryTypes) || [];
        if (supported.includes('longtask')) {
            new PO((list) => {
                for (const e of list.getEntries()) {
                    this.event('longtask', { start: +(e.startTime - this.t0).toFixed(1), dur: +e.duration.toFixed(1) });
                }
            }).observe({ type: 'longtask', buffered: false });
        }
        if (supported.includes('event')) {
            // Event Timing: input → next paint. Only slow ones (>= 40 ms) are kept.
            new PO((list) => {
                for (const e of list.getEntries()) {
                    this.event('input', {
                        name: e.name,
                        start: +(e.startTime - this.t0).toFixed(1),
                        dur: e.duration,
                        delay: +(e.processingStart - e.startTime).toFixed(1),
                        proc: +(e.processingEnd - e.processingStart).toFixed(1)
                    });
                }
            }).observe({ type: 'event', durationThreshold: 40, buffered: false });
        }
        window.addEventListener('error', (e) => this.event('error', {
            msg: String(e.message).slice(0, 300), src: `${e.filename}:${e.lineno}:${e.colno}`
        }));
        window.addEventListener('unhandledrejection', (e) => this.event('error', {
            msg: `unhandledrejection: ${String(e.reason && (e.reason.stack || e.reason)).slice(0, 300)}`
        }));
        const origErr = console.error;
        console.error = (...a) => {
            this.event('console.error', { msg: a.map(String).join(' ').slice(0, 300) });
            origErr.apply(console, a);
        };
        const origWarn = console.warn;
        console.warn = (...a) => {
            this.event('console.warn', { msg: a.map(String).join(' ').slice(0, 300) });
            origWarn.apply(console, a);
        };
        const canvas = this.game.canvas;
        canvas.addEventListener('webglcontextlost', () => this.event('contextlost'));
        canvas.addEventListener('webglcontextrestored', () => this.event('contextrestored'));
        document.addEventListener('visibilitychange', () => this.event('visibility', { hidden: document.hidden }));
        let resizeTimer = 0;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.event('resize', this.viewInfo()), 150);
        });
    }

    viewInfo() {
        const c = this.game.canvas;
        const st = this.game.renderer.ready ? this.game.renderer.getStats() : {};
        return {
            orient: orientation(), w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
            bufW: c.width, bufH: c.height, texRes: st.textureRes, q: this.game.quality.level
        };
    }

    collectDevice() {
        const d = {
            ua: navigator.userAgent,
            cores: navigator.hardwareConcurrency,
            memGB: navigator.deviceMemory,
            screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio },
            touch: matchMedia('(pointer: coarse)').matches,
            theme: THEME.mode,
            lang: getLang(),
            settings: { ...this.game.settings.values },
            mode: this.game.currentMode && this.game.currentMode.id
        };
        try {
            const r = this.game.renderer.app.renderer;
            const gl = r.gl;
            d.renderer = r.name;
            d.glVersion = gl.getParameter(gl.VERSION);
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            d.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            d.gpuVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
            d.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            d.samples = gl.getParameter(gl.SAMPLES);
            d.contextAttrs = gl.getContextAttributes();
        } catch (e) {
            d.glError = String(e);
        }
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList'])
                .then((v) => { d.uaData = v; }).catch(() => {});
        }
        return d;
    }

    // ------------------------------------------------------------
    // Sampling
    // ------------------------------------------------------------

    /**
     * Called by main.js once per animation frame.
     * @param {number} dt frame interval (ms)
     * @param {number} steps fixed simulation steps run
     * @param {number} upd update CPU time (ms)
     * @param {number} rnd render CPU time (ms, incl. Pixi submit)
     */
    frame(dt, steps, upd, rnd) {
        const g = this.game;
        const state = g.state;
        const orient = orientation();
        if (state !== this.lastState) {
            this.event('state', { from: this.lastState, to: state, orient });
            this.lastState = state;
        }
        const q = g.quality.level;
        if (q !== this.lastQ) {
            if (this.lastQ >= 0) this.event('quality', { from: this.lastQ, to: q, ...this.viewInfo() });
            this.lastQ = q;
        }
        const boss = !!(g.waveManager && g.waveManager.bossActive);
        if (boss !== this.lastBoss) {
            this.event(boss ? 'bossStart' : 'bossEnd', { elapsedMs: Math.round(g.elapsedMs) });
            this.lastBoss = boss;
        }
        if (state === 'PLAYING' && dt > 0 && dt < 250) this.playS[orient] += dt / 1000;

        const perf = g.renderer.perf;
        const bakes = perf ? perf.bakes - this.bakesBase : 0;
        if (perf) this.bakesBase = perf.bakes;

        if (this.n >= CAP) {
            this.truncated = true;
        } else {
            const i = this.n++;
            const c = this.cols;
            const st = g.renderer.ready ? g.renderer.world.stats : null;
            c.t[i] = this.now();
            c.dt[i] = dt;
            c.upd[i] = upd;
            c.rnd[i] = rnd;
            c.steps[i] = steps;
            c.state[i] = STATES[state] ?? -1;
            c.orient[i] = orient;
            c.q[i] = q;
            c.bullets[i] = st ? st.bullets : 0;
            c.particles[i] = g.renderer.ready ? g.renderer.fx.stats.particles : 0;
            c.draws[i] = this.fDraws;
            c.texUp[i] = this.fTex;
            c.upKB[i] = this.fUpKB;
            c.bakes[i] = bakes;
            c.boss[i] = boss ? 1 : 0;
        }
        this.fDraws = 0;
        this.fTex = 0;
        this.fUpKB = 0;
    }

    sampleSecond() {
        const g = this.game;
        const m = performance.memory;
        const s = {
            t: Math.round(this.now()),
            heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(2) : null,
            heapTotalMB: m ? +(m.totalJSHeapSize / 1048576).toFixed(2) : null,
            baked: g.renderer.ready ? g.renderer.perf.bakedCount() : null,
            state: g.state,
            fps: +g.quality.fps.toFixed(1),
            hz: Math.round(1000 / g.quality.interval),
            ...this.viewInfo()
        };
        if (this.battery) {
            s.battery = this.battery.level;
            s.charging = this.battery.charging;
        } else if (navigator.getBattery && !this.batteryAsked) {
            this.batteryAsked = true;
            navigator.getBattery().then((b) => { this.battery = b; }).catch(() => {});
        }
        this.seconds.push(s);
    }

    // ------------------------------------------------------------
    // HUD + API
    // ------------------------------------------------------------

    buildHud() {
        const el = document.createElement('div');
        el.id = 'perfHud';
        Object.assign(el.style, {
            position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 4px)', left: '50%',
            transform: 'translateX(-50%)', zIndex: '9999', pointerEvents: 'none',
            font: '600 11px/1.3 system-ui, sans-serif', color: '#fff', background: 'rgba(30,10,40,0.72)',
            padding: '3px 8px', borderRadius: '8px', whiteSpace: 'nowrap'
        });
        document.body.appendChild(el);
        this.hud = el;
        this.updateHud();
    }

    status() {
        const p = Math.min(TARGET_S, this.playS[0]);
        const l = Math.min(TARGET_S, this.playS[1]);
        return {
            portraitS: +this.playS[0].toFixed(1),
            landscapeS: +this.playS[1].toFixed(1),
            target: TARGET_S,
            done: p >= TARGET_S && l >= TARGET_S,
            frames: this.n,
            truncated: this.truncated,
            state: this.game.state,
            orient: orientation() ? 'landscape' : 'portrait',
            fps: +this.game.quality.fps.toFixed(1),
            q: this.game.quality.level
        };
    }

    updateHud() {
        if (!this.hud) return;
        const s = this.status();
        const part = (label, v) => `${label} ${Math.min(TARGET_S, Math.floor(v))}/${TARGET_S}${v >= TARGET_S ? ' ✓' : ''}`;
        this.hud.textContent = s.done
            ? '✓ KAYIT TAMAM · bilgisayara dönebilirsin'
            : `● KAYIT · ${part('Dikey', s.portraitS)} · ${part('Yatay', s.landscapeS)}`;
        this.hud.style.background = s.done ? 'rgba(20,120,60,0.85)' : 'rgba(30,10,40,0.72)';
    }

    /** Full dump as a JSON string (pulled by tools/perf/collect.mjs). */
    export() {
        const frames = {};
        const n = this.n;
        for (const f of FIELDS) {
            const col = this.cols[f];
            const out = new Array(n);
            const dec = f === 't' || f === 'dt' || f === 'upd' || f === 'rnd' || f === 'upKB' ? 100 : 1;
            for (let i = 0; i < n; i++) out[i] = Math.round(col[i] * dec) / dec;
            frames[f] = out;
        }
        const perf = this.game.renderer.perf;
        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            durationMs: Math.round(this.now()),
            device: this.device,
            status: this.status(),
            stateCodes: STATES,
            frames,
            seconds: this.seconds,
            events: this.events,
            uploadsByName: perf ? perf.uploads : null,
            bakedCount: perf ? perf.bakedCount() : null,
            hzEstimate: Math.round(1000 / this.game.quality.interval)
        });
    }
}

/** Creates the recorder once the renderer is ready and exposes `window.__perf`. */
export function startTelemetry(game) {
    const rec = new PerfRecorder(game);
    window.__perf = {
        status: () => rec.status(),
        export: () => rec.export(),
        mark: (label) => rec.event('mark', { label: String(label) })
    };
    return rec;
}
