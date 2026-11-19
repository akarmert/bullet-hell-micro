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
        SHIELD: {
            PER_PICKUP: 1,     // Her kalkan güçlendirmesi +1 hak (0 → 1 → 2 → 3)
            MAX: 3,            // Aynı anda en fazla 3 kalkan
            IFRAME_MS: 800     // Son kalkan kırılınca kısa dokunulmazlık (karakter yanıp söner)
        },
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

    // --- EKŞİ ŞEKERLER (oyuncunun ZARARINA) ---
    // Koyu mor, dikenli ambalajlı, somurtkan şekerler. Oyuncuya doğru yavaşça süzülür;
    // dokunursan bir süre ağırlaşırsın ya da şişip büyürsün. Kalkan bunları engellemez.
    DEBUFFS: {
        START_AFTER: 12000,    // İlk ekşi şeker (ms) — oyuncu oyunu tanısın
        SPAWN_INTERVAL: 10000, // Ortalama aralık (±1.5 sn)
        MAX_ON_FIELD: 1,
        LIFETIME: 7500,
        DRIFT: 28,             // Oyuncuya doğru süzülme hızı (px/s)
        MIN_PLAYER_DIST: 140,  // Oyuncunun dibinde doğmaz
        TYPES: {
            HEAVY: { id: 'heavy', color: '#5B3A86', label: 'AĞIR', duration: 4500, factor: 0.5, mouseSpeed: 230 },
            BIG:   { id: 'big',   color: '#7A3E78', label: 'DEV',  duration: 5000, scale: 1.7 }
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

    // --- BOSS 1: JÖLE KRAL (30s, AIM ile CHAOS arası) ---
    // Oyuncu ateş etmez: enerji zamanla söner, Graze ve Dash-Ram hızlandırır.
    BOSS: {
        NAME: 'BOSS',
        KIND: 'jelly',
        TITLE: 'Jöle Kral',
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
            { NAME: 'BLOOM', PATTERN: 'bloom', INTERVAL: 900, COUNT: 14, SPEED: 125, ROTATE_STEP: 0.2 },
            { NAME: 'FANG', PATTERN: 'fang', INTERVAL: 1150, FAN_COUNT: 5, FAN_SPREAD: 0.2, SPEED: 215, TELEGRAPH_TIME: 420,
              RING_INTERVAL: 1800, RING_COUNT: 10, RING_SPEED: 95 },
            { NAME: 'VORTEX', PATTERN: 'vortex', INTERVAL: 150, ARMS: 2, SPEED: 140, ROT_SPEED: 2.2 }
        ]
    },

    // --- BOSS 2: PAMUK BULUT (oyun saatinde 1:15) ---
    BOSS_CLOUD: {
        NAME: 'BOSS',
        KIND: 'cloud',
        TITLE: 'Pamuk Bulut',
        DURATION: 24000,      // Jöle Kral'dan uzun dayanır
        MAX_HP: 100,
        GRAZE_DAMAGE: 1.2,
        RAM_DAMAGE: 6,
        RAM_REACH: 16,
        RADIUS: 30,
        HOVER_Y: 175,
        ENTRY_TIME: 1800,
        DEATH_TIME: 900,
        STAGE_COOLDOWN: 600,
        BULLET_RADIUS: 4,
        COLOR: '#B79BFF',
        GLOW: 'rgba(183, 155, 255, 0.25)',
        STAGES: [
            { NAME: 'YAĞMUR', PATTERN: 'rain', INTERVAL: 70, SPEED: 195, GAP: 100 },
            { NAME: 'DUVAR', PATTERN: 'walls', INTERVAL: 1750, SPEED: 165, GAP: 100, SPACING: 15, TELEGRAPH_TIME: 550,
              DRIZZLE: { INTERVAL: 300, SPEED: 150, GAP: 100 } },   // Duvarlar arasında hafif yağmur
            { NAME: 'GİRDAP', PATTERN: 'pull', PULL: 80, INTERVAL: 440, COUNT: 14, SPEED: 130, ROT_SPEED: 1.5 }
        ]
    },

    // --- BOSS 3: SAKIZ BALON (Pamuk Bulut'tan sonra) ---
    // Mobilde okunaklı olsun diye yavaş, büyük ve önceden belli olan saldırılar.
    BOSS_GUM: {
        NAME: 'BOSS',
        KIND: 'gum',
        TITLE: 'Sakız Balon',
        DURATION: 22000,
        MAX_HP: 100,
        GRAZE_DAMAGE: 1.3,
        RAM_DAMAGE: 7,
        RAM_REACH: 16,
        RADIUS: 27,
        HOVER_Y: 170,
        ENTRY_TIME: 1800,
        DEATH_TIME: 900,
        STAGE_COOLDOWN: 700,
        BULLET_RADIUS: 4,
        COLOR: '#FF6FAE',
        GLOW: 'rgba(255, 111, 174, 0.25)',
        STAGES: [
            // Yavaş süzülen balonlar bir süre sonra küçük halkaya patlar (şişerek uyarır)
            { NAME: 'BALON', PATTERN: 'bubbles', INTERVAL: 1500, COUNT: 2, SPEED: 70, POP_MS: 1700, BUBBLE_RADIUS: 10,
              RING_COUNT: 8, RING_SPEED: 110 },
            // Duvarlardan seken sakız topları + seyrek halka
            { NAME: 'SEKME', PATTERN: 'bounce', INTERVAL: 1300, COUNT: 2, SPEED: 150, BOUNCES: 3, BALL_RADIUS: 6,
              RING_INTERVAL: 2400, RING_COUNT: 10, RING_SPEED: 90 },
            // Boss şişer ve patlar: oyuncunun olduğu yöne bakan GENİŞ bir boşluklu halka
            { NAME: 'PATLAMA', PATTERN: 'burst', INFLATE_MS: 1300, REST_MS: 900, COUNT: 26, SPEED: 135, GAP: 1.0 }
        ]
    },

    // Boss sırası: yenilen her boss'tan BOSS_INTERVAL sonra sıradaki gelir; tur döndükçe zorlaşır
    BOSS_ROTATION: ['BOSS', 'BOSS_CLOUD', 'BOSS_GUM'],
    BOSS_INTERVAL: 15000,     // ms: bir boss yenildikten sonra sıradakine kadar en az bu kadar mola
    BOSS_SCHEDULE: [30000, 75000], // Sabit geliş saatleri: 1. boss 0:30, 2. boss 1:15 (sonrakiler BOSS_INTERVAL ile)
    BOSS_LEVEL_SPEED: 0.12,   // Her yeni turda mermi hızı +%12
    BOSS_LEVEL_DENSITY: 0.1,  // Her yeni turda atış sıklığı +%10

    // İlk boss yenildikten sonra, ikinci boss gelene kadarki "nefes" molası
    BOSS_BREAK: {
        CALM_MS: 3000,        // Zaferden sonra hiç mermi gelmeyen süre
        INTERVAL_MULT: 2.0,   // Kaos atışları 2 kat seyrek
        SPEED_MULT: 0.75,     // %25 daha yavaş
        PROGRESS_CAP: 0.4,    // Kaos rampası en fazla %40'a çıkar
        BOUNCES: 1,           // Çubuklar 2 yerine 1 kez seker
        AIM_INTERVAL: 2600,   // Nişanlı atış 1 sn yerine 2.6 sn'de bir
        DROP: 'shield'        // Jöle Kral yenildiği yere kalkan düşürür
    },

    // --- PERFORMANS ---
    PERFORMANCE: {
        MAX_DPR: 2,            // Masaüstünde en fazla 2x çözünürlük
        MAX_DPR_TOUCH: 1.5,    // Telefonda 1.5x: çizilen piksel ~%44 azalır, görüntü yine keskin
        BG_SCALE: 0.5,         // Arka plan katmanı yarı çözünürlükte (yumuşak bulutlar fark edilmez)
        BG_REFRESH_FRAMES: 4,  // Arka plan katmanı 4 karede bir yenilenir (bulutlar çok yavaş süzülür)
        BAR_REFRESH_MS: 100,   // Alt şeritteki süre/puan DOM'a en fazla saniyede 10 kez yazılır
        GRAZE_SOUND_GAP: 0.045 // Graze sesleri arası en az süre (s): yoğun anlarda ses düğümü yağmuru olmasın
    },

    // --- MOBİL / KÜÇÜK EKRAN DENGESİ ---
    // Mermi sayısı zamana bağlı; dar (dikey telefon) arenada aynı sayı çok daha sıkışık olur.
    // Kaos ve boss atışları arena alanına göre seyrekleşir, dokunmatikte biraz yavaşlar.
    ARENA_DENSITY: {
        REFERENCE_AREA: 600 * 600, // Bu alan ve üstünde değişiklik yok
        MIN_SCALE: 0.55,           // En dar ekranda atışlar en fazla ~1.8 kat seyrekleşir
        TOUCH_SPEED: 0.9,          // Dokunmatikte mermiler %10 yavaş (kaos + boss)
        TOUCH_BOUNCES: 1           // Dokunmatikte kaos çubukları en fazla 1 kez seker
    },

    // --- ŞEKER TESTERELER ---
    // Yavaş, dalgalanarak ilerleyen, duvardan seken, dişleri dönen minik testereler.
    // Oyuncuya nişan almaz; kenardan arenanın ortasına doğru gelir.
    SAW: {
        RADIUS: 7,            // Çarpışma yarıçapı (diş uçları zararsız süs)
        SPEED: 115,
        WOBBLE: 60,           // Yan salınım hızı (px/s) → yaklaşık ±17 px dalga
        WOBBLE_FREQ: 3.5,
        SPIN: 9,              // Dönüş hızı (rad/s)
        BOUNCES: 2,
        COLOR: '#FF6FAE',
        ALT_COLOR: '#B79BFF',
        GLOW: 'rgba(255, 111, 174, 0.25)',
        AIM_EVERY: 3200,      // AIM fazında (20-30 sn) ilk kez görünür
        CHAOS_EVERY: 2600,    // Boss'lar arası normal kaos
        BREAK_EVERY: 4500,    // İlk boss sonrası kolay mola
        ALL_EVERY: 3000       // CHAOS modu
    },

    // --- ŞEKER (oyun içi para) ---
    // Her tur sonunda kazanılır; bazı kostümler şekerle alınır. Gerçek parayla ilgisi yoktur.
    CANDY: {
        POINTS_PER: 200,      // Her 200 puan = 1 şeker
        PER_BOSS: 15,         // Yenilen her boss için ek şeker
        CONFIRM_MS: 2500      // Satın almada ikinci dokunuş için süre
    },

    // --- SAHADA BELİREN ŞEKER PARALAR ---
    // Değer arttıkça daha nadir çıkar ve sahada daha kısa kalır.
    COINS: {
        START_AFTER: 3000,    // İlk para (ms)
        SPAWN_EVERY: 3500,    // Ortalama aralık (±%40)
        MAX_ON_FIELD: 3,
        MARGIN: 40,           // Kenarlardan uzaklık
        TOP: 130,             // HUD'un altında kalsın
        MIN_PLAYER_DIST: 70,  // Oyuncunun dibinde doğmasın
        PICK_REACH: 4,        // Toplama toleransı
        TIERS: [
            { VALUE: 1,   WEIGHT: 50, LIFE: 9000, RADIUS: 9,  COLOR: '#FFC4DE', TEXT: '#4B2A6E' },
            { VALUE: 5,   WEIGHT: 28, LIFE: 6500, RADIUS: 10, COLOR: '#CDB8FF', TEXT: '#4B2A6E' },
            { VALUE: 10,  WEIGHT: 14, LIFE: 4500, RADIUS: 11, COLOR: '#FF6FAE', TEXT: '#4B2A6E' },
            { VALUE: 50,  WEIGHT: 6,  LIFE: 2600, RADIUS: 12, COLOR: '#6A3FC8', TEXT: '#FFFFFF' },
            { VALUE: 100, WEIGHT: 2,  LIFE: 1600, RADIUS: 13, COLOR: '#FFD86B', TEXT: '#4B2A6E', SPARKLE: true }
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
        DEATH_REVEAL: 650,        // ms: ölüm patlaması görünsün, sonra "oyun bitti" ekranı gelsin
        DEATH_FADE: 300,          // ms: ölüm ekranının belirme süresi
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
        DESCRIPTION: 'fazlar, bosslar ve kaos · ne kadar dayanabilirsin?'
    },
    endless: {
        ID: 'endless',
        LABEL: 'ENDLESS',
        STORAGE_KEY: 'bulletHellHighScore_endless',
        SPEED_MULT: 1.0,
        INTERVAL_MULT: 1.0,
        SCALING_RATE: 0.025, // 30s sonrası her saniye hız %2.5 artar, aralık daralır
        DESCRIPTION: 'mermiler durmadan hızlanır ve sıklaşır · sınır yok'
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
