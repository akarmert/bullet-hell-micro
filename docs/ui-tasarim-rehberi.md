# UI Tasarım Rehberi — "Şeker Çıkartma" Arayüz Sistemi

Bu rehber yalnızca **arayüz ve görsel tasarımı** kapsar: renk sistemi, tipografi, bileşenler, ekran düzenleri, hareket, durumlar, mobil ve erişilebilirlik. Oynanış, ses ve kod mimarisi kapsam dışıdır.

Kaynak: **Bullet Hell Micro**. Ölçüler bu oyundan alınmıştır; renkler ve tema her projede değişebilir, **yapı ve kurallar** sabit kalır.

---

## 1. Tasarım İlkeleri

1. **Okunabilirlik her şeyden önce.** Her öğe, ne kadar renkli olursa olsun, koyu bir konturla zeminden ayrılır.
2. **Çıkartma (sticker) hissi.** Yuvarlak köşeler, kalın kontur, aşağı kaydırılmış katı gölge: her şey "basılabilir bir şeker" gibi görünür.
3. **Parlama yok, bulanıklık yok.** Derinlik bulanık gölgeyle değil, ofset gölgeyle verilir.
4. **Tek dünya, tek dil.** Butondan bildirime kadar her bileşen aynı birkaç parçadan (panel, hap, yuvarlak buton) türetilir.
5. **Önemli anı örtme.** Arayüz, oyunun en heyecanlı anının (patlama, zafer) üstüne hemen gelmez; önce an yaşanır, sonra arayüz belirir.
6. **Sakin zemin, canlı ön plan.** Arka plan hep daha soluk ve yavaştır; dikkat oyuncuda ve etkileşimli öğelerde kalır.

---

## 2. Renk Sistemi

### 2.1 Jeton yapısı

Tüm renkler tek bir tema dosyasında **isimli jetonlar** olarak tanımlanır; kodda çıplak renk kodu kullanılmaz.

| Jeton | Görev | Örnek (bu proje) |
|---|---|---|
| `BG` | Ana zemin | `#FFF6FA` marşmelov beyazı |
| `BG_SOFT` | Zemin üstü hafif ton | `#FBE8F2` |
| `WHITE` | Kart / buton dolgusu | `#FFFFFF` |
| `INK` | **Kontur + ana metin** (en koyu renk) | `#4B2A6E` erik moru |
| `INK_SOFT` | Yarı saydam kontur | `rgba(75,42,110,.55)` |
| `MUTED` | İkincil metin, ipuçları | `#9C86B8` |
| `PRIMARY` | Ana eylem (OYNA, seçili ayar) | `#8E5BE8` mor |
| `PRIMARY_DEEP` | Primary'nin koyusu | `#6A3FC8` |
| `ACCENT` | Seçili durum, skor, uyarı | `#FF6FAE` sakız pembesi |
| `ACCENT_DEEP` | Tehlike, kilitli, kritik metin | `#F0468F` |
| `SOFT_A` / `SOFT_B` | Pastel dolgular, etiketler | `#CDB8FF` lavanta, `#FFC4DE` açık pembe |
| `SHADOW` | Nesne altı gölge | `rgba(INK, .16)` |

### 2.2 Kurallar

- Kullanıcının istediği 2–3 marka rengi `PRIMARY`, `ACCENT` ve `SOFT_*` olur; üstüne mutlaka **bir koyu `INK`** eklenir.
- `INK` hem kontur hem metin rengidir: tüm arayüz tek bir "mürekkep" ile çizilmiş gibi görünür.
- Bir ekranda en fazla **bir** `PRIMARY` dolgulu ana eylem butonu bulunur.
- Seçili durum = `ACCENT` dolgu + beyaz metin; seçili olmayan = `WHITE` dolgu + `INK` metin.
- Kontrast: metin/zemin en az 4.5:1. `MUTED` sadece ikincil bilgi için.
- **Yüksek kontrast modu** için kontur kalınlığı ve arka plan sadeliği tek bayrakla değişir.

