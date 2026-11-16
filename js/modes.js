// ============================================================
// modes.js — Oyun Modları Mimarisi (Strategy Pattern)
// Classic, Endless, Hardcore ve Chaos Modları
// ============================================================

import { MODES_CONFIG } from './config.js';

export class BaseMode {
    constructor(config) {
        this.id = config.ID;
        this.label = config.LABEL;
        this.storageKey = config.STORAGE_KEY;
        this.legacyKey = config.LEGACY_KEY || null;
        this.description = config.DESCRIPTION;
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

export class ModeRegistry {
    static modes = {
        classic: new ClassicMode(),
        endless: new EndlessMode(),
        hardcore: new HardcoreMode(),
        chaos: new ChaosMode()
    };

    static defaultModeId = 'classic';

    static get(id) {
        return this.modes[id] || this.modes[this.defaultModeId];
    }

    static getAll() {
        return Object.values(this.modes);
    }
}
