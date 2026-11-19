// ============================================================
// menuBackdrop.js — Ana Menünün Etkileşimli Arka Planı
// Açık tema: süzülen şekerler; imleçten kaçar, dokununca patlar.
// Koyu tema: yıldızlı gece; ateşböcekleri imleci izler, imleç
// yakındaki yıldızları takımyıldızı gibi bağlar, dokununca kayan yıldız.
// İmleç/parmak yokken görünmez bir "gezgin" sahneyi canlı tutar.
// Oynanışı etkilemez: rastgelelik Math.random ile (günlük mod tohumuna dokunmaz).
// ============================================================

import { THEME } from './theme.js';

const CANDY_KINDS = ['mallow', 'wrap', 'lolly', 'drop'];
const CANDY_COLORS = ['#FF6FAE', '#8E5BE8', '#CDB8FF', '#FFC4DE', '#B79BFF'];
const IDLE_MS = 2500;          // Bu kadar hareketsizlikten sonra gezgin devralır
const REPEL_RADIUS = 110;      // Şekerlerin imleçten kaçma menzili
export const LINK_RADIUS = 135;       // Takımyıldızı çizgilerinin menzili
const CHAIN_GAP = 1.2;         // Art arda patlatmalarda nota yükselir (saniye)

const rand = (a, b) => a + Math.random() * (b - a);

export class MenuBackdrop {
    constructor(width = 800, height = 600) {
        this.w = 0;
        this.h = 0;
        this.time = 0;
        this.candies = [];
        this.fireflies = [];
        this.stars = [];
        this.bursts = [];      // Şeker patlaması serpintileri
        this.ripples = [];     // Boşa dokunma halkaları
        this.shooting = [];    // Kayan yıldızlar
        this.trail = [];       // İmlecin bıraktığı serpinti izi (açık tema)
        this.pointer = { x: width / 2, y: height / 2, lastMove: -Infinity };
        this.attractor = { x: width / 2, y: height / 2, idle: true };
        this.popChain = 0;
        this.lastPopAt = -Infinity;
        this.nextShootingAt = 4;
        this.opacity = 1;
        this.resize(width, height);
    }

    /** Arena boyutu değişince sahneyi yeniden dağıtır */
    resize(w, h) {
        if (w === this.w && h === this.h) return;
        this.w = w;
        this.h = h;
        const candyCount = Math.max(12, Math.round(w / 36));
        while (this.candies.length < candyCount) this.candies.push(this.makeCandy(rand(0, h)));
        this.candies.length = candyCount;
        for (const c of this.candies) c.x = Math.min(c.x, w);

        this.stars = [];
        for (let i = 0; i < Math.round(w / 11); i++) {
            this.stars.push({
                x: rand(0, w), y: rand(0, h), ph: rand(0, 6.28),
                big: Math.random() < 0.16, flare: 0,
                c: THEME.SPRINKLES[i % THEME.SPRINKLES.length]
            });
        }
        const flyCount = Math.max(12, Math.round(w / 55));
        while (this.fireflies.length < flyCount) {
            this.fireflies.push({ x: rand(0, w), y: rand(0, h), vx: 0, vy: 0, ph: rand(0, 6.28), orbit: rand(28, 90), spin: Math.random() < 0.5 ? -1 : 1 });
        }
        this.fireflies.length = flyCount;
    }

    makeCandy(y = this.h + rand(20, 60)) {
        return {
            x: rand(0, this.w), y,
            vx: 0, vy: -rand(12, 30),
            size: rand(11, 20),
            rot: rand(0, 6.28), spin: rand(-0.8, 0.8),
            sway: rand(0, 6.28), wiggle: 0,
            kind: CANDY_KINDS[Math.floor(Math.random() * CANDY_KINDS.length)],
            color: CANDY_COLORS[Math.floor(Math.random() * CANDY_COLORS.length)]
        };
    }

    /** İmleç / parmak hareketi (mantıksal arena koordinatı) */
    pointerMove(x, y) {
        const p = this.pointer;
        if (!THEME.dark && Number.isFinite(p.x) && Math.hypot(x - p.x, y - p.y) > 14) {
            this.trail.push({ x, y, life: 1, c: CANDY_COLORS[this.trail.length % CANDY_COLORS.length], rot: rand(0, 6.28) });
            if (this.trail.length > 40) this.trail.shift();
        }
        p.x = x;
        p.y = y;
        p.lastMove = this.time;
    }