---

## 3. Tipografi

- **Yazı tipi:** yuvarlak hatlı, sıcak bir sans-serif (bu projede **Fredoka** 400–700). Yedek: `system-ui, sans-serif`.
- Tüm yazı tipi tanımları tek bir yardımcıdan gelir: `font(boyut, kalınlık)`.

| Rol | Boyut | Kalınlık | Not |
|---|---|---|---|
| Logo / başlık | 42 | 700 | Beyaz dış hat (6 px) + `ACCENT` ofset gölge (+3, +4) |
| Ekran başlığı ("duraklatıldı", "OYUN BİTTİ") | 26–32 | 700 | `PRIMARY` veya `ACCENT_DEEP` |
| Büyük sayaç / skor | 34–36 | 700 | Beyaz dış hat 5–6 px; dar ekranda `min(36, genişlik × 0.085)` |
| Buton etiketi | 18–22 | 700 | |
| Gövde / açıklama | 14 | 500 | `INK` |
| Etiket, ipucu, ikincil | 11–12 | 600 | `MUTED` |
| Hap (pill) metni | 10–14 | 700 | |

Kurallar:
- Büyük sayılar ve başlıklar **beyaz dış hatlı** yazılır (`strokeText` + `fillText`), böylece her zeminde okunur.
- Uzun metinler `maxWidth` ile sığdırılır; çok dilli projelerde en uzun dile göre test edilir.
- Büyük harfe çevirme dile duyarlıdır (Türkçe `i → İ`).

---

## 4. Bileşenler

### 4.1 Şeker panel (`candyPanel`) — temel yapı taşı

Her kart, buton ve bildirimin temeli:

```
1) Gölge: aynı şekil, depth px aşağıda, INK dolgu
2) Gövde: dolgu rengi
3) Kontur: INK, lineWidth 2–2.5
```

| Kullanım | Köşe yarıçapı | Gölge derinliği | Kontur |
|---|---|---|---|
| Küçük hap / etiket | yükseklik / 2 | 2 | 1.5 |
| Bildirim etiketi | 15 | 3 | 2 |
| Mod kartı | 18 | 4 (seçili: 6) | 2 |
| Ana buton | yükseklik / 2 | 6 | 2.5 |
| Ekran kartı (duraklatma, sonuç, ayarlar) | 22–26 | 6–7 | 2.5 |

### 4.2 Buton türleri

| Tür | Ölçü (600×600 sanal alanda) | Görünüm |
|---|---|---|
| **Ana eylem** (OYNA) | 260 × 64, tam yuvarlak | `PRIMARY` dolgu, beyaz 22 px metin, üstte yarı saydam beyaz parlama şeridi (8 px), yavaşça süzülür |
| **Seçim kartı** (mod) | 200 × 60, r 18 | Başlık 18 px + alt bilgi 11 px; seçili: `ACCENT` + 2 px yukarı kalkar + gölge 6 |
| **Geniş şerit** (günlük mod) | 420 × 46 | Sol: ikon + başlık, sağ: ikincil bilgi |
| **İkincil hap buton** (ayarlar) | 108 × 34 | `WHITE` dolgu, `INK` metin, gölge 3 |
| **Yuvarlak ok** (‹ ›) | r 20 | `WHITE` dolgu, gölge 3, ortada ok |
| **HTML butonu** (dokunmatik) | min yükseklik 44 px | Tam yuvarlak, kontur 2.5 px, `box-shadow: 0 4px 0 INK`; basılınca `translateY(3px)` ve gölge 1 px |

### 4.3 Hap (pill)

- Yükseklik = yazı boyutu + 9, yatay iç boşluk 8 + 8.
- Kullanım: mod etiketi, skor, aktif güçlendirme, "yeni rekor", açık/kapalı durumu.
- Renk anlamı: `ACCENT` = önemli/pozitif, `PRIMARY` = özel durum, `SOFT_A` = nötr bilgi, `WHITE` = kapalı/pasif.

