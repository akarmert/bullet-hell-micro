# Bullet Hell Micro — UI/UX Analizi ve İyileştirme Planı

**Tarih:** 19 Kasım 2026 · **Kapsam:** Tüm arayüz, etkileşim ve erişilebilirlik · **Durum:** Aşama 1 (K1–K6) oyuna uygulandı; Aşama 2 ve 3 öneri olarak bekliyor.

> **Uygulama notu (Aşama 1):** K1–K6 kalıcı koda taşındı (`ui.js`, `game.js`, `theme.js`, `collision.js`, `i18n.js`, `style.css`) ve `tests/ui.test.mjs` ile test edildi. Uygularken iki ek düzeltme yapıldı: telefonda ayarlar butonu ve kostüm okları 44 px hedefine çıkarıldı, uzun kontrol ipuçları sıkıştırılmak yerine satırlara bölündü. Bu yüzden `ux-preview/compare.html` içindeki **"eski"** taraf artık Aşama 1'i içeren güncel oyunu gösterir; ilk karşılaştırma için git geçmişindeki önceki sürüme bakılabilir.

## Yöntem ve sınırlar

- **Yapılanlar:** Kodun satır satır incelenmesi; renk kontrast oranlarının WCAG formülüyle hesaplanması; yazı ve dokunma hedeflerinin üç ekran boyutunda (telefon dikey 390×844, telefon yatay 844×390, masaüstü 1280×720) gerçek CSS piksel karşılıklarının hesaplanması; tüm ekranların tarayıcıda ekran görüntüsüyle incelenmesi; yeni etkileşimlerin otomatik olarak denenmesi.
- **Yapılmayanlar:** **Gerçek kullanıcı testi yapılmadı.** Aşağıdaki "kullanıcıya etkisi" sütunu, ölçümlere ve yerleşik kullanılabilirlik ilkelerine dayanan **beklentidir**, doğrulanmış bulgu değildir. Gerçek dokunmatik cihazda, ekran okuyucuyla ve gamepad ile deneme yapılmadı.
- Her bulgunun **Kanıt** sütununda kaynağı belirtilmiştir: ⓜ ölçüm, ⓚ kod incelemesi, ⓖ ekran görüntüsü, ⓥ varsayım (doğrulanması gerekir).

## Eski / yeni karşılaştırma önizlemesi

Önerilen tasarımlar mevcut dosyalara **dokunmadan**, ayrı bir klasörde çalışan bir önizleme olarak hazırlandı:

```
ux-preview/
  compare.html   ← eski ve yeni yan yana; cihaz boyutu + senaryo seçimi + açıklamalar
  old.html       ← mevcut oyun (değişmemiş kod)
  new.html       ← aynı oyun + öneri yamaları
  new-main.js    ← tüm öneriler (K1–K6, D1–D6), çalışma anında yama
  new.css        ← önerilen CSS farkları
  sandbox.js     ← önizlemenin rekor/ilerleme/ayar kaydetmesini engeller
```

Açmak için: sunucuyu başlat (`npm start`) ve `/ux-preview/compare.html` adresine git. İki pencerede de gerçek oyun çalışır, içlerinde oynanabilir. **Önizleme kayıtlarına hiçbir şey yazmaz.** Klasörü silmek her şeyi geri alır.

---

## 1. Genel değerlendirme

**Güçlü yanlar (korunmalı):**
- Tutarlı görsel dil: koyu konturlu "şeker çıkartma" stili, tek palet, yuvarlak yazı tipi.
- Tehlikeler **şekille** ayrışıyor (top, donut, damla, çubuk); renk körlüğünde de okunur.
- Ölümcül saldırılardan önce uyarı lazeri; kenara yaklaşınca kenar uyarısı.
- Odak kaybında otomatik duraklatma, dönüşte 1.5 sn geri sayım.
- Dokunmatik joystick + bekleme halkalı DASH butonu, güvenli alan boşlukları.
- İlk oyun ipuçları; ayarlarda ses, sarsıntı/flaş, yüksek kontrast, dil.
- Önemli sesli olayların görsel karşılığı var (boss uyarısı bildirimi, dash çubuğu, graze parçacıkları).

