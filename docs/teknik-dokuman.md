# Bullet Hell Micro — Teknik Doküman

> **Amaç:** Bu doküman projenin bütün teknik yapısını, sistemlerini, verilerini ve bilinen sınırlarını tek yerde anlatır. Dışarıdan bir değerlendiricinin (insan ya da yapay zekâ) kodu açmadan mimariyi anlayıp öneri yapabilmesi için yazıldı.
> Son bölüm, hız, optimizasyon ve güvenlik için **WebGL'e (PixiJS) geçiş önerisini** içerir.
>
> **Durum notu:** Doküman yazıldığında çalışma dizininde henüz commit edilmemiş değişiklikler vardı: ekşi şekerler, üçüncü boss, mobil denge, geliştirici modu ve performans düzeltmeleri. Bunlar dokümana dahildir. `android/` klasörü ve Capacitor ayarları da projede bulunuyor ama git'e eklenmemiş.

---

## 1. Genel bakış

| Özellik | Değer |
|---|---|
| Tür | Tek ekranlı "bullet hell": mermilerden kaç, hayatta kal, skor yap |
| Tema | "Marshmallow Candy": marşmelov beyazı, mor, sakız pembesi; açık + koyu tema |
| Platform | Tarayıcı (masaüstü + mobil), Android (Capacitor ile APK) |
| Dil | Vanilla JavaScript (ES modülleri), HTML, CSS |
| Çizim | Tek `<canvas>` + **Canvas 2D API** (WebGL yok) |
| Ses | Web Audio API ile **tamamen prosedürel** (ses dosyası yok) |
| Bağımlılık | Çalışma zamanında **sıfır** kütüphane. Sadece Capacitor (Android paketleme) ve Google Fonts (Fredoka yazı tipi, CDN) |
| Derleme | Derleme/bundler yok; dosyalar doğrudan tarayıcıya ES modülü olarak gider |
| Kod boyutu | ~9.900 satır (`js/` + `css/`), 29 JS modülü |
| Test | Node'un yerleşik test koşucusu, 7 dosya, **60 test** |
| Dil desteği | Türkçe + İngilizce (çalışma anında değişir) |

---

## 2. Çalıştırma ve derleme

```bash
npm start            # node server.js → http://localhost:3000
npm test             # node --test tests/*.test.mjs
npm run build:web    # index.html + css/ + js/ → www/ (Capacitor için)
npm run apk          # build:web + cap sync android + gradlew assembleDebug
```

- **`server.js`**: Node'un yerleşik `http` ve `fs` modülleriyle yazılmış, bağımlılıksız statik sunucu. Port 3000, `Cache-Control: no-cache`. Sadece geliştirme için (bkz. §13 Güvenlik).
- **Capacitor**: `capacitor.config.json` → `appId: com.bullethellmicro.app`, `webDir: www`. `scripts/build-web.mjs` statik dosyaları `www/` içine kopyalar.
- **`.claude/launch.json`**: önizleme sunucusu tanımı (`node server.js`).
- `www/`, `node_modules/` ve `*.apk` `.gitignore`'da.

---

## 3. Klasör yapısı ve modüller

```
index.html            Tek sayfa: canvas + dokunmatik kontrol şeridi + birkaç HTML buton
css/style.css         Tema değişkenleri (açık/koyu), tam ekran yerleşim, kontrol şeridi, geliştirici paneli
js/                   Oyun (29 modül)
tests/                Node test dosyaları (*.test.mjs)
docs/                 Tasarım rehberleri, UX raporu, bu doküman
ux-preview/           Tasarım karşılaştırma sayfaları + sandbox.js (kayıtlara yazmayan test ortamı)
scripts/build-web.mjs Capacitor için www/ kopyalayıcı
server.js             Yerel geliştirme sunucusu
```

### 3.1 Modül sorumlulukları

| Modül | Satır | Sorumluluk |
|---|---|---|
| `main.js` | 43 | Giriş noktası; `Game` oluşturur, `requestAnimationFrame` döngüsü (dt tavanı 50 ms) |
| `game.js` | ~1150 | **Orkestratör**: durum makinesi, girdi, güncelleme sırası, çizim sırası, ölüm, ödüller, alt şerit senkronu, arka plan katmanı |
| `config.js` | ~360 | **Tüm ayarlanabilir sayılar**: oyuncu, fazlar, 3 boss, güçlendirmeler, ekşi şekerler, testere, para, mobil denge, performans, modlar |
| `arena.js` | ~40 | Mantıksal arena boyutu (yükseklik sabit 600, genişlik ekran oranına göre), DPR, tuval dönüşümü, güvenli alanlar |
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
| `devMode.js` | ~170 | Geliştirici modu (`?dev`): ölümsüzlük, boss'a atlama, kayıtlar kapalı |

