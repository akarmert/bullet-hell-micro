// ============================================================
// ui.js — Kullanıcı Arayüzü Yöneticisi
// Çoklu Mod Menüsü, Gelişmiş HUD (Graze, Dash Bar, Kalkan), Ölüm Ekranı
// ============================================================

import { GAME_CONFIG } from './config.js';
import { ModeRegistry } from './modes.js';

export class UIManager {
    constructor() {
        this.currentMode = ModeRegistry.get('classic');
        this.highScores = {};
        this.loadAllHighScores();
        this.isNewRecord = false;

        // Menü Buton Koordinatları (2x2 Izgara)
        this.modeButtons = [
            { id: 'classic', label: 'CLASSIC', x: 90, y: 175, w: 200, h: 44 },
            { id: 'endless', label: 'ENDLESS', x: 310, y: 175, w: 200, h: 44 },
            { id: 'hardcore', label: 'HARDCORE', x: 90, y: 230, w: 200, h: 44 },
            { id: 'chaos', label: 'CHAOS', x: 310, y: 230, w: 200, h: 44 }
        ];

        // Başlat Butonu Koordinatları
        this.playButton = { x: 170, y: 440, w: 260, h: 50 };

        // Ölüm Ekranı Butonları (dokunmatik için büyük hedefler)
        this.deadButtons = [
            { id: 'retry', label: 'TEKRAR OYNA', x: 130, y: 408, w: 170, h: 50, primary: true },
            { id: 'menu',  label: 'MENÜ',        x: 312, y: 408, w: 158, h: 50, primary: false }
        ];

        // Girdi tipi: ipucu metinleri buna göre değişir ('touch' | 'desktop')
        this.inputType = UIManager.detectInputType();

        // Dokunmatik kontrol şeması ('joystick' | 'drag') ve menüdeki değiştirme butonu
        this.touchScheme = 'joystick';
        this.schemeButton = { x: 180, y: 508, w: 240, h: 42 };
    }

    isSchemeToggleClicked(x, y) {
        x -= this.offsetX;
        if (!this.isTouch) return false;
        const b = this.schemeButton;
        return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }

    static detectInputType() {
        try {
            if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return 'touch';
        } catch (e) { /* yok say */ }
        return 'desktop';
    }

    /**
     * Menü / ölüm / duraklatma ekranları 600 genişliğinde bir kutuda çizilir;
     * geniş (yatay) arenada bu kutu yatayda ortalanır.
     */
    get offsetX() {
        return (GAME_CONFIG.CANVAS.WIDTH - GAME_CONFIG.CANVAS.BASE_SIZE) / 2;
    }

    setInputType(type) {
        this.inputType = type;
    }

    get isTouch() {
        return this.inputType === 'touch';
    }

