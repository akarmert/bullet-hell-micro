# Bullet Hell Micro — Teknik Doküman

> **Amaç:** Bu doküman projenin bütün teknik yapısını, sistemlerini, verilerini ve bilinen sınırlarını tek yerde anlatır. Dışarıdan bir değerlendiricinin (insan ya da yapay zekâ) kodu açmadan mimariyi anlayıp öneri yapabilmesi için yazıldı.
> Son bölüm, hız, optimizasyon ve güvenlik için **WebGL'e (PixiJS) geçiş önerisini** içerir.
>
> **Durum notu (PixiJS Aşama 1 sonrası):** Bu doküman `pixijs-v8-stage1` dalındaki mimariyi anlatır. Çizim artık tamamen **PixiJS v8 (WebGL)** üzerinden yapılır, derleme **Vite** iledir. Geçişin ayrıntıları, ölçümler ve açık konular: [`PIXIJS-STAGE1-REPORT.md`](../PIXIJS-STAGE1-REPORT.md). `android/` klasörü projede bulunuyor ama git'e eklenmemiş.

---

## 1. Genel bakış

| Özellik | Değer |
|---|---|
| Tür | Tek ekranlı "bullet hell": mermilerden kaç, hayatta kal, skor yap |
| Tema | "Marshmallow Candy": marşmelov beyazı, mor, sakız pembesi; açık + koyu tema |
| Platform | Tarayıcı (masaüstü + mobil), Android (Capacitor ile APK) |
| Dil | Vanilla JavaScript (ES modülleri), HTML, CSS |
| Çizim | **PixiJS 8.22.0 (WebGL)**. Eski Canvas 2D çizim kodu yalnızca **doku üreticisi** olarak kullanılır |
| Ses | Web Audio API ile **tamamen prosedürel** (ses dosyası yok) |
| Çalışma zamanı bağımlılıkları | `pixi.js@8.22.0`, `@fontsource/fredoka@5.3.0` (yerel yazı tipi, OFL-1.1), Capacitor 7.6.10 (Android). Hepsi tam sürüme sabit |
| Derleme | **Vite 8.3.5** (`www/` çıktısı, göreli yollar) |
| Kod boyutu | ~10.500 satır (`js/` + `css/`), 37 JS modülü (7'si `js/render/`) |
| Test | Node'un yerleşik test koşucusu, 8 dosya, **65 test** |
| Dil desteği | Türkçe + İngilizce (çalışma anında değişir) |

## 2. Çalıştırma ve derleme

```bash
npm ci                 # bağımlılıklar (package-lock.json'a göre)
npm run dev            # Vite geliştirme sunucusu → http://localhost:3000 (geliştirici modu: /?dev)
npm test               # node --test tests/*.test.mjs
npm run build:web      # vite build → www/ (CSP eklenir, geliştirici modu çıkarılır)
npm run preview        # derlenmiş www/ sürümünü http://localhost:4173'te dener
npm run apk            # build:web + cap sync android + gradlew assembleDebug
```

- **Vite** (`vite.config.js`): geliştirme sunucusu 3000 portunda; yayın derlemesi `www/` klasörüne, `base: './'` ile (Capacitor APK içinden yüklenebilsin diye). Yayın derlemesine sıkı bir **Content-Security-Policy** `<meta>` etiketi eklenir (geliştirme sunucusunda eklenmez, çünkü Vite'ın anlık yenilemesi satır içi betik ve websocket kullanır).
- Eski `server.js` (bağımlılıksız Node sunucusu) ve `scripts/build-web.mjs` kaldırıldı. İkisi de başlangıç yedeğinde ve git geçmişinde duruyor.
- **Capacitor**: `capacitor.config.json` → `appId: com.bullethellmicro.app`, `webDir: www`.
- **Geliştirici modu** yalnızca geliştirme sunucusunda (`import.meta.env.DEV`) ya da `VITE_ENABLE_DEV_MODE=true` ile derlenen pakette yüklenir; normal yayın paketinde kodu hiç yer almaz.
- `www/`, `node_modules/` ve `*.apk` `.gitignore`'da.

## 3. Klasör yapısı ve modüller

```
index.html            Tek sayfa: canvas (PixiJS/WebGL) + dokunmatik kontrol şeridi + birkaç HTML buton
css/style.css         Tema değişkenleri (açık/koyu), tam ekran yerleşim, kontrol şeridi, geliştirici paneli
js/                   Oyun mantığı (PixiJS'e bağımlı DEĞİL; Node testlerinde çalışır)
js/render/            Çizim katmanı (PixiJS v8): tek ekran çizicisi
tests/                Node test dosyaları (*.test.mjs)
docs/                 Tasarım rehberleri, UX raporu, bu doküman, docs/pixijs-stage1/ (plan, referans/sonra görüntüleri, ölçümler)
ux-preview/           Tasarım karşılaştırma sayfaları + sandbox.js (kayıtlara yazmayan test ortamı)
vite.config.js        Derleme, geliştirme sunucusu, yayın CSP'si
PIXIJS-STAGE1-REPORT.md  PixiJS Aşama 1 teknik raporu
```

### 3.1 Modül sorumlulukları

| Modül | Satır | Sorumluluk |
|---|---|---|
| `main.js` | ~50 | Giriş noktası: yerel Fredoka yazı tipini yükler, `Game` oluşturur, sabit adımlı döngüyü (`loop.js`) çalıştırır |
| `loop.js` | ~30 | Sabit adımlı (1/120 sn) simülasyon; kare başına en fazla 8 adım (DOM'suz, test edilir) |
| `quality.js` | ~95 | Uyarlanabilir kalite: kare aralıklarını izler, gerekirse çözünürlük tavanını ve efekt yoğunluğunu düşürür (DOM'suz, test edilir) |
| `game.js` | ~1080 | **Orkestratör**: durum makinesi, girdi, güncelleme sırası, ölüm, ödüller, alt şerit senkronu; çizimi `PixiRenderer`'a devreder |
| `config.js` | ~360 | **Tüm ayarlanabilir sayılar**: oyuncu, fazlar, 3 boss, güçlendirmeler, ekşi şekerler, testere, para, mobil denge, performans, modlar |
| `arena.js` | ~40 | Mantıksal arena boyutu (yükseklik sabit 600, genişlik ekran oranına göre), DPR tavanı, PixiJS'e yeniden boyutlandırma, güvenli alanlar |
| `player.js` | ~410 | Marşmelov oyuncu: fare 1:1 / klavye-joystick hareketi, dash, kalkan (3 hak), dokunulmazlık, ağırlık/şişme etkileri |
| `bullet.js` | ~450 | Mermi varlığı: 7 şekil (circle, diamond, capsule, ring, saw, bubble…), iz, sekme, salınım; kapsül ve hale önbellek görselleri |
| `bulletManager.js` | ~130 | Mermi **nesne havuzu** (sıfır çöp hedefi), güncelleme, temizleme |
| `waveManager.js` | ~780 | Faz zaman çizelgesi, desen üreticileri, uyarı lazerleri, testereler, boss rotasyonu ve takvimi, kaos, mobil yoğunluk ölçeği |
| `boss.js` | ~915 | 3 boss (Jöle Kral, Pamuk Bulut, Sakız Balon): durumlar, 9 desen, hasar modeli, gövde teması, çizimleri |
| `collision.js` | ~135 | Daire-daire çarpışma, graze tespiti, kalkan tüketimi, duvar kontrolü, ölüm nedeni |
| `pickup.js` | ~430 | Güçlendirmeler (kalkan, yavaş çekim, POP) + ekşi şekerler (AĞIR, DEV) |
| `coins.js` | ~180 | Sahada beliren şeker paralar (1/5/10/50/100), ömür halkası |
| `score.js` | ~85 | Saniye puanı, graze puanı, seri/çarpan, boss bonusu, puan baloncukları |
| `progress.js` | ~135 | Kalıcı istatistikler, açılan kostümler, şeker bakiyesi, satın alma |
| `skins.js` | ~255 | 12 kostüm (8 başarım + 4 satılık) ve marşmelov çizimi |
| `effects.js` | ~600 | Parçacıklar, şok dalgaları, flaş, sarsıntı, afiş, yaylı benek ızgarası, pastel bulutlar |
| `menuBackdrop.js` | ~470 | Menü ve sonuç kartının etkileşimli arka planı (açık: şekerler, koyu: yıldız/ateşböceği) |
| `ui.js` | ~1210 | Tüm canvas arayüzü: 3 menü yerleşimi, HUD, ayarlar, bilgi paneli, duraklatma, sonuç kartı, isabet testleri, klavye odağı |
| `theme.js` | ~150 | Açık/koyu renk jetonları, `applyTheme`, `candyPanel`, `outlinedText`, `font()` |
| `audio.js` | ~655 | Prosedürel müzik (menü/oyun/boss modu) ve tüm efekt sesleri |
| `touchControls.js` | ~105 | Joystick + DASH, çoklu dokunuş sahipliği (pointer id) |
| `settings.js` | ~90 | Kalıcı ayarlar (ses, sarsıntı, kontrast, hayalet, tema, dil) |
| `i18n.js` | ~390 | TR/EN sözlükler, `t()`, Türkçe büyük harf (`upper`) |
| `modes.js` | ~150 | Mod kayıt defteri (klasik, sonsuz, zorlu, kaos, günlük) |
| `rng.js` | ~50 | Tohumlu RNG (günlük mod herkes için aynı desen), tarih anahtarı |
| `ghost.js` | ~95 | "En iyi tur" hayaleti kaydı/oynatması |
| `tutorial.js` | ~90 | İlk oyun ipuçları (bir kez gösterilir) |
| `share.js` | ~60 | Sonuç paylaşımı (Web Share API → panoya kopyala yedeği) |
| `devMode.js` | ~170 | Geliştirici modu (`?dev`): ölümsüzlük, boss'a atlama, kayıtlar kapalı; yayın paketinden çıkarılır |
| `render/pixiRenderer.js` | ~140 | PixiJS `Application` (WebGL, elle çizim), katman sırası, ekran sarsıntısı, WebGL bağlam kaybı/kurtarma |
| `render/textures.js` | ~360 | Doku pişirme önbelleği, mermi `TextureAtlas`'ı, içerik değişince yeniden çizilen `LiveCanvasSprite`, havuzlu `ParticleLayer`, ertelenmiş doku silme, `PerfStats` yükleme sayaçları |
| `render/glyphText.js` | ~110 | Her karede değişen sayılar (süre, skor) için önceden pişirilmiş karakter sprite'ları |
| `render/shapes.js` | ~110 | Ortak beyaz şekil dokuları (nokta, ışık, hale, şerit, yıldız, iz); GPU'da renklendirilir |
| `render/worldView.js` | ~720 | Arka plan, yıldızlar, benekler, uyarı lazerleri, şekerler, paralar, boss, hayalet, mermiler (havuz + hale + iz), oyuncu, puan baloncukları |
| `render/fxView.js` | ~90 | Konfeti parçacıkları, şok dalgaları, flaş, bildirim afişi |
| `render/uiView.js` | ~430 | HUD bölgeleri, ipucu, boss barı, menü/duraklatma/sonuç kartı, arena çerçevesi, maskeli kenar uyarısı |
| `render/backdropView.js` | ~150 | Menü ve sonuç kartının etkileşimli arka planı (şekerler, yıldızlar, ateşböcekleri) |

---

## 4. Çekirdek mimari

### 4.1 Oyun döngüsü
`main.js`, `loop.js`'teki sabit adımlı yürütücüyü kullanır: her `requestAnimationFrame`'de geçen süre biriktirilir, simülasyon **1/120 saniyelik eşit adımlarla** (`game.update(STEP)`) ilerler ve kare başına bir kez `game.render()` çağrılır. Kare başına en fazla 8 adım çalışır (takılmalardan sonra telafi döngüsü olmasın diye). Böylece hareket, boss süreleri, çarpışmalar ve skor 30, 60, 90 ya da 120 Hz ekranda aynı kalır; bu, testlerle doğrulanır. Simülasyon süresi (`elapsedMs`) sadece `PLAYING` durumunda ilerler. Yavaş çekim, `pickupManager.getSpeedFactor()` ile mermi/boss/para güncellemelerine çarpan olarak uygulanır.

### 4.2 Durum makinesi
`GAME_STATE = MENU | PLAYING | PAUSED | DEAD`

- `MENU → PLAYING` (`startGame`): oyuncu/mermi/dalga/skor/şeker sıfırlanır; dokunmatik destek bayrağı dalga yöneticisine verilir; "cihazı çevir" ipucu 3,5 sn gösterilir.
- `PLAYING ↔ PAUSED`: dünya donar; devam ederken 1,5 sn geri sayım.
- `PLAYING → DEAD` (`triggerDeath`): ölüm nedeni (kenar/boss/mermi), patlama efekti, rekor/hayalet/istatistik/şeker kaydı (geliştirici modunda kayıt yok), 650 ms sonra sonuç kartı belirir.
- `DEAD → PLAYING` sadece "tekrar oyna" butonu, Enter veya Space ile; `DEAD → MENU` kart içindeki "ana menü" ya da M tuşu ile.

### 4.3 Koordinat sistemi ve çözünürlük
- Mantıksal arena: **yükseklik 600 birim**, genişlik = `600 × ekranGenişliği / ekranYüksekliği`. Dikey telefonda ~277 birim, geniş masaüstünde ~1000 birim.
- PixiJS sahnesi mantıksal birimlerle kurulur ve `kökKonteyner.scale = cssYükseklik / 600` ile ekrana ölçeklenir. Çizim tamponu `renderer.resize(cssW, cssH, dpr)` ile ayarlanır. Tuvalin CSS boyutunu sayfa belirler (`autoDensity` kapalı).
- DPR tavanı masaüstünde 2, dokunmatik cihazda (`pointer: coarse`) **1,5**. Dokular `dpr × ölçek` çözünürlüğünde pişirilir (0,25 adımlarla yuvarlanır).
- `ResizeObserver`, pencere `resize` ve `orientationchange` olayları boyutu yeniden ölçer; oyuncu konumu oransal korunur.
- Menüler mantıksal arenaya sabit tasarım boyutlarında (600×600 kare, 920×470 geniş, 420×790 dikey) çizilip ölçeklenir; ekrana en iyi sığan yerleşim seçilir.

### 4.4 Güncelleme sırası (PLAYING)
1. Girdi toplama (klavye + gamepad + joystick) → `player.setMoveInput`
2. Duraklatma geri sayımı
3. Oyuncu (dash, dokunulmazlık, ağırlık/şişme, klavye hareketi)
4. Efektler (parçacık, ızgara yayları, bulutlar, müzik gerilimi)
5. Skor, hayalet kaydı, öğretici ipucu
6. Duvar kontrolü
7. Dalga yöneticisi (faz desenleri / boss / kaos), mermiler, güçlendirmeler, paralar (yavaş çekim çarpanıyla)
8. Çarpışma: mermi → (kalkan | ölüm), graze → skor + boss hasarı, boss gövdesi teması
9. Alt şerit DOM senkronu (saniyede en fazla 10 kez)

### 4.5 Çizim mimarisi (PixiJS katmanları)
Oyun mantığı PixiJS'i hiç import etmez. `PixiRenderer` her karede oyun durumunu **okur** ve sahneyi günceller. Katmanlar (arkadan öne):
1. **Arka plan** (sarsılmaz): zemin rengi / koyu temada gökyüzü geçişi dokusu + pastel bulutlar (tek ışık dokusu, `ParticleContainer`)
2. Menüde: **etkileşimli arka plan** (`BackdropView`)
3. **Oyun alanı + efektler** (birlikte sarsılır): yıldızlar ve benekler (`ParticleContainer`) → uyarı lazerleri (`Graphics` + nokta parçacıkları) → şekerler, paralar, boss, hayalet (`LiveCanvasSprite`) → mermi izleri ve haleleri (`ParticleContainer`) → mermiler (pişmiş doku + sprite havuzu; testere gövdesi döner, yüzü dik kalır) → oyuncu → puan baloncukları → konfeti, şok dalgası, flaş, afiş
4. **Arayüz** (sarsılmaz): kenar uyarısı ışığı (çerçeve içine maskeli) → HUD bölgeleri → ipucu → boss barı → menü / duraklatma / sonuç kartı (kartın gövdesinde maskeli arka plan efekti) → arena çerçevesi ve yaklaşılan kenarın pembe parçası (çerçeve çizgisine maskeli)

**Dokular:** Mevcut Canvas 2D çizim fonksiyonları yalnızca **doku üreticisi** olarak kullanılır:
- *Pişmiş dokular* (`bake`): mermi şekilleri, konfeti, şekerler, puan yazıları, ortak beyaz şekiller bir kez çizilir; tema, kontrast, çözünürlük ya da yazı tipi değişince yeniden pişirilir. Eski dokular bir sonraki çizimden sonra silinir.
- *Canlı dokular* (`LiveCanvasSprite`): oyuncu, boss, şekerler, paralar, HUD bölgeleri ve ekranlar küçük bir ara tuvalde çizilir ve **yalnızca görünüşü değişince** yeniden yüklenir (animasyonlu olanlar en fazla saniyede 30 kez). Konum değişince sadece sprite kayar.

## 5. Oyun tasarımı ve sistemler

### 5.1 Zaman çizelgesi (Klasik mod)

| Zaman | Faz | İçerik |
|---|---|---|
| 0–10 sn | WARM UP | Kenarlardan sakız topları; aralık 380 → 180 ms |
| 10–20 sn | SPIRAL | Merkezden 3 kollu lavanta donut spirali |
| 20–30 sn | AIM | Uyarı lazerli (380 ms) nişanlı kristaller; testereler başlar |
| 0:30 | **Boss 1 — Jöle Kral** | 18 sn'de kendiliğinden söner |
| Boss 1 sonrası | CHAOS (mola) | Seyrek ve yavaş kaos (aralık ×2, hız ×0,75), ilk 3 sn mermi yok, kalkan düşer |
| 1:15 | **Boss 2 — Pamuk Bulut** | 24 sn |
| Boss 2 + ≥15 sn | **Boss 3 — Sakız Balon** | 22 sn |
| Sonra | Rotasyon | Jöle → Bulut → Sakız tekrar; her turda mermi hızı +%12, sıklık +%10 |

Boss'lar arasında CHAOS fazı sürer: duvardan seken, uyarı lazerli şeker çubukları + saniyede bir nişanlı atış + testereler. Kaos rampası 20 sn'de doruğa çıkar.

### 5.2 Mermiler
- **Nesne havuzu**: `BulletManager.spawn` havuzdan alır, pasifleşen mermiler havuza döner.
- Şekiller: `circle`, `diamond`, `capsule` (önbellek görsel), `ring`, `saw` (salınan, dönen testere), `bubble` (patlayacak sakız balonu).
- Özellikler: hız vektörü, iz uzunluğu, sekme hakkı, salınım, dönüş, `tag` (boss'un takip ettiği mermiler için; havuzdan tekrar kullanılınca sıfırlanır).
- **Uyarı lazerleri** (`telegraphs`): önce kesik şeker çizgisi, süre dolunca `onFire` ile mermi doğar.

### 5.3 Boss sistemi
- Config tabanlı: her boss `KIND`, süre, can, graze/ram hasarı, yarıçap, aşama listesi tanımlar.
- **Oyuncu ateş etmez.** Boss enerjisi zamanla erir (`maxHp × dt / DURATION`). **Graze** (yakından sıyrılma) ve **dash ile gövdeden geçiş (ram)** enerjiyi hızla düşürür.
- Aşamalar canın %66 ve %33'ünde değişir, arada kısa ateşkes olur.
- Gövde teması: dash veya dokunulmazlıkta zararsız; kalkan varsa **bütün kalkanlar kırılır ve oyuncu dışarı itilir**; yoksa ölüm.

| Boss | Aşama 1 | Aşama 2 | Aşama 3 |
|---|---|---|---|
| Jöle Kral | BLOOM: dönen halka çiçekleri | FANG: uyarılı nişan yelpazesi + yavaş halka | VORTEX: ters dönen çift spiral |
| Pamuk Bulut | YAĞMUR: kayan güvenli koridorlu yağmur | DUVAR: tek geçitli çubuk duvarları (geçit önceden gösterilir) + hafif yağmur | GİRDAP: oyuncuyu çeker (dash çekimi kırar) + dönen halkalar |
| Sakız Balon | BALON: yavaş balonlar 1,7 sn sonra 8'li halkaya patlar (titreyerek uyarır) | SEKME: duvarlardan 3 kez seken toplar + seyrek halka | PATLAMA: boss 1,3 sn şişer, sonra 26'lık halkaya patlar; **oyuncu yönünde ~57° güvenli boşluk** |

### 5.4 Oyuncu
- Gövde yarıçapı 5, **hitbox 4** (adil his), graze yarıçapı 16.
- Fare/dokunuş: imleci 1:1 takip. Klavye/joystick: 360 px/s. Gamepad desteği var.
- **Dash**: 160 ms dokunulmazlık + 35 birimlik itme, 2,4 sn bekleme.
- **Kalkan**: her güçlendirme +1 hak, en fazla 3. Her darbe 1 hak harcar; dokunulmazlık (800 ms) sadece son kalkan kırılınca başlar.
- **Kenara değmek ölümdür** (kenara yaklaşınca sadece yakın nokta pembe yanar).

### 5.5 Güçlendirmeler ve ekşi şekerler
| Tür | Etki | Not |
|---|---|---|
| KALKAN | +1 kalkan hakkı | Ortalama 9 sn'de bir, sahada en fazla 2 |
| YAVAŞ | 2,8 sn dünya ×0,55 hızda | Paraların ömrü de yavaşlar |
| POP! | Ekrandaki tüm mermileri patlatır | |
| **AĞIR** (ekşi) | 4,5 sn: joystick/klavye hızı ×0,5; fare imleci anında değil 230 px/s ile izlenir | Oyuncuya 28 px/s ile süzülür; **kalkan engellemez** |
| **DEV** (ekşi) | 5 sn: gövde, hitbox ve graze alanı ×1,7 (yumuşak geçiş) | İlk 12. sn'de, sonra ~10 sn'de bir; sahada en fazla 1 |

### 5.6 Skor, seri ve ekonomi
- Saniyede 100 puan; graze başına 25 × çarpan. Her 5 graze çarpanı +1 artırır (en fazla ×5); 900 ms graze olmazsa seri biter. Boss başına +3000.
- **Şeker** (oyun içi para, gerçek parayla ilgisi yok): her 200 puan = 1, yenilen boss başına +15, artı sahada toplanan paralar (1/5/10/50/100; değer arttıkça nadir ve kısa ömürlü).
- **Kostümler**: 8 başarım kostümü (ör. 50 graze, 30 sn, boss yenme, 3 farklı gün günlük mod) + 4 satılık kostüm (400 / 650 / 1000 / 1500 şeker, iki dokunuşlu onay).

### 5.7 Modlar
| Mod | Hız | Sıklık | Özellik |
|---|---|---|---|
| Klasik | ×1 | ×1 | Fazlar + boss rotasyonu |
| Sonsuz | ×1 | ×1 | Kaosta ek spiral dalgaları |
| Zorlu | ×1,35 | ×1,43 | |
| Kaos | ×1,15 | ×1,18 | Bütün sistemler aynı anda, boss yok |
| Günlük | ×1,1 | ×1,11 | **Tohumlu RNG**: o gün herkes aynı deseni oynar; rekor güne özel |

### 5.8 Mobil denge (dar ekran)
Mermi sayısı zamana bağlı olduğu için dar arenada alan başına mermi çok artıyordu. Çözüm (`GAME_CONFIG.ARENA_DENSITY`):
- `densityScale = clamp(arenaAlanı / 600², 0,55, 1)`: kaos, nişanlı atış, testere ve **boss** atış aralıkları bu ölçeğe bölünür. Dikey telefonda en fazla ~1,8 kat seyreklik.
- Dokunmatikte kaos ve boss mermileri ×0,9 hızda, kaos çubukları en fazla 1 kez seker.
- İlk 30 sn'lik fazlar değiştirilmedi.

---

## 6. Görsel sistem

- **Tema jetonları** (`theme.js`): `BG, SURFACE, SURFACE_SOFT, TEXT, TEXT_HALO, INK (kontur), MUTED, PINK, PURPLE, LAVENDER, SCRIM, FRAME…` Açık ve koyu ("Gece Şekercisi") paletleri `applyTheme` ile değişir. Ayar: sistem / açık / koyu; sistem tercihini canlı izler. CSS tarafı `html[data-theme]` değişkenleriyle eşlenir.
- **Çizim dili**: koyu konturlu "çıkartma" şekiller, aşağı kaydırılmış koyu gölgeli şeker paneller (`candyPanel`), dış hatlı metin (`outlinedText`), yuvarlak yazı tipi Fredoka.
- **Yüksek kontrast**: kalın mermi konturu, sade arka plan.
- **Etkileşimli arka plan** (`menuBackdrop.js`): açık temada süzülen şekerler imleçten kaçar, dokununca patlar; koyu temada ateşböcekleri imleci izler, yakın yıldızlar takımyıldızı gibi bağlanır, dokununca kayan yıldız çıkar. İmleç yokken görünmez bir gezgin sahneyi canlı tutar. Sonuç kartının gövdesinde de soluk çizilir.
- **Sonuç kartı**: tam ekran kart, krema kenarlı pembe-mor başlık bandı, sersemlemiş kostümlü marşmelov, büyük skor, 3 renkli istatistik çipi, TEKRAR OYNA + ANA MENÜ + PAYLAŞ.
- **Dokunmatik şerit** (HTML/CSS): oyun alanının altında joystick, süre/puan tabağı, duraklat, DASH. Krema damlası kenar, serpinti deseni, çıkartma gölgeleri. Sadece oyun ve duraklatmada görünür.

---

## 7. Ses
- Tümü Web Audio ile sentezlenir (osilatör, gürültü, filtre, panlama, "duck"). Ses dosyası yok.
- Müzik modları: menü (sakin), oyun (faz gerilimine göre filtre), boss (minör, hızlı), yok. Zamanlayıcı 25 ms aralıklı `setInterval` ile ileriye bakarak nota planlar.
- Graze sesi seriye göre pentatonik yükselir; yoğun anlarda 45 ms'den sık çalmaz.
- Müzik ve efekt sesi ayrı ayrı açılıp kapanır (B / N tuşları) ve kayıtlı tutulur.

## 8. Girdi
- **Fare**: imleç 1:1, sağ tık dash, sol tık menü.
- **Klavye**: WASD/oklar, Shift/Space dash, P/ESC duraklat, B müzik, N efekt, O ayarlar, I bilgi, ← → kostüm, Tab/↑↓ menü odağı, Enter tekrar, M menü, C paylaş.
- **Gamepad** (Standard Gamepad eşlemesi): sol çubuk veya yön tuşları hareket, A (0) veya sağ tetik (7) dash, Start (9) duraklat/başlat.
- **Dokunmatik**: alt şeritte joystick (göreli vektör) + DASH; iki parmakla aynı anda kullanılabilir (pointer id sahipliği). Menüler canvas üzerinde dokunmayla çalışır, hedefler ≥44 CSS px.

## 9. Kalıcı veri (localStorage)

| Anahtar | İçerik |
|---|---|
| `bulletHellHighScore_<mod>` | En iyi süre (ms); günlük modda sonuna tarih eklenir |
| `bulletHellHighScore_<mod>_score` | En iyi skor |
| `bullet_hell_micro_highscore` | Eski sürüm anahtarı (bir kez taşınır) |
| `bulletHellMicro_progress` | İstatistikler, açılan kostümler, seçili kostüm, şeker bakiyesi |
| `bulletHellMicro_settings` | Ses seviyeleri, sarsıntı, kontrast, hayalet, tema, dil |
| `bulletHellMicro_audio` | Müzik/efekt açık-kapalı |
| `bulletHellMicro_tutorial` | Gösterilen ipuçları |
| `bulletHellMicro_ghost_<mod>` | En iyi turun konum kaydı (en fazla 3 dk); eski günlük kayıtlar temizlenir |

Bütün okuma/yazmalar `try/catch` içindedir (gizli sekme, kota hatası).

## 10. Dil desteği
`i18n.js` içinde TR ve EN sözlükleri. `t(anahtar, parametreler, yedek)` ile çağrılır, parametreler `{ad}` biçiminde. `upper()` Türkçe büyük harf kuralına uyar (i → İ). Mod adları, boss adları ve aşamaları, HUD, afişler, bilgi paneli ve HTML butonları çevrilir.

## 11. Geliştirici modu
- Geliştirme sunucusunda (`npm run dev`) adres `?dev` içerince (`?dev=0` hariç) solda bir panel açılır. Dar ekranda kapalı başlar.
- Ölümsüzlük (açılışta açık; aynı çarpmanın tekrarları tek sayılır), boss'a atlama (Jöle/Bulut/Sakız), AĞIR/DEV uygula, ekşi şeker bırak, kalkan +1, mermileri temizle, turu bitir.
- **Geliştirici modunda rekor, hayalet, istatistik, kostüm başarımı ve şeker kaydedilmez.**
- **Yayın paketinde (`npm run build:web`) geliştirici modunun kodu yoktur**; `?dev` hiçbir şey yapmaz. İstenirse `VITE_ENABLE_DEV_MODE=true npm run build:web` ile bilerek açılabilir.

## 12. Testler
`node --test tests/*.test.mjs`, 9 dosya, 70 test. DOM ve WebGL gerektirmeyen mantık test edilir:
- `boss.test.mjs`: boss girişi, hasar modeli, aşamalar, 3 boss rotasyonu, Pamuk Bulut desenleri, Sakız Balon, mobil yoğunluk ölçeği
- `mobile.test.mjs`: kalkan kuralları, ekşi şeker etkileri
- `features.test.mjs`: skor, modlar, günlük RNG, i18n, kostümler, geliştirici modu
- `ui.test.mjs`: menü yerleşimleri, ≥44 px dokunma hedefleri, sonuç kartı butonları, odak sırası
- `stage1.test.mjs`: sabit adımın 30/60/90/120 Hz'de aynı süreyi simüle etmesi, takılma sınırı, aynı tohumla 30 Hz ve 120 Hz'de **birebir aynı mermiler**, oyun mantığının çiziciye bağımlı olmaması, yayın güvenliği (eski sunucu yok, CSP yalnızca derlemede, uzak yazı tipi yok, sürümler sabit)
- `stage2.test.mjs`: uyarlanabilir kalite (60/120 Hz algılama, kademeli düşüş, menü ve uzun boşlukların yok sayılması), mermi izinin nesne yeniden kullanımı
- `theme.test.mjs`, `menuBackdrop.test.mjs`, `audio.test.mjs`

Görsel doğrulama otomatik piksel karşılaştırması değildir: `docs/pixijs-stage1/baseline/` (Canvas 2D) ve `docs/pixijs-stage1/after/` (PixiJS) klasörlerinde aynı senaryoların ekran görüntüleri vardır. `ux-preview/sandbox.js` kayıtlara yazmayan bir test ortamı sağlar.

## 13. Performans önlemleri ve bilinen sınırlar

**Uygulanmış (Aşama 1)**
- WebGL toplu çizim: yoğun sahnede kare başına **5–7 GPU çizim çağrısı** (Canvas 2D'de 700–840 boyama komutu vardı).
- Mermi sprite havuzu (mermi nesne havuzuyla eşli), konfeti sprite havuzu, `ParticleContainer` katmanları (iz, hale, benek, yıldız, bulut, lazer noktası). Kare başına yeni nesne üretilmez.
- Doku pişirme önbelleği (en fazla 600 doku; aşılırsa sıfırlanır) ve değişince yüklenen canlı dokular.
- Ekran dışındaki mermiler çizilmez (40 birim pay); oyun mantığında güncellenmeye devam eder.
- Dokunmatikte DPR tavanı 1,5; alt şerit DOM yazımı saniyede en fazla 10; graze sesi sınırlı.
- Sabit adımlı simülasyon (FPS'den bağımsız oynanış).

**Uygulanmış (Aşama 2 — ayrıntı ve ölçümler: `PIXIJS-STAGE2-REPORT.md`)**
- Her karede doku yükleme kaldırıldı: süre/skor pişmiş karakterlerle (`render/glyphText.js`); menü, duraklat ve sonuç kartı statik doku + dönüşümle oynatılan parçalar; oyuncu, şeker, para, seri hapı ve boss barı parçalara ayrıldı. Masaüstünde menü ~66 MB/s → 32 KB/s, oyun ~25 MB/s → ~0,3 MB/s, duraklat/sonuç → 0.
- Mermi doku atlası (`TextureAtlas`, 1024²): 1000 mermide çizim çağrısı 70 → 7.
- GC: mermi izi nokta nesneleri yeniden kullanılıyor; para/skor yazısı listeleri yerinde sıkıştırılıyor; `toTint` önbellekli.
- Uyarlanabilir kalite (`js/quality.js`): oyunda kareler sürekli yenileme aralığını kaçırırsa çözünürlük tavanı 1,25× → 1× ve azaltılmış efekt; boss dokusu düşük çözünürlük / 15 Hz. Menüde yargılamaz, otomatik geri yükselmez.
- Canlı doku tuvali gereğinden çok büyükse küçülür.
- Ölçüm aracı: `ux-preview/perf-harness.js` (simüle 60 Hz saat, `gl.finish`, çizim çağrısı ve yükleme sayacı). Geliştirici panelinde FPS / Hz / kalite kademesi.

**Bilinen sınırlar**
- Boss gövdesi her karede dalgalandığı için 30 Hz canlı doku (telefon emülasyonunda kalite 0'da 13–25 MB/s). Kalıcı çözüm boss çiziminin PixiJS Graphics'e taşınması.
- 90 Hz ekranlarda ara değerleme yok (120 Hz sabit adım; kare başına 1–2 adım).
- Gerçek telefonda FPS/ısınma ölçülmedi; ölçümler masaüstü tarayıcıda telefon emülasyonuyla, gizli panelde (`gl.finish` ile) yapıldı.
- Görsel regresyon testi otomatik değil.

## 14. Güvenlik notları
- **Sunucu yok, hesap yok, ağ isteği yok.** Yazı tipi artık pakette (Google Fonts kaldırıldı); oyun tamamen çevrimdışı çalışır.
- **Sıkı CSP** (yalnızca yayın derlemesinde): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`. PixiJS `pixi.js/unsafe-eval` modülüyle `eval`/`new Function` kullanmadan çalışır. Derlenmiş sürümde CSP ihlali gözlenmedi.
- **Bağımlılıklar tam sürüme sabit** (`pixi.js 8.22.0`, `vite 8.3.5`, `@fontsource/fredoka 5.3.0`, Capacitor `7.6.10`); `npm audit`: 0 açık.
- **Geliştirici modu yayın paketinden çıkarılır.**
- **Eski `server.js` kaldırıldı** (proje klasöründeki her dosyayı sunuyordu). Vite geliştirme sunucusu yalnızca `localhost`'u dinler.
- **Skorlar ve şeker localStorage'da düz JSON**: kullanıcı değiştirebilir. Çevrimiçi liderlik tablosu yok; eklenirse sunucu tarafı doğrulama şart olur. Kayıt anahtarları değişmedi.
- `window.game` tarayıcı konsolundan erişilebilir (hata ayıklama kolaylığı); yalnızca yerel oyunu etkiler.
- Android: `INTERNET` izni ve `allowBackup="true"` Capacitor varsayılanı olarak duruyor; oyun ağ kullanmadığı için yayın öncesi gözden geçirilmesi önerilir (rapora bakın).

## 15. WebGL'e (PixiJS) geçiş önerisi — Aşama 1 olarak uygulandı

> Aşağıdaki öneri `pixijs-v8-stage1` dalında **Aşama 1** olarak uygulandı. Gerçekleşen mimari §4.5'te, sonuçlar ve sapmalar [`PIXIJS-STAGE1-REPORT.md`](../PIXIJS-STAGE1-REPORT.md) içinde. Bölüm, değerlendirme geçmişi için korunuyor.

### 15.1 Neden
Oyunun mantığı hafif. Darboğaz **Canvas 2D çizim modeli**: her nesne her karede ayrı yol komutlarıyla rasterleştiriliyor. Bullet hell türünde nesne sayısı yüzlerle ölçülür ve mobil tarayıcılarda bu model hızla tıkanır. **PixiJS (WebGL)** aynı görselleri ekran kartına **doku (texture)** olarak yükler ve aynı dokuyu kullanan binlerce sprite'ı birkaç çizim çağrısında toplu (batch) çizer. Bu tür oyunlarda mobilde akıcılık için standart çözüm budur.

Neden başka bir dil ya da motor değil:
- **Flutter**: oyun ekosistemi (Flame) küçük, Steam entegrasyonu zayıf, tamamen yeniden yazım gerekir.
- **Godot**: performans ve çoklu platform açısından mükemmel ama tamamen yeniden yazım gerekir. Bir sonraki, daha büyük proje için önerilir.
- **PixiJS**: mevcut JS kodu, testler, oyun mantığı ve Capacitor (mobil) / ileride Electron (masaüstü) hattı korunur. Sadece çizim katmanı değişir.

### 15.2 Yaklaşım: hibrit geçiş (yeniden yazım değil)
1. **Oyun dünyası → PixiJS (WebGL)**: mermiler, parçacıklar, şok dalgaları, uyarı lazerleri, şekerler, paralar, ızgara, bulutlar, yıldızlar, menü arka planı.
2. **Mevcut Canvas 2D çizim kodu "doku üreticisi" olarak kalır**: her mermi şekli/rengi/boyutu bir kez offscreen canvas'a çizilir, `Texture.from(canvas)` ile atlas/doku olur, sonra binlerce kez kullanılır. Görünüm birebir korunur, çizim fonksiyonları çöpe gitmez.
3. **Arayüz → ayrı, üstte duran Canvas 2D katmanı**: `ui.js` neredeyse değişmeden kalır; menü/kart/ayarlar **sadece değişince** yeniden çizilir (kirli bayrak), HUD düşük frekansta güncellenir.
4. **Oyuncu ve boss'lar (ilk aşama)**: küçük offscreen canvas'a çizilip doku olarak güncellenir (tek nesne, ucuz). İleride animasyon kareleri önceden üretilebilir.
5. **Yedek çizici**: WebGL yoksa ya da bağlamı kurtarılamazsa mevcut Canvas 2D çizici kullanılır.
6. Mantık modülleri (`waveManager`, `boss` desenleri, `collision`, `player`, `score`…) render'dan ayrılır: varlıklar sadece durum tutar, çizim adaptörü (`PixiRenderer` / `Canvas2DRenderer`) durumu okuyup çizer.

### 15.3 Aşamalar ve tahmini iş

| # | İş | Tahmin | Beklenen kazanç |
|---|---|---|---|
| 0 *(isteğe bağlı, ucuz)* | Canvas 2D'de tüm mermi şekilleri ve parçacıkları önbellek görsele çevirmek (`drawImage`) ve telefonda ölçmek | ~1 gün | Orta; PixiJS'e hazırlık |
| 1 | PixiJS'i projeye **dosya olarak** eklemek (CDN değil), iki katmanlı tuval, boyut/DPR, kendi döngümüzle manuel render | ~0,5 gün | Altyapı |
| 2 | Mermi doku atlası + mermi havuzuyla eşli sprite havuzu, hale ve iz | ~1 gün | **En büyük** |
| 3 | Parçacıklar (`ParticleContainer`), şok dalgası, ızgara, uyarı lazerleri, şekerler, paralar | ~1 gün | Büyük (patlama/kaos anları) |
| 4 | Bulutlar, yıldızlar, menü/kart arka planı | ~0,5–1 gün | Orta |
| 5 | Oyuncu ve boss'lar (offscreen doku) | ~0,5–1 gün | Düşük |
| 6 | Arayüz katmanını kirli bayrakla çizmek; sonuç kartındaki arka plan efektini katmanlar arası uyarlamak | ~1 gün | Orta |
| 7 | Gerçek cihaz ölçümü, `webglcontextlost/restored` işleme, Canvas 2D yedeği, Capacitor APK denemesi | ~1 gün | Güvenilirlik |

**Toplam: ~5–7 iş günü.** Her aşama sonunda oyun çalışır durumda kalır ve testler geçer (mantık testleri render'dan bağımsız).

### 15.4 Optimizasyon hedefleri ve ölçüm
- **Hedef**: orta seviye Android telefonda yoğun kaos + boss anında kararlı 60 FPS; kare süresi ≤16,7 ms, takılma (>33 ms kare) oranı <%1.
- **Ölçüm**: oyuna isteğe bağlı FPS/kare süresi göstergesi (geliştirici modunda); Chrome uzaktan hata ayıklama ile performans kaydı; aynı senaryonun (2 boss sonrası kaos, 300+ mermi) Canvas 2D ve PixiJS ile karşılaştırılması.
- **Ek kazanımlar**:
  - Doku atlası ile çizim çağrısı sayısı birkaç taneye iner.
  - Sprite havuzu mermi havuzuyla eşlenir, kare başına nesne üretimi olmaz.
  - Arayüz sadece değişince çizilir.
  - Mobilde ihtiyaç halinde çözünürlük ölçeği dinamik düşürülebilir (FPS düşerse 1,5 → 1,25).

### 15.5 Güvenlik açısından
WebGL'e geçmek kendi başına bir güvenlik önlemi değildir. Ama geçiş, mevcut güvenlik eksiklerini kapatmak için doğru zamandır ve yeni riskleri de beraberinde getirir:
- **Tedarik zinciri**: PixiJS CDN'den değil, **sürümü sabitlenmiş yerel dosya** olarak eklenmeli (bütünlüğü kontrol edilmiş, `package-lock` ile izlenen). Böylece çevrimdışı da çalışır ve üçüncü taraf betik riski olmaz.
- **Yazı tipini gömmek**: Google Fonts bağımlılığı kaldırılmalı (ağ isteği ve gizlilik).
- **Sıkı CSP**: tüm kaynaklar yerel olunca `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'` gibi sıkı bir politika eklenebilir. `innerHTML` kullanımı (geliştirici paneli) DOM API'lerine çevrilmeli.
- **Geliştirici modu**: yayın derlemesinde (`build:web`) tamamen çıkarılmalı ya da derleme bayrağıyla kapatılmalı.
- **WebGL kaynak yönetimi**: bağlam kaybı (mobilde arka plana alınınca) düzgün işlenmezse oyun siyah ekranda kalabilir. Doku sayısı ve boyutu sınırlandırılmalı (bellek tükenmesi riski).
- **İleride çevrimiçi skor**: istemci tarafındaki skor her zaman değiştirilebilir. Liderlik tablosu eklenirse sunucuda tekrar oynatma/doğrulama (ör. günlük modun tohumlu RNG'si + girdi kaydı) gerekir.

### 15.6 Riskler
- Derleme aracı olmadığı için PixiJS'in ES modülü sürümünün doğrudan tarayıcıda yüklenmesi gerekir (boyut ~200 KB sıkıştırılmış).
- İki katmanlı yapıda (WebGL + üst Canvas 2D) katmanlar arası efektler (ör. kartın içinde arka plan efekti) için düzenleme gerekir.
- Eski/zayıf cihazlarda WebGL sürücü hataları → Canvas 2D yedeği şart.
- Görsel eşdeğerlik otomatik test edilmiyor; her aşamada gözle karşılaştırma gerekir.

### 15.7 Değerlendirici için açık sorular
1. Aşama 0 (Canvas 2D'de önbellek görseller) tek başına mobilde yeterli olur mu, yoksa doğrudan PixiJS mi daha verimli?
2. PixiJS v8 mi (WebGPU/WebGL), yoksa daha olgun v7 mi tercih edilmeli? Capacitor WebView'larında hangisi daha güvenilir?
3. Arayüz Canvas 2D üst katmanda kalmalı mı, yoksa PixiJS `Text`/`BitmapText` ile tek katmana mı taşınmalı?
4. Render/mantık ayrımı (renderer adaptörü) bu boyutta bir proje için doğru soyutlama mı?
5. Uzun vadede (Steam + mobil) Godot'ya geçiş, PixiJS yatırımını gereksiz kılar mı?
