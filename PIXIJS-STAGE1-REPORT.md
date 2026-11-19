# Bullet Hell Micro — PixiJS v8 Aşama 1 Teknik Raporu

**Dal:** `pixijs-v8-stage1` (başlangıç commit'i `4b21d7f`, `main` dalına dokunulmadı)
**Tarih:** 2026-11-20
**Kapsam:** Tam PixiJS v8 çizim geçişi + temel optimizasyonlar. **Aşama 2 başlatılmadı.**

---

## 1. Projenin başlangıç durumu
- Vanilla JS (ES modülleri), tek `<canvas>`, **Canvas 2D** çizim, bağımlılıksız Node sunucusu (`server.js`), Google Fonts'tan Fredoka, Capacitor 7 ile Android.
- `main` dalı `db4e0d8` + commit edilmemiş değişiklikler (ekşi şekerler, Sakız Balon, mobil denge, geliştirici modu, performans düzeltmeleri, teknik doküman). Git'e eklenmemiş: `android/`, `capacitor.config.json`, `scripts/`, `package-lock.json`, `.gitignore`, `js/devMode.js`.
- Başlangıç testleri: **60/60 geçti**. `npm run build:web` başarılı. Android debug APK başarılı (4.231.468 bayt).
- Başlangıç çizim yükü (masaüstü, yoğun sahne, ~77 mermi): kare başına **700 (açık) / 842 (koyu) Canvas 2D boyama komutu**, 497–562 yay çizimi. Ayrıntılar: `docs/pixijs-stage1/baseline/metrics.json`.

## 2. Yedekleme sonucu
| Öğe | Sonuç |
|---|---|
| ZIP | `C:\_projectsmert\backups\Bullet-Hell-Micro-Pre-PixiJS-Backup.zip`: 154 dosya, 5.510.459 bayt (sıkıştırılmış 4.371.016) |
| SHA-256 | `888f89678c05ed1991fa7ee0aa0f775d59dc04d77f38e786ffc5b5bbf5fb5020` |
| Bütünlük | `zipfile.testzip()` temiz; kaynakla karşılaştırmada eksik dosya yok; 13 kritik dosya tek tek doğrulandı |
| Git geçmişi | `Bullet-Hell-Micro-Pre-PixiJS.gitbundle` (`--all`), `git bundle verify` → OK, SHA-256 `db1fe6ff…cfad9` |
| Hariç tutulanlar (yeniden üretilebilir) | `node_modules/` (npm ci), `www/` (build), `android/.gradle`, `android/build`, `android/app/build`, `…/capacitor-cordova-android-plugins/build` |
| Hassas dosya | `android/local.properties` (makineye özel SDK yolu; sır değil). Yedekte var, **teslim paketinde yok** |
| Kayıt | `Bullet-Hell-Micro-Pre-PixiJS-Backup.MANIFEST.txt`, `git-status-before.txt` |

## 3. İncelenen mimari
- 29 JS modülünün tamamı tarandı. Çizim yapan modüller satır satır okundu: `game`, `ui`, `boss`, `bullet`, `effects`, `menuBackdrop`, `pickup`, `coins`, `player`, `skins`, `theme`, `waveManager`. Mantık modülleri, çizimle bağları ve kullandıkları API'ler açısından kontrol edildi.
- Çizim komutu dağılımı: `ui.js` ~370 + 51 metin, `boss.js` ~200, `skins.js` ~140, `bullet.js` ~120, `menuBackdrop.js` ~120, `pickup.js` ~95.
- Girdi (fare/klavye/gamepad/dokunmatik), kayıt (localStorage), ses (Web Audio), dil (i18n) ve tema sistemlerinin çizimden bağımsız olduğu doğrulandı.

## 4. Tespit edilen sorunlar
1. **Canvas 2D çizim modeli:** her nesne her karede ayrı yol komutlarıyla çiziliyordu. 1000 mermide yalnızca CPU tarafı ~21,6 ms (60 FPS bütçesi 16,7 ms).
2. **Uzak yazı tipi** (Google Fonts): çevrimdışı çalışmayı bozuyor, üçüncü tarafa istek gönderiyordu.
3. **CSP yoktu**; `server.js` proje klasöründeki her dosyayı sunuyordu (`.git/` dahil).
4. Geliştirici modu yayın paketinde yer alıyordu.
5. Capacitor sürümleri sabit değildi (`^7.6.10`).
6. Simülasyon değişken `dt` ile ilerliyordu: oynanış ekran yenileme hızına hafifçe bağlıydı.
7. Geçiş sırasında bulunup düzeltilenler:
   - PixiJS `autoDensity`, CSS genişliğini eziyordu (yeniden boyutlanmada tuval takılı kalıyordu).
   - Tema değişince yok edilmiş bir doku `ParticleContainer`'da çiziliyordu (WebGL hatası).
   - Tuval metni Fredoka'nın indirilmesini tetiklemiyordu (yayın sürümünde yedek yazı tipi görünüyordu).
   - Geliştirici modu, Vite'ın sabite çeviremediği bir ifade yüzünden pakete giriyordu.

## 5. Yapılan mimari değişiklikler
- **Katmanlar:** Oyun mantığı (`js/*.js`) ↔ çizim katmanı (`js/render/*`) ↔ platform (DOM kontrol şeridi, girdi, ses, depolama). Oyun mantığı PixiJS'i import etmez; bu bir testle korunuyor.
- **`PixiRenderer`:** tek ekran çizicisi. `Application` WebGL tercihli, elle çizim (`autoStart: false`), paylaşımlı ticker yok, `autoDensity: false`. Mantıksal arena (yükseklik 600) kök konteyner ölçeğiyle ekrana oturuyor.
- **Doku stratejisi:** mevcut Canvas 2D çizim fonksiyonları yalnızca **doku üreticisi** olarak kaldı:
  - *Pişmiş dokular*: mermiler, konfeti, şekerler, puan yazıları, ortak şekiller.
  - *Canlı dokular*: oyuncu, boss, şekerler, paralar, HUD bölgeleri, ekranlar. Yalnızca görünüş değişince yükleniyor; animasyonlu olanlar ≤30 Hz.
  - Eski canlı Canvas 2D çizim yolu tamamen kaldırıldı: `game.render` gövdesi, arka plan katmanı, `effects.pre/postRender`, `renderGrid`, `renderTelegraphs`, `renderBoss`, `bullet.render`, `menuBackdrop.render` vb.
- **Döngü:** `js/loop.js`, 1/120 sn sabit adım, kare başına en fazla 8 adım.
- **Derleme:** Vite 8.3.5 (`npm run dev` / `build:web` → `www/` / `preview`). `server.js` ve `scripts/build-web.mjs` kaldırıldı.
- **Dosyalar:** yeni `js/render/{pixiRenderer,textures,shapes,worldView,fxView,uiView,backdropView}.js`, `js/loop.js`, `vite.config.js`, `tests/stage1.test.mjs`. Değişen 19 dosya: +1565 / −815 satır.

## 6. PixiJS'e taşınan sistemler
| Sistem | PixiJS yöntemi |
|---|---|
| Zemin, gece gökyüzü, pastel bulutlar | Sprite + pişmiş geçiş dokusu + `ParticleContainer` (tek ışık dokusu, GPU'da renk) |
| Yıldızlar, yaylı benekler | `ParticleContainer` (nokta dokusu) |
| Uyarı lazerleri | `Graphics` (şerit, halka) + `ParticleContainer` (yürüyen noktalar) |
| Mermiler (7 şekil) | Pişmiş doku başına sprite havuzu; testere gövdesi dönen sprite + dik yüz sprite'ı; balon ölçeklenir |
| Mermi izleri, koyu tema haleleri | `ParticleContainer` (tek doku, renkli) |
| Şekerler, ekşi şekerler, paralar, boss (3 tür), hayalet, oyuncu (+kostümler, kalkan) | `LiveCanvasSprite` (≤30 Hz, konum değişince sadece kayar) |
| Puan baloncukları, seri hapı | Pişmiş metin sprite havuzu / canlı doku |
| Konfeti, şok dalgası, flaş, afiş | Sprite havuzu, `Graphics`, renkli sprite, canlı doku |
| Ekran sarsıntısı | Oyun alanı + efekt konteyneri kaydırılır (arka plan ve arayüz sabit) |
| Menü arka planı, kart içi arka plan | `BackdropView`: sprite (şekerler) + `ParticleContainer` (yıldız, ateşböceği, iz, patlama) + `Graphics` (takımyıldızı, halka); kart gövdesine maskeli |
| HUD (4 bölge), ipucu, boss barı | Bölge başına canlı doku, içerik değişince yüklenir |
| Menü, ayarlar, bilgi paneli, duraklatma, sonuç kartı | Tam ekran canlı doku; sonuç kartı taban + maskeli arka plan + içerik |
| Arena çerçevesi, kenar uyarısı | `Graphics` + çerçeve içine / çerçeve çizgisine maskeli ışık sprite'ları |

Dokunmatik kontrol şeridi (joystick, DASH, süre, duraklat) **HTML/CSS olarak kaldı**: dokunma hedefleri ve erişilebilirlik için bilinçli bir tercih (istemde izin verilen istisna).

## 7. Uygulanan temel optimizasyonlar
- **Sprite pooling:** mermi, testere yüzü, konfeti, puan baloncuğu, menü şekerleri. Kare başına Sprite/Particle nesnesi üretilmez.
- **Ortak dokular / atlas yerine paylaşılan beyaz şekiller:** nokta, ışık, hale, şerit, yıldız, iz. Yüzlerce nesne tek dokuyla. Mermi dokuları renk/şekil/boyut başına bir kez pişer.
- **Batch rendering:** yoğun sahnede kare başına **5–7 WebGL çizim çağrısı** (menü 4, sonuç kartı ~15).
- **ParticleContainer:** iz, hale, benek, yıldız, bulut, lazer noktası, menü yıldızları ve ateşböcekleri. Konfeti normal sprite'larla (çoklu renk/kontur için); sayılar yönetilebilir düzeyde olduğu için yeterli.
- **Render caching:** pişmiş doku önbelleği (≤600, aşarsa sıfırlanır); canlı dokular yalnızca anahtar değişince yeniden çizilir; eski dokular bir sonraki çizimden sonra silinir.
- **Culling:** arenanın 40 birimden fazla dışındaki mermi, iz ve haleler çizilmez; mantık güncellenmeye devam eder.
- **Sabit adımlı döngü:** 30/60/90/120 Hz'de aynı simülasyon (test edildi).
- **UI:** HUD 4 bağımsız bölgeye ayrıldı; her bölge kendi içeriği değişince yüklenir.
- **Bellek:** doku silme ertelendi (sahnedeki nesne asla yok edilmiş GPU kaynağına bakmaz); WebGL bağlam kaybı/kurtarma dinleniyor (kurtarmada dokular yeniden pişer).
- **Responsive:** DPR tavanı (masaüstü 2, dokunmatik 1,5), CSS boyutu sayfada, `ResizeObserver` + `resize` + `orientationchange`.

## 8. Korunan oyun özellikleri
- Beş mod, üç boss ve tüm desenleri, graze/dash hasarı, kalkan/dokunulmazlık, ekşi şekerler, skor/çarpan, şeker ekonomisi, kostümler, günlük RNG, hayalet, TR/EN, ses, mobil denge, geliştirici modu (yalnızca geliştirmede).
- **Oyun dengesine dokunulmadı.** Tüm mantık testleri değişmeden geçiyor; ayrıca aynı tohumla 30 Hz ve 120 Hz'de birebir aynı mermi durumu test ediliyor.
- **Kayıtlar korundu:** localStorage anahtarları değişmedi, veri taşıma yok.
- Girdiler PixiJS sürümünde doğrulandı (sentetik olaylarla): menü butonları, mod seçimi, OYNA, ayarlar + ESC, fare 1:1 takip, P ile duraklatma, joystick, DASH, sonuç kartı butonları.
- **Bilinçli küçük görsel farklar:**
  - Mermi izleri, haleler ve gövdeler mermi başına iç içe değil, katman katman çiziliyor; görünüşte fark yok.
  - Kenar uyarısının ışık eğrisi, 4 duraklı degrade yerine doğrusal ışık dokusuyla yaklaşık olarak çiziliyor.
  - Oyuncu, boss, şeker ve para animasyonları en fazla saniyede 30 kez yenileniyor; konumları her karede.

## 9. Güvenlik düzenlemeleri
- **Yerel yazı tipi** (`@fontsource/fredoka 5.3.0`, OFL-1.1, latin + latin-ext ile Türkçe karakterler). Uzak istek yok, oyun çevrimdışı çalışıyor.
- **Sıkı CSP** (yalnızca yayın derlemesine eklenir): `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`… PixiJS `pixi.js/unsafe-eval` ile `eval` kullanmadan çalışıyor. **Derlenmiş sürümde CSP ihlali ve konsol hatası yok.**
- **Geliştirici modu yayın paketinden çıkarıldı:** `www/` içinde ilgili kod parçası ve referans sayısı 0. `?dev` yayında etkisiz.
- **Tam sürüme sabitlenmiş bağımlılıklar** (Capacitor dahil). `npm audit`: 0 açık.
- **`server.js` kaldırıldı**; Vite geliştirme sunucusu yalnızca `localhost`'ta.
- Kullanıcı verisi dışarı gönderilmiyor (ağ isteği yok; paylaşım yalnızca Web Share/pano).
- **Android incelemesi:** `INTERNET` izni ve `allowBackup="true"` (Capacitor varsayılanları) duruyor. Oyun ağ kullanmıyor; `INTERNET` izninin kaldırılması yayın öncesi bir cihazda test edilerek değerlendirilmeli. Değiştirilmedi.

## 10. Test sonuçları
- `npm test`: **65/65 geçti** (60 mevcut + 5 yeni `stage1.test.mjs`):
  - 30/60/90/120 Hz'de aynı simülasyon süresi.
  - Takılma sınırı.
  - Aynı tohumla 30 Hz ve 120 Hz'de birebir aynı mermi durumu.
  - Mantık modüllerinin çiziciye bağımsızlığı.
  - Yayın güvenliği: eski sunucu yok, CSP yalnızca derlemede, uzak yazı tipi yok, sürümler sabit.
- **Tarayıcı doğrulaması** (geliştirme sunucusu, kayıtlara yazmayan test ortamı):
  - Menü, yoğun sahne, üç boss, duraklatma ve sonuç kartı açık ve koyu temada.
  - Dikey ve yatay telefon emülasyonu.
  - Tema, kontrast ve doku yenileme geçişlerinde 0 hata.
  - Geliştirici modu (geliştirmede) çalışıyor.
- Test edilemeyenler: gerçek telefon, gerçek dokunma (sentetik olaylarla doğrulandı), APK'nın cihazda açılması.

## 11. Build sonuçları
| Adım | Sonuç |
|---|---|
| `npm install` (sabit sürümler) | ✓, 0 açık |
| `npm run dev` (Vite) | ✓ `localhost:3000` |
| `npm run build:web` | ✓ ~0,3 sn, `www/` 997 KB (32 dosya; ana JS 464 KB / gzip 139 KB) |
| `npm run preview` + CSP kontrolü | ✓ WebGL, Fredoka yüklü, ihlal yok, `?dev` etkisiz |
| `npx cap sync android` | ✓ |
| `gradlew assembleDebug` | ✓ `app-debug.apk` 4.555.074 bayt, SHA-256 `068a31a6…52e1`; son web derlemesini ve CSP'yi içeriyor |
| APK cihazda açılış testi | ✗ yapılamadı: bağlı cihaz yok, Android emülatörü kurulu değil |

## 12. Performans ölçümleri
> **Önemli:** Tarayıcı paneli gizliydi, bu yüzden `requestAnimationFrame` tabanlı gerçek **FPS ölçülemedi**. Aşağıdakiler sentetik kare süreleridir (2 × 1/120 sn simülasyon + çizim + `gl.finish()`), masaüstü GPU üzerinde. "Mobil" = Chrome cihaz emülasyonu (375×812, DPR 1,5 tavanlı), **gerçek telefon değil**. Ayrıntılar: `docs/pixijs-stage1/after/metrics.json`.

| Ölçüm | PixiJS (yeni) | Canvas 2D (eski) |
|---|---|---|
| Çizim çağrısı / kare (yoğun sahne) | **5 (açık) / 7 (koyu)** WebGL çağrısı | 700 / 842 Canvas 2D boyama komutu |
| Kaos sahnesi, masaüstü 900×600, `gl.finish` dahil | ort. 2,0–4,2 ms, p95 6–12 ms, p99 12–15 ms | (GPU süresi ölçülemez) |
| Kaos sahnesi, mobil emülasyon | ort. ~1,2 ms, p95 3,4–4,1 ms, p99 6,5–7,9 ms | — |
| **400 mermi**, mobil emülasyon | ort. 2,8 (açık) / 5,0 (koyu) ms, GPU dahil | ort. 4,2 / 5,4 ms, **yalnızca CPU, rasterleştirme hariç** |
| **1000 mermi**, mobil emülasyon (koyu) | **ort. 6,35 ms, p95 14,3 ms**, GPU dahil | **ort. 21,6 ms, p95 30,5 ms**, yalnızca CPU |
| Yalnızca CPU çizim süresi, 900×600 yoğun sahne | 1,9–2,5 ms | 0,9 ms (rasterleştirme hariç) |

- Mermi sayısı arttıkça PixiJS süresi yavaş büyüyor (400 → 1000 mermide 5 → 6,35 ms). Canvas 2D ise yalnızca CPU tarafında 1000 mermide 60 FPS bütçesini aşıyor.
- **Dürüst not:** az mermili sahnelerde PixiJS'in CPU süresi Canvas 2D'den yüksek (~2 ms'ye karşı ~0,9 ms). Sebepler: sahne senkronu ve canlı doku yüklemeleri (özellikle masaüstünde her kare değişen süre/skor bölgeleri). Canvas 2D'nin rasterleştirme maliyeti bu karşılaştırmaya dahil değil.
- p99'da ara ara 12–35 ms sıçramalar görüldü. Muhtemel kaynaklar: doku yüklemeleri, tema değişiminden hemen sonra yeniden pişirme, çöp toplayıcı. Ölçülerek doğrulanmalı (Aşama 2).
- **60/90/120 FPS başarısı iddia edilmiyor**; gerçek cihazda ölçülmedi.

## 13. Başlangıç ve yeni sürüm karşılaştırması
| | Başlangıç | Aşama 1 |
|---|---|---|
| Çizim | Canvas 2D, her nesne her kare | PixiJS v8 WebGL, toplu çizim |
| Mantık / çizim ayrımı | Aynı sınıflarda | Mantık PixiJS'siz, çizim `js/render/` |
| Döngü | Değişken dt | Sabit 1/120 sn adım |
| Derleme | Yok (statik dosya + `server.js`) | Vite, `www/` |
| Yazı tipi | Google Fonts | Pakette (çevrimdışı) |
| CSP | Yok | Yayında sıkı CSP |
| Geliştirici modu | Yayında mevcut | Yayından çıkarıldı |
| Testler | 60 | 65 |
| Görsel | — | Referansla eşdeğer (`docs/pixijs-stage1/baseline/` ↔ `after/`) |

## 14. Açık kalan sorunlar
1. Gerçek cihaz FPS ölçümü ve APK açılış testi yapılmadı (cihaz/emülatör yok).
2. Masaüstünde HUD'un süre ve skor bölgeleri her karede yeniden yükleniyor.
3. Menü ve sonuç kartı animasyonu tam ekran dokuyu ≤30 Hz yeniliyor (yalnızca bu ekranlarda).
4. p99 kare süresi sıçramaları (kaynağı doğrulanmadı).
5. Görsel regresyon otomatik değil (ekran görüntüleriyle elle karşılaştırıldı).
6. `ux-preview/new.html`, `compare.html`: Aşama 1 UX önerilerinden kalan tarihsel prototipler. Açılıyorlar, ama ayrıca bakımı yapılmıyor.
7. Android `INTERNET` izni ve `allowBackup` gözden geçirilmeli.
8. Fredoka paketi `hebrew` alt kümesini de içeriyor (yalnızca gerekirse indirilir; paket boyutunu ~50 KB artırır).

## 15. Aşama 2 için önerilen optimizasyonlar (onay bekliyor)
Ölçümlerden çıkan, öncelik sırasıyla:
1. **Gerçek cihaz profili** (orta seviye Android, Capacitor WebView): FPS, p95/p99, uzun kareler, ısınma; 5 dakikalık uzun koşu.
2. **Canlı doku yüklemelerini azaltmak:**
   - Süre ve skor için PixiJS `BitmapText` (tek atlas, yeniden yükleme yok).
   - Menü ve kartın hareketli parçalarını (başlık, OYNA butonu, marşmelov) ayrı sprite yapıp konumla oynatmak.
3. **Oyuncu, boss ve şeker animasyonlarını** önceden üretilmiş karelere (atlas) taşımak; 30 Hz yüklemeleri kaldırmak.
4. **Tek doku atlası** (mermiler + konfeti + şekiller) ve tüm mermileri tek `ParticleContainer`'da çizmek.
5. **p99 sıçramalarının kaynağı:** çöp toplayıcı ve doku yükleme izleme (Chrome performans kaydı); tema geçişinde ön pişirme.
6. **Uyarlanır kalite:** FPS düşerse DPR 1,5 → 1,25, hale/iz/parçacık yoğunluğunu azaltmak; cihaz sınıfına göre profiller.
7. **90/120 Hz:** gerekirse çizim interpolasyonu (şu an sabit adım, interpolasyonsuz).
8. **Otomatik görsel regresyon** (senaryo betiği + piksel karşılaştırması).

---

## Kontrol ve kabul listesi
- [x] Başlangıç ZIP yedeği oluşturuldu ve doğrulandı (+ git bundle, SHA-256).
- [x] Bütün proje incelendi (çizim modülleri satır satır; mantık modülleri çizim bağları açısından).
- [x] PixiJS v8 entegrasyonu tamamlandı (8.22.0, WebGL).
- [x] Oyun dünyası PixiJS'e taşındı.
- [x] Menü ve HUD PixiJS'e taşındı: ekranda PixiJS çiziyor, içerik mevcut Canvas 2D kodundan doku olarak üretiliyor; dokunmatik şerit HTML/CSS.
- [x] Oyuncu ve boss çizimleri taşındı (canlı doku, ≤30 Hz).
- [x] Efektler ve arka planlar taşındı.
- [x] Sprite pooling uygulandı.
- [x] Doku yönetimi optimize edildi (paylaşılan şekiller, önbellek, sınır, ertelenmiş silme). Tek atlas Aşama 2'de.
- [x] Batch rendering düzenlendi (5–7 çağrı/kare).
- [x] Render ve mantık ayrıldı (testle korunuyor).
- [x] Mevcut oynanış korundu (testler + 30/120 Hz eşdeğerliği; denge değişmedi).
- [x] Mevcut kayıtlar korundu (anahtarlar aynı).
- [x] Masaüstü kontrolleri doğrulandı (sentetik fare/klavye olaylarıyla).
- [ ] Mobil kontroller doğrulandı: **kısmen.** Emülasyonda joystick ve DASH sentetik dokunuşla çalışıyor; gerçek cihazda denenmedi.
- [x] Otomatik testler çalıştırıldı (65/65).
- [x] Web build doğrulandı (CSP'li önizleme dahil).
- [x] Android build kontrol edildi: APK derlendi. **Cihazda açılış testi yapılamadı.**
- [x] Görsel regresyon kontrolleri yapıldı: **elle**, 10 senaryo ekran görüntüsüyle; otomatik piksel karşılaştırması yok.
- [x] Dokümantasyon güncellendi (`docs/teknik-dokuman.md`, bu rapor, `docs/pixijs-stage1/`).
- [x] Yeni ZIP paketi doğrulandı (`Bullet-Hell-Micro-PixiJS-v8-Stage1.zip`, bkz. teslim notu).
- [x] Aşama 2 ihtiyaçları belirlendi (§15).