**Temel sorunlar:**
1. **Telefonda menü ve ayarlar okunamayacak kadar küçük.** Menü sabit 600×600 alana çiziliyor; dikey telefonda %65'e küçülüyor → 11 px yazılar ≈ **7 CSS px**, ayarlar butonu ≈ **70×22 px**. ⓜ
2. **Kontrast yetersiz:** ikincil metin **3.04:1**, pembe üstünde beyaz metin **2.58:1** (küçük metin için gereken 4.5:1). ⓜ
3. **Kazara eylemler:** menüde boş alana tıklamak oyunu başlatıyor; sonuç ekranında her yere tıklamak yeni turu başlatıyor. ⓚ
4. **Klavye/gamepad ile mod seçilemiyor**, tuvaldeki arayüzde odak göstergesi yok. ⓚ
5. **"Neden öldüm?" bilinmiyor:** kenara değince ölmek oyuna özgü bir kural ama hiçbir yerde gösterilmiyor. ⓚ

---

## 2. Sorun ve çözüm tablosu

Öncelik: **Y** yüksek · **O** orta · **D** düşük. "Önizleme" sütunu, değişikliğin `compare.html` içinde görülebilir olup olmadığını belirtir.

| # | Alan | Mevcut sorun | Kullanıcıya etkisi | Önerilen çözüm | Öncelik | Kanıt | Önizleme |
|---|---|---|---|---|---|---|---|
| **K1** | Ana menü | Boş bir yere tıklamak/dokunmak oyunu başlatıyor (`getMenuAction` → `null` → `startGame`). | Çocuklar ve dokunmatik kullanıcılar mod seçerken ıskalayınca istemeden oyun başlar; ayarlar butonunu ıskalayan oyuncu kendini oyunda bulur. | Oyun sadece **OYNA** butonu ve Enter/Space ile başlasın; boş alan hiçbir şey yapmasın. | Y | ⓚ | ✓ |
| **K2** | Ana menü (telefon) | 600×600 sabit yerleşim ekrana sığdırılınca küçülüyor. Dikey telefonda: yazılar 7–9 px, mod kartları 130×39 px, kostüm okları ~26 px, ayarlar butonu ~70×22 px. Yatay telefonda da 11 px yazı ≈ 7 px. | Yaşlı kullanıcılar ve az gören oyuncular menüyü okuyamaz; küçük hedefler motor güçlüğü olanlarda ıskalamaya yol açar. | Üç yerleşim (kare / geniş iki sütun / dikey); ekrana **en büyük ölçekte** sığanı seçilir. En küçük yazı 13 px, hedefler ≥ 44 CSS px. | Y | ⓜⓖ | ✓ |
| **K3** | Tüm ekranlar | İkincil metin `#9C86B8` zeminde 3.04:1, beyaz kartta 3.22:1. Pembe dolguda beyaz metin 2.58:1 (seçili mod kartı, skor hapı, PAYLAŞ). Küçük koyu pembe metin 3.51:1, küçük mor metin 4.36:1. | Düşük kontrast; parlak ortamda (telefon, dışarıda) ve yaşla azalan kontrast duyarlılığında okunmaz. | İkincil metin `#6F5A8C` (5.63:1); pembe dolguda koyu mürekkep metin (4.39:1); küçük vurgu metinleri için yeni jetonlar `#C2185B` (5.54:1) ve `#6A3FC8`. | Y | ⓜ | ✓ |
| **K4** | Ana menü | Klavye ile sadece Enter (oyunu başlat), ←→ (kostüm), O (ayarlar) var; **mod seçilemiyor**. Gamepad'de sadece A/Start. Tuvaldeki butonlarda odak göstergesi yok. | Fare kullanamayanlar, klavye/switch kullanıcıları ve gamepad oyuncuları modlara erişemez (WCAG 2.1.1, 2.4.7). | ↑ ↓ / Tab ile odak sırası (modlar → OYNA → kostüm → ayarlar), Enter/Space ile seçim, kesikli odak çerçevesi. Gamepad d-pad'i aynı sisteme bağlanmalı (D8). | Y | ⓚ | ✓ (klavye) |
| **K5** | Oyun bitti | Ölüm nedeni gösterilmiyor. Kenara değince ölmek sezgisel değil. | İlk kez oynayan "mermiye değmedim, neden öldüm?" der; kural öğrenilmez, haksızlık hissi oluşur. | Sonuç kartında neden hapı: "🧱 kenara çarptın" / "🍬 şekere çarptın" / "👑 Jöle Kral ile çarpıştın". | Y | ⓚ | ✓ |
| **K6** | Oyun bitti | Ekranın herhangi bir yerine tıklamak 0.65 sn sonra yeni turu başlatıyor. | Oyun sırasında hızlı tıklayan oyuncu (özellikle çocuklar) sonucunu göremeden yeni tura girer. | Belirgin "↻ TEKRAR OYNA" butonu; sadece buton, Enter ve Space yeniden başlatır. | O–Y | ⓚ | ✓ |
| **D1** | Menü, sonuç ekranı | Fareyle butonların üstüne gelince görsel tepki yok; imleç her yerde artı (crosshair). | Nelerin tıklanabilir olduğu belirsiz; teknolojiye alışkın olmayanlar için keşfetmek zor. | Üstüne gelince kalkma + kalın kontur; butonlarda el imleci, oyunda artı imleç. | O | ⓚ | ✓ |
| **D2** | Menü, sonuç ekranı | Dokunmatik cihazda da "fare · WASD · sağ tık · shift", "tıkla · space · enter", "M / ESC" yazıyor. | Telefonda anlamsız talimatlar; öğrenmeyi zorlaştırır. | Cihaza göre metin: dokunmatikte "joystick → hareket · DASH butonu"; sonuç ekranında klavye satırı gizlenir. | O | ⓚ | ✓ ("dokunmatik gibi göster" ile) |
| **D3** | Ayarlar | Panel menü ölçeğini kullanıyor; telefonda satırlar ~27 px. | Erişilebilirlik ayarlarının kendisi zor kullanılıyor. | Panel kendi ölçeğiyle ekranın %94'üne kadar büyür. | O–Y | ⓜⓖ | ✓ |
| **D4** | Oyun içi HUD (yatay telefon) | 1 mantıksal px ≈ 0.65 CSS px: HUD yazıları ~7 px. | Oynarken skor, kalkan, dash durumu okunmaz. | Ekran küçük ölçekteyse HUD otomatik büyür (en az 0.95 CSS px). | O | ⓜⓖ | ✓ |
| **D5** | Genel | "Yatay oynamak için cihazı çevir" masaüstünde dar/uzun pencerede de çıkıyor. | Masaüstü kullanıcısı için anlamsız uyarı. | Sadece dokunmatik cihazlarda göster. | D | ⓖ | ✓ |
| **D6** | Ana menü | Hiç oynanmamış modlarda "en iyi ★ 0". | Yeni oyuncuya anlamsız bilgi. | "henüz oynanmadı". | D | ⓖ | ✓ |
| **D7** | Duraklatma, boss barı | D4 ile aynı ölçek sorunu yatay telefonda duraklatma kartında ve boss barında da var. | Yatay telefonda okunmaz. | D4'teki ölçek yardımcısı bunlara da uygulanmalı. | O | ⓜ | — |
| **D8** | Gamepad | Menüde gezinme ve ayarlar gamepad ile erişilemez. | Gamepad oyuncusu modu değiştiremez. | D-pad ↑↓ = K4 odak sistemi, A = seç, B = geri, Start = OYNA. | O | ⓚ | — |
| **D9** | Terimler | "graze" İngilizce bir oyun terimi; sadece ilk oyun ipucunda açıklanıyor. | Çocuklar ve ileri yaştakiler için anlamsız. | İlk kullanımda kısa açıklama, duraklatma ekranındaki yardım kartında (D10) sözlük satırı. | D–O | ⓥ | — |
| **D10** | Yardım | Oyun içinde yardım yok; ipuçları yalnızca ilk turda bir kez. | Oyuncu kuralı unutursa (kenar ölümü, dash) tekrar öğrenecek yer yok. | Duraklatma kartına küçük "nasıl oynanır" bölümü: kontroller (cihaza göre), "kenarlar ölümcül", graze ve dash. | O | ⓚ | — |
| **D11** | Hareket azaltma | İşletim sisteminin "hareketi azalt" tercihi dikkate alınmıyor; menüdeki süzülme ve nabız animasyonları ayarla kapatılamıyor. | Hareket hassasiyeti olanlarda rahatsızlık. | `prefers-reduced-motion` açıksa "sarsıntı ve flaş" varsayılan kapalı; bu ayar menü animasyonlarını da durdursun. | O | ⓚ | — |
| **D12** | Zaman baskısı | Oyunu yavaşlatan bir yardım seçeneği yok. | Motor/bilişsel güçlüğü olanlar, çocuklar ve yeni başlayanlar ilk fazı geçemeyebilir. | **Karar gerektirir:** isteğe bağlı "rahat mod" (oyun hızı %75, rekorlar ayrı). Oynanışı etkilediği için onay gerekir. | O | ⓥ | — |
| **D13** | Fare kontrolü | Karakter imleci birebir takip ediyor; imleci hızla kenara veya pencere dışına götürmek anında kenar ölümüne yol açar. | Fareye alışkın olmayanlar beklenmedik şekilde ölür. | **Karar gerektirir:** (a) imleç hedefini kenardan 8 px içeride sınırlamak veya (b) sadece kenar uyarısını güçlendirmek. (a) oynanışı değiştirir. | O | ⓚⓥ | — |
| **D14** | Duraklatma | Duraklatmada "baştan başla" yok; yeniden başlamak için menü → OYNA gerekiyor. | Gereksiz adım. | Duraklatma kartına "↻ baştan başla" (R tuşu). | D–O | ⓚ | — |
| **D15** | Duraklatma | Duraklatmadayken "ANA MENÜ" butonu turu onaysız bitiriyor. | Kazara dokunuşla tur kaybı. | Tek dokunuşta "emin misin? ana menü / vazgeç" satırına dönüşen buton. | D | ⓚ | — |
| **D16** | Ölçekleme | Yazı boyutu ayarı yok. | Az gören kullanıcılar arayüzü büyütemez. | Ayarlara "arayüz boyutu: normal / büyük" (D4 ölçek yardımcısını kullanır). | O | ⓚ | — |
| **D17** | İlk deneyim | İlk ipucu oyun başladıktan 0.3 sn sonra, mermiler zaten gelirken çıkıyor. | Yeni oyuncu aynı anda okumaya ve kaçmaya çalışır. | **Karar gerektirir:** sadece ilk turda ~2 sn hazırlık (ipucu görünür, mermi yok). | D–O | ⓚ | — |

