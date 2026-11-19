// ============================================================
// skins.js — Marşmelov Kostümleri ve Çizimi
// Kostümler başarımla açılır ya da (price olanlar) şekerle alınır;
// çizim hem oyunda hem menü önizlemesinde kullanılır.
// ============================================================

import { THEME } from './theme.js';

export const SKINS = [
    { id: 'classic', name: 'Klasik', body: '#FFFFFF', cheek: 'rgba(255, 111, 174, 0.55)', accessory: null,
      hint: 'başlangıç kostümü', test: () => true },
    { id: 'strawberry', name: 'Çilek', body: '#FFC4DE', cheek: 'rgba(240, 70, 143, 0.6)', accessory: 'seeds',
      hint: 'tek turda 50 graze yap', test: (s) => s.bestGrazeRun >= 50 },
    { id: 'lavender', name: 'Lavanta', body: '#E6DAFF', cheek: 'rgba(142, 91, 232, 0.45)', accessory: 'leaf',
      hint: '30 saniye hayatta kal', test: (s) => s.bestTime >= 30000 },
    { id: 'chocolate', name: 'Çikolata', body: '#D2A48C', cheek: 'rgba(240, 70, 143, 0.5)', accessory: 'drizzle',
      hint: "Jöle Kral'ı erit", test: (s) => s.bossKills >= 1 },
    { id: 'party', name: 'Parti', body: '#FFFFFF', cheek: 'rgba(255, 111, 174, 0.55)', accessory: 'hat',
      hint: "20'lik graze serisi yap", test: (s) => s.bestCombo >= 20 },
    { id: 'bow', name: 'Fiyonk', body: '#FFF1F8', cheek: 'rgba(255, 111, 174, 0.55)', accessory: 'bow',
      hint: '3 farklı gün günlük meydan okuma oyna', test: (s) => (s.dailyDays || []).length >= 3 },
    { id: 'cotton', name: 'Pamuk', body: '#F7F0FF', cheek: 'rgba(183, 155, 255, 0.6)', accessory: 'puff',
      hint: "Pamuk Bulut'u dağıt", test: (s) => (s.bossesBeaten || []).includes('cloud') },
    { id: 'royal', name: 'Kraliyet', body: '#F3EBFF', cheek: 'rgba(255, 111, 174, 0.55)', accessory: 'crown',
      hint: "HARDCORE'da 30 saniye dayan", test: (s) => s.hardcoreBest >= 30000 },

    // --- Şekerle alınan kostümler (başarımla açılmaz) ---
    { id: 'caramel', name: 'Karamel', body: '#F2D2A0', cheek: 'rgba(240, 70, 143, 0.5)', accessory: 'drizzle', drizzle: '#B5651D',
      hint: 'şekerle alınır', price: 400, test: () => false },
    { id: 'bubblegum', name: 'Sakız', body: '#FF9CCB', cheek: 'rgba(240, 70, 143, 0.65)', accessory: 'bubble',
      hint: 'şekerle alınır', price: 650, test: () => false },
    { id: 'night', name: 'Gece', body: '#C9B8EE', cheek: 'rgba(255, 111, 174, 0.55)', accessory: 'stars',
      hint: 'şekerle alınır', price: 1000, test: () => false },
    { id: 'chef', name: 'Şef', body: '#FFFFFF', cheek: 'rgba(255, 111, 174, 0.55)', accessory: 'chef',
      hint: 'şekerle alınır', price: 1500, test: () => false }
];

export function getSkin(id) {
    return SKINS.find(s => s.id === id) || SKINS[0];
}

/**
 * Marşmelov gövdesi, yüzü ve aksesuarı
 * @param {object} opts { squash, blink, locked, hitboxRadius }
 */