### 4.4 Bildirim etiketi (toast/banner)

- `WHITE` panel, r 15, yükseklik 30, gölge rengi = bildirimin vurgu rengi.
- Ekranın üst-orta kısmında, sayaçların ve üst barların **altında** (bu projede y = 148).
- 1.6–2.2 sn görünür, son 0.3 sn'de solar. Aynı anda tek bildirim.

### 4.5 İpucu balonu

- `WHITE` panel, yükseklik 36, gölge `PRIMARY`, başında 💡.
- Ekranın alt kısmında, kontrollerin üstünde.
- **Oyuncu yaklaşırsa %25 opaklığa düşer**; oyun alanını kapatmaz.

### 4.6 Seri / durum rozeti (oyun nesnesine bağlı)

- Oyuncunun ~30 px üstünde küçük hap (yükseklik 18).
- İçinde kalan süreyi gösteren 2 px ince çubuk.
- Çarpan > 1 olunca `ACCENT` dolguya geçer.

### 4.7 İlerleme çubuğu

- Yükseklik 10, tam yuvarlak, `WHITE` zemin, dolgu `ACCENT` (hazır) / `SOFT_A` (doluyor), `INK` kontur 2.
- Eşik işaretleri (ör. aşama sınırları) 2 px `INK_SOFT` çizgiler.
- Üstünde 11 px etiket: solda başlık (`ACCENT_DEEP`), sağda ipucu (`MUTED`).

### 4.8 Ayar satırı

- Satır yüksekliği 42; seçili satır `SOFT_A` %45 dolgulu yuvarlak arka plan.
- Sol: etiket (15 px). Sağ: değer.
  - Seviye: `‹ %80 ›` (ok = `MUTED`, değer = `PRIMARY`).
  - Anahtar: hap (`açık` = `ACCENT` dolgu, `kapalı` = `WHITE`).
  - Seçim (dil vb.): `‹ Türkçe ›`.
  - Sessize alınmış: değer yerine `sessiz · N` (`ACCENT_DEEP`).
- Eylem satırları ortalı; "kapat ✕" her zaman en altta ve `ACCENT_DEEP`.
- Panelin altında küçük klavye yardımı: `↑ ↓ seç · ← → değiştir · ESC kapat`.

### 4.9 Karakter önizlemesi / kilitli öğe

- Önizleme gerçek oyundaki çizimle aynı fonksiyonu kullanır.
- Kilitli: gri-lila gövde + kilit ikonu; altında `kilitli · nasıl açılır` (`ACCENT_DEEP`).
- Seçili: adın yanında `✓`. Sayaç: `kostüm 3/8`.

---

## 5. Ekran Düzenleri

Menü ve kartlar **600 × 600 sanal alanda** tasarlanır, ekrana `min(1, genişlik/600, yükseklik/600)` ile ölçeklenip güvenli alanlar düşülerek ortalanır. HUD ise gerçek ekran kenarlarına yaslanır.

### 5.1 Ana menü (yukarıdan aşağı)

```
[                          ⚙ ayarlar ]   ← sağ üst hap
          BULLET HELL  (micro)          ← logo + eğik hap
              mod seç                   ← MUTED 13 px
   [ CLASSIC ]        [ ENDLESS ]       ← 2×2 seçim kartları
   [ HARDCORE ]       [ CHAOS   ]
   [ ☀ GÜNLÜK · 19 Kasım   en iyi ★ 0 ] ← geniş şerit
     seçili modun açıklaması (14 px)
   kontrol ipuçları (12 px MUTED, 2 satır)
          [  OYNA ▶ CLASSIC  ]          ← ana eylem
            ‹  (önizleme)  ›            ← kostüm seçici
               Klasik ✓
              kostüm 1/8
```

### 5.2 Oyun içi HUD bölgeleri

