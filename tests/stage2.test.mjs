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

test('adaptive quality: detects 120 Hz but only demands 60 FPS', () => {
    const q = new AdaptiveQuality();
    let { now } = feed(q, 200, 1000 / 120);
    assert.ok(Math.abs(q.interval - 1000 / 120) < 0.01);
    // Mixed 8.3 / 16.7 ms frames (measured on a 120 Hz phone, ~90 FPS): keep full quality
    for (let i = 0; i < 3000; i++) {
        const ms = i % 4 === 0 ? 1000 / 60 : 1000 / 120;
        now += ms;
        q.sample(ms, true, now);
    }
    assert.equal(q.level, 0);
    // Steady 60 FPS on a 120 Hz display is still fine
    ({ now } = feed(q, 1000, 1000 / 60, true, now));
    assert.equal(q.level, 0);
    // Below 60 FPS (30 FPS) → steps down
    const r = feed(q, 400, 1000 / 30, true, now);
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

// ------------------------------------------------------------
// Frame pacer (FPS setting: 60 default, 90 / 120 on request)
// ------------------------------------------------------------
import { createFramePacer } from '../js/loop.js';

function rendered(fps, hz, seconds = 2) {
    const pace = createFramePacer();
    let n = 0;
    const warm = Math.round(hz / 4);   // the refresh-rate estimate needs a few frames
    const frames = Math.round(hz * seconds);
    for (let i = 0; i < warm + frames; i++) {
        const jitter = (i % 3 - 1) * 0.3; // vsync timestamps are never exact
        if (pace(i * (1000 / hz) + jitter, fps) && i >= warm) n++;
    }
    return n / seconds;
}

test('frame pacer: 60 / 90 / 120 FPS on a 120 Hz display', () => {
    assert.ok(Math.abs(rendered(60, 120) - 60) <= 1);
    assert.ok(Math.abs(rendered(90, 120) - 90) <= 1);
    assert.ok(Math.abs(rendered(120, 120) - 120) <= 1);
});

test('frame pacer: no drift against a slightly fast display (60 FPS = every 2nd vsync)', () => {
    // 120.1 Hz panel: a millisecond deadline would skip a vsync every ~1-2 s (25 ms frame)
    const pace = createFramePacer();
    const vs = 1000 / 120.1;
    const gaps = new Set();
    let lastRender = null;
    for (let i = 0; i < 120 * 20; i++) {
        const now = i * vs + (i % 3 - 1) * 0.3;
        if (pace(now, 60)) {
            if (lastRender !== null && i > 60) gaps.add(i - lastRender);
            lastRender = i;
        }
    }
    assert.deepEqual([...gaps], [2]);
});

test('frame pacer: 90 FPS on 120 Hz never waits more than 2 vsyncs', () => {
    const pace = createFramePacer();
    let lastRender = 0;
    let worst = 0;
    for (let i = 1; i < 120 * 10; i++) {
        if (pace(i * (1000 / 120), 90)) {
            if (i > 60) worst = Math.max(worst, i - lastRender);
            lastRender = i;
        }
    }
    assert.ok(worst <= 2);
});

test('frame pacer: a 60 Hz display renders every frame whatever the cap', () => {
    assert.ok(Math.abs(rendered(60, 60) - 60) <= 1);
    assert.ok(Math.abs(rendered(120, 60) - 60) <= 1);
});
