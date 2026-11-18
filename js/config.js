// ============================================================
// config.js — Merkezi Oyun Yapılandırması
// Tüm sabitler, mod ayarları, zorluk parametreleri ve renk paleti
// ============================================================

export const GAME_CONFIG = {
    CANVAS: {
        WIDTH: 600,
        HEIGHT: 600
    },

    PLAYER: {
        RADIUS: 5,
        HITBOX_RADIUS: 4,     // Adil oyun hissi için hafif küçük hitbox
        GRAZE_RADIUS: 16,     // Teğet geçme (Graze) algılama yarıçapı
        COLOR: '#FFFFFF',
        GLOW: 'rgba(255, 111, 174, 0.25)',
        START_X: 300,
        START_Y: 300,
        KEYBOARD_SPEED: 360,  // Klavye / Gamepad hareket hızı (px/s)
        DASH: {
            DURATION: 160,     // Dokunulmazlık ve atılma süresi (ms)
            COOLDOWN: 2400,    // Yeniden kullanım bekleme süresi (ms)
            SPEED_MULT: 2.4    // Dash anındaki hız çarpanı
        }
    },

    // --- GÜÇLENDİRMELER (PICK-UPS) ---
    PICKUPS: {
        SPAWN_INTERVAL: 9000,  // Ortalama beliriş periyodu (ms)
        LIFETIME: 6500,        // Sahada kalma süresi (ms)
        RADIUS: 11,
        TYPES: {
            SHIELD: { id: 'shield', color: '#8E5BE8', glow: 'rgba(142, 91, 232, 0.2)', label: 'KALKAN' },
            SLOWMO: { id: 'slowmo', color: '#B79BFF', glow: 'rgba(183, 155, 255, 0.25)', label: 'YAVAŞ', duration: 2800, factor: 0.55 },
            EMP:    { id: 'emp',    color: '#FF6FAE', glow: 'rgba(255, 111, 174, 0.2)', label: 'POP!' }
        }
    },

    // --- FAZLAR & TEMEL DALGA SİSTEMİ ---
    PHASE_1: {
        NAME: 'WARM UP',
        START_TIME: 0,
        END_TIME: 10000,
        BASE_INTERVAL: 380, // Spawn aralığı (ms)
        MIN_INTERVAL: 180,
        SPEED_MIN: 110,
        SPEED_MAX: 170,
        RADIUS: 4.5,
        COLOR: '#FF6FAE',           // Sakız topu
        GLOW: 'rgba(255, 111, 174, 0.25)',
        SHAPE: 'circle'
    },

    PHASE_2: {
        NAME: 'SPIRAL',
        START_TIME: 10000,
        END_TIME: 20000,
        BASE_INTERVAL: 160,
        MIN_INTERVAL: 90,
        SPEED: 150,
        RADIUS: 4,
        ARMS: 3,             // Spiral kol sayısı
        BASE_ROT_SPEED: 2.0, // rad/s
        COLOR: '#B79BFF',           // Lavanta donut
        GLOW: 'rgba(183, 155, 255, 0.25)',
        SHAPE: 'ring'
    },

    PHASE_3: {
        NAME: 'AIM',
        START_TIME: 20000,
        END_TIME: 30000,
        BASE_INTERVAL: 700,
        MIN_INTERVAL: 260,
        SPEED: 280,
        RADIUS: 4.5,
        COLOR: '#8E5BE8',           // Mor şeker kristali
        GLOW: 'rgba(142, 91, 232, 0.25)',
        TRAIL_LENGTH: 8,
        SHAPE: 'diamond',
        TELEGRAPH_TIME: 380 // Ateşleme öncesi uyarı lazeri süresi (ms)
    },

    PHASE_4: {
        NAME: 'CHAOS',
        START_TIME: 30000,
        END_TIME: Infinity,
        BASE_INTERVAL: 400,
        MIN_INTERVAL: 140,
        SPEED: 320,
        MAX_SPEED: 440,
        RADIUS: 3.5,
        COLOR: '#F0468F',           // Çizgili şeker çubuğu
        GLOW: 'rgba(240, 70, 143, 0.25)',
        MAX_BOUNCES: 2,
        TRAIL_LENGTH: 14,
        SHAPE: 'capsule',
        TELEGRAPH_TIME: 320
    },

    // --- BOSS: NEXUS (30s, AIM ile CHAOS arası) ---
    // Oyuncu ateş etmez: enerji zamanla söner, Graze ve Dash-Ram hızlandırır.
    BOSS: {
        NAME: 'BOSS',
        START_TIME: 30000,
        DURATION: 18000,      // Hiç hasar verilmezse boss'un sönme süresi (ms)
        MAX_HP: 100,
        GRAZE_DAMAGE: 1.5,    // Her teğet geçiş
        RAM_DAMAGE: 7,        // Dash ile gövdeden geçiş (dash başına 1 kez)
        RAM_REACH: 14,        // Ram için gövdeye ek tolerans (px)
        RADIUS: 24,
        HOVER_Y: 185,
        ENTRY_TIME: 1800,     // Giriş animasyonu (ateş yok)
        DEATH_TIME: 900,      // Ölüm animasyonu (ateş yok)
        STAGE_COOLDOWN: 700,  // Aşama geçişinde ateşkes
        BULLET_RADIUS: 4,
        COLOR: '#FF6FAE',           // Jöle boss
        GLOW: 'rgba(255, 111, 174, 0.25)',
        STAGES: [
            { NAME: 'BLOOM', INTERVAL: 900, COUNT: 14, SPEED: 125, ROTATE_STEP: 0.2 },
            { NAME: 'FANG', INTERVAL: 1150, FAN_COUNT: 5, FAN_SPREAD: 0.2, SPEED: 215, TELEGRAPH_TIME: 420,
              RING_INTERVAL: 1800, RING_COUNT: 10, RING_SPEED: 95 },
            { NAME: 'VORTEX', INTERVAL: 150, ARMS: 2, SPEED: 140, ROT_SPEED: 2.2 }
        ]
    },

    // --- EFEKTLER ---
    EFFECTS: {
        SHAKE_DURATION: 300,      // ms
        SHAKE_INTENSITY: 12,      // piksel
        PARTICLE_COUNT: 28,
        PARTICLE_SPEED_MIN: 80,
        PARTICLE_SPEED_MAX: 260,
        PARTICLE_LIFETIME: 550,   // ms
        COLOR: '#FF6FAE'
    },

    // --- DURAKLATMA ---
    PAUSE: {
        RESUME_COUNTDOWN: 1500 // Devam etmeden önceki geri sayım (ms)
    },

    // --- SES AYARLARI (Web Audio API) ---
    AUDIO: {
        MASTER_VOLUME: 0.25
    }
};

