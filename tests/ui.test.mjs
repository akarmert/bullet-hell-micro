import test from 'node:test';
import assert from 'node:assert/strict';

const { UIManager, MENU_LAYOUTS, MENU_FOCUS_ORDER } = await import('../js/ui.js');
const { CollisionSystem } = await import('../js/collision.js');
const { THEME } = await import('../js/theme.js');
const { Player } = await import('../js/player.js');
const { GAME_CONFIG } = await import('../js/config.js');

// Mantıksal tuval boyutları: yükseklik 600, genişlik ekran oranına göre
const PHONE_PORTRAIT = 600 * 390 / 844;   // ≈ 277
const PHONE_LANDSCAPE = 600 * 844 / 390;  // ≈ 1298
const DESKTOP = 600 * 1280 / 720;         // ≈ 1067

const center = (ui, b) => ({ x: ui.lOffX + (b.x + b.w / 2) * ui.lScale, y: ui.lOffY + (b.y + b.h / 2) * ui.lScale });

test('K2: ekrana göre yerleşim seçilir ve telefonda menü eskisinden büyüktür', () => {
    const ui = new UIManager();
    ui.setLayout(PHONE_PORTRAIT, 600);
    assert.equal(ui.layout.name, 'tall');
    const oldScale = Math.min(1, PHONE_PORTRAIT / 600, 1);
    assert.ok(ui.lScale > oldScale * 1.4, 'dikey telefonda en az %40 daha büyük');
    ui.setLayout(PHONE_LANDSCAPE, 600);
    assert.equal(ui.layout.name, 'wide');
    ui.setLayout(600, 600);
    assert.equal(ui.layout.name, 'square');
    ui.setLayout(DESKTOP, 600);
    assert.ok(ui.lScale <= 1.3);

    // Telefonda kartlar, ayarlar ve oklar ≥ 44 CSS px; en küçük yazı okunur
    for (const [w, cssPerLogical, minText] of [[PHONE_PORTRAIT, 844 / 600, 12], [PHONE_LANDSCAPE, 390 / 600, 10]]) {
        ui.setLayout(w, 600);
        const css = (n) => n * ui.lScale * cssPerLogical;
        for (const c of ui.layout.cards) assert.ok(css(c.h) >= 44, `${ui.layout.name}: ${c.id} yüksekliği ${css(c.h).toFixed(1)}`);
        assert.ok(css(ui.layout.settings.h) >= 44, `${ui.layout.name}: ayarlar butonu ${css(ui.layout.settings.h).toFixed(1)}`);
        assert.ok(css(ui.layout.skin.r * 2) >= 44, `${ui.layout.name}: kostüm okları`);
        assert.ok(css(13) >= minText, `${ui.layout.name}: en küçük menü yazısı ${css(13).toFixed(1)}`);
    }
});

test('K1: menüde boş alan hiçbir eylem döndürmez; butonlar doğru eşlenir', () => {
    const ui = new UIManager();
    for (const [w, h] of [[PHONE_PORTRAIT, 600], [PHONE_LANDSCAPE, 600], [DESKTOP, 600]]) {
        ui.setLayout(w, h);
        assert.equal(ui.getMenuAction(2, 2), null, 'köşe boş alan');
        assert.equal(ui.getMenuAction(w - 3, h - 3), null, 'alt köşe boş alan');
        const p = center(ui, ui.layout.play);
        assert.equal(ui.getMenuAction(p.x, p.y).type, 'play');
        const c = center(ui, ui.layout.cards[1]);
        assert.deepEqual(ui.getMenuAction(c.x, c.y), { type: 'mode', id: 'endless' });
        const sb = center(ui, ui.layout.settings);
        assert.equal(ui.getMenuAction(sb.x, sb.y).type, 'settings');
    }
});

test('K4: klavye odağı tüm menü öğelerinde döner', () => {
    const ui = new UIManager();
    assert.equal(ui.focusedItem, null);
    assert.equal(ui.moveFocus(1), 'info', 'sol üstteki bilgi butonu ilk sırada');
    assert.equal(ui.moveFocus(1), 'classic');
    for (let i = 2; i < MENU_FOCUS_ORDER.length; i++) ui.moveFocus(1);
    assert.equal(ui.focusedItem, 'settings');
    assert.equal(ui.moveFocus(1), 'info', 'sondan başa döner');
    assert.equal(ui.moveFocus(-1), 'settings', 'geri gider');
    const fresh = new UIManager();
    assert.equal(fresh.moveFocus(-1), 'settings', 'ilk geri tuşu sondan başlar');
    // Her yerleşimde odak sırasındaki tüm kart kimlikleri var
    for (const L of Object.values(MENU_LAYOUTS)) {
        const ids = L.cards.map(c => c.id);
        for (const id of MENU_FOCUS_ORDER.slice(1, 6)) assert.ok(ids.includes(id), `${L.name}: ${id}`);
        assert.ok(L.info && L.info.r > 0, `${L.name}: bilgi butonu`);
    }
});