    /** İmleç aktif mi (yoksa gezgin dolaşır) */
    get pointerActive() {
        return this.time - this.pointer.lastMove < IDLE_MS / 1000;
    }

    /**
     * Boş alana dokunma: açıkta en yakın şeker patlar, koyuda kayan yıldız
     * @returns {{type: string, chain?: number}}
     */
    tap(x, y) {
        this.pointerMove(x, y);
        if (THEME.dark) {
            const dir = x < this.w / 2 ? 1 : -1;
            this.shooting.push({ x, y, vx: dir * rand(420, 560), vy: rand(120, 220), life: 1 });
            for (const s of this.stars) {
                const d = Math.hypot(s.x - x, s.y - y);
                if (d < 110) s.flare = Math.max(s.flare, 1 - d / 110);
            }
            this.ripples.push({ x, y, r: 6, life: 1, c: THEME.LAVENDER });
            return { type: 'star' };
        }

        let best = null;
        let bestD = Infinity;
        for (const c of this.candies) {
            const d = Math.hypot(c.x - x, c.y - y);
            if (d < c.size + 22 && d < bestD) { best = c; bestD = d; }
        }
        if (best) {
            this.chainStep();
            this.popCandy(best);
            return { type: 'pop', chain: this.popChain };
        }
        // Boşa dokununca o noktadan yeni bir şeker kabarır
        const fresh = this.makeCandy(y);
        fresh.x = x;
        fresh.vy = -rand(40, 60);
        fresh.wiggle = 1;
        this.candies[Math.floor(Math.random() * this.candies.length)] = fresh;
        this.ripples.push({ x, y, r: 6, life: 1, c: THEME.PINK });
        return { type: 'puff' };
    }

    chainStep() {
        this.popChain = this.time - this.lastPopAt < CHAIN_GAP ? this.popChain + 1 : 0;
        this.lastPopAt = this.time;
    }

