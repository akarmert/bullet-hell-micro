// ============================================================
// ux-preview/sandbox.js — Önizleme Kum Havuzu
// Önizleme sekmelerindeki oyunun gerçek kayıtlara (rekor, ilerleme,
// ayar, öğretici) YAZMASINI engeller ve senaryo kısayolları sağlar.
// Bu klasör silinince hiçbir iz kalmaz.
// ============================================================

export function installSandbox(game) {
    const ui = game.ui;
    ui.checkAndSaveHighScore = () => { ui.isNewTimeRecord = false; return false; };
    ui.checkAndSaveBestScore = () => { ui.isNewRecord = false; return false; };
    game.progress.save = () => {};
    game.progress.recordRun = () => [];
    game.tutorial.save = () => {};
    game.settings.save = () => {};
    game.effects.sound.saveSettings = () => {};

    // Senaryolarda ölümsüzlük (HUD/boss görüntülemek için)
    game.__invincible = false;
    game.triggerDeath = function () {
        if (game.__invincible) return;
        return Object.getPrototypeOf(game).triggerDeath.call(game);
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    window.uxScenario = async (name, { touch = false } = {}) => {
        game.touchControls.touchDevice = touch;
        game.__invincible = false;
        game.ui.settingsOpen = false;
        switch (name) {
            case 'menu':
                game.returnToMenu();
                break;
            case 'settings':
                game.returnToMenu();
                game.openSettings();
                break;
            case 'play':
                game.__invincible = true;
                game.startGame();
                game.elapsedMs = 12500;
                game.player.grazeCount = 14;
                game.score.points = 2380;
                game.pickupManager.spawnRandom();
                break;
            case 'pause':
                game.__invincible = true;
                game.startGame();
                game.elapsedMs = 8000;
                await sleep(700);
                game.pauseGame();
                break;
            case 'boss':
                game.__invincible = true;
                game.startGame();
                game.elapsedMs = 29900;
                break;
            case 'deadBullet':
                game.startGame();
                game.elapsedMs = 23400;
                game.player.grazeCount = 31;
                game.score.points = 4120;
                await sleep(250);
                game.bulletManager.spawn({ x: game.player.x, y: game.player.y, vx: 0, vy: 0, radius: 4 });
                break;
            case 'deadWall':
                game.startGame();
                game.elapsedMs = 6100;
                await sleep(250);
                game.player.x = game.player.radius;
                break;
            default:
                break;
        }
        return game.state;
    };
}

/** Oyun oluşunca kum havuzunu kurar (eski sürüm için) */
export function sandboxWhenReady() {
    const tick = () => (window.game ? installSandbox(window.game) : setTimeout(tick, 10));
    tick();
}
