#!/usr/bin/env node
// ============================================================
// tools/perf/analyze.mjs — Turns a perf session into report.md + summary.json
//
//   npm run perf:analyze                       latest session in perf-sessions/
//   npm run perf:analyze -- perf-sessions/X    a specific session
// ============================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIENTS = ['portrait', 'landscape'];
const ORIENT_TR = { portrait: 'Dikey', landscape: 'Yatay' };

// ------------------------------------------------------------
// Math helpers
// ------------------------------------------------------------

function pct(sorted, p) {
    if (!sorted.length) return null;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[i];
}
const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);

function dist(values) {
    const s = Float64Array.from(values).sort();
    return {
        n: s.length,
        mean: r2(mean(values)),
        p50: r2(pct(s, 50)), p90: r2(pct(s, 90)), p95: r2(pct(s, 95)), p99: r2(pct(s, 99)),
        max: r2(s.length ? s[s.length - 1] : null)
    };
}

// ------------------------------------------------------------
// Frame segment analysis
// ------------------------------------------------------------

function indicesWhere(F, pred) {
    const out = [];
    for (let i = 0; i < F.t.length; i++) if (pred(i)) out.push(i);
    return out;
}

function analyzeFrames(F, idx) {
    if (!idx.length) return null;
    const col = (k) => idx.map((i) => F[k][i]);
    // Long gaps (app switch, notification shade) are not frames the player saw
    const valid = idx.filter((i) => F.dt[i] > 0 && F.dt[i] < 250);
    const dt = valid.map((i) => F.dt[i]);
    const seconds = sum(dt) / 1000;
    const dtD = dist(dt);
    const med = dtD.p50 || 16.7;
    const cpu = valid.map((i) => F.upd[i] + F.rnd[i]);
    const slow = valid.filter((i) => F.dt[i] > 25);
    const slowGpuBound = slow.filter((i) => F.upd[i] + F.rnd[i] < 0.5 * F.dt[i]);
    const hist = { '≤8.4': 0, '≤11.2': 0, '≤16.8': 0, '≤25': 0, '≤33.4': 0, '≤50': 0, '>50': 0 };
    for (const v of dt) {
        if (v <= 8.4) hist['≤8.4']++;
        else if (v <= 11.2) hist['≤11.2']++;
        else if (v <= 16.8) hist['≤16.8']++;
        else if (v <= 25) hist['≤25']++;
        else if (v <= 33.4) hist['≤33.4']++;
        else if (v <= 50) hist['≤50']++;
        else hist['>50']++;
    }
    for (const k of Object.keys(hist)) hist[k] = r1((100 * hist[k]) / Math.max(1, dt.length));

    // Frame time vs bullet count
    const byBullets = {};
    for (const [lo, hi] of [[0, 50], [50, 150], [150, 300], [300, 600], [600, 1e9]]) {
        const sel = valid.filter((i) => F.bullets[i] >= lo && F.bullets[i] < hi);
        if (sel.length < 30) continue;
        const d = Float64Array.from(sel.map((i) => F.dt[i])).sort();
        const c = Float64Array.from(sel.map((i) => F.upd[i] + F.rnd[i])).sort();
        byBullets[hi >= 1e9 ? `${lo}+` : `${lo}-${hi}`] = {
            frames: sel.length, dtP50: r2(pct(d, 50)), dtP95: r2(pct(d, 95)), cpuP50: r2(pct(c, 50)), cpuP95: r2(pct(c, 95))
        };
    }
    const qLevels = {};
    for (const i of valid) qLevels[`q${F.q[i]}`] = (qLevels[`q${F.q[i]}`] || 0) + 1;
    const steps = {};
    for (const i of valid) steps[F.steps[i]] = (steps[F.steps[i]] || 0) + 1;

    return {
        frames: valid.length,
        seconds: r1(seconds),
        fps: r1(valid.length / Math.max(0.001, seconds)),
        dt: dtD,
        histPct: hist,
        over25msPct: r1((100 * slow.length) / Math.max(1, valid.length)),
        over33msPct: r1((100 * dt.filter((v) => v > 33.4).length) / Math.max(1, dt.length)),
        janks: dt.filter((v) => v > Math.max(1.9 * med, 24)).length,
        jankPerMin: r1((dt.filter((v) => v > Math.max(1.9 * med, 24)).length / Math.max(0.001, seconds)) * 60),
        hitchesOver100ms: idx.filter((i) => F.dt[i] >= 100 && F.dt[i] < 250).length,
        gaps250msPlus: idx.filter((i) => F.dt[i] >= 250).length,
        update: dist(col('upd')),
        render: dist(col('rnd')),
        cpu: dist(cpu),
        slowFramesCpuBoundPct: slow.length ? r1((100 * (slow.length - slowGpuBound.length)) / slow.length) : null,
        slowFramesGpuOrCompositorPct: slow.length ? r1((100 * slowGpuBound.length) / slow.length) : null,
        steps,
        drawCalls: dist(col('draws')),
        texUploadsPerSec: r1(sum(col('texUp')) / Math.max(0.001, seconds)),
        uploadMBPerSec: r2(sum(col('upKB')) / 1024 / Math.max(0.001, seconds)),
        bakes: sum(col('bakes')),
        bullets: dist(col('bullets')),
        particles: dist(col('particles')),
        qualityFrames: qLevels,
        byBullets
    };
}

