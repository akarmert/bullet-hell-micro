import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuBackdrop } from '../js/menuBackdrop.js';
import { applyTheme } from '../js/theme.js';

test('Menü arka planı (açık): dokunulan şeker patlar, serpinti saçar, art arda patlatma seri yapar', () => {
    applyTheme('light');
    const bd = new MenuBackdrop(800, 600);
    const target = bd.candies[0];
    target.x = 300; target.y = 300;
    const first = bd.tap(302, 298);
    assert.equal(first.type, 'pop');
    assert.equal(first.chain, 0);
    assert.ok(bd.bursts.length >= 10, 'serpinti saçılır');
    assert.ok(target.y > 600, 'patlayan şeker alttan yeniden doğar');

    const next = bd.candies[1];
    next.x = 500; next.y = 200;
    bd.update(0.3);
    const second = bd.tap(next.x, next.y);
    assert.equal(second.type, 'pop');
    assert.equal(second.chain, 1, 'kısa sürede ikinci patlatma seriyi artırır');
});

test('Menü arka planı (açık): boşa dokunmak o noktadan yeni şeker kabartır', () => {
    applyTheme('light');
    const bd = new MenuBackdrop(800, 600);
    for (const c of bd.candies) { c.x = -500; c.y = -500; }
    const r = bd.tap(400, 300);
    assert.equal(r.type, 'puff');
    assert.ok(bd.candies.some(c => c.x === 400 && c.y === 300));
});

test('Menü arka planı (açık): şekerler imleçten kaçar', () => {
    applyTheme('light');
    const bd = new MenuBackdrop(800, 600);
    const c = bd.candies[0];
    c.x = 420; c.y = 300; c.vx = 0; c.vy = 0;
    bd.pointerMove(400, 300);
    bd.attractor.x = 400; bd.attractor.y = 300;
    for (let i = 0; i < 10; i++) bd.update(1 / 60);
    assert.ok(c.x > 420, 'imlecin sağındaki şeker sağa itilir');
});

test('Menü arka planı (koyu): dokunuş kayan yıldız ve parlayan yıldızlar; ateşböcekleri imlece yaklaşır', () => {
    try {
        applyTheme('dark');
        const bd = new MenuBackdrop(800, 600);
        bd.stars[0].x = 205; bd.stars[0].y = 205;
        const r = bd.tap(200, 200);
        assert.equal(r.type, 'star');
        assert.equal(bd.shooting.length, 1);
        assert.ok(bd.stars[0].flare > 0.5);

        const avgDist = () => bd.fireflies.reduce((sum, f) => sum + Math.hypot(f.x - 600, f.y - 400), 0) / bd.fireflies.length;
        for (const f of bd.fireflies) { f.x = 50; f.y = 50; f.vx = 0; f.vy = 0; }
        const before = avgDist();
        for (let i = 0; i < 120; i++) { bd.pointerMove(600, 400); bd.update(1 / 60); }
        assert.ok(avgDist() < before * 0.5, 'ateşböcekleri imlecin etrafına toplanır');
    } finally {
        applyTheme('light');
    }
});

test('Menü arka planı: imleç yokken gezgin dolaşır, boyut değişince sahne uyar', () => {
    applyTheme('light');
    const bd = new MenuBackdrop(800, 600);
    bd.update(3);
    assert.equal(bd.pointerActive, false);
    assert.equal(bd.attractor.idle, true);
    bd.resize(1200, 600);
    assert.ok(bd.candies.length > 19);
    assert.ok(bd.stars.length > 100);
});