---

## 4. Çekirdek mimari

### 4.1 Oyun döngüsü
`main.js` her `requestAnimationFrame`'de `game.update(dt)` ve `game.render()` çağırır. `dt` saniye cinsindendir ve 0,05 s ile sınırlıdır (sekme dönüşünde ışınlanma olmasın diye). Simülasyon süresi (`elapsedMs`) sadece `PLAYING` durumunda ilerler. Yavaş çekim, `pickupManager.getSpeedFactor()` ile mermi/boss/para güncellemelerine çarpan olarak uygulanır.

### 4.2 Durum makinesi
`GAME_STATE = MENU | PLAYING | PAUSED | DEAD`

- `MENU → PLAYING` (`startGame`): oyuncu/mermi/dalga/skor/şeker sıfırlanır; dokunmatik destek bayrağı dalga yöneticisine verilir; "cihazı çevir" ipucu 3,5 sn gösterilir.
- `PLAYING ↔ PAUSED`: dünya donar; devam ederken 1,5 sn geri sayım.
- `PLAYING → DEAD` (`triggerDeath`): ölüm nedeni (kenar/boss/mermi), patlama efekti, rekor/hayalet/istatistik/şeker kaydı (geliştirici modunda kayıt yok), 650 ms sonra sonuç kartı belirir.
- `DEAD → PLAYING` sadece "tekrar oyna" butonu, Enter veya Space ile; `DEAD → MENU` kart içindeki "ana menü" ya da M tuşu ile.

### 4.3 Koordinat sistemi ve çözünürlük
- Mantıksal arena: **yükseklik 600 birim**, genişlik = `600 × ekranGenişliği / ekranYüksekliği`. Dikey telefonda ~277 birim, geniş masaüstünde ~1000 birim.
- `arena.js` tuval piksel boyutunu `CSS boyutu × DPR` yapar. DPR tavanı masaüstünde 2, dokunmatik cihazda (`pointer: coarse`) **1,5**. Mantıksal → piksel ölçeği tek bir `setTransform` ile verilir.
- `ResizeObserver` boyut değişince arenayı yeniden ölçer; oyuncu konumu oransal korunur.
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

### 4.5 Çizim sırası (her kare tam yeniden çizim)
1. **Arka plan katmanı** (önbellekli, yarı çözünürlük, 4 karede bir yenilenir): zemin rengi / koyu temada gökyüzü geçişi + pastel bulutlar
2. Menüde: etkileşimli arka plan · Oyunda: yıldızlar (koyu tema) + yaylı benek ızgarası
3. Uyarı lazerleri → güçlendirmeler/ekşi şekerler → paralar → boss → hayalet
4. Mermiler (koyu temada önbellekli hale görseli) → oyuncu → seri/puan baloncukları
5. Efektler (parçacık, şok dalgası, flaş, afiş)
6. Arayüz katmanı (menü / HUD + kenar uyarısı + ipucu + boss barı + duraklatma / sonuç kartı)
7. Oyun içinde: arena çerçevesi + yaklaşılan kenarın pembe vurgusu

Ekran sarsıntısı (`effects.preRender`) arka plandan sonra uygulanır, böylece saydam olmayan tuvalde kenarda siyah şerit oluşmaz.

---

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
- Adres `?dev` içerince (`?dev=0` hariç) solda bir panel açılır. Dar ekranda kapalı başlar.
- Ölümsüzlük (açılışta açık; aynı çarpmanın tekrarları tek sayılır), boss'a atlama (Jöle/Bulut/Sakız), AĞIR/DEV uygula, ekşi şeker bırak, kalkan +1, mermileri temizle, turu bitir.
- **Geliştirici modunda rekor, hayalet, istatistik, kostüm başarımı ve şeker kaydedilmez.**
- Bu mod normal adreste yüklenmez ama koddan çıkarılmış da değildir (bkz. §13).

