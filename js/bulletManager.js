// ============================================================
// bulletManager.js — Mermi Koleksiyonu & Object Pool Yöneticisi
// Mermilerin yaşam döngüsü, sıfır GC çöpü ve toplu render
// ============================================================

import { Bullet } from './bullet.js';

export class BulletManager {
    constructor(initialPoolSize = 300) {
        this.bullets = [];
        this.pool = [];

        // Başlangıçta mermi havuzunu önbellekle
        for (let i = 0; i < initialPoolSize; i++) {
            this.pool.push(new Bullet());
        }
    }

    /**
     * Havuzdan bir mermi çeker ve aktif listeye ekler (Sıfır GC tahsisi)
     * @param {Object} params Mermi yapılandırması
     * @returns {Bullet}
     */
    spawn(params) {
        let bullet;
        if (this.pool.length > 0) {
            bullet = this.pool.pop();
            bullet.init(params);
        } else {
            bullet = new Bullet(params);
        }
        this.bullets.push(bullet);
        return bullet;
    }

    /**
     * Geriye dönük uyumluluk: Mevcut Bullet örneğini veya nesnesini kabul eder
     * @param {Bullet|Object} bulletOrParams 
     */
    add(bulletOrParams) {
        if (bulletOrParams instanceof Bullet) {
            this.bullets.push(bulletOrParams);
            return bulletOrParams;
        }
        return this.spawn(bulletOrParams);
    }

    /**
     * Tüm aktif mermileri günceller; pasifleşenleri havuza iade eder
     * @param {number} dt Saniye cinsinden delta time
     * @param {number} speedFactor Slow-mo çarpanı (varsayılan 1.0)
     */
    update(dt, speedFactor = 1.0) {
        let activeCount = 0;
        const len = this.bullets.length;

        for (let i = 0; i < len; i++) {
            const b = this.bullets[i];
            b.update(dt, speedFactor);
            if (b.active) {
                this.bullets[activeCount++] = b;
            } else {
                this.pool.push(b);
            }
        }
        this.bullets.length = activeCount;
    }

    /**
     * EMP patlaması gibi durumlarda ekrandaki tüm mermileri yok eder
     * ve patlama parçacığı oluşturabilmek için koordinatlarını döner
     * @returns {Array<{x: number, y: number, color: string}>}
     */
    destroyAll() {
        const destroyed = [];
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            destroyed.push({ x: b.x, y: b.y, color: b.color });
            b.active = false;
            this.pool.push(b);
        }
        this.bullets.length = 0;
        return destroyed;
    }

    /**
     * Aktif mermi listesini döner
     * @returns {Bullet[]}
     */
    getActiveBullets() {
        return this.bullets;
    }

    /**
     * Tur yeniden başlatıldığında anında tüm mermileri havuza iade eder
     */
    clear() {
        for (let i = 0; i < this.bullets.length; i++) {
            this.bullets[i].active = false;
            this.pool.push(this.bullets[i]);
        }
        this.bullets.length = 0;
    }

    /**
     * Aktif mermi sayısı
     */
    get count() {
        return this.bullets.length;
    }

    /**
     * Havuzdaki boşta mermi sayısı
     */
    get poolSize() {
        return this.pool.length;
    }
}
