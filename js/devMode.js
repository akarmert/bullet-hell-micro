// ============================================================
// devMode.js — Geliştirici Modu (sadece test için)
// Adres çubuğuna ?dev eklenince açılır: http://localhost:3000/?dev
// Ölümsüzlük, boss'a atlama, ekşi şeker / kalkan deneme ve turu bitirme.
// Geliştirici modunda hiçbir rekor, şeker, istatistik veya hayalet KAYDEDİLMEZ.
// ============================================================

/** Adres ?dev (ya da ?dev=1) içeriyor mu? */
export function isDevRequested(search = (typeof location !== 'undefined' ? location.search : '')) {
    const params = new URLSearchParams(search);
    return params.has('dev') && params.get('dev') !== '0';
}

const BOSSES = [
    ['👑 Jöle', 0],
    ['☁️ Bulut', 1],
    ['🫧 Sakız', 2]
];

export class DevMode {
    /** @param {import('./game.js').Game} game */
    constructor(game) {
        this.game = game;
        this.invincible = true;   // Açılışta ölümsüz
        this.hits = 0;            // Ölümsüzken "ölecek" kadar çarpma sayısı (ayrı çarpmalar)
        this.lastHitAt = -Infinity;
        this.forceDeath = false;  // "Turu bitir" ölümsüzlüğü bir kereliğine aşar
        // Dar ekranda (telefon) kapalı başlar; "🛠 DEV" düğmesiyle açılır
        this.open = typeof window === 'undefined' || window.innerWidth >= 700;
        if (typeof document !== 'undefined') this.buildPanel();
    }

    /** game.triggerDeath çağırır: ölümsüzken ölümü yutar */
    blocksDeath() {
        if (this.forceDeath) {
            this.forceDeath = false;
            return false;
        }
        if (!this.invincible) return false;
        // Aynı mermi/duvar her karede tetikler: 0,4 sn içindeki tekrarlar tek çarpma sayılır
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this.lastHitAt > 400) {
            this.hits++;
            this.refresh();
        }
        this.lastHitAt = now;
        return true;
    }

    // ------------------------------------------------------------
    // EYLEMLER
    // ------------------------------------------------------------

    ensurePlaying() {
        const g = this.game;
        if (g.state !== 'PLAYING') g.startGame();
    }

    toggleInvincible() {
        this.invincible = !this.invincible;
        this.refresh();
    }

    /** Sıradaki boss'u hemen getirir (0 Jöle, 1 Bulut, 2 Sakız) */
    jumpToBoss(index) {
        this.ensurePlaying();
        const g = this.game;
        const w = g.waveManager;
        if (!w.hasBoss()) return; // KAOS modunda boss yok
        w.boss = null;
        w.bossActive = false;
        w.telegraphs.length = 0;
        g.bulletManager.clear();
        if (g.elapsedMs < 30000) g.elapsedMs = 30000; // Boss'lar ısınma fazlarından sonra gelir
        w.bossCount = index;
        w.nextBossAt = g.elapsedMs;
    }

    heavy() {
        this.ensurePlaying();
        this.game.player.applySlow();
    }

    big() {
        this.ensurePlaying();
        this.game.player.applyGrow();
    }

    sourCandy() {
        this.ensurePlaying();
        this.game.pickupManager.spawnDebuff(this.game.player);
    }

    shield() {
        this.ensurePlaying();
        this.game.player.addShield();
    }

    clearBullets() {
        this.game.bulletManager.clear();
        this.game.waveManager.telegraphs.length = 0;
    }

    endRun() {
        const g = this.game;
        if (g.state === 'PAUSED') g.state = 'PLAYING';
        if (g.state !== 'PLAYING') return;
        this.forceDeath = true;
        g.triggerDeath();
    }

    // ------------------------------------------------------------
    // PANEL (DOM)
    // ------------------------------------------------------------

    buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'devPanel';
        panel.innerHTML = `
            <button type="button" class="dev-toggle" data-act="panel">🛠 DEV</button>
            <div class="dev-body">
                <button type="button" data-act="inv"></button>
                <div class="dev-row">${BOSSES.map(([label, i]) => `<button type="button" data-act="boss" data-i="${i}">${label}</button>`).join('')}</div>
                <div class="dev-row">
                    <button type="button" data-act="heavy">🐌 AĞIR</button>
                    <button type="button" data-act="big">🎈 DEV</button>
                    <button type="button" data-act="sour">😖 şeker</button>
                </div>
                <div class="dev-row">
                    <button type="button" data-act="shield">🛡️ +1</button>
                    <button type="button" data-act="clear">🧹 temizle</button>
                </div>
                <button type="button" data-act="end">⏹ turu bitir</button>
                <p class="dev-note"></p>
                <p class="dev-perf"></p>
            </div>`;
        // Paneldeki dokunuşlar oyuna (canvas'a) geçmesin
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'touchstart']) {
            panel.addEventListener(type, (e) => e.stopPropagation());
        }
        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'panel') { this.open = !this.open; this.refresh(); return; }
            if (act === 'inv') this.toggleInvincible();
            else if (act === 'boss') this.jumpToBoss(Number(btn.dataset.i));
            else if (act === 'heavy') this.heavy();
            else if (act === 'big') this.big();
            else if (act === 'sour') this.sourCandy();
            else if (act === 'shield') this.shield();
            else if (act === 'clear') this.clearBullets();
            else if (act === 'end') this.endRun();
            btn.blur(); // Space/Enter oyun kısayolları butonu tekrar tetiklemesin
        });
        document.body.appendChild(panel);
        this.panel = panel;
        this.refresh();
        // Performance readout for on-device profiling (dev builds only)
        const perfLine = panel.querySelector('.dev-perf');
        setInterval(() => {
            const g = this.game;
            if (!this.open || !g.renderer || !g.renderer.ready) return;
            const q = g.quality;
            const st = g.renderer.getStats();
            const hz = q ? Math.round(1000 / q.interval) : 0;
            perfLine.textContent = `${q ? q.fps.toFixed(0) : '?'} fps · ${q ? q.frameMs.toFixed(1) : '?'} ms · ${hz} Hz · `
                + `q${q ? q.level : 0} · res ${st.textureRes} · ${st.bullets} mermi`;
        }, 500);
    }

    refresh() {
        if (!this.panel) return;
        this.panel.classList.toggle('closed', !this.open);
        const inv = this.panel.querySelector('[data-act="inv"]');
        inv.textContent = this.invincible ? '♾️ ölümsüz: AÇIK' : '💀 ölümsüz: KAPALI';
        inv.classList.toggle('on', this.invincible);
        this.panel.querySelector('.dev-note').textContent =
            `${this.invincible ? `çarpma: ${this.hits} · ` : ''}kayıtlar kapalı`;
    }
}