| Bölge | İçerik |
|---|---|
| Sol üst | Mod hapı (`SOFT_A`) + altında ikincil sayaç (12 px `MUTED`) |
| Orta üst | Büyük sayaç (beyaz dış hatlı) + altında "en iyi" (11 px) |
| Sağ üst | Skor hapı (`ACCENT`) + altında aktif durum hapları (üst üste, 24 px aralık) |
| Üst bar (gerektiğinde) | Boss / ilerleme çubuğu (y ≈ 110) |
| Üst-orta bildirim | Bildirim etiketi (y ≈ 148) |
| Alt orta | Yetenek çubuğu + durumu (masaüstü); dokunmatikte duraklatma butonu |
| Alt bölge | İpucu balonu (dokunmatik kontrollerin üstünde) |
| Nesneye bağlı | Seri rozeti, uçan puan yazıları |

Kenar boşluğu: 18 px + güvenli alan.

### 5.3 Duraklatma

- Zemin: `BG` %78 opak katman.
- Ortada kart (genişlik ≤ 320): başlık 28 px `PRIMARY`, altında nabız gibi atan devam ipucu, altında `MUTED` menü ipucu.
- Devam ederken: büyük geri sayım rakamı (64–90 px), her yarım saniyede küçülüp solar, arkasında `ACCENT` ofset kopya.

### 5.4 Sonuç ekranı (oyun bitti)

- **Önce an, sonra arayüz:** 650 ms boyunca sadece patlama görünür; sonra 300 ms içinde katman + kart **solarak ve 24 px aşağıdan yukarı kayarak** gelir. Tekrar oyna ve butonlar bu süreden sonra etkinleşir.
- Kart (genişlik ≤ 360) içeriği sırasıyla:
  1. Başlık 30–32 px `ACCENT_DEEP` + `SOFT_B` ofset kopya
  2. Mod hapı (günlükse tarihli)
  3. "★ yeni rekor ★" hapı (`PRIMARY`, hafifçe zıplar)
  4. Ana sonuç (skor) 36 px, beyaz dış hatlı
  5. Üç sütun istatistik: etiket 11 px `MUTED` + değer 17 px `INK`
  6. "en iyi" satırı `PRIMARY`
  7. Özel durum satırları (boss, yeni açılan öğe hapı)
  8. Tekrar oyna (15 px, nabız) + menü/paylaş ipucu (12 px `MUTED`)
- HTML butonları alt köşelerde: sol "ANA MENÜ" (`PRIMARY`), sağ "PAYLAŞ" (`ACCENT`).

### 5.5 Ayarlar paneli

- Menünün üstünde `BG` %80 katman + ortada kart (genişlik 380).
- Başlık 26 px `PRIMARY`, satırlar bölüm 4.8'e göre.
- Kartın dışına tıklamak paneli kapatır.

---

## 6. Hareket ve Animasyon

| Öğe | Hareket | Değer |
|---|---|---|
| Logo | Dikey süzülme | `sin(t × 2) × 2` px |
| Ana eylem butonu | Dikey süzülme | `sin(t × 3) × 2` px |
| Önizleme karakteri | Süzülme + nefes | `sin(t × 2.4) × 2` px, ölçek ±%3 |
| "Devam / tekrar oyna" metni | Opaklık nabzı | 0.65 → 1.0 |
| "Yeni rekor" hapı | Zıplama | `|sin(t × 5)| × 3` px |
| Bildirim | Görünme / sönme | 1.6–2.2 sn, son 0.3 sn sönme |
| Sonuç ekranı | Gecikme + belirme + kayma | 650 ms bekle, 300 ms, 24 px |
| Geri sayım | Küçülme + sönme | her 500 ms |
| Uçan puan | Yukarı kayma + sönme | 700 ms, 26 px |
| Seçili kart | Kalkma | 2 px yukarı, gölge 4 → 6 |
| HTML buton basma | Çökme | `translateY(3px)`, gölge 4 → 1 px |

Kurallar:
- Hareketler küçük ve yumuşaktır (2–3 px); dikkat dağıtmaz.
- "Sarsıntı ve flaş" ayarı kapalıysa ekran sarsıntısı ve flaş tamamen durur.
- Arka plan öğeleri (bulutlar) çok yavaş kayar (≤ 10 px/sn).