export function drawMarshmallow(ctx, x, y, r, skin, { squash = 1, blink = 1, locked = false, hitboxRadius = 0, body = null } = {}) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Gölge
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = THEME.SHADOW;
    ctx.fill();

    // Gövde
    ctx.beginPath();
    ctx.ellipse(x, y, r / squash, r * squash, 0, 0, Math.PI * 2);
    ctx.fillStyle = locked ? '#E9E1F2' : (body || skin.body);
    ctx.fill();
    ctx.strokeStyle = THEME.INK;
    ctx.lineWidth = Math.max(1.5, r * 0.2);
    ctx.stroke();

    if (locked) {
        // Kilit simgesi
        ctx.strokeStyle = THEME.MUTED;
        ctx.lineWidth = r * 0.14;
        ctx.beginPath();
        ctx.arc(x, y - r * 0.12, r * 0.24, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = THEME.MUTED;
        ctx.beginPath();
        ctx.roundRect(x - r * 0.36, y - r * 0.12, r * 0.72, r * 0.5, r * 0.1);
        ctx.fill();
        ctx.restore();
        return;
    }

    // Kostüm dokusu (gövde üstünde)
    if (skin.accessory === 'seeds') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (const [sx, sy] of [[-0.45, 0.35], [0.1, 0.55], [0.5, 0.3], [-0.1, -0.55], [0.4, -0.45]]) {
            ctx.beginPath();
            ctx.ellipse(x + sx * r, y + sy * r, r * 0.07, r * 0.11, sx, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (skin.accessory === 'drizzle') {
        ctx.strokeStyle = skin.drizzle || THEME.PINK;
        ctx.lineWidth = r * 0.16;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.7, y - r * 0.45);
        ctx.quadraticCurveTo(x - r * 0.2, y - r * 0.2, x + r * 0.1, y - r * 0.55);
        ctx.quadraticCurveTo(x + r * 0.4, y - r * 0.8, x + r * 0.7, y - r * 0.4);
        ctx.stroke();
    } else if (skin.accessory === 'stars') {
        // Gövdede minik yıldızlar
        ctx.fillStyle = '#FFF4B8';
        ctx.strokeStyle = THEME.INK;
        ctx.lineWidth = Math.max(0.6, r * 0.05);
        for (const [sx, sy, k] of [[-0.5, -0.5, 0.2], [0.45, 0.45, 0.16], [-0.35, 0.55, 0.12], [0.55, -0.35, 0.11]]) {
            const cx = x + sx * r;
            const cy = y + sy * r;
            const R = k * r;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 4;
                const rr = i % 2 ? R * 0.4 : R;
                ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    // Gözler ve allık
    ctx.fillStyle = THEME.INK;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + side * r * 0.38, y - r * 0.2 * squash, r * 0.14, r * 0.19 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = skin.cheek;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + side * r * 0.62, y + r * 0.18, r * 0.22, r * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Hitbox çekirdeği
    if (hitboxRadius > 0) {
        ctx.beginPath();
        ctx.arc(x, y + r * 0.22, hitboxRadius, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fill();
    }

    // Başa takılan aksesuarlar
    const top = y - r * squash;
    ctx.strokeStyle = THEME.INK;
    ctx.lineWidth = Math.max(1, r * 0.12);
    if (skin.accessory === 'chef') {
        // Şef şapkası: kabarık üst + bant
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.strokeStyle = THEME.INK;
        const puffs = [[-0.32, -0.42, 0.3], [0.0, -0.58, 0.34], [0.32, -0.42, 0.3]];
        for (const [px, py, pr] of puffs) {
            ctx.beginPath();
            ctx.arc(x + px * r, top + py * r, pr * r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.roundRect(x - r * 0.45, top - r * 0.38, r * 0.9, r * 0.42, r * 0.08);
        ctx.stroke();
        ctx.fillStyle = THEME.WHITE;
        for (const [px, py, pr] of puffs) {
            ctx.beginPath();
            ctx.arc(x + px * r, top + py * r, pr * r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillRect(x - r * 0.45, top - r * 0.38, r * 0.9, r * 0.42);
        ctx.strokeStyle = THEME.LAVENDER;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.4, top - r * 0.08);
        ctx.lineTo(x + r * 0.4, top - r * 0.08);
        ctx.stroke();
    } else if (skin.accessory === 'bubble') {
        // Ağızdan şişen sakız balonu
        const bx = x + r * 0.58;
        const by = y + r * 0.42;
        const br = r * 0.36;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PINK;
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.strokeStyle = THEME.INK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx - br * 0.35, by - br * 0.35, br * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
    } else if (skin.accessory === 'hat') {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.42, top + r * 0.12);
        ctx.lineTo(x + r * 0.05, top - r * 0.9);
        ctx.lineTo(x + r * 0.45, top + r * 0.05);
        ctx.closePath();
        ctx.fillStyle = THEME.PURPLE;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + r * 0.05, top - r * 0.9, r * 0.17, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PINK;
        ctx.fill();
        ctx.stroke();
    } else if (skin.accessory === 'crown') {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.45, top + r * 0.1);
        ctx.lineTo(x - r * 0.5, top - r * 0.45);
        ctx.lineTo(x - r * 0.2, top - r * 0.15);
        ctx.lineTo(x, top - r * 0.55);
        ctx.lineTo(x + r * 0.2, top - r * 0.15);
        ctx.lineTo(x + r * 0.5, top - r * 0.45);
        ctx.lineTo(x + r * 0.45, top + r * 0.1);
        ctx.closePath();
        ctx.fillStyle = THEME.PINK;
        ctx.fill();
        ctx.stroke();
    } else if (skin.accessory === 'bow') {
        ctx.fillStyle = THEME.PINK;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(x + r * 0.35, top + r * 0.05);
            ctx.lineTo(x + r * 0.35 + side * r * 0.42, top - r * 0.3);
            ctx.lineTo(x + r * 0.35 + side * r * 0.42, top + r * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x + r * 0.35, top + r * 0.05, r * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PINK_DEEP;
        ctx.fill();
    } else if (skin.accessory === 'puff') {
        const puffs = [[-0.35, 0.05, 0.3], [0.05, -0.15, 0.36], [0.42, 0.05, 0.28]];
        ctx.lineWidth = Math.max(1.5, r * 0.16);
        for (const [px, py, pr] of puffs) {
            ctx.beginPath();
            ctx.arc(x + px * r, top + py * r, pr * r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = THEME.LAVENDER;
        for (const [px, py, pr] of puffs) {
            ctx.beginPath();
            ctx.arc(x + px * r, top + py * r, pr * r, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (skin.accessory === 'leaf') {
        ctx.beginPath();
        ctx.moveTo(x, top + r * 0.05);
        ctx.quadraticCurveTo(x + r * 0.05, top - r * 0.35, x + r * 0.15, top - r * 0.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + r * 0.35, top - r * 0.45, r * 0.3, r * 0.15, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = THEME.PURPLE;
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}