    popCandy(c) {
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
            const sp = rand(90, 200);
            this.bursts.push({
                x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
                life: 1, rot: a, c: i % 3 === 0 ? THEME.WHITE : CANDY_COLORS[i % CANDY_COLORS.length]
            });
        }
        this.ripples.push({ x: c.x, y: c.y, r: c.size, life: 1, c: c.color });
        Object.assign(c, this.makeCandy());
    }

    update(dt) {
        this.time += dt;
        const { w, h } = this;

        // Hedef: aktif imleç ya da yavaşça dolaşan gezgin
        const a = this.attractor;
        if (this.pointerActive) {
            a.x += (this.pointer.x - a.x) * Math.min(1, dt * 12);
            a.y += (this.pointer.y - a.y) * Math.min(1, dt * 12);
            a.idle = false;
        } else {
            const t = this.time * 0.22;
            const tx = w * (0.5 + 0.38 * Math.sin(t * 1.3));
            const ty = h * (0.5 + 0.33 * Math.sin(t * 2.1 + 1));
            a.x += (tx - a.x) * Math.min(1, dt * 1.5);
            a.y += (ty - a.y) * Math.min(1, dt * 1.5);
            a.idle = true;
        }

        if (THEME.dark) this.updateNight(dt);
        else this.updateCandies(dt);

        // Ortak parçacıklar
        for (const b of this.bursts) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.vy += 260 * dt;
            b.vx *= 1 - dt * 1.5;
            b.rot += dt * 6;
            b.life -= dt * 1.4;
        }
        this.bursts = this.bursts.filter(b => b.life > 0);
        for (const r of this.ripples) {
            r.r += dt * 120;
            r.life -= dt * 1.8;
        }
        this.ripples = this.ripples.filter(r => r.life > 0);
        for (const tr of this.trail) tr.life -= dt * 1.6;
        this.trail = this.trail.filter(tr => tr.life > 0);
    }

    updateCandies(dt) {
        const a = this.attractor;
        // Gezgin şekerleri sadece hafifçe dürter; gerçek imleç belirgin iter
        const strength = a.idle ? 0.35 : 1;
        for (const c of this.candies) {
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d < REPEL_RADIUS && d > 0.01) {
                const f = (1 - d / REPEL_RADIUS) * 420 * strength;
                c.vx += (dx / d) * f * dt;
                c.vy += (dy / d) * f * dt * 0.6;
                c.wiggle = Math.min(1, c.wiggle + dt * 4 * strength);
            }
            c.vx *= 1 - dt * 2.2;
            c.vy += (-20 - c.vy) * dt * 0.8; // Yavaşça yukarı süzülme hızına döner
            c.sway += dt * 1.4;
            c.x += (c.vx + Math.sin(c.sway) * 10) * dt;
            c.y += c.vy * dt;
            c.rot += (c.spin + c.wiggle * Math.sin(this.time * 18) * 3) * dt;
            c.wiggle = Math.max(0, c.wiggle - dt * 1.5);
            if (c.y < -c.size * 3) Object.assign(c, this.makeCandy());
            if (c.x < -30) c.x = this.w + 25;
            if (c.x > this.w + 30) c.x = -25;
        }
    }

    updateNight(dt) {
        const a = this.attractor;
        for (const f of this.fireflies) {
            // Hedefin etrafında yörünge: önce yaklaş, sonra çevresinde dön
            f.ph += dt * (0.8 + f.orbit / 120);
            const tx = a.x + Math.cos(f.ph * f.spin) * f.orbit;
            const ty = a.y + Math.sin(f.ph * f.spin) * f.orbit * 0.75;
            const pull = a.idle ? 0.6 : 2.2;
            f.vx += (tx - f.x) * pull * dt;
            f.vy += (ty - f.y) * pull * dt;
            f.vx *= 1 - dt * 1.8;
            f.vy *= 1 - dt * 1.8;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
        }
        for (const s of this.stars) s.flare = Math.max(0, s.flare - dt * 0.9);

        // Arada bir kendiliğinden kayan yıldız
        if (this.time >= this.nextShootingAt) {
            this.nextShootingAt = this.time + rand(6, 10);
            const fromLeft = Math.random() < 0.5;
            this.shooting.push({ x: fromLeft ? rand(0, this.w * 0.4) : rand(this.w * 0.6, this.w), y: rand(0, this.h * 0.3), vx: (fromLeft ? 1 : -1) * rand(380, 500), vy: rand(100, 180), life: 1 });
        }
        for (const s of this.shooting) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt * 0.9;
        }
        this.shooting = this.shooting.filter(s => s.life > 0);
    }

    /**
     * @param {number} opacity Genel saydamlık (sonuç kartında içerik önde kalsın diye soluk çizilir)
     */
    render(ctx, opacity = 1) {
        if (THEME.highContrast) return; // Yüksek kontrastta sade zemin
        this.opacity = opacity;
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (THEME.dark) this.renderNight(ctx);
        else this.renderCandies(ctx);

        for (const r of this.ripples) {
            ctx.globalAlpha = (r.life * 0.7) * this.opacity;
            ctx.strokeStyle = r.c;
            ctx.lineWidth = 3 * r.life;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (const b of this.bursts) {
            ctx.globalAlpha = (Math.min(1, b.life * 1.5)) * this.opacity;
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.rot);
            ctx.fillStyle = b.c;
            ctx.beginPath();
            ctx.roundRect(-4, -1.6, 8, 3.2, 1.6);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    renderCandies(ctx) {
        for (const tr of this.trail) {
            ctx.globalAlpha = (tr.life * 0.7) * this.opacity;
            ctx.save();
            ctx.translate(tr.x, tr.y);
            ctx.rotate(tr.rot);
            ctx.fillStyle = tr.c;
            ctx.beginPath();
            ctx.roundRect(-3.5, -1.4, 7, 2.8, 1.4);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = (0.88) * this.opacity;
        for (const c of this.candies) drawCandy(ctx, c);
        ctx.globalAlpha = (1) * this.opacity;
    }

    /** Up to 7 stars nearest to the attractor, chained like a constellation: [{ s, d }] */
    constellation() {
        const a = this.attractor;
        const near = [];
        for (const s of this.stars) {
            const d = Math.hypot(s.x - a.x, s.y - a.y);
            if (d < LINK_RADIUS) near.push({ s, d });
        }
        near.sort((p, q) => p.d - q.d);
        return near.slice(0, 7);
    }

    renderNight(ctx) {
        const a = this.attractor;
        const tw = this.time * 1.6;

        // Takımyıldızı: hedefe yakın yıldızlar birbirine ve hedefe bağlanır
        const linked = this.constellation();
        const linkAlpha = a.idle ? 0.35 : 0.6;
        ctx.strokeStyle = THEME.LAVENDER;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < linked.length; i++) {
            const { s, d } = linked[i];
            const prev = i === 0 ? a : linked[i - 1].s;
            ctx.globalAlpha = ((1 - d / LINK_RADIUS) * linkAlpha) * this.opacity;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
        }
        const linkedSet = new Set(linked.map(l => l.s));

        // Yıldızlar (bağlananlar ve dokunuşla parlayanlar büyür)
        for (const s of this.stars) {
            const lit = linkedSet.has(s) ? 0.55 : 0;
            const glow = Math.max(lit, s.flare);
            ctx.globalAlpha = (Math.min(1, 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(tw + s.ph)) + glow * 0.7)) * this.opacity;
            ctx.fillStyle = s.c;
            const r = (s.big ? 2.2 : 1.2) + glow * 2.2;
            if (glow > 0.3) drawStar(ctx, s.x, s.y, r * 1.9, r * 0.7);
            else {
                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Kayan yıldızlar
        for (const s of this.shooting) {
            const len = 0.09;
            const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len);
            g.addColorStop(0, 'rgba(255, 246, 250, 0.95)');
            g.addColorStop(1, 'rgba(255, 141, 192, 0)');
            ctx.globalAlpha = (Math.min(1, s.life * 1.6)) * this.opacity;
            ctx.strokeStyle = g;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len);
            ctx.stroke();
            ctx.fillStyle = '#FFF6FA';
            drawStar(ctx, s.x, s.y, 4, 1.6);
        }

        // Ateşböcekleri: pembe/lavanta parıltılar
        for (let i = 0; i < this.fireflies.length; i++) {
            const f = this.fireflies[i];
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + f.orbit);
            const color = i % 2 ? '255, 141, 192' : '205, 184, 255';
            const R = 9 + pulse * 5;
            const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
            g.addColorStop(0, `rgba(${color}, ${0.55 + pulse * 0.3})`);
            g.addColorStop(1, `rgba(${color}, 0)`);
            ctx.globalAlpha = (1) * this.opacity;
            ctx.fillStyle = g;
            ctx.fillRect(f.x - R, f.y - R, R * 2, R * 2);
            ctx.fillStyle = '#FFF6FA';
            ctx.beginPath();
            ctx.arc(f.x, f.y, 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = (1) * this.opacity;
    }
}

function drawStar(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r : R;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
}

/** Tek bir süzülen şeker: marşmelov, paketli şeker, lolipop ya da jöle damlası */
export function drawCandy(ctx, c) {
    const s = c.size;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.strokeStyle = THEME.INK_SOFT;
    ctx.lineWidth = 2;
    switch (c.kind) {
        case 'mallow':
            ctx.beginPath();
            ctx.roundRect(-s * 0.8, -s * 0.7, s * 1.6, s * 1.4, s * 0.45);
            ctx.fillStyle = THEME.WHITE;
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = c.color;
            ctx.globalAlpha *= 0.6;
            ctx.beginPath();
            ctx.ellipse(0, -s * 0.15, s * 0.55, s * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'wrap':
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(side * s * 0.55, 0);
                ctx.lineTo(side * s * 1.25, -s * 0.5);
                ctx.lineTo(side * s * 1.25, s * 0.5);
                ctx.closePath();
                ctx.fillStyle = THEME.WHITE;
                ctx.fill();
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
            ctx.fillStyle = c.color;
            ctx.fill();
            ctx.stroke();
            break;
        case 'lolly':
            ctx.beginPath();
            ctx.moveTo(0, s * 0.6);
            ctx.lineTo(0, s * 1.6);
            ctx.strokeStyle = THEME.WHITE;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = THEME.INK_SOFT;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = c.color;
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const ang = t * Math.PI * 3.2;
                const rr = t * s * 0.55;
                ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * rr, Math.sin(ang) * rr);
            }
            ctx.strokeStyle = THEME.WHITE;
            ctx.stroke();
            break;
        default: // jöle damlası
            ctx.beginPath();
            ctx.moveTo(-s * 0.75, s * 0.45);
            ctx.quadraticCurveTo(-s * 0.8, -s * 0.75, 0, -s * 0.75);
            ctx.quadraticCurveTo(s * 0.8, -s * 0.75, s * 0.75, s * 0.45);
            ctx.closePath();
            ctx.fillStyle = c.color;
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(-s * 0.25, -s * 0.35, s * 0.18, s * 0.09, -0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
            break;
    }
    ctx.restore();
}