test('K6: sonuç ekranında sadece "tekrar oyna" butonu yeniden başlatır; kart ekrana sığar', () => {
    const ui = new UIManager();
    for (const [w, h] of [[PHONE_PORTRAIT, 600], [PHONE_LANDSCAPE, 600], [DESKTOP, 600]]) {
        ui.setLayout(w, h);
        const D = ui.getDeadLayout();
        assert.ok(D.cw * D.s <= w, 'kart genişliği ekrana sığar');
        assert.ok(410 * D.s <= h, 'kart yüksekliği ekrana sığar');
        const r = D.retry;
        const bx = D.cx + (r.x + r.w / 2) * D.s;
        const by = D.cy + (r.y + r.h / 2) * D.s;
        assert.equal(ui.hitsRetry(bx, by), true);
        assert.equal(ui.hitsRetry(5, 5), false);
        assert.equal(ui.hitsRetry(D.cx, D.cy), false, 'kartın ortası (skor) yeniden başlatmaz');
    }
    // Dikey telefonda yazılar eski karttan küçük değil (eski: ölçek 1)
    ui.setLayout(PHONE_PORTRAIT, 600);
    assert.ok(ui.getDeadLayout().s >= 0.95);
});

test('K5: ölüm nedeni kenar, boss ve mermi olarak ayrılır', () => {
    const player = new Player();
    assert.equal(CollisionSystem.deathCause(player, null), 'bullet');
    player.x = player.radius;
    assert.equal(CollisionSystem.deathCause(player, null), 'wall');
    player.x = GAME_CONFIG.CANVAS.WIDTH / 2;
    const boss = { alive: true, touches: () => true };
    assert.equal(CollisionSystem.deathCause(player, boss), 'boss');
    assert.equal(CollisionSystem.deathCause(player, { alive: false, touches: () => true }), 'bullet');
});

test('K3: küçük metin renkleri zeminde ≥ 4.5:1 kontrast verir', () => {
    const lum = (hex) => {
        const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
            .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const fg of [THEME.MUTED, THEME.TEXT_ACCENT, THEME.TEXT_PRIMARY, THEME.INK]) {
        assert.ok(ratio(fg, THEME.BG) >= 4.5, `${fg} zeminde`);
        assert.ok(ratio(fg, THEME.WHITE) >= 4.5, `${fg} beyazda`);
    }
    assert.ok(ratio(THEME.WHITE, THEME.TEXT_PRIMARY) >= 4.5, 'beyaz yazı koyu mor dolguda');
    assert.ok(ratio(THEME.INK, THEME.PINK) >= 4.3, 'koyu yazı pembe dolguda');
});

test('Bilgi ("i") butonları: menüde ve sonuç kartında dokunulabilir, ≥ 44 CSS px', () => {
    const ui = new UIManager();
    for (const [w, cssPerLogical] of [[PHONE_PORTRAIT, 844 / 600], [PHONE_LANDSCAPE, 390 / 600], [DESKTOP, 720 / 600]]) {
        ui.setLayout(w, 600);
        const L = ui.layout;
        const x = ui.lOffX + L.info.cx * ui.lScale;
        const y = ui.lOffY + L.info.cy * ui.lScale;
        assert.equal(ui.getMenuAction(x, y).type, 'info', `${L.name} menü`);
        if (w !== DESKTOP) assert.ok(L.info.r * 2 * ui.lScale * cssPerLogical >= 44, `${L.name} boyut`);

        const D = ui.getDeadLayout();
        const dx = D.cx + D.info.cx * D.s;
        const dy = D.cy + D.info.cy * D.s;
        assert.equal(ui.hitsDeadInfo(dx, dy), true, `${L.name} sonuç kartı`);
        assert.equal(ui.hitsRetry(dx, dy), false, 'bilgi butonu yeniden başlatmaz');
        assert.equal(ui.hitsDeadInfo(D.cx, D.cy + D.retry.y * D.s + 10), false);
    }
});

test('Mağaza: satın alma butonu sadece şekerle alınabilen kilitli kostümde çıkar', async () => {
    const { SKINS } = await import('../js/skins.js');
    const ui = new UIManager();
    const owned = new Set(['classic']);
    ui.progress = { candies: 0, isUnlocked: (id) => owned.has(id), isForSale: (id) => !!SKINS.find(k => k.id === id && k.price) && !owned.has(id) };
    for (const [w, h] of [[PHONE_PORTRAIT, 600], [PHONE_LANDSCAPE, 600], [600, 600]]) {
        ui.setLayout(w, h);
        ui.skinIndex = SKINS.findIndex(k => k.id === 'caramel');
        const r = ui.getBuyRect();
        assert.ok(r, `${ui.layout.name}: butonu var`);
        assert.ok(r.y + r.h <= ui.layout.H, `${ui.layout.name}: buton yerleşimin içinde`);
        const p = center(ui, r);
        assert.equal(ui.getMenuAction(p.x, p.y).type, 'buy');

        ui.skinIndex = SKINS.findIndex(k => k.id === 'strawberry');
        assert.equal(ui.getBuyRect(), null, 'başarım kostümünde buton yok');
        owned.add('caramel');
        ui.skinIndex = SKINS.findIndex(k => k.id === 'caramel');
        assert.equal(ui.getBuyRect(), null, 'alınmış kostümde buton yok');
        owned.delete('caramel');
    }
});
