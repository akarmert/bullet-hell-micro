import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality, QUALITY_LEVELS } from '../js/quality.js';
import { Bullet } from '../js/bullet.js';

/** Feeds `n` frames of `ms` each; returns how many times the level changed. */
function feed(q, n, ms, active = true, start = 0) {
    let now = start;
    let changes = 0;
    for (let i = 0; i < n; i++) {
        now += ms;
        if (q.sample(ms, active, now)) changes++;
    }
    return { changes, now };
}

test('adaptive quality: steady 60 Hz keeps full quality', () => {
    const q = new AdaptiveQuality();
    feed(q, 2000, 1000 / 60);
    assert.equal(q.level, 0);
    assert.ok(Math.abs(q.interval - 1000 / 60) < 0.01);
});

test('adaptive quality: detects 120 Hz refresh and judges against it', () => {
    const q = new AdaptiveQuality();
    const { now } = feed(q, 200, 1000 / 120);
    assert.ok(Math.abs(q.interval - 1000 / 120) < 0.01);
    // Steady 60 fps on a 120 Hz display = every frame misses → steps down
    const r = feed(q, 400, 1000 / 60, true, now);
    assert.ok(r.changes >= 1);
    assert.ok(q.level >= 1);
});

test('adaptive quality: sustained slow frames step down one level at a time, with cooldown', () => {
    const q = new AdaptiveQuality();
    let { now } = feed(q, 200, 1000 / 60);
    // 3 s of 30 fps → one step down (then a cooldown blocks an immediate second step)
    let r = feed(q, 100, 1000 / 30, true, now);
    assert.equal(q.level, 1);
    assert.equal(q.settings.dprCap, QUALITY_LEVELS[1].dprCap);
    // still slow after the cooldown → level 2 (reduced effects), never beyond
    r = feed(q, 2000, 1000 / 30, true, r.now);
    assert.equal(q.level, QUALITY_LEVELS.length - 1);
    assert.equal(q.settings.reducedFx, true);
});

test('adaptive quality: menus and long hitches are not judged', () => {
    const q = new AdaptiveQuality();
    const { now } = feed(q, 200, 1000 / 60);
    feed(q, 1000, 1000 / 20, false, now);      // slow menu: ignored
    assert.equal(q.level, 0);
    feed(q, 50, 400, true, now);                // tab switches / background gaps: ignored
    assert.equal(q.level, 0);
});

test('bullet trail reuses point objects and keeps newest-first order', () => {
    const b = new Bullet({ x: 0, y: 0, vx: 100, vy: 0, trailLength: 4 });
    for (let i = 0; i < 4; i++) b.update(0.01);
    const objs = new Set(b.trail);
    for (let i = 0; i < 20; i++) b.update(0.01);
    assert.equal(b.trail.length, 4);
    for (const pt of b.trail) assert.ok(objs.has(pt), 'no new point objects once the trail is full');
    for (let i = 1; i < b.trail.length; i++) assert.ok(b.trail[i - 1].x > b.trail[i].x, 'newest point first');
});