---

## 3. Eski / yeni tasarım karşılaştırmaları

Tümü `ux-preview/compare.html` içinde, gerçek uygulama üzerinde yan yana ve etkileşimli olarak görülebilir. Cihaz düğmeleri ve "dokunmatik gibi göster" seçeneği farkları farklı koşullarda gösterir.

| Senaryo | Eski | Yeni | Değişiklikler | Gerekçe | Kullanıcıya faydası |
|---|---|---|---|---|---|
| **Ana menü** | 600×600 tek yerleşim; telefonda küçük; boş tıklama oyunu başlatır | Ekrana göre kare / geniş / dikey yerleşim; koyu ikincil metin; seçili kartta koyu yazı ve ✓; odak çerçevesi; üstüne gelme efekti | K1, K2, K3, K4, D1, D2, D6 | Telefonda okunurluk ve dokunma hedefleri; kontrast; kazara başlatma; klavye erişimi | Her yaş için okunur, yanlışlıkla başlamayan, klavyeyle de kullanılabilen menü |
| **Ayarlar** | Telefonda küçük panel | Ekrana göre büyüyen panel | D3, K3 | Satır yüksekliği ~27 px → ~40 px | Erişilebilirlik ayarlarına kolay erişim |
| **Oyun içi (HUD)** | Yatay telefonda ~7 px yazı | Otomatik büyüyen HUD; pembe hapta koyu yazı | D4, K3 | Oynarken bilgi okunamıyor | Skor ve durum bir bakışta okunur |
| **Oyun bitti (şeker)** | Her yere tıklamak yeniden başlatır; neden yok | Neden hapı, "↻ TEKRAR OYNA" butonu, dokunmatikte klavye satırı yok | K5, K6, D2, K3 | Kazara yeniden başlatma; kural öğrenimi | Oyuncu ne olduğunu anlar, sonucunu okur |
| **Oyun bitti (kenar)** | Neden yok | "🧱 kenara çarptın" | K5 | Sezgisel olmayan kural görünür olur | İlk ölümde kural öğrenilir |
| **Duraklatma** | — | Bilinçli olarak değiştirilmedi | — | Dikey telefonda yeterli; yatay telefon için D7 önerildi | — |