    /**
     * Ölüm ekranında dokunulan butonu döner ('retry' | 'menu' | null)
     */
    getDeadAction(x, y) {
        x -= this.offsetX;
        for (const btn of this.deadButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return btn.id;
            }
        }
        return null;
    }

    setMode(mode) {
        this.currentMode = mode;
        this.isNewRecord = false;
    }

    static formatTime(ms) {
        if (!ms || ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor(ms % 1000);

        const mStr = String(minutes).padStart(2, '0');
        const sStr = String(seconds).padStart(2, '0');
        const msStr = String(milliseconds).padStart(3, '0');

        return `${mStr}:${sStr}.${msStr}`;
    }

    loadAllHighScores() {
        const modes = ModeRegistry.getAll();
        for (const m of modes) {
            try {
                let saved = localStorage.getItem(m.storageKey);
                if (!saved && m.legacyKey) {
                    saved = localStorage.getItem(m.legacyKey);
                    if (saved) {
                        localStorage.setItem(m.storageKey, saved);
                    }
                }
                this.highScores[m.id] = saved ? parseFloat(saved) : 0;
            } catch (e) {
                console.warn(`${m.id} rekoru okunamadı:`, e);
                this.highScores[m.id] = 0;
            }
        }
    }

    getHighScore(modeId = this.currentMode.id) {
        return this.highScores[modeId] || 0;
    }

    checkAndSaveHighScore(finalTimeMs, mode = this.currentMode) {
        const currentBest = this.getHighScore(mode.id);
        if (finalTimeMs > currentBest) {
            this.highScores[mode.id] = finalTimeMs;
            this.isNewRecord = true;
            try {
                localStorage.setItem(mode.storageKey, finalTimeMs.toString());
            } catch (e) {
                console.warn(`${mode.id} rekoru kaydedilemedi:`, e);
            }
            return true;
        }
        this.isNewRecord = false;
        return false;
    }

    resetGameSession() {
        this.isNewRecord = false;
    }

    getClickedMode(x, y) {
        x -= this.offsetX;
        for (const btn of this.modeButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return btn.id;
            }
        }
        return null;
    }

    isPlayButtonClicked(x, y) {
        x -= this.offsetX;
        const btn = this.playButton;
        return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
    }

    /**
     * Menü Ekranı (Mod Seçimi ve Klavye/Fare/Gamepad İpuçları)
     */
    renderMenu(ctx, activeModeId = this.currentMode.id) {
        const w = GAME_CONFIG.CANVAS.BASE_SIZE;

        ctx.save();
        ctx.translate(this.offsetX, 0);

        // Başlık
        ctx.textAlign = 'center';
        ctx.font = '900 27px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 18;
        ctx.fillText('BULLET HELL MICRO', w / 2, 70);

        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.fillText('SELECT GAME MODE', w / 2, 102);

        // Mod Seçim Butonları
        for (const btn of this.modeButtons) {
            const isSelected = btn.id === activeModeId;

            ctx.save();
            if (isSelected) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.18)';
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 14;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = 1;
                ctx.shadowBlur = 0;
            }

            ctx.beginPath();
            ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 6);
            ctx.fill();
            ctx.stroke();

            ctx.font = isSelected ? 'bold 14px "JetBrains Mono", monospace' : '13px "JetBrains Mono", monospace';
            ctx.fillStyle = isSelected ? '#ffffff' : '#8c8ca0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);

            if (isSelected) {
                ctx.font = 'bold 9px "JetBrains Mono", monospace';
                ctx.fillStyle = '#00ffff';
                ctx.fillText('● AKTİF', btn.x + btn.w / 2, btn.y + btn.h - 7);
            }

            ctx.restore();
        }

        // Mod Açıklaması
        const activeMode = ModeRegistry.get(activeModeId);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#a2a2bd';
        ctx.fillText(`“${activeMode.description}”`, w / 2, 305);

        // Rekor
        const bestTime = this.getHighScore(activeModeId);
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = 'rgba(255, 230, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.fillText(`EN İYİ REKOR (${activeMode.label}): ${UIManager.formatTime(bestTime)}`, w / 2, 335);
        ctx.shadowBlur = 0;

        // Kontrol ve Mekanik İpuçları
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00ffff';
        if (this.isTouch) {
            ctx.font = '13px "JetBrains Mono", monospace';
            if (this.touchScheme === 'joystick') {
                ctx.fillText('[ Ekrana Bas & Kaydır ] Joystick', w / 2, 372);
                ctx.fillStyle = '#8e8ea8';
                const dashWhere = GAME_CONFIG.CANVAS.WIDTH > GAME_CONFIG.CANVAS.BASE_SIZE ? 'Sağdaki' : 'Sağ Alt';
                ctx.fillText(`[ ${dashWhere} DASH / 2. Parmak ] Dash`, w / 2, 396);
                ctx.font = '11px "JetBrains Mono", monospace';
                ctx.fillText('Az it = yavaş & hassas · Tam it = hızlı', w / 2, 418);
            } else {
                ctx.fillText('[ Parmağını Sürükle ] Hareket', w / 2, 372);
                ctx.fillStyle = '#8e8ea8';
                ctx.fillText('[ 2. Parmakla Dokun / Çift Dokun ] Dash', w / 2, 396);
                ctx.font = '11px "JetBrains Mono", monospace';
                ctx.fillText('Duvara değmek de öldürür!', w / 2, 418);
            }
        } else {
            ctx.fillText('[ Fare / WASD / Gamepad ] Hareket', w / 2, 370);
            ctx.fillStyle = '#8e8ea8';
            ctx.fillText('[ Sağ Tık / Shift / Space ] Dash (Dokunulmazlık)', w / 2, 390);
            ctx.fillText('[ B ] Synth Müzik  ·  [ P / ESC ] Duraklat', w / 2, 410);
        }

        // PLAY Butonu
        const pb = this.playButton;
        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;

        ctx.fillStyle = `rgba(0, 255, 255, ${0.12 + pulse * 0.08})`;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10 + pulse * 8;

        ctx.beginPath();
        ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 15px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`OYNA: ${activeMode.label}`, w / 2, pb.y + 31);

        // Dokunmatik kontrol şeması seçici
        if (this.isTouch) {
            const sb = this.schemeButton;
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = 'rgba(255, 230, 0, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 8);
            ctx.fill();
            ctx.stroke();
            ctx.font = 'bold 13px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffe600';
            const label = this.touchScheme === 'joystick' ? 'KONTROL: JOYSTICK  ⇄' : 'KONTROL: SÜRÜKLE  ⇄';
            ctx.fillText(label, w / 2, sb.y + 26);
        }

        ctx.restore();
    }

    /**
     * Oynanış HUD: Mod, Süre, Graze Sayacı, Kalkan ve Dash Şarj Çubuğu
     */
    renderHUD(ctx, elapsedMs, mode = this.currentMode, player = null, pickupManager = null) {
        const w = GAME_CONFIG.CANVAS.WIDTH;

        ctx.save();

        // 1. Sol Üst: Graze (Teğet Geçme) Sayacı
        ctx.textAlign = 'left';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = 6;
        const graze = player ? player.grazeCount : 0;
        ctx.fillText(`GRAZE: ${graze}`, 18, 28);
        ctx.shadowBlur = 0;

        // Kalkan aktifse sol üstte yeşil kalkan ikonu/metni
        if (player && player.hasShield) {
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 6;
            ctx.fillText('🛡 KALKAN AKTİF', 18, 48);
            ctx.shadowBlur = 0;
        }

        // Slow-mo aktifse bildirim
        if (pickupManager && pickupManager.isSlowmoActive()) {
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffaa00';
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 8;
            const remaining = (pickupManager.slowmoTimer / 1000).toFixed(1);
            ctx.fillText(`⏳ SLOW-MO: ${remaining}s`, 18, player && player.hasShield ? 68 : 48);
            ctx.shadowBlur = 0;
        }

        // 2. Orta Üst: Mod Etiketi ve Büyük Sayaç
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 6;
        ctx.fillText(mode.label, w / 2, 26);

        ctx.font = 'bold 34px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fillText(UIManager.formatTime(elapsedMs), w / 2, 62);
        ctx.shadowBlur = 0;

        // 3. Sağ Üst: Modun Rekoru
        ctx.textAlign = 'right';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#808098';
        ctx.fillText(`REKOR: ${UIManager.formatTime(this.getHighScore(mode.id))}`, w - 18, 26);

        // 4. Alt Orta: Dash (I-Frame) Şarj Göstergesi
        if (player) {
            const barW = 120;
            const barH = 5;
            const barX = (w - barW) / 2;
            const barY = 575;
            const ratio = player.getDashReadyRatio();
            const isReady = ratio >= 1.0;

            // Arka zemin çerçevesi
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(barX, barY, barW, barH);

            // Doluluk
            ctx.fillStyle = isReady ? '#00ffff' : 'rgba(0, 255, 255, 0.45)';
            if (isReady) {
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 8;
            }
            ctx.fillRect(barX, barY, barW * ratio, barH);
            ctx.shadowBlur = 0;

            // Dash Durum Metni
            ctx.textAlign = 'center';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.fillStyle = isReady ? '#00ffff' : '#686880';
            const readyHint = !this.isTouch
                ? 'DASH HAZIR (Sağ Tık / Space / Shift)'
                : (this.touchScheme === 'joystick' ? 'DASH HAZIR' : 'DASH HAZIR (2. Parmak / Çift Dokun)');
            ctx.fillText(isReady ? readyHint : 'DASH DOLUYOR...', w / 2, barY - 6);
        }

        ctx.restore();
    }

    /**
     * Ölüm Ekranı
     */
    renderDead(ctx, finalTimeMs, mode = this.currentMode, player = null) {
        const w = GAME_CONFIG.CANVAS.BASE_SIZE;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        ctx.save();

        ctx.fillStyle = 'rgba(8, 8, 15, 0.84)';
        ctx.fillRect(0, 0, GAME_CONFIG.CANVAS.WIDTH, h);
        ctx.translate(this.offsetX, 0);

        ctx.textAlign = 'center';

        // OYUN BİTTİ
        ctx.font = '900 28px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ff0055';
        ctx.shadowColor = '#ff0055';
        ctx.shadowBlur = 15;
        ctx.fillText('OYUN BİTTİ', w / 2, h / 2 - 115);

        // MOD GÖSTERGESİ
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.fillText(`MOD: ${mode.label}`, w / 2, h / 2 - 82);

        // Yeni rekor banner'ı
        if (this.isNewRecord) {
            ctx.font = 'bold 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffe600';
            ctx.shadowColor = '#ffe600';
            ctx.shadowBlur = 12;
            ctx.fillText('★ YENİ REKOR! ★', w / 2, h / 2 - 48);
        }

        // SÜRE
        ctx.shadowBlur = 0;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#9090a8';
        ctx.fillText('HAYATTA KALMA SÜRESİ', w / 2 - 80, h / 2 - 12);
        ctx.fillText('GRAZE (TEĞET)', w / 2 + 80, h / 2 - 12);

        ctx.font = 'bold 24px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(UIManager.formatTime(finalTimeMs), w / 2 - 80, h / 2 + 18);

        ctx.fillStyle = '#ffe600';
        ctx.fillText(player ? player.grazeCount.toString() : '0', w / 2 + 80, h / 2 + 18);

        // EN İYİ REKOR
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#9090a8';
        ctx.fillText(`EN İYİ REKOR (${mode.label})`, w / 2, h / 2 + 58);

        ctx.font = 'bold 17px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText(UIManager.formatTime(this.getHighScore(mode.id)), w / 2, h / 2 + 82);

        // Hızlı Yeniden Başlatma & Menü Butonları
        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.textBaseline = 'middle';
        for (const btn of this.deadButtons) {
            ctx.save();
            if (btn.primary) {
                ctx.fillStyle = `rgba(0, 255, 255, ${0.12 + pulse * 0.08})`;
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 8 + pulse * 6;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1;
            }
            ctx.beginPath();
            ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.font = btn.primary ? 'bold 15px "JetBrains Mono", monospace' : '14px "JetBrains Mono", monospace';
            ctx.fillStyle = btn.primary ? '#ffffff' : '#a0a0b8';
            ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
            ctx.restore();
        }
        ctx.textBaseline = 'alphabetic';

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#7a7a92';
        const hint = this.isTouch
            ? 'Ekranın herhangi bir yerine dokun = Tekrar Oyna'
            : '[ Tıkla / Space / Enter ] Tekrar  ·  [ M / ESC ] Menü';
        ctx.fillText(hint, w / 2, h / 2 + 192);

        ctx.restore();
    }

    /**
     * Duraklatma Ekranı (uygulama arka plana alındığında otomatik açılır)
     */
    renderPaused(ctx) {
        const w = GAME_CONFIG.CANVAS.BASE_SIZE;
        const h = GAME_CONFIG.CANVAS.HEIGHT;

        ctx.save();
        ctx.fillStyle = 'rgba(8, 8, 15, 0.72)';
        ctx.fillRect(0, 0, GAME_CONFIG.CANVAS.WIDTH, h);
        ctx.translate(this.offsetX, 0);

        ctx.textAlign = 'center';
        ctx.font = '900 28px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.fillText('DURAKLATILDI', w / 2, h / 2 - 10);
        ctx.shadowBlur = 0;

        const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        ctx.font = '13px "JetBrains Mono", monospace';
        ctx.fillStyle = `rgba(0, 255, 255, ${0.6 + pulse * 0.4})`;
        ctx.fillText(this.isTouch ? 'Devam etmek için dokun' : '[ Tıkla / Space / P ] Devam  ·  [ ESC ] Menü', w / 2, h / 2 + 28);
        ctx.restore();
    }
}
