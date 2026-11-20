#!/usr/bin/env node
// ============================================================
// tools/perf/collect.mjs — Pull an on-device perf session over USB
//
//   npm run perf:collect              wait until 30 s portrait + 30 s landscape were played
//   npm run perf:collect -- --now     pull whatever was recorded so far
//   npm run perf:collect -- --max 300 give up waiting after 300 s (default 600)
//   npm run perf:collect -- --install install the perf APK first (keeps app data)
//   npm run perf:collect -- --soak 600 --immortal   10-minute soak test, no deaths, nothing saved
//
// Needs: the perf APK (`npm run apk:perf`) running on a phone connected with USB
// debugging. While the player plays, the script samples the phone every second
// (battery temperature, thermal status, CPU load, CPU clocks, memory) and records
// the app's logcat. At the end it pulls the in-game recorder (`window.__perf`)
// through the WebView DevTools socket, saves everything under perf-sessions/<time>/
// and writes report.md with tools/perf/analyze.mjs.
// ============================================================

import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSession } from './analyze.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = 'com.bullethellmicro.app';
const PORT = 9333;
const args = process.argv.slice(2);
const NOW = args.includes('--now');
const flag = (name) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : 0);
const SOAK_S = flag('--soak');                  // long session: seconds of total play (e.g. 600)
const IMMORTAL = args.includes('--immortal');   // turn off death + saving in this app run
const MAX_WAIT_S = flag('--max') || (SOAK_S ? SOAK_S * 2 + 300 : 600);

// ------------------------------------------------------------
// adb helpers
// ------------------------------------------------------------

function findAdb() {
    const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
    const dirs = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
    const lp = join(ROOT, 'android', 'local.properties');
    if (existsSync(lp)) {
        const m = readFileSync(lp, 'utf8').match(/^sdk\.dir=(.*)$/m);
        if (m) dirs.unshift(m[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\'));
    }
    if (process.env.LOCALAPPDATA) dirs.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
    for (const d of dirs) {
        if (d && existsSync(join(d, 'platform-tools', exe))) return join(d, 'platform-tools', exe);
    }
    return 'adb';
}
const ADB = findAdb();

function adb(argv, { timeout = 15000, allowFail = false } = {}) {
    return new Promise((res, rej) => {
        execFile(ADB, argv, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
            if (err && !allowFail) rej(new Error(`adb ${argv.join(' ')}: ${stderr || err.message}`));
            else res(String(stdout || ''));
        });
    });
}
const sh = (cmd, opts) => adb(['shell', cmd], { allowFail: true, ...opts });

function die(msg) {
    console.error(`\n✖ ${msg}\n`);
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// DevTools protocol (WebView)
// ------------------------------------------------------------

class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.addEventListener('message', (m) => {
            const msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString());
            const p = this.pending.get(msg.id);
            if (p) {
                this.pending.delete(msg.id);
                if (msg.error) p.rej(new Error(msg.error.message));
                else p.res(msg.result);
            }
        });
    }

    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('WebSocket connection failed')), { once: true });
        });
        const cdp = new Cdp(ws);
        ws.addEventListener('close', () => { cdp.closed = true; });
        return cdp;
    }

    send(method, params = {}, timeoutMs = 60000) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => {
            this.pending.set(id, { res, rej });
            setTimeout(() => {
                if (this.pending.delete(id)) rej(new Error(`${method} timed out`));
            }, timeoutMs);
        });
    }

    async eval(expression, timeoutMs = 60000) {
        if (this.closed) throw new Error('DevTools connection closed');
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    }

    close() {
        try { this.ws.close(); } catch { /* ignore */ }
    }
}