Önizlemede doğrulanan davranışlar (otomatik deneme):
- Boş alana tıklama → menüde kalır ✓
- ↓ ↓ Enter → ENDLESS seçilir, oyun başlamaz ✓ · odak OYNA'da Enter → başlar ✓ · odak yokken Enter → eskisi gibi başlar ✓ · Tab / Shift+Tab ✓
- Sonuç ekranında buton dışına tıklama → yeniden başlamaz ✓ · butona tıklama → başlar ✓
- Ölüm nedeni: mermi → "şeker", kenar → "kenar" ✓
- Yerleşim seçimi: dikey telefon → dikey, yatay telefon ve masaüstü → geniş ✓

---

## 4. Kullanıcı akışı değerlendirmesi

| Görev | Mevcut adımlar | Sorun | Önerilen akış |
|---|---|---|---|
| Oyunu ilk kez açma | Menü açılır; müzik ilk dokunuşta başlar | Telefonda menü küçük (K2); amaç tek satır açıklamada | K2 ile okunur menü; açıklama 15 px |
| Oyuna başlama | OYNA'ya tıkla **veya ekranın herhangi bir yerine** | Kazara başlatma (K1) | Sadece OYNA / Enter / Space |
| Mod değiştirme | Karta tıkla → OYNA | Klavye/gamepad ile mümkün değil (K4, D8) | ↑↓/Tab + Enter; gamepad d-pad |
| Kuralları öğrenme | İlk turda 3 ipucu, sonra yok | Kenar kuralı ölümle bile öğrenilmiyor (K5); tekrar bakacak yer yok (D10) | Ölüm nedeni + duraklatmada yardım kartı |
| Kontrolleri keşfetme | Menüde 2 satır ipucu | Dokunmatikte yanlış ipuçları (D2) | Cihaza göre ipucu |
| Yanlış işlemden dönme | — | Kazara başlatma/yeniden başlatma geri alınamıyor (K1, K6); duraklatmada menüye dönüş onaysız (D15) | K1 + K6 + D15 |
| Ayarları değiştirme | ⚙ ayarlar → satır → ←→ | Telefonda küçük (D3); hareket azaltma OS'tan gelmiyor (D11) | D3 + D11 |
| Oyun sırasında yardım | Yok | (D10) | Duraklatma kartında "nasıl oynanır" |
| Çıkma / yeniden başlama | Duraklat → M (klavye) veya ANA MENÜ; baştan başlamak 2 adım | (D14) | Duraklatmada "↻ baştan başla" |