---

## 7. Durumlar

| Durum | Görsel |
|---|---|
| Normal | `WHITE` dolgu, `INK` metin, gölge 4 |
| Seçili | `ACCENT` dolgu, beyaz metin, 2 px yukarı, gölge 6 |
| Odak (klavye) | 3 px `ACCENT` çerçeve, 4 px ofset |
| Basılı | Gölge kısalır, öğe aşağı iner |
| Kilitli | Soluk gri-lila + kilit ikonu + açılış koşulu (`ACCENT_DEEP`) |
| Pasif / kapalı | `WHITE` hap, `INK` metin |
| Aktif / açık | `ACCENT` hap, beyaz metin |
| Sessiz / devre dışı | Değer yerine durum metni `ACCENT_DEEP` |
| Uyarı / tehlike | `ACCENT_DEEP`, gerekirse nabız |
| Yakında / beklemede | `MUTED` metin, "…" |

---

## 8. Arka Plan

- Düz `BG` dolgu.
- Üzerinde 5+ büyük, yavaş kayan pastel **radyal gradyan bulut** (merkez %55 opak → kenar %0).
- Üzerinde 50 px aralıklı **benek ızgarası** (r 2, `PRIMARY` %16). Oyuncu veya patlama yakınındaki benekler büyür ve `ACCENT`'e döner (dokunuşa tepki).
- Kenarda 6 px yuvarlak çerçeve (`SOFT_A`; oyun bitince `ACCENT`).
- Yüksek kontrast modunda bulutlar kapanır.
- Kritik sınıra yaklaşınca o kenarda nabız gibi atan `ACCENT_DEEP` gradyan şerit.

---

## 9. Mobil ve Duyarlı Tasarım

- Tam ekran tuval; `100dvh`; `viewport-fit=cover`; `env(safe-area-inset-*)` boşlukları hem HTML'de hem tuvalde uygulanır.
- Sanal alan: yükseklik sabit (600), genişlik ekran oranına göre değişir.
- **Dokunmatik kontroller** (yalnızca dokunmatik cihazda ve oyun sırasında):
  - Joystick: sol alt, `clamp(96px, 25vh, 136px)`, yarı saydam beyaz zemin, `INK` kontur, `ACCENT` topuz; boşta %55, kullanımda %85 opak.
  - Aksiyon butonu: sağ alt, `clamp(82px, 22vh, 112px)`, etrafında bekleme süresi halkası (`ACCENT`, 6 px); hazırken açık pembe dolgu.
  - Duraklatma: alt orta, 50 px yuvarlak.
- Dokunma hedefleri en az 44 px.
- Dikey ekranda üstte küçük "yatay çevir" hapı.
- Dar ekranda büyük sayaç küçülür; uzun metinler `maxWidth` ile sığdırılır.

---

## 10. Erişilebilirlik ve Çok Dillilik

- Ayarlar: sarsıntı/flaş kapatma, yüksek kontrast, ses seviyeleri, dil.
- Tüm HTML butonlarında ARIA etiketi; `:focus-visible` çerçevesi.
- Renk tek başına anlam taşımaz: durumlar metin ve şekille de belirtilir (`açık/kapalı`, `✓`, kilit ikonu).
- Tüm metinler sözlükten gelir (`t('anahtar')`); sayı ayracı ve tarih biçimi dile göre değişir.
- HTML'deki statik metinler de dil değişince güncellenir; `<html lang>` ayarlanır.

---

## 11. Uygulama İpuçları (Canvas / HTML)

- Ortak yardımcılar: `candyPanel()`, `pill()`, `roundButton()`, `outlinedText()`, `font()`.
- `shadowBlur` kullanma; derinliği ofset gölgeyle ver.
- Menü/kart çizerken sanal alana `translate + scale`; tıklamaları aynı dönüşümün tersiyle eşle.
- Tuval ve HTML katmanı birlikte: kalıcı dokunmatik butonlar HTML'de (erişilebilirlik ve 44 px hedef), görsel arayüz tuvalde.
- Pahalı çizimleri (kırpma, desen) bir kez çizip önbelleğe al.
- Tüm renkleri tema jetonlarından, tüm metinleri sözlükten al.