## 12. Testler
`node --test tests/*.test.mjs`, 7 dosya, 60 test. DOM gerektirmeyen mantık test edilir:
- `boss.test.mjs`: boss girişi, hasar modeli, aşamalar, 3 boss rotasyonu, Pamuk Bulut desenleri, Sakız Balon (balon patlaması, sekme, boşluklu halka), mobil yoğunluk ölçeği
- `mobile.test.mjs`: kalkan kuralları, ekşi şeker etkileri (yavaşlama, imleç takibi, büyüme/küçülme, kalkanın engellememesi, süzülme)
- `features.test.mjs`: skor, modlar, günlük RNG, i18n, kostümler, geliştirici modu
- `ui.test.mjs`: menü yerleşimleri, ≥44 px dokunma hedefleri, sonuç kartı butonları, odak sırası
- `theme.test.mjs`, `menuBackdrop.test.mjs`, `audio.test.mjs`

Görsel doğrulama otomatik değil; `ux-preview/sandbox.js` kayıtlara yazmayan bir test ortamı ve senaryo kısayolları (menü, oyun, boss, ölüm) sağlar.

## 13. Mevcut performans önlemleri ve bilinen sınırlar

**Yapılmış optimizasyonlar**
- Mermi nesne havuzu (çöp toplayıcı baskısı az).
- Kapsül mermi ve koyu tema mermi halesi önceden çizilip görsel olarak önbelleğe alınır.
- Arka plan (zemin + büyük pastel bulut degradeleri) yarı çözünürlüklü ayrı katmanda, 4 karede bir yeniden çizilir. Önceden her karede yaklaşık 3 tam ekran degrade boyanıyordu.
- Dokunmatik cihazlarda DPR tavanı 1,5 (2'ye göre ~%44 daha az piksel).
- Tuval `alpha: false` ile açılır.
- Alt şerit DOM yazımı saniyede en fazla 10 kez, DASH halkası sadece değişince yazılır.
- Kaos ayarı ve sayımlarda her kare yeni nesne üretimi kaldırıldı; graze sesi sınırlandı.

**Bilinen sınırlar / teknik borç**
- **Canvas 2D**: her mermi, parçacık, şeker ve yüz her karede tek tek yol (path) olarak çizilir. Yoğun anlarda (yüzlerce mermi + patlama parçacıkları) çizim komutu sayısı çok yükselir. Telefonlarda takılmanın ana kaynağı budur. JS mantığı ölçümde kare başına <0,1 ms, çizim komut üretimi ~0,8 ms (masaüstü). Asıl maliyet tarayıcının bu komutları rasterleştirmesidir ve JS'ten ölçülemez.
- Arayüz (menü, kart, HUD) değişmese bile her karede yeniden çizilir.
- Boss ve oyuncu yüzleri her karede vektör olarak çizilir.
- Gerçek cihaz performans ölçümü yapılmadı; ölçümler masaüstü tarayıcıda telefon boyutu emülasyonuyla yapıldı.
- `game.js` ve `ui.js` büyük dosyalar (~1.200 satır); çizim ile mantık aynı sınıflarda.
- Görsel regresyon testi yok.

## 14. Güvenlik notları (mevcut durum)
- **Sunucu yok, hesap yok, ağ isteği yok** (Google Fonts hariç). Oyun tamamen istemci tarafında çalışır.
- **Skorlar ve şeker localStorage'da düz JSON**: kullanıcı tarayıcı araçlarıyla değiştirebilir. Şu an çevrimiçi liderlik tablosu olmadığı için risk yalnızca kişisel. Liderlik tablosu eklenirse sunucu tarafı doğrulama şart olur.
- **Harici kaynak**: Fredoka yazı tipi `fonts.googleapis.com`'dan yüklenir. Bu hem çevrimdışı çalışmayı bozar hem de üçüncü tarafa istek gönderir. Yazı tipi projeye gömülmeli (OFL lisansı izin verir).
- **CSP yok**: `index.html` bir Content-Security-Policy tanımlamıyor. Kod `innerHTML`'i yalnızca geliştirici panelinde, sabit metinle kullanır; kullanıcı girdisi DOM'a yazılmaz.
- **Geliştirici modu yayın paketinde mevcut**: `?dev` ile açılır. Kayıt yapmadığı için skor hilesine yol açmaz ama yayın derlemesinde tamamen kapatılması önerilir.
- **`server.js` sadece geliştirme içindir**: proje klasöründeki her dosyayı sunar (ör. `.git/`, `node_modules/`), yol temizliği basittir. İnternete açılmamalı; yayın için statik barındırma ya da Capacitor/Electron paketi kullanılmalı.
- Paylaşım yalnızca metin üretir (`navigator.share` / pano); dışarıdan veri okunmaz.

---

## 15. Öneri: Hız, optimizasyon ve güvenlik için WebGL'e (PixiJS) geçiş

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