// ------------------------------------------------------------
// Session
// ------------------------------------------------------------

function parseGfxinfo(txt) {
    if (!txt) return null;
    const g = (re) => { const m = txt.match(re); return m ? m[1] : null; };
    return {
        totalFrames: Number(g(/Total frames rendered:\s*(\d+)/)),
        janky: g(/Janky frames:\s*([^\n]+)/),
        p50: g(/50th percentile:\s*(\S+)/),
        p90: g(/90th percentile:\s*(\S+)/),
        p95: g(/95th percentile:\s*(\S+)/),
        p99: g(/99th percentile:\s*(\S+)/),
        missedVsync: Number(g(/Number Missed Vsync:\s*(\d+)/)),
        slowUi: Number(g(/Number Slow UI thread:\s*(\d+)/)),
        slowDraw: Number(g(/Number Slow issue draw commands:\s*(\d+)/)),
        gpuP50: g(/50th gpu percentile:\s*(\S+)/),
        gpuP99: g(/99th gpu percentile:\s*(\S+)/)
    };
}

function analyzeHost(host) {
    if (!host || !host.samples || !host.samples.length) return null;
    const S = host.samples;
    const num = (k) => S.map((s) => s[k]).filter((v) => typeof v === 'number');
    const temps = {};
    for (const s of S) {
        for (const [k, v] of Object.entries((s.thermal && s.thermal.temps) || {})) {
            (temps[k] ||= []).push(v);
        }
    }
    const sensors = {};
    for (const [k, v] of Object.entries(temps)) sensors[k] = { start: v[0], end: v[v.length - 1], max: Math.max(...v) };
    const bt = num('batteryTempC');
    const cpu = num('cpuPct');
    const thermal = S.map((s) => s.thermal && s.thermal.status).filter((v) => v != null);
    const mem = S.map((s) => s.mem).filter(Boolean);
    const freq = S.map((s) => s.cpuMHz).filter(Boolean);
    let freqSummary = null;
    if (freq.length) {
        const cores = freq[0].length;
        freqSummary = [];
        for (let c = 0; c < cores; c++) {
            const v = freq.map((f) => f[c]).filter((x) => x != null);
            freqSummary.push({ core: c, mean: Math.round(mean(v)), max: Math.max(...v), min: Math.min(...v) });
        }
    }
    return {
        samples: S.length,
        appDied: !!host.appDied,
        batteryTempC: bt.length ? { start: bt[0], end: bt[bt.length - 1], max: Math.max(...bt) } : null,
        batteryLevel: num('batteryLevel').length ? { start: num('batteryLevel')[0], end: num('batteryLevel').at(-1) } : null,
        usbPowered: S.some((s) => s.usbPowered),
        thermalStatusMax: thermal.length ? Math.max(...thermal) : null,
        sensors,
        cpuPct: cpu.length ? { mean: r1(mean(cpu)), max: Math.max(...cpu) } : null,
        appCpuPct: num('appCpuPct').length ? { mean: r1(mean(num('appCpuPct'))), max: Math.max(...num('appCpuPct')) } : null,
        rendererCpuPct: num('rendererCpuPct').length ? { mean: r1(mean(num('rendererCpuPct'))), max: Math.max(...num('rendererCpuPct')) } : null,
        rendererPssMBMax: num('rendererPssMB').length ? Math.max(...num('rendererPssMB')) : null,
        threadsMax: num('threads').length ? Math.max(...num('threads')) : null,
        mem: mem.length ? {
            pssMB: { start: mem[0].pssMB, end: mem.at(-1).pssMB, max: Math.max(...mem.map((m) => m.pssMB || 0)) },
            graphicsMBMax: Math.max(...mem.map((m) => m.graphicsMB || 0)),
            glMtrackMBMax: Math.max(...mem.map((m) => m.glMtrackMB || 0)),
            nativeMBMax: Math.max(...mem.map((m) => m.nativeMB || 0))
        } : null,
        cpuFreqMHz: freqSummary
    };
}