---

## 12. UI Kontrol Listesi

- [ ] Her öğe `INK` konturlu ve zeminden net ayrılıyor mu?
- [ ] Renkler sadece tema jetonlarından mı geliyor?
- [ ] Bir ekranda tek bir ana eylem (`PRIMARY`) mi var?
- [ ] Bileşen `candyPanel` / `pill` / `roundButton` ailesinden mi?
- [ ] Bildirimler HUD ve üst barlarla çakışmıyor mu?
- [ ] Önemli an (patlama, zafer) arayüzle hemen örtülmüyor mu?
- [ ] Seçili, odak, basılı, kilitli, pasif durumların hepsi tasarlandı mı?
- [ ] Dar ekranda ve en uzun dilde metinler sığıyor mu?
- [ ] Dokunma hedefleri ≥ 44 px ve güvenli alanlar uygulanmış mı?
- [ ] Sarsıntı/flaş kapalıyken ve yüksek kontrastta düzgün görünüyor mu?

---

## 13. Genel Prompt

Bu rehberi ekleyerek herhangi bir oyun veya uygulama için kullanın. Köşeli parantezler isteğe bağlıdır; boş bırakılırsa asistan projeye bakarak kendisi önerir.

```text
Ekteki "UI Tasarım Rehberi"ni (ui-tasarim-rehberi.md) arayüz standardı olarak kullanmanı istiyorum. Sadece arayüz ve görsel tasarımla ilgilen; oynanışa, iş mantığına ve içeriğe dokunma.

Rehberdeki yapıyı aynen uygula: renk jetonu sistemi (BG, INK, PRIMARY, ACCENT, SOFT, MUTED, SHADOW), tipografi ölçeği, "şeker çıkartma" bileşenleri (panel, hap, ana buton, seçim kartı, yuvarlak buton, bildirim, ipucu balonu, ilerleme çubuğu, ayar satırı), ekran düzenleri, hareket değerleri, durum tasarımları, arka plan, mobil/duyarlı kurallar ve erişilebilirlik. Renkleri, ikonları ve ton/temayı ise projenin kendi kimliğine göre uyarla.

Proje bilgileri (boş olanları projeye bakarak sen öner):
- Proje: [ad ve kısa tanım, ya da "mevcut kod tabanı"]
- Tema / dünya: [ör. "orman ve mantarlar", "uzay şekerlemeleri"]
- Marka renkleri (2–3): [ör. krem, adaçayı yeşili, kiremit]
- Platform: [masaüstü / mobil / ikisi]
- Diller: [ör. Türkçe + İngilizce]

Çalışma şekli:
1. Önce projeyi incele ve bana şunları öner: renk jetonları (hex değerleriyle), yazı tipi, ve rehberdeki her bileşenin bu projede nerede kullanılacağını gösteren kısa bir eşleme. Onayımı bekle.
2. Onaydan sonra önce tema dosyasını ve ortak çizim yardımcılarını kur, sonra ekranları sırayla dönüştür: ana menü → oyun içi HUD → bildirimler → duraklatma → sonuç ekranı → ayarlar → mobil kontroller.
3. Her ekrandan sonra arayüzü tarayıcıda aç, ekran görüntüsüyle kontrol et ve rehberin 12. bölümündeki kontrol listesinden geçir; geçmeyen maddeleri düzelt.
4. Renkleri sadece tema dosyasından, metinleri sadece dil sözlüğünden al.
5. Her adımın sonunda neyi değiştirdiğini, neyi doğruladığını ve neyin doğrulanmadığını kısaca anlat. Commit/push'u ben istediğimde yap.
6. Bana Türkçe cevap ver.
```