async function connectWebView(pid) {
    const unix = await sh('cat /proc/net/unix');
    const sockets = [...unix.matchAll(/@(webview_devtools_remote_(\d+))/g)];
    const sock = sockets.find((m) => m[2] === String(pid)) || sockets[0];
    if (!sock) throw new Error('WebView hata ayıklama soketi bulunamadı. Perf APK (debug) yüklü ve oyun açık mı?');
    await adb(['forward', `tcp:${PORT}`, `localabstract:${sock[1]}`]);
    let pages = [];
    for (let i = 0; i < 10 && !pages.length; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            pages = list.filter((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        } catch { /* WebView not ready yet */ }
        if (!pages.length) await sleep(500);
    }
    if (!pages.length) throw new Error('WebView sayfası DevTools üzerinden görünmüyor.');
    return Cdp.connect(pages[0].webSocketDebuggerUrl);
}

// ------------------------------------------------------------
// Host-side (phone) sampling
// ------------------------------------------------------------

async function deviceInfo() {
    const prop = async (k) => (await sh(`getprop ${k}`)).trim();
    const [model, maker, android, sdk, soc, hw, size, density, display, refresh] = await Promise.all([
        prop('ro.product.model'), prop('ro.product.manufacturer'), prop('ro.build.version.release'),
        prop('ro.build.version.sdk'), prop('ro.soc.model'), prop('ro.hardware'),
        sh('wm size'), sh('wm density'),
        sh('dumpsys display | grep -E "mActiveSfDisplayMode|mDefaultModeId|renderFrameRate|mRefreshRate" | head -n 8'),
        sh('settings get system peak_refresh_rate; settings get system min_refresh_rate; settings get secure refresh_rate_mode')
    ]);
    const webview = await sh('dumpsys webviewupdate | grep -E "Current WebView package|versionName" | head -n 3');
    const appVer = await sh(`dumpsys package ${PKG} | grep -E "versionName|lastUpdateTime" | head -n 2`);
    return {
        model, maker, android, sdk, soc, hw,
        wmSize: size.trim(), wmDensity: density.trim(),
        display: display.trim(), refreshSettings: refresh.trim(),
        webview: webview.trim(), app: appVer.trim()
    };
}

function parseThermal(txt) {
    const status = (txt.match(/Thermal Status:\s*(\d+)/) || [])[1];
    const temps = {};
    // "Temperature{mValue=36.2, mType=0, mName=AP, mStatus=0}" — keep the current block only
    const cur = txt.split(/Cached temperatures:|Current temperatures from HAL:/)[1] || txt;
    for (const m of cur.matchAll(/mValue=([\d.-]+), mType=(\d+), mName=([^,]+), mStatus=(\d+)/g)) {
        const type = { 0: 'cpu', 1: 'gpu', 2: 'battery', 3: 'skin' }[m[2]] || `t${m[2]}`;
        temps[`${type}:${m[3]}`] = Number(m[1]);
    }
    return { status: status == null ? null : Number(status), temps };
}

/** WebView runs page JavaScript in a separate sandboxed renderer process. */
async function findRendererPids() {
    const ps = await sh('ps -A -o PID,NAME');
    return ps.split('\n').map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length >= 2 && /webview.*sandboxed|trichrome.*sandboxed/i.test(p[1]))
        .map((p) => p[0]);
}

const cpuPrev = new Map(); // pid → { ticks, at }
/** CPU % (100 = one core) from /proc/<pid>/stat deltas; also thread count. */
async function procCpu(pids) {
    const out = {};
    if (!pids.length) return out;
    const txt = await sh(`for p in ${pids.join(' ')}; do echo "$p $(cat /proc/$p/stat 2>/dev/null)"; done`);
    const now = Date.now();
    for (const line of txt.split('\n')) {
        const pid = line.trim().split(' ')[0];
        const rest = line.slice(line.lastIndexOf(')') + 2).trim().split(/\s+/);
        if (!pid || rest.length < 18) continue;
        // After "(comm)": state=0 … utime=11 stime=12 … num_threads=17
        const ticks = Number(rest[11]) + Number(rest[12]);
        const prev = cpuPrev.get(pid);
        cpuPrev.set(pid, { ticks, at: now });
        out[pid] = {
            threads: Number(rest[17]),
            cpuPct: prev ? Math.round(((ticks - prev.ticks) / 100) / ((now - prev.at) / 1000) * 100) : null
        };
    }
    return out;
}