---

## 5. Kullanıcı grupları

| Grup | Mevcut durumda en büyük engel | En çok fayda sağlayan öneriler |
|---|---|---|
| Oyunlara yeni başlayan çocuklar | Kazara başlatma/yeniden başlatma; okunmayan küçük yazılar; "graze" terimi | K1, K6, K2, K5, D9 |
| Genç, deneyimli oyuncular | Telefonda küçük HUD (yatay); sonuç ekranında hızlı tekrar | D4; K6'da Enter/Space korunur, hız kaybı olmaz |
| Oyun deneyimi az yetişkinler | Kenar kuralı; neyin tıklanabilir olduğu | K5, D1, D10 |
| Teknolojiye alışkın olmayanlar | Telefonda anlamsız tuş ipuçları; küçük hedefler | D2, K2, D3 |
| İleri yaştakiler | Kontrast ve yazı boyutu; hızlı tempo | K3, K2, D16, D12 (karar) |
| Görme ihtiyaçları | Düşük kontrast; ölçekleme yok | K3, D16, yüksek kontrast modu (mevcut) |
| İşitme ihtiyaçları | Önemli seslerin görsel karşılığı büyük ölçüde var | Durum iyi; menüde ses kapalı göstergesi eklenebilir |
| Motor beceri ihtiyaçları | Küçük hedefler; fareyle kenar ölümü; zaman baskısı | K2, K4, D13 (karar), D12 (karar) |
| Bilişsel ihtiyaçlar | Aynı anda okuma ve kaçma; tek seferlik ipuçları | D17 (karar), D10, K5 |

---

## 6. Erişilebilirlik değerlendirmesi