// ============================================================
// OYUN MODLARI YAPILANDIRMASI (MODES CONFIG)
// ============================================================
export const MODES_CONFIG = {
    classic: {
        ID: 'classic',
        LABEL: 'CLASSIC',
        STORAGE_KEY: 'bulletHellHighScore_classic',
        LEGACY_KEY: 'bullet_hell_micro_highscore', // Geriye dönük uyumluluk için
        SPEED_MULT: 1.0,
        INTERVAL_MULT: 1.0,
        DESCRIPTION: '30 saniyelik klasik kaçış deneyimi'
    },
    endless: {
        ID: 'endless',
        LABEL: 'ENDLESS',
        STORAGE_KEY: 'bulletHellHighScore_endless',
        SPEED_MULT: 1.0,
        INTERVAL_MULT: 1.0,
        SCALING_RATE: 0.025, // 30s sonrası her saniye hız %2.5 artar, aralık daralır
        DESCRIPTION: '30s sınırı yok, sonsuza kadar artan kaos'
    },
    hardcore: {
        ID: 'hardcore',
        LABEL: 'HARDCORE',
        STORAGE_KEY: 'bulletHellHighScore_hardcore',
        SPEED_MULT: 1.35,     // %35 daha hızlı mermiler
        INTERVAL_MULT: 0.70,  // %30 daha sık mermi üretimi
        SPIRAL_ROT_MULT: 1.35,// %35 daha hızlı dönen spiral
        DESCRIPTION: 'Yüksek hız, yoğun mermi yağmuru ve agresif nişan'
    },
    chaos: {
        ID: 'chaos',
        LABEL: 'CHAOS',
        STORAGE_KEY: 'bulletHellHighScore_chaos',
        SPEED_MULT: 1.15,
        INTERVAL_MULT: 0.85,
        SIMULTANEOUS: true,   // Tüm mermi sistemleri eşzamanlı aktif
        DESCRIPTION: 'Kenar, spiral, aim ve seken lazerler aynı anda aktif'
    },
    daily: {
        ID: 'daily',
        LABEL: 'GÜNLÜK',
        STORAGE_KEY: 'bulletHellHighScore_daily', // Sonuna tarih eklenir
        SPEED_MULT: 1.1,
        INTERVAL_MULT: 0.9,
        DESCRIPTION: 'bugün herkese aynı desen · arkadaşlarınla yarış'
    }
};
