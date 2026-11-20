// ============================================================
// render/pixiRenderer.js — The game's only on-screen renderer (PixiJS v8)
//
// Stage = logical arena (height 600 units, width from the aspect ratio), scaled
// to the canvas' CSS size. The renderer only READS game state; game logic never
// imports PixiJS, so it stays testable in Node.
// ============================================================

import 'pixi.js/unsafe-eval'; // No runtime eval/new Function → works under a strict CSP
import { Application, Container } from 'pixi.js';
import { GAME_CONFIG } from '../config.js';
import { THEME } from '../theme.js';
import { setBakeResolution, invalidateBaked, flushTextureTrash, TexState, PerfStats } from './textures.js';
import { WorldView } from './worldView.js';
import { FxView } from './fxView.js';
import { UiView } from './uiView.js';
import { resetGlyphMetrics } from './glyphText.js';
import { BackdropView } from './backdropView.js';

export class PixiRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.app = null;
        this.ready = false;
        this.lost = false;
        this.themeKey = '';
        this.stats = { drawCalls: 0 };
    }

    async init() {
        const app = new Application();
        await app.init({
            canvas: this.canvas,
            preference: 'webgl',          // Most compatible across mobile WebViews; WebGPU not required
            antialias: true,
            autoDensity: false,           // CSS keeps the canvas at 100%; Pixi only sizes the drawing buffer
            resolution: 1,
            backgroundColor: 0xfff6fa,
            autoStart: false,             // The game loop calls render() itself
            sharedTicker: false,
            powerPreference: 'high-performance',
            hello: false
        });
        this.app = app;

        // Layers (back → front)
        this.root = new Container();
        this.world = new WorldView();
        this.menuBackdrop = new BackdropView();
        this.fx = new FxView();
        this.ui = new UiView();
        this.shaken = new Container();     // Play field + effects shake together (UI does not)
        this.shaken.addChild(this.world.field, this.fx.container);
        this.root.addChild(this.world.background, this.menuBackdrop.container, this.shaken, this.ui.container);
        app.stage.addChild(this.root);

        // Mobile WebViews may drop the GL context when backgrounded
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.lost = true;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.lost = false;
            invalidateBaked(); // Re-create every generated texture on the new context
        });
        this.ready = true;
    }

    /**
     * Resizes the drawing buffer. Called from arena.js with the canvas CSS size.
     * @param {number} cssW
     * @param {number} cssH
     * @param {number} dpr Device pixel ratio cap already applied
     */
    resize(cssW, cssH, dpr) {
        if (!this.app) return;
        this.app.renderer.resize(cssW, cssH, dpr);
        const scale = cssH / GAME_CONFIG.CANVAS.HEIGHT;
        this.root.scale.set(scale);
        setBakeResolution(dpr * scale);
    }

    /** Draws the current game state. */
    render(game) {
        if (!this.ready || this.lost) return;
        const w = GAME_CONFIG.CANVAS.WIDTH;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        // Theme / contrast / language changes re-bake every generated texture
        const themeKey = `${THEME.mode}|${THEME.highContrast}|${THEME.BULLET_OUTLINE}`;
        if (themeKey !== this.themeKey) {
            if (this.themeKey) invalidateBaked();
            this.themeKey = themeKey;
        }

        const inMenu = game.state === 'MENU';
        // Adaptive quality (js/quality.js): fewer trail dots / confetti on struggling devices
        const reducedFx = !!(game.quality && game.quality.settings.reducedFx);
        this.world.reducedFx = reducedFx;
        this.world.qualityLevel = game.quality ? game.quality.level : 0;
        this.fx.reducedFx = reducedFx;
        this.world.syncBackground(game, w, h);
        this.menuBackdrop.container.visible = inMenu;
        if (inMenu) this.menuBackdrop.sync(game.menuBackdrop, 1);
        this.world.syncField(game, w, h, inMenu);
        this.fx.sync(game.effects, w, h);

        // Screen shake moves the play field and effects, not the background or the UI
        const fx = game.effects;
        if (fx.motionEnabled && (fx.shakeX || fx.shakeY)) this.shaken.position.set(fx.shakeX, fx.shakeY);
        else this.shaken.position.set(0, 0);

        this.ui.sync(game, w, h);
        this.app.render();
        flushTextureTrash();
    }

    /** Re-bakes every generated texture (e.g. once the bundled font has loaded). */
    refreshTextures() {
        resetGlyphMetrics();
        invalidateBaked();
    }

    /** Upload / bake counters (see PerfStats) */
    get perf() {
        return PerfStats;
    }

    /** Diagnostics for dev mode / reports */
    getStats() {
        return {
            bullets: this.world.stats.bullets,
            particles: this.fx.stats.particles,
            textureRes: TexState.res,
            baked: PerfStats.bakedCount(),
            renderer: this.app ? this.app.renderer.name : 'none'
        };
    }
}