WCAG 2.2, gerçek zamanlı oyun bağlamına uyarlanarak uygulandı (ör. zaman sınırı kuralı aksiyon oyunlarında "zorunlu" istisnaya girer, bu yüzden "isteğe bağlı rahat mod" olarak ele alındı).

| Kriter | Durum | Ayrıntı |
|---|---|---|
| 1.4.3 Kontrast (asgari) | ✗ | 3.04:1 ikincil metin, 2.58:1 pembe üstünde beyaz, 3.51:1 küçük koyu pembe → K3 |
| 1.4.11 Metin dışı kontrast | ✓ | Tüm öğelerde `#4B2A6E` kontur (zeminde 10.68:1) |
| 1.4.1 Rengin tek başına kullanımı | Kısmen | Mermiler şekille ayrışıyor ✓; seçili mod sadece renkle belirtiliyor → yeni tasarımda ✓ işareti |
| 1.4.4 Metni yeniden boyutlandırma | ✗ | Tuval arayüzünde ölçek ayarı yok → D16 |
| 2.1.1 Klavye | ✗ menü / ✓ oyun | Mod seçimi klavyeyle yapılamıyor → K4 |
| 2.4.7 Görünür odak | ✗ tuval / ✓ HTML | HTML butonlarında `:focus-visible` var; tuvalde yok → K4 |
| 2.5.8 Hedef boyutu (asgari, 24 px) | ✗ | Dikey telefonda ayarlar butonu ~22 px yükseklik; 44 px (AAA) hedefinin altında birçok öğe → K2, D3 |
| 2.3.1 Üç flaş | ✓ | Ölüm flaşı tek seferlik, saniyede 3'ün altında |
| 2.3.3 Etkileşimden kaynaklı animasyon | Kısmen | Sarsıntı/flaş kapatılabiliyor; OS tercihi ve menü animasyonları kapsam dışı → D11 |
| 2.2.1 Zamanlama ayarlanabilir | İstisna | Gerçek zamanlı oyun; isteğe bağlı rahat mod önerisi → D12 |
| 3.3.1 / 3.3.3 Hata tanımlama ve öneri | ✗ | Ölüm nedeni yok → K5 |
| Sesli uyarıların görsel karşılığı | ✓ | Boss uyarısı, faz, dash hazır, graze → hepsinin görsel karşılığı var |
| Ekran okuyucu | Sınırlı | Tuval oyun içeriği ekran okuyucuya kapalı (aksiyon oyunu için beklenen); HTML butonlarında ARIA etiketleri ✓ |

---

## 7. Önceliklendirilmiş uygulama planı

### Aşama 1 — Kritik iyileştirmeler

| # | Beklenen fayda | Zorluk | Bağımlılık |
|---|---|---|---|
| K1 Boş alana tıklama oyunu başlatmasın | Kazara başlatmanın tamamen ortadan kalkması | Çok düşük (tek satır) | — |
| K3 Kontrast jetonları | Tüm küçük metinler 4.5:1 üstü | Düşük (tema jetonları + hap metin rengi) | — |
| K5 Ölüm nedeni | Kenar kuralının öğrenilmesi | Düşük | — |
| K6 Açık "tekrar oyna" butonu | Kazara yeniden başlatmanın bitmesi | Düşük–orta | — |
| K2 Ekrana uyan menü yerleşimleri | Telefonda okunur menü, ≥44 px hedefler | Orta | — |
| K4 Klavye ile menüde gezinme ve odak | Klavye erişimi | Orta | K2 (yerleşim tanımlarını kullanır) |

### Aşama 2 — Kullanıcı deneyimi iyileştirmeleri

| # | Beklenen fayda | Zorluk | Bağımlılık |
|---|---|---|---|
| D3 Ayarlar paneli ölçeği | Telefonda kullanılabilir ayarlar | Düşük | K2 ile birlikte |
| D2 Cihaza göre ipuçları | Dokunmatikte doğru talimatlar | Düşük | — |
| D4 + D7 Arayüz ölçek yardımcısı (HUD, duraklatma, boss barı) | Yatay telefonda okunur oyun içi bilgi | Orta | — |
| D16 Arayüz boyutu ayarı | Az gören kullanıcılar | Düşük | D4 yardımcısı |
| D10 Duraklatmada yardım kartı | Kuralları tekrar öğrenme | Düşük–orta | D2 (cihaza göre metin) |
| D14 + D15 Duraklatmada baştan başla, menüye onay | Daha az adım, daha az kayıp | Düşük | — |
| D11 Hareket azaltma | Hareket hassasiyeti | Düşük | — |
| D8 Gamepad ile menü | Gamepad erişimi | Orta | K4 |
| D12, D13, D17 | **Oynanışı etkiler, ayrıca onayın gerekir** | Düşük–orta | — |