export function analyzeSession(dir) {
    const game = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
    const host = existsSync(join(dir, 'host.json')) ? JSON.parse(readFileSync(join(dir, 'host.json'), 'utf8')) : null;
    const gfx = existsSync(join(dir, 'gfxinfo.txt')) ? readFileSync(join(dir, 'gfxinfo.txt'), 'utf8') : null;
    const F = game.frames;
    const PLAY = game.stateCodes.PLAYING;
    const MENU = game.stateCodes.MENU;

    const segments = {};
    ORIENTS.forEach((o, oi) => {
        segments[o] = {
            playing: analyzeFrames(F, indicesWhere(F, (i) => F.state[i] === PLAY && F.orient[i] === oi)),
            playingBoss: analyzeFrames(F, indicesWhere(F, (i) => F.state[i] === PLAY && F.orient[i] === oi && F.boss[i] === 1)),
            playingNoBoss: analyzeFrames(F, indicesWhere(F, (i) => F.state[i] === PLAY && F.orient[i] === oi && F.boss[i] === 0)),
            menu: analyzeFrames(F, indicesWhere(F, (i) => F.state[i] === MENU && F.orient[i] === oi))
        };
    });
    const allPlaying = analyzeFrames(F, indicesWhere(F, (i) => F.state[i] === PLAY));

    // Rotation / resize hitches: worst frame within 1.5 s after each resize event
    const resizes = game.events.filter((e) => e.type === 'resize').map((e) => {
        const idx = indicesWhere(F, (i) => F.t[i] >= e.t - 300 && F.t[i] <= e.t + 1500);
        const dts = idx.map((i) => F.dt[i]);
        return { ...e, worstFrameMs: dts.length ? r1(Math.max(...dts)) : null, bakesAfter: sum(idx.map((i) => F.bakes[i])) };
    });

    // Per-second timeline (heap, baked textures, fps)
    const sec = game.seconds;
    const heap = sec.map((s) => s.heapMB).filter((v) => v != null);
    const eventCounts = {};
    for (const e of game.events) eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    const longtasks = game.events.filter((e) => e.type === 'longtask').sort((a, b) => b.dur - a.dur);
    const inputs = game.events.filter((e) => e.type === 'input').sort((a, b) => b.dur - a.dur);
    const errors = game.events.filter((e) => ['error', 'console.error', 'contextlost', 'contextrestored'].includes(e.type));

    const uploadsTop = Object.entries(game.uploadsByName || {})
        .map(([name, u]) => ({ name, count: u.count, MB: r2(u.bytes / 1048576) }))
        .sort((a, b) => b.MB - a.MB).slice(0, 12);

    const summary = {
        session: dir,
        exportedAt: game.exportedAt,
        durationS: r1(game.durationMs / 1000),
        status: game.status,
        hzEstimate: game.hzEstimate,
        device: game.device,
        phone: host ? host.info : null,
        segments,
        allPlaying,
        resizes,
        quality: game.events.filter((e) => e.type === 'quality'),
        heapMB: heap.length ? { start: heap[0], end: heap.at(-1), min: Math.min(...heap), max: Math.max(...heap) } : null,
        bakedTextures: { start: sec[0] && sec[0].baked, end: sec.at(-1) && sec.at(-1).baked, max: Math.max(0, ...sec.map((s) => s.baked || 0)) },
        buffers: Object.fromEntries(ORIENTS.map((o, oi) => {
            const s = sec.find((x) => x.orient === oi && x.state === 'PLAYING') || sec.find((x) => x.orient === oi);
            return [o, s ? { css: `${s.w}x${s.h}`, dpr: s.dpr, buffer: `${s.bufW}x${s.bufH}`, texRes: s.texRes } : null];
        })),
        eventCounts,
        longtasks: { count: longtasks.length, totalMs: r1(sum(longtasks.map((e) => e.dur))), top: longtasks.slice(0, 10) },
        slowInputs: { count: inputs.length, top: inputs.slice(0, 10) },
        errors: errors.slice(0, 30),
        uploadsTop,
        host: analyzeHost(host),
        gfxinfo: parseGfxinfo(gfx)
    };
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    const reportPath = join(dir, 'report.md');
    writeFileSync(reportPath, renderReport(summary));
    return { summary, reportPath };
}