async function hostSample(pid, t0, slow, renderers) {
    const s = { t: Date.now() - t0 };
    const jobs = [
        sh('dumpsys battery').then((b) => {
            const temp = b.match(/temperature:\s*(\d+)/);
            const lvl = b.match(/level:\s*(\d+)/);
            s.batteryTempC = temp ? Number(temp[1]) / 10 : null;
            s.batteryLevel = lvl ? Number(lvl[1]) : null;
            s.usbPowered = /USB powered:\s*true/.test(b);
        }),
        sh('dumpsys thermalservice').then((t) => Object.assign(s, { thermal: parseThermal(t) })),
        sh('cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq 2>/dev/null').then((f) => {
            const v = f.trim().split(/\s+/).filter(Boolean).map((x) => Math.round(Number(x) / 1000));
            if (v.length) s.cpuMHz = v;
        }),
        procCpu([pid, ...renderers]).then((c) => {
            const app = c[pid];
            if (app) {
                s.appCpuPct = app.cpuPct;
                s.threads = app.threads;
            }
            const r = renderers.map((p) => c[p]).filter(Boolean);
            if (r.length) {
                s.rendererCpuPct = r.some((x) => x.cpuPct != null) ? r.reduce((a, x) => a + (x.cpuPct || 0), 0) : null;
                s.rendererThreads = r.reduce((a, x) => a + x.threads, 0);
            }
            if (s.appCpuPct != null) s.cpuPct = s.appCpuPct + (s.rendererCpuPct || 0);
        })
    ];
    if (slow && renderers.length) {
        jobs.push(sh(`dumpsys meminfo ${renderers[0]}`, { timeout: 10000 }).then((m) => {
            const total = m.match(/TOTAL PSS:\s*(\d+)/) || m.match(/^\s*TOTAL\s+(\d+)/m);
            if (total) s.rendererPssMB = Math.round(Number(total[1]) / 1024);
        }));
    }
    if (slow) {
        jobs.push(sh(`dumpsys meminfo ${PKG}`, { timeout: 10000 }).then((m) => {
            const total = m.match(/TOTAL PSS:\s*(\d+)/) || m.match(/^\s*TOTAL\s+(\d+)/m);
            const gfx = m.match(/Graphics:\s*(\d+)/);
            const gl = m.match(/^\s*GL mtrack\s+(\d+)/m);
            const egl = m.match(/^\s*EGL mtrack\s+(\d+)/m);
            const native = m.match(/Native Heap:\s*(\d+)/);
            s.mem = {
                pssMB: total ? Math.round(Number(total[1]) / 1024) : null,
                graphicsMB: gfx ? Math.round(Number(gfx[1]) / 1024) : null,
                glMtrackMB: gl ? Math.round(Number(gl[1]) / 1024) : null,
                eglMtrackMB: egl ? Math.round(Number(egl[1]) / 1024) : null,
                nativeMB: native ? Math.round(Number(native[1]) / 1024) : null
            };
        }));
    }
    await Promise.allSettled(jobs);
    return s;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
    console.log(`adb: ${ADB}`);
    const devs = (await adb(['devices'], { allowFail: true })).split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2);
    if (!devs.length) die('Telefon bulunamadı. USB hata ayıklama açık mı, telefonda "izin ver" onaylandı mı?');
    if (devs.some((d) => d[1] === 'unauthorized')) die('Telefon yetkisiz: telefondaki "USB hata ayıklamaya izin ver" penceresini onayla.');
    if (devs.length > 1 && !process.env.ANDROID_SERIAL) die('Birden fazla cihaz bağlı: ANDROID_SERIAL ile birini seç.');

    if (args.includes('--install')) {
        const apk = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        if (!existsSync(apk)) die('Perf APK yok. Önce: npm run apk:perf');
        console.log('Perf APK yükleniyor (ilerleme ve ayarlar korunur)…');
        const out = await adb(['install', '-r', apk], { timeout: 180000, allowFail: true });
        if (!/Success/.test(out)) {
            die(`Yükleme başarısız:\n${out}\nİmza uyuşmazlığıysa telefondaki eski sürümü kaldırmak gerekir (bu, oyundaki ilerlemeyi siler).`);
        }
        await sh(`am force-stop ${PKG}`);
        console.log('✓ Yüklendi.');
    }

    let pid = (await sh(`pidof ${PKG}`)).trim().split(/\s+/)[0];
    if (!pid) {
        console.log('Oyun açık değil, başlatılıyor…');
        await sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
        for (let i = 0; i < 20 && !pid; i++) {
            await sleep(500);
            pid = (await sh(`pidof ${PKG}`)).trim().split(/\s+/)[0];
        }
        if (!pid) die(`${PKG} başlatılamadı. Perf APK yüklü mü? (npm run apk:perf, sonra npm run perf:collect -- --install)`);
        await sleep(3000);
    }

    const info = await deviceInfo();
    console.log(`Cihaz: ${info.maker} ${info.model} · Android ${info.android} · SoC ${info.soc || info.hw}`);

    let cdp = await connectWebView(pid).catch((e) => die(e.message));
    let hasPerf = false;
    for (let i = 0; i < 20 && !hasPerf; i++) {
        hasPerf = await cdp.eval('!!window.__perf').catch(() => false);
        if (!hasPerf) await sleep(500);
    }
    if (!hasPerf) die('Oyunda kayıt modülü yok. Normal APK yüklü olabilir: `npm run apk:perf` ile derlenen APK gerekli.');
    if (SOAK_S || IMMORTAL) {
        const st = await cdp.eval(`window.__perf.configure ? window.__perf.configure(${JSON.stringify({ soakS: SOAK_S, immortal: IMMORTAL })}) : null`);
        if (!st) die('Bu APK uzun test modunu desteklemiyor: `npm run apk:perf` ile yeniden derleyip --install ile yükle.');
        console.log(`Uzun test: ${SOAK_S ? `${SOAK_S} sn oyun` : 'süre hedefi yok'}${IMMORTAL ? ' · ölümsüz (ölüm ve kayıt kapalı)' : ''}`);
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const dir = join(ROOT, 'perf-sessions', stamp);
    mkdirSync(dir, { recursive: true });

    // Logcat of the app process, from now on
    const logFile = createWriteStream(join(dir, 'logcat.txt'));
    const logcat = spawn(ADB, ['logcat', '-v', 'threadtime', '-T', '1', `--pid=${pid}`], { windowsHide: true });
    logcat.stdout.pipe(logFile);
    // System-wide kills / thermal / low-memory messages
    const sysFile = createWriteStream(join(dir, 'logcat-system.txt'));
    const syslog = spawn(ADB, ['logcat', '-v', 'threadtime', '-T', '1', '-s',
        'ActivityManager:I', 'lowmemorykiller:*', 'ThermalManagerService:*', 'thermal:*', 'chromium:W', 'cr_*:W'], { windowsHide: true });
    syslog.stdout.pipe(sysFile);

    await sh(`dumpsys gfxinfo ${PKG} reset`);
    const renderers = await findRendererPids();
    info.rendererPids = renderers;
    if (!renderers.length) console.log("⚠ WebView renderer süreci bulunamadı: CPU ölçümü yalnızca uygulama sürecini kapsar.");

    const host = [];
    const t0 = Date.now();
    let stop = NOW;
    let tick = 0;
    process.on('SIGINT', () => {
        if (stop) process.exit(130);
        stop = true;
        console.log('\nDurduruldu, kayıt çekiliyor…');
    });
    if (!NOW) {
        console.log('\nKayıt sürüyor. Telefonda oyna: 30 sn dikey + 30 sn yatay (ekrandaki sayaç).');
        console.log('Bitince otomatik çekilir. Erken bitirmek için Ctrl+C.\n');
    }
    while (!stop) {
        const [st, hs] = await Promise.all([
            cdp.eval('window.__perf.status()', 5000).catch(() => null),
            hostSample(pid, t0, tick % 5 === 0, renderers)
        ]);
        host.push(hs);
        tick++;
        if (st) {
            const temp = hs.batteryTempC != null ? `${hs.batteryTempC.toFixed(1)}°C` : '?°C';
            const progress = st.soakS
                ? `Oyun ${String(Math.floor(st.totalS)).padStart(3)}/${st.soakS} sn`
                : `Dikey ${st.portraitS.toFixed(0).padStart(2)}/${st.target} · Yatay ${st.landscapeS.toFixed(0).padStart(2)}/${st.target}`;
            process.stdout.write(`\r  ${progress}`
                + ` · ${st.state.padEnd(7)} · ${String(st.fps).padStart(5)} fps · q${st.q} · ${temp} · CPU ${hs.cpuPct ?? '?'}%   `);
            if (st.done) {
                console.log(st.soakS ? '\n\n✓ Uzun test tamam. 3 sn daha örnekleniyor…' : '\n\n✓ İki yönde de 30 sn tamam. 3 sn daha örnekleniyor…');
                for (let i = 0; i < 3; i++) host.push(await hostSample(pid, t0, i === 2, renderers));
                stop = true;
            }
        } else if ((await adb(['get-state'], { allowFail: true, timeout: 5000 })).trim() !== 'device') {
            // Phone unplugged / USB reset: wait for it. The in-game recorder keeps everything in
            // memory, so the session continues once the cable is back.
            process.stdout.write('\r  ⚠ Telefon bağlantısı yok (kablo?), bekleniyor…                        ');
        } else if ((await sh(`pidof ${PKG}`)).trim() === String(pid)) {
            // App alive but no answer: the port forward was lost. Reconnect.
            process.stdout.write('\r  ⚠ Bağlantı koptu, yeniden bağlanılıyor…                               ');
            cdp.close();
            cdp = await connectWebView(pid).catch(() => cdp);
        } else {
            console.log('\n\n⚠ Oyun kapandı (çökme veya sistem tarafından öldürüldü). Logcat kaydedildi.');
            writeFileSync(join(dir, 'host.json'), JSON.stringify({ info, startedAt: t0, samples: host, appDied: true }, null, 1));
            logcat.kill();
            syslog.kill();
            return;
        }
        if ((Date.now() - t0) / 1000 > MAX_WAIT_S) {
            console.log(`\n\n⏱ ${MAX_WAIT_S} sn doldu, eldeki kayıt çekiliyor.`);
            stop = true;
        }
        if (!stop) await sleep(Math.max(0, 1000 - ((Date.now() - t0) % 1000)));
    }

    console.log('Oyundan kayıt çekiliyor…');
    const json = await cdp.eval('window.__perf.export()');
    writeFileSync(join(dir, 'game.json'), json);
    const gfx = await sh(`dumpsys gfxinfo ${PKG}`);
    writeFileSync(join(dir, 'gfxinfo.txt'), gfx);
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ info, startedAt: t0, samples: host }, null, 1));
    cdp.close();
    await sleep(500);
    logcat.kill();
    syslog.kill();
    await adb(['forward', '--remove', `tcp:${PORT}`], { allowFail: true });

    const { reportPath } = analyzeSession(dir);
    console.log(`\n✓ Kaydedildi: ${dir}`);
    console.log(`  Rapor: ${reportPath}\n`);
    process.exit(0);
}

main().catch((e) => die(e.stack || e.message));
