# Bullet Hell Micro — PixiJS v8 Aşama 2 Raporu (Ölçüme Dayalı Optimizasyon)

Dal: `pixijs-v8-stage1` (Aşama 1'in üzerine, henüz commit edilmedi). `main` dokunulmadı.

## 1. Nasıl ölçüldü

- Araç: `ux-preview/perf-harness.js` (yalnızca geliştirmede). Her ölçülen kare = 2 simülasyon adımı (1/120 s) + çizim + `gl.finish()`, yani GPU tamamlanması dahil bir 60 Hz karesi. Animasyonlar **simüle edilmiş 60 Hz saatle** çalışır, böylece zamana bağlı doku yenilemeleri gerçek zamandaki gibi sayılır.
- Sayılanlar: kare süresi (ort / p95 / p99 / maks), kare başına WebGL çizim çağrısı (`drawElements` + `drawArrays`), **GPU'ya doku yükleme** sayısı ve bayt/s (adı konmuş her canlı doku için).
- Ortam: masaüstü Chrome (Claude uygulamasının tarayıcı paneli, panel gizliyken), 900×600 masaüstü görünümü ve 375×812 telefon emülasyonu (DPR 1,5 tavanı → 563×1218 tampon).
- **Gerçek telefon ölçümü yapılmadı** (cihaz/emülatör yok). Telefon satırları emülasyondur; gerçek cihazda GPU, sürücü ve ısınma davranışı farklıdır.
- **60/90/120 FPS gerçek ekranda doğrulanmadı.** Panel gizliyken `requestAnimationFrame` çalışmadığı için gerçek kare hızı ölçülemedi; aşağıdaki süreler "bir kare ne kadar iş" ölçüsüdür, FPS değildir.
- Süre ölçümleri gürültülüdür (aynı sahne art arda koşulduğunda ±%30–50 oynayabiliyor). Bu yüzden asıl karşılaştırma, deterministik olan **doku yükleme** ve **çizim çağrısı** sayılarıyla yapıldı.

## 2. Aşama 2 başındaki tespit (önce)

Aşama 1 sonrası en büyük sürekli maliyet, Canvas 2D ile çizilip **her karede GPU'ya yeniden yüklenen dokular**dı (masaüstü 900×600, açık tema):

| Sahne | Yükleme | Ana kaynak |
|---|---|---|
| Ana menü | 30/s, ~66 MB/s | tam ekran menü dokusu (başlık/oyna/kostüm sallanması için) |
| Sonuç kartı | 30/s, ~66 MB/s | tam ekran kart içeriği (dönen yıldızlar için) |
| Duraklat | 15/s, ~33 MB/s | tam ekran (“devam” yazısının nabzı için) |
| Oyun (kaos) | ~280/s, ~25 MB/s | HUD sağ 60/s 12 MB/s, HUD orta (süre) 60/s 7,2 MB/s, şekerler 50/s, paralar ~54/s, oyuncu 30/s, seri hapı 28/s |
| Boss | ~45–55/s, ~10–13 MB/s | boss 25–31/s 9–11 MB/s, boss barı 15–23/s 1–2 MB/s |
| 1000 mermi stres | 70 çizim çağrısı/kare | mermi dokuları karışık sırada → toplu çizim bölünüyor |

Telefon emülasyonunda bayt değerleri yaklaşık 2,5 kat daha yüksekti (daha yüksek doku çözünürlüğü).

## 3. Yapılanlar

### 3.1 Her karede doku yüklemeyi kaldırma (en büyük kazanç)
Hareket eden ama şekli değişmeyen parçalar bir kez pişirilip **dönüşümle** (konum, dönüş, ölçek, saydamlık) oynatılıyor:

| Öğe | Yeni yöntem |
|---|---|
| Süre (HUD) ve skor | `js/render/glyphText.js`: her karakter bir kez pişirilir (hale ve dolgu ayrı katmanlarda, komşu harfi örtmez); metin her karede sprite dizilimiyle kurulur. Skor hapı arka planı genişliğe göre önbellekte. |
| Ana menü | Statik menü yalnızca durum değişince yeniden çizilir (mod, odak, kostüm, şeker, ayarlar, dil, tema…). Başlık, OYNA ve kostüm önizlemesi ayrı sprite; sallanma/nefes/göz kırpma dönüşümle. Mağaza animasyonu (sallanma/onay) sırasında 30 Hz'e döner. |
| Duraklat | Kart statik; “devam” satırı ayrı sprite, nabız `alpha` ile. Geri sayım rakamı (1,5 s) eskisi gibi. |
| Sonuç kartı | Dönen yıldızlar sprite; kart içeriği statik. Yalnızca “yeni rekor” rozeti zıplarken 30 Hz. |
| Boss barı | Etiket+ray, dolgu (PixiJS Graphics, maske ile yuvarlatılmış) ve üst çizgi ayrı; dolgu değişince doku yüklenmez. |
| Şekerler | Gölge, kanatlar (sallanma = dönüş), gövde+ikon+etiket, ekşi şeker halkası (Graphics) ayrı parçalar. |
| Paralar | Gölge, kalan süre yayı (Graphics), gövde+değer (ölçekle büyüme), ışıltılar ayrı. |
| Oyuncu | Gece ışığı, dash izleri, kalkan köpüğü/dönen yay/noktalar, gövde (kostüm × göz kırpma × dash için pişmiş; nefes ve büyüme ölçekle), dokunulmazlık yanıp sönmesi `alpha` ile. |
| Seri hapı | Hap yalnızca etiket değişince; kalan süre çubuğu ayrı sprite. |
| Boss | Şekil her karede dalgalandığı için canlı doku kaldı; sınırlar türe göre sıkılaştırıldı (piksel olarak ölçüldü). |

### 3.2 Mermi doku atlası
`TextureAtlas` (1024², raf paketleme, 2 px boşluk): tüm mermi gövdeleri ve testere yüzleri tek GPU dokusunu paylaşır, karışık mermiler tek çizim çağrısında toplanır. Atlas dolarsa ayrı dokuya geri düşer. Tema/çözünürlük değişince yeniden paketlenir.

### 3.3 Çöp toplayıcı (GC) baskısı
- Mermi izi her adımda (120 Hz) yeni `{x, y}` nesnesi üretiyordu; artık iz dolunca en eski nokta nesnesi yeniden kullanılıyor (test: `tests/stage2.test.mjs`).
- Para ve skor yazısı listeleri her adımda `filter` ile yeni dizi üretiyordu; yerinde sıkıştırmaya çevrildi.
- `toTint` (her mermi, her kare renk ayrıştırma) önbelleğe alındı.
- Sayısal tahmin (ölçüm değil): 1000 mermilik stres sahnesinde izli mermiler için saniyede ~30 000 küçük nesne ayırması ortadan kalktı.

### 3.4 Uyarlanabilir kalite (`js/quality.js`)
- Oyun sırasında gerçek kare aralıklarını izler. Ekran yenileme hızını ilk karelerden tahmin eder (60/90/120 Hz ekranlarda kendi aralığına göre yargılar).
- ~3 saniyelik pencerede karelerin %20'sinden fazlası yenileme aralığının 1,5 katını aşarsa bir kademe düşer: **1** → çözünürlük tavanı 1,25×, boss dokusu en fazla 1,5 px/birim; **2** → 1×, azaltılmış efekt (iz noktaları ve konfeti yarıya), boss dokusu 15 Hz.
- Menüler yargılanmaz, 250 ms'den uzun boşluklar (sekme değişimi) yok sayılır, değişiklikten sonra 4 s bekleme. Otomatik geri yükselmez (salınım olmasın); sayfa yeniden açılınca tam kaliteyle başlar.
- Testler: 60 Hz'de sabit kalır, 120 Hz'i tanır, kademe kademe düşer, menü/boşluk yok sayılır.

### 3.5 Diğer
- Canlı doku tuvali artık gereğinden 2 kat büyükse küçülüyor (önceki en büyük boss boyutunda kalıp her yenilemede tamamı yükleniyordu).
- Geliştirici panelinde (yalnızca geliştirme sürümünde) FPS, kare süresi, algılanan Hz, kalite kademesi, doku çözünürlüğü ve mermi sayısı.
- `npm run apk`: Gradle sarmalayıcısı açık yolla çağrılıyor (`.\gradlew.bat`); bazı ortamlarda mevcut dizinden çalıştırma kapalı olduğundan derleme düşüyordu.

## 4. Sonuçlar (sonra)

### 4.1 Masaüstü 900×600, kalite 0 (240 kare)

| Sahne | Tema | ort ms | p95 | p99 | çizim çağrısı | yükleme/s | KB/s |
|---|---|---|---|---|---|---|---|
| menü | açık | 0,17 | 0,6 | 0,9 | 4 | 0,5 | 32 |
| oyun (kaos) | açık | 0,76 | 1,6 | 2,2 | 9,3 | 2,8 | 1206* |
| boss 1 (jöle) | açık | 0,68 | 1,5 | 2,9 | 10,4 | 31,8 | 4801 |
| boss 2 (bulut) | açık | 0,39 | 0,7 | 1,0 | 11 | 30 | 3600 |
| boss 3 (sakız) | açık | 0,37 | 0,7 | 1,5 | 10,2 | 32 | 6190 |
| duraklat | açık | 0,21 | 0,3 | 0,5 | 7 | 0 | 0 |
| sonuç | açık | 0,44 | 1,3 | 2,2 | 8 | 0 | 0 |
| 1000 mermi | açık | 2,88 | 6,4 | 9,5 | 7,3 | 3,3 | 219 |
| menü | koyu | 0,43 | 1,4 | 2,3 | 8,1 | 1 | 64 |
| oyun (kaos) | koyu | 1,11 | 2,2 | 3,0 | 11,7 | 4,5 | 1307* |
| boss 1 | koyu | 0,84 | 1,9 | 2,6 | 12,4 | 31,8 | 7138 |
| duraklat | koyu | 0,37 | 0,7 | 1,0 | 9 | 0 | 0 |
| sonuç | koyu | 0,23 | 0,4 | 0,6 | 14,1 | 0 | 0 |
| 1000 mermi | koyu | 1,68 | 2,1 | 2,6 | 9,4 | 3,3 | 219 |

\* Oyun satırındaki ~1 MB/s'nin büyük kısmı mermi atlasının **tek seferlik** yüklemesidir (yeni mermi türü ilk göründüğünde 4 MB); sürekli kısım HUD sol (graze sayacı) ve seri hapıdır (~0,2–0,3 MB/s).

### 4.2 Önce / sonra (doku yükleme, masaüstü açık tema)

| Sahne | Önce | Sonra |
|---|---|---|
| Ana menü | 30/s, ~66 MB/s | 0,5/s, 32 KB/s |
| Sonuç kartı | 30/s, ~66 MB/s | 0 |
| Duraklat | 15/s, ~33 MB/s | 0 |
| Oyun (kaos), sürekli | ~280/s, ~25 MB/s | ~3/s, ~0,2–0,3 MB/s |
| Boss | ~45–55/s, ~10–13 MB/s | ~31/s, 3,6–6,2 MB/s (yalnızca boss gövdesi) |
| 1000 mermi çizim çağrısı | 70/kare | 7,3/kare |

Atlas A/B (aynı oturum, 3'er tekrar, 1000 mermi): çizim çağrısı 70 → 7,2; masaüstü kare süresinde fark gürültü düzeyinde (ort 1,12–1,49 ms atlaslı, 1,27–1,60 ms atlassız). Çizim çağrısının mobil GPU'larda daha pahalı olduğu bilinir, ancak bu kazanç cihazda ölçülmedi.

### 4.3 Telefon emülasyonu 375×812 (563×1218 tampon), açık tema

| Sahne | Kalite 0 | Kalite 1 (469×1015) | Kalite 2 (375×812) |
|---|---|---|---|
| boss 1 yükleme | 13,7 MB/s | 7,1 MB/s | 2,7 MB/s |
| boss 2 yükleme | 13,6 MB/s | 7,9 MB/s | 2,8 MB/s |
| boss 3 yükleme | 24,8 MB/s | 15,1 MB/s | 6,4 MB/s |
| oyun (kaos) | 1,5 MB/s* | 1,7 MB/s* | 1,4 MB/s* |
| menü / duraklat / sonuç | 72 KB/s / 0 / 0 | – | – |

Kare süreleri emülasyonda 0,3–0,7 ms (boss), 1,4–1,7 ms (1000 mermi); masaüstü işlemcisinde ölçüldüğü için telefon için anlamlı değildir.

### 4.4 Uzun süre (soak) testi
10 dakikalık oyun süresi (36 000 kare, simüle saat, ölümsüz, 18 boss geçildi), masaüstü:
- Pişmiş doku sayısı 90 → 101'de sabitlendi (sınırsız büyüme yok; tavan 600).
- JS heap 37–50 MB arasında salındı, artış eğilimi yok.
- Kare başına CPU süresi dakika ortalamalarında 0,51–0,89 ms, p99 1,3–4,6 ms; zamanla kötüleşme yok.
- Telefonun ısınması/kısılması ölçülmedi.

## 5. Görsel kontrol
Menü, oyun (açık), boss (koyu), duraklat (koyu), sonuç kartı ve kalite 2'deki boss ekran görüntüleriyle kontrol edildi: düzen, renkler, metinler ve animasyonlu parçalar Aşama 1 ile aynı görünüyor. Bilinen küçük farklar: oyuncu nefes alırken tüm sprite ölçeklenir (önceden yalnızca gövde elipsi; ±%3 olduğu için fark edilmiyor), seri hapının süre çubuğu yazının üstünde çizilir (2 px). Otomatik görsel regresyon testi yok.

## 6. Test ve derleme
- `npm test`: **70/70** (Aşama 1'in 65 testi + Aşama 2'nin 5 testi).
- `npm run build:web`: başarılı; ana paket 479 KB (gzip 144 KB). Geliştirici modu ve `dev-perf` pakette yok.
- Önizleme (`vite preview`, CSP etkin): konsolda hata/CSP ihlali yok, WebGL çalışıyor, Fredoka yüklü.
- Android: `cap sync` + `gradlew assembleDebug` **BUILD SUCCESSFUL**, `app-debug.apk` 4,55 MB. Cihazda çalıştırılmadı.

## 7. Yapılmayanlar / açık kalanlar
- **Boss gövdesi** hâlâ 30 Hz canlı doku (telefonda kalite 0'da 13–25 MB/s). Kalıcı çözüm üç boss çiziminin (~390 satır) PixiJS Graphics'e taşınması; ayrı bir iş olarak önerilir.
- **90/120 Hz ara değerleme (interpolation)** yapılmadı. Simülasyon 120 Hz sabit adımlı; 120 Hz ekranda kare başına 1 adım düşer, 90 Hz ekranda kareler 1–2 adım arasında değişir (hafif düzensizlik olabilir). Gerçek yüksek yenileme hızlı cihazda test edilmedi.
- Gerçek Android cihazda FPS, ısınma ve uzun süre ölçümü yapılmadı. Öneri: debug APK + Chrome `chrome://inspect` ile WebView'a bağlanıp konsolda `game.quality` (fps, kademe, algılanan Hz) izlenebilir.
- Uyarlanabilir kalitenin eşikleri (%20, 1,5×, 3 s) gerçek cihaz verisiyle ayarlanmalı.

## 8. Değişen dosyalar
Yeni: `js/quality.js`, `js/render/glyphText.js`, `tests/stage2.test.mjs`, `ux-preview/perf-harness.js`, bu rapor.
Değişen: `js/render/{worldView,uiView,fxView,textures,pixiRenderer}.js`, `js/{ui,boss,pickup,bullet,coins,score,game,arena,main,devMode}.js`, `css/style.css`, `package.json` (`apk` betiği), `docs/teknik-dokuman.md`.