// ------------------------------------------------------------
// Markdown report
// ------------------------------------------------------------

function segRow(label, s) {
    if (!s) return `| ${label} | – | | | | | | | | | | |`;
    return `| ${label} | ${s.seconds} | ${s.fps} | ${s.dt.p50} | ${s.dt.p95} | ${s.dt.p99} | ${s.dt.max} | ${s.over25msPct}% | ${s.jankPerMin} | ${s.cpu.p50} / ${s.cpu.p95} | ${s.drawCalls.mean} | ${s.bullets.mean} / ${s.bullets.max} |`;
}

function renderReport(S) {
    const L = [];
    const d = S.device || {};
    const p = S.phone || {};
    L.push(`# Cihaz performans oturumu — ${S.exportedAt}`, '');
    L.push(`**Telefon:** ${p.maker || ''} ${p.model || ''} · Android ${p.android || '?'} · SoC ${p.soc || p.hw || '?'}  `);
    L.push(`**GPU:** ${d.gpu || '?'} (${d.glVersion || ''}) · ${d.cores} çekirdek · ${d.memGB ?? '?'} GB (JS bildirimi)  `);
    L.push(`**Ekran:** ${d.screen ? `${d.screen.w}x${d.screen.h} @${d.screen.dpr}x` : '?'} · algılanan ${S.hzEstimate} Hz · ${p.wmSize || ''}  `);
    L.push(`**Ayarlar:** tema ${d.theme}, sarsıntı ${d.settings && d.settings.shake}, kontrast ${d.settings && d.settings.contrast}, mod ${d.mode}  `);
    L.push(`**Süre:** ${S.durationS} sn kayıt · oynanan: dikey ${S.status.portraitS} sn, yatay ${S.status.landscapeS} sn`, '');

    L.push('## 1. Oyun sırasında kare süreleri (ms)', '');
    L.push('| Bölüm | sn | FPS | p50 | p95 | p99 | maks | >25ms | takılma/dk | CPU p50/p95 | çizim çağrısı | mermi ort/maks |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const o of ORIENTS) {
        const g = S.segments[o];
        L.push(segRow(`${ORIENT_TR[o]} — oyun`, g.playing));
        L.push(segRow(`${ORIENT_TR[o]} — boss`, g.playingBoss));
        L.push(segRow(`${ORIENT_TR[o]} — boss yok`, g.playingNoBoss));
        L.push(segRow(`${ORIENT_TR[o]} — menü`, g.menu));
    }
    L.push('', 'CPU = güncelleme + çizim gönderimi (JS ana iş parçacığı). Kare aralığı CPU\'dan çok büyükse darboğaz GPU / birleştirici (compositor) / vsync tarafındadır.', '');

    L.push('## 2. Ayrıntı (oyun, yön bazında)', '');
    for (const o of ORIENTS) {
        const s = S.segments[o].playing;
        if (!s) { L.push(`### ${ORIENT_TR[o]}: veri yok`, ''); continue; }
        L.push(`### ${ORIENT_TR[o]}`, '');
        L.push(`- Kare aralığı dağılımı (%): ${Object.entries(s.histPct).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
        L.push(`- Güncelleme ms: p50 ${s.update.p50}, p95 ${s.update.p95}, p99 ${s.update.p99}, maks ${s.update.max}`);
        L.push(`- Çizim ms: p50 ${s.render.p50}, p95 ${s.render.p95}, p99 ${s.render.p99}, maks ${s.render.max}`);
        L.push(`- Yavaş karelerin (>25 ms) %${s.slowFramesCpuBoundPct ?? '–'}'i CPU kaynaklı, %${s.slowFramesGpuOrCompositorPct ?? '–'}'i GPU/birleştirici kaynaklı`);
        L.push(`- 100 ms+ takılma: ${s.hitchesOver100ms} · 250 ms+ boşluk: ${s.gaps250msPlus}`);
        L.push(`- Simülasyon adımı/kare: ${JSON.stringify(s.steps)}`);
        L.push(`- Doku yükleme: ${s.texUploadsPerSec}/sn, ${s.uploadMBPerSec} MB/sn · yeni pişirme: ${s.bakes}`);
        L.push(`- Kalite kademesi (kare): ${JSON.stringify(s.qualityFrames)} · parçacık ort/maks ${s.particles.mean}/${s.particles.max}`);
        if (Object.keys(s.byBullets).length) {
            L.push('', '| Mermi | kare | aralık p50 | aralık p95 | CPU p50 | CPU p95 |', '|---|---|---|---|---|---|');
            for (const [k, v] of Object.entries(s.byBullets)) L.push(`| ${k} | ${v.frames} | ${v.dtP50} | ${v.dtP95} | ${v.cpuP50} | ${v.cpuP95} |`);
        }
        L.push('');
    }

    L.push('## 3. Çözünürlük, döndürme, kalite', '');
    for (const o of ORIENTS) {
        const b = S.buffers[o];
        L.push(`- ${ORIENT_TR[o]}: ${b ? `CSS ${b.css}, DPR ${b.dpr}, tampon ${b.buffer}, doku ${b.texRes} px/birim` : 'veri yok'}`);
    }
    for (const r of S.resizes) L.push(`- Yeniden boyut @${(r.t / 1000).toFixed(1)} sn → ${r.orient ? 'yatay' : 'dikey'} ${r.w}x${r.h}: en kötü kare ${r.worstFrameMs} ms, ${r.bakesAfter} pişirme`);
    if (S.quality.length) for (const q of S.quality) L.push(`- Kalite q${q.from} → q${q.to} @${(q.t / 1000).toFixed(1)} sn (${q.orient ? 'yatay' : 'dikey'})`);
    else L.push('- Uyarlanabilir kalite hiç düşmedi.');
    L.push('');

    L.push('## 4. Bellek ve kararlılık', '');
    if (S.heapMB) L.push(`- JS heap: başlangıç ${S.heapMB.start} MB, son ${S.heapMB.end} MB, aralık ${S.heapMB.min}–${S.heapMB.max} MB`);
    L.push(`- Pişmiş doku sayısı: ${S.bakedTextures.start} → ${S.bakedTextures.end} (maks ${S.bakedTextures.max})`);
    L.push(`- Uzun görevler (>50 ms): ${S.longtasks.count} adet, toplam ${S.longtasks.totalMs} ms${S.longtasks.top.length ? ` · en uzun: ${S.longtasks.top.slice(0, 5).map((e) => `${e.dur} ms @${(e.start / 1000).toFixed(1)}s`).join(', ')}` : ''}`);
    L.push(`- Yavaş dokunma tepkisi (≥40 ms): ${S.slowInputs.count}${S.slowInputs.top.length ? ` · en kötü: ${S.slowInputs.top.slice(0, 5).map((e) => `${e.name} ${e.dur} ms (gecikme ${e.delay})`).join(', ')}` : ''}`);
    L.push(`- Hatalar / bağlam kaybı: ${S.errors.length}`);
    for (const e of S.errors.slice(0, 10)) L.push(`  - ${e.type} @${(e.t / 1000).toFixed(1)} sn: ${e.msg || ''}`);
    L.push(`- Olaylar: ${JSON.stringify(S.eventCounts)}`, '');

    if (S.uploadsTop.length) {
        L.push('### En çok yüklenen dokular (tüm oturum)', '', '| Doku | adet | MB |', '|---|---|---|');
        for (const u of S.uploadsTop) L.push(`| ${u.name} | ${u.count} | ${u.MB} |`);
        L.push('');
    }

    const h = S.host;
    L.push('## 5. Telefon (adb)', '');
    if (!h) L.push('Telefon örneklemesi yok.');
    else {
        if (h.appDied) L.push('- ⚠ **Uygulama oturum sırasında kapandı** (logcat-system.txt).');
        if (h.batteryTempC) L.push(`- Pil sıcaklığı: ${h.batteryTempC.start} → ${h.batteryTempC.end} °C (maks ${h.batteryTempC.max}) · şarj USB'den: ${h.usbPowered ? 'evet' : 'hayır'}`);
        if (h.batteryLevel) L.push(`- Pil: %${h.batteryLevel.start} → %${h.batteryLevel.end}`);
        L.push(`- Termal durum (0 = normal … 3+ = kısma): maks ${h.thermalStatusMax ?? '?'}`);
        const sens = Object.entries(h.sensors).filter(([k]) => /^(cpu|gpu|skin)/.test(k)).slice(0, 12);
        if (sens.length) L.push(`- Sensörler: ${sens.map(([k, v]) => `${k} ${v.start}→${v.end} (maks ${v.max})`).join(' · ')}`);
        if (h.cpuPct) L.push(`- CPU toplam: ort %${h.cpuPct.mean}, maks %${h.cpuPct.max} (100 = 1 çekirdek)`
            + (h.appCpuPct ? ` · uygulama/GPU süreci ort %${h.appCpuPct.mean}` : '')
            + (h.rendererCpuPct ? ` · WebView JS süreci ort %${h.rendererCpuPct.mean} (maks %${h.rendererCpuPct.max})` : '')
            + ` · iş parçacığı maks ${h.threadsMax}`);
        if (h.rendererPssMBMax) L.push(`- WebView JS süreci bellek (PSS) maks ${h.rendererPssMBMax} MB`);
        if (h.mem) L.push(`- Bellek (PSS): ${h.mem.pssMB.start} → ${h.mem.pssMB.end} MB (maks ${h.mem.pssMB.max}) · grafik maks ${h.mem.graphicsMBMax} MB · GL maks ${h.mem.glMtrackMBMax} MB · native maks ${h.mem.nativeMBMax} MB`);
        if (h.cpuFreqMHz) L.push(`- CPU saat (MHz, çekirdek ort/maks): ${h.cpuFreqMHz.map((c) => `${c.core}:${c.mean}/${c.max}`).join(' ')}`);
    }
    if (S.gfxinfo && S.gfxinfo.totalFrames) {
        const g = S.gfxinfo;
        L.push(`- Android gfxinfo (uygulama penceresi): ${g.totalFrames} kare, takılan ${g.janky}, p50 ${g.p50}, p90 ${g.p90}, p99 ${g.p99}, GPU p50 ${g.gpuP50}`);
    }
    L.push('');
    return L.join('\n');
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    let dir = process.argv[2];
    if (!dir) {
        const base = join(ROOT, 'perf-sessions');
        const all = existsSync(base) ? readdirSync(base).filter((n) => existsSync(join(base, n, 'game.json'))).sort() : [];
        if (!all.length) {
            console.error('perf-sessions/ altında oturum yok. Önce: npm run perf:collect');
            process.exit(1);
        }
        dir = join(base, all.at(-1));
    }
    const { reportPath } = analyzeSession(resolve(dir));
    console.log(`Rapor: ${reportPath}`);
}
