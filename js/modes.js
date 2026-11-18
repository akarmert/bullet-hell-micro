// ============================================================
// modes.js — Oyun Modları Mimarisi (Strategy Pattern)
// Classic, Endless, Hardcore ve Chaos Modları
// ============================================================

import { MODES_CONFIG } from './config.js';
import { dateKey, hashSeed } from './rng.js';
import { t } from './i18n.js';

export class BaseMode {
    constructor(config) {
        this.id = config.ID;
        this.storageKey = config.STORAGE_KEY;
        this.legacyKey = config.LEGACY_KEY || null;
        this.config = config;
    }

    /**
     * Mermi hız çarpanı
     */
    getSpeedMultiplier(elapsedMs) {
        return this.config.SPEED_MULT || 1.0;
    }

    /**
     * Mermi spawn aralığı çarpanı (daha küçük = daha sık mermi)
     */
    getIntervalMultiplier(elapsedMs) {
        return this.config.INTERVAL_MULT || 1.0;
    }

    /**
     * Spiral dönüş hızı çarpanı
     */
    getSpiralRotMultiplier(elapsedMs) {
        return this.config.SPIRAL_ROT_MULT || 1.0;
    }

    /**
     * Tüm mermi sistemlerinin aynı anda çalışıp çalışmayacağı
     */
    isSimultaneous() {
        return !!this.config.SIMULTANEOUS;
    }

    get label() {
        return t(`mode.${this.id}.label`, null, this.config.LABEL);
    }

    get description() {
        return t(`mode.${this.id}.desc`, null, this.config.DESCRIPTION);
    }

    /** En iyi skorun saklandığı anahtar */
    get scoreKey() {
        return `${this.storageKey}_score`;
    }

    /** Sabit tohum (günlük mod); null = her tur rastgele */
    getSeed() {
        return null;
    }
}

export class ClassicMode extends BaseMode {
    constructor() {
        super(MODES_CONFIG.classic);
    }
}

export class EndlessMode extends BaseMode {
    constructor() {
        super(MODES_CONFIG.endless);
    }

    /**
     * 30 saniyeden sonra mermi hızı zamanla sürekli artar
     */
    getSpeedMultiplier(elapsedMs) {
        if (elapsedMs <= 30000) return 1.0;
        const extraSeconds = (elapsedMs - 30000) / 1000;
        // Her saniye %2.5 artış, max 2.2 kat
        return Math.min(2.2, 1.0 + extraSeconds * this.config.SCALING_RATE);
    }

    /**
     * 30 saniyeden sonra spawn aralıkları sürekli daralır
     */
    getIntervalMultiplier(elapsedMs) {
        if (elapsedMs <= 30000) return 1.0;
        const extraSeconds = (elapsedMs - 30000) / 1000;
        // Her saniye aralık %1.5 daralır, min 0.4 kat (aşırı yoğun ama kaçılabilir)
        return Math.max(0.40, 1.0 - extraSeconds * 0.015);
    }
}

export class HardcoreMode extends BaseMode {
    constructor() {
        super(MODES_CONFIG.hardcore);
    }
}

export class ChaosMode extends BaseMode {
    constructor() {
        super(MODES_CONFIG.chaos);
    }
}

/**
 * Günlük meydan okuma: tarihten türetilen tohumla herkes aynı mermi dizisini görür.
 * Rekorlar her gün için ayrı tutulur.
 */
export class DailyMode extends BaseMode {
    constructor() {
        super(MODES_CONFIG.daily);
    }

    set storageKey(value) {
        this.baseKey = value;
    }

    get storageKey() {
        return `${this.baseKey}_${dateKey()}`;
    }

    getSeed() {
        return hashSeed(`bullet-hell-micro:${dateKey()}`);
    }
}

export class ModeRegistry {
    static modes = {
        classic: new ClassicMode(),
        endless: new EndlessMode(),
        hardcore: new HardcoreMode(),
        chaos: new ChaosMode(),
        daily: new DailyMode()
    };

    static defaultModeId = 'classic';

    static get(id) {
        return this.modes[id] || this.modes[this.defaultModeId];
    }

    static getAll() {
        return Object.values(this.modes);
    }
}
