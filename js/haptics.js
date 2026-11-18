// ============================================================
// haptics.js — Mobil Titreşim Geri Bildirimi
// navigator.vibrate desteklenmiyorsa (ör. iOS Safari) sessizce yok sayılır.
// Capacitor'a geçildiğinde bu modül @capacitor/haptics ile değiştirilebilir.
// ============================================================

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const Haptics = {
    enabled: true,

    pulse(pattern) {
        if (!this.enabled || !canVibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            // Bazı tarayıcılar kullanıcı etkileşimi olmadan titreşimi engeller
        }
    },

    dash()        { this.pulse(12); },
    graze()       { this.pulse(4); },
    pickup()      { this.pulse(20); },
    shieldBreak() { this.pulse([30, 40, 30]); },
    death()       { this.pulse([60, 30, 90]); }
};
