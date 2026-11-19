# PixiJS v8 Stage 1 — Working Plan

Branch: `pixijs-v8-stage1` (baseline commit `4b21d7f`, `main` untouched).
Backup: `C:\_projectsmert\backups\Bullet-Hell-Micro-Pre-PixiJS-Backup.zip` (+ `.gitbundle`, `MANIFEST.txt`).
Pinned: `pixi.js@8.22.0`, `vite@8.3.5` (dev), `@fontsource/fredoka@5.3.0` (OFL-1.1).

## Architecture

- **Game core (unchanged logic):** `waveManager`, `boss`, `player`, `bullet`, `bulletManager`, `collision`, `score`, `progress`, `modes`, `rng`, `ghost`, `pickup`, `coins`, `effects` (state + physics). No PixiJS imports → Node tests keep running.
- **Rendering layer (`js/render/`)** — the only live renderer:
  - `pixiRenderer.js`: `Application` (WebGL preferred, manual render, no shared ticker), stage = logical arena (height 600) scaled to CSS size; layers: background → world → fx → ui → frame.
  - `textures.js`: baked texture cache. Existing Canvas 2D drawing functions are used **only as texture generators** (offscreen canvas → `Texture.from`).
  - `liveCanvasSprite.js`: sprite backed by a small offscreen canvas, redrawn **only when its state key changes** (used for boss, player, pickups, coins, HUD regions, menus/cards).
  - `worldView.js`: background (gradient + blob sprites), stars, grid dots, telegraphs, pickups, coins, boss, ghost, bullets (sprite pool + halo + trails), player, popups.
  - `fxView.js`: particles (`ParticleContainer`), shockwaves, flash, banner.
  - `uiView.js`: HUD split into regions; menu / settings / info / pause / result card overlays; arena frame + edge warning.
  - `backdropView.js`: menu + result-card interactive backdrop (native sprites).
- **Loop:** fixed timestep (1/120 s, max 8 steps/frame) in `main.js`; render once per frame.
- **Build:** Vite (`npm run dev` / `npm run build:web` → `www/`, `base: './'`) for Capacitor. `server.js` + `scripts/build-web.mjs` replaced.
- **Security:** fonts bundled locally, `pixi.js/unsafe-eval` (no `eval` → strict CSP possible), CSP meta injected on build only, dev mode compiled out of production unless `VITE_ENABLE_DEV_MODE=true`.

## Steps
1. Tooling (Vite, fonts, CSP, dev-mode gate) — game still Canvas 2D.
2. Render infra + background/world/fx in PixiJS (UI temporarily via full overlay).
3. UI regions + overlays; result-card backdrop masking.
4. Remove the old live Canvas 2D path; fixed timestep loop.
5. Tests, web build, Android build, screenshots vs `baseline/`, metrics.
6. Docs, ZIP, `PIXIJS-STAGE1-REPORT.md`, ask for Stage 2 approval.

## Status (Stage 1 complete — Stage 2 awaiting approval)
All Stage 1 steps done; see `PIXIJS-STAGE1-REPORT.md` at the project root. Not done: real-device FPS and APK launch test (no device/emulator available).