### Aşama 3 — Görsel ve deneyimsel iyileştirmeler

| # | Beklenen fayda | Zorluk |
|---|---|---|
| D1 Üstüne gelme durumları ve imleçler | Tıklanabilirlik netleşir | Düşük |
| D5 Masaüstünde "cihazı çevir" gizleme | Gereksiz uyarı kalkar | Çok düşük |
| D6 "henüz oynanmadı" | Daha anlamlı ilk izlenim | Çok düşük |
| D9 Terim açıklamaları | Çocuklar ve ileri yaştakiler | Düşük |

**Teknik not:** Önizlemedeki yamalar doğrudan kalıcı koda taşınabilir. `ui.js` içinde `renderMenu`, `getMenuAction`, `renderDead` ve `setLayout` güncellenir; `theme.js`'e iki yeni metin jetonu eklenir; `game.js`'te ölüm nedeni kaydedilir; menü klavye gezintisi oyunun tuş işleyicisine taşınır. Mevcut 26 test etkilenmez. Yeni yerleşim seçimi ve tıklama eşlemesi için birim testleri eklenmelidir.

---

## 8. Doğrulama kriterleri

**Otomatik / ölçülebilir:**
- [ ] Tüm küçük metinler (< 18.66 px kalın / < 24 px normal) zemine karşı ≥ 4.5:1; büyük metinler ≥ 3:1.
- [ ] Dikey telefonda (390×844) en küçük arayüz metni ≥ 12 CSS px; tüm dokunma hedefleri ≥ 44×44 CSS px.
- [ ] Yatay telefonda (844×390) HUD metinleri ≥ 10 CSS px.
- [ ] Menüdeki her öğeye klavyeyle erişilebiliyor ve odak görünüyor; Enter ile etkinleşiyor.
- [ ] Menüde boş alana tıklama durumu değiştirmiyor; sonuç ekranında sadece buton/Enter/Space yeniden başlatıyor (birim testi).
- [ ] Üç ekran boyutunda ekran görüntüsü karşılaştırması: metin taşması ve çakışma yok (TR ve EN).

**Kullanıcı testi** (önerilen: her gruptan 1–2 kişi, toplam 6–8 kişi, sesli düşünme yöntemi, telefon ve masaüstü):

| Görev | Başarı ölçütü |
|---|---|
| Yardım almadan ilk oyunu başlatmak | %100 başarı, < 10 sn |
| Modu HARDCORE yapıp başlatmak | ≥ %90 başarı; kazara başlatma 0 |
| Müziği kapatıp efekt sesini %50 yapmak | ≥ %90 başarı, < 30 sn |
| İlk ölümden sonra "neden öldün?" sorusunu doğru cevaplamak | ≥ %90 |
| Sonuç ekranında skoru okuyup bilerek yeniden başlamak | Sonucu görmeden yeniden başlama 0 |
| Klavyeyle (fare yok) mod seçip oyunu başlatmak | %100 |

Ek olarak: SUS (Sistem Kullanılabilirlik Ölçeği) ≥ 75; ilk 3 turda "kafam karıştı" anlarının not edilmesi.

---

## 9. Doğrulanmış ↔ varsayım ayrımı

- **Doğrulandı (ölçüm/kod/ekran):** K1, K2, K3, K4, K5, K6, D1–D8, D11, D14–D17 bulguları; önizlemedeki davranışlar.
- **Varsayım (kullanıcı testi gerekir):** Tüm "kullanıcıya etkisi" beklentileri; D9 (terim anlaşılırlığı); D12 ve D13'ün gerçek etkisi.
- **Test edilemeyen:** Gerçek dokunmatik cihaz (dokunmatik görünüm masaüstünde taklit edildi); ekran okuyucu; gamepad; çok düşük performanslı telefonlar.
