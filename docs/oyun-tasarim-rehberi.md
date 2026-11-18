# Oyun Tasarım Rehberi — "Şeker Dünyası" Yapısı

Bu rehber, **Bullet Hell Micro** yapılırken kullanılan tasarım ve geliştirme yaklaşımını, içeriği tamamen farklı oyunlara uygulanabilecek şekilde özetler. Mermiler, bosslar ve marşmelov sadece bir örnektir; burada anlatılan şey **yapıdır**.

> **Nasıl kullanılır?** Yeni bir oyuna başlarken bu dosyayı yapay zekâ asistanına (veya ekibe) verin, en alttaki **Prompt Şablonu**nu kendi oyununuzun bilgileriyle doldurun. Bölüm 11'deki "Uyarlama Tablosu", her kavramın başka türlerde neye karşılık geldiğini gösterir.

---

## 1. Temel Felsefe

Her kararda iki soru sorulur:

1. **Oyuncu ne hissetmeli?** (gerilim, ustalık, sevimlilik, "bir tur daha" isteği)
2. **Ekranda neyin önemli olduğu bir bakışta anlaşılıyor mu?** (okunabilirlik her şeyden önce gelir)

Bunlara bağlı ilkeler:

- **Tek bir dünya metaforu.** Her şey aynı temaya aittir. (Örnek: mermiler = şekerler, kahraman = marşmelov, boss = jöle.) Yeni bir öğe eklerken önce "bu dünyada bu neye benzer?" diye sorulur.
- **Adil zorluk.** Tehlike her zaman önceden haber verir (uyarı çizgisi, ses, titreşim). Oyuncu öldüğünde "benim hatamdı" demeli.
- **Görünen = gerçek.** Çarpışma alanları çizimle tutarlıdır; ekranda gördüğün şeye güvenebilirsin.
- **Risk ödüllendirilir ama zorunlu değildir.** Güvenli oynayan da ilerler; cesur oynayan daha çok kazanır.
- **Kısa tur, uzun bağlılık.** Turlar kısa ve hemen yeniden başlatılabilir; kalıcılık meta sistemlerden (skor, kostüm, günlük) gelir.

---

## 2. Görsel Sistem

### 2.1 Renk paleti yapısı

Palet her oyunda değişir, **yapısı** değişmez. Tüm renkler tek bir tema dosyasında (`theme.js`) isimli jetonlar olarak tutulur:

| Jeton | Görevi | Bullet Hell Micro örneği |
|---|---|---|
| `BG` | Ana zemin (sakin, düşük kontrast) | Marşmelov beyazı `#FFF6FA` |
| `INK` | Kontur + metin (en koyu renk) | Erik moru `#4B2A6E` |
| `PRIMARY` | Ana vurgu (butonlar, oyuncu ögeleri) | Mor `#8E5BE8` |
| `ACCENT` | İkinci vurgu (tehlike, ödül) | Sakız pembesi `#FF6FAE` |
| `SOFT_*` | Pastel tonlar (dolgu, arka plan bulutları) | Lavanta, açık pembe |
| `MUTED` | İkincil metin | `#9C86B8` |
| `SHADOW` | Yarı saydam gölge | `rgba(INK, 0.16)` |

Kurallar:
- Kullanıcının istediği 2–3 ana renk alınır, üzerine **bir koyu kontur rengi** eklenir. Açık zeminde pastel nesneleri bu kontur okunur kılar.
- Kod içinde çıplak renk kodu yazılmaz; her zaman tema jetonu kullanılır.

### 2.2 "Çıkartma" (sticker) stili

- Her oyun nesnesi **koyu konturlu**dur (1.5–3 px).
- Butonlar ve kartlar: dolgu + kontur + **aşağı kaydırılmış koyu gölge** ("basılabilir şeker" hissi). Tek bir yardımcı fonksiyon (`candyPanel`) ile çizilir.
- Neon parlama / bulanıklık (`shadowBlur`) kullanılmaz: hem pahalıdır hem de açık zeminde okunabilirliği düşürür.
- Yazı tipi yuvarlak hatlıdır (örn. Fredoka); büyük başlıklar beyaz dış hatlı yazılır.

### 2.3 Okunabilirlik kuralları

- **Tehlikeler** belirgin konturlu ve her biri ayırt edilebilir şekillidir (daire, damla, halka, çubuk).
- **Oyuncunun vurulabilir noktası** görünürdür (örn. merkezde pembe nokta) ve çizilen gövdeyle orantılıdır.
- **Uyarılar** (telegraph) her ölümcül saldırıdan önce gelir: noktalı çizgi + küçülen halka.
- **Arka plan sakindir**: yumuşak, yavaş kayan pastel bulutlar + oyuncuya tepki veren benekli zemin. Oyun nesnelerinden asla daha dikkat çekici olmaz.
- **Yüksek kontrast modu**: kalın konturlar, sade arka plan (ayarlardan).

### 2.4 Karakter tasarımı

- Kahraman ve bosslar **yüz ifadesi** taşır (göz, allık, ağız). İfade oyun durumunu anlatır: uykulu → kızgın → yenik (X gözler).
- Hafif "yaşam" animasyonları: nefes alma (ölçek titreşimi), göz kırpma, dash sırasında ezilme.
- Kozmetik çeşitlilik (kostümler) aynı çizim fonksiyonuyla yapılır; menü önizlemesi ve oyun aynı kodu kullanır.

---

## 3. Oyun Hissi ("Juice")

| Olay | Geri bildirim |
|---|---|
| Küçük başarı (graze, toplama) | Minik parçacık + kısa yükselen ses + uçan puan yazısı |
| Güçlendirme | Renkli patlama + bildirim etiketi + çan sesi |
| Faz / aşama değişimi | Bildirim etiketi + şok dalgası + kısa ateşkes |
| Ölüm | Büyük patlama + şok dalgası + sarsıntı → **0.6 sn bekle** → sonuç ekranı yumuşakça belirir |
| Boss yenilgisi | Ekranı temizle + büyük patlama + müzik kısılır + fanfar |

Kurallar:
- Parçacıklar temaya uygundur (bu oyunda şeker serpintisi + ponponlar).
- **Önemli bir anı UI ile örtme.** Sonuç ekranı, patlama göründükten sonra gelir.
- Sarsıntı ve flaş ayarlardan kapatılabilir (erişilebilirlik).
- Bildirimler tek tip "şeker etiketi"dir ve HUD ile çakışmayacak bir yükseklikte çıkar.

---

## 4. Oynanış Yapısı

### 4.1 Tur akışı

```
Isınma fazı → Yeni mekanik fazı → Zorlayıcı faz → BOSS 1 → kısa mola → BOSS 2 → … (rotasyon, her turda zorlaşır)
```

- Her faz **tek bir yeni fikir** öğretir.
- Bosslar sırayla döner; her yeni turda hız/sıklık çarpanı artar (`+%12 hız`, `+%10 yoğunluk`).
- Bosslar arası mola kısa tutulur (bu oyunda 15 sn).

### 4.2 Boss şablonu

Her boss bir **veri tanımıdır** (config), kod değildir:

```js
BOSS_X: {
  KIND: 'cloud', TITLE: 'Pamuk Bulut',
  DURATION, MAX_HP, RADIUS, HOVER_Y, ENTRY_TIME, DEATH_TIME,
  STAGES: [
    { NAME: 'YAĞMUR', PATTERN: 'rain',  ... },   // beceri 1
    { NAME: 'DUVAR',  PATTERN: 'walls', ... },   // beceri 2
    { NAME: 'GİRDAP', PATTERN: 'pull',  ... }    // beceri 3
  ]
}
```

- **Üç aşama**, her biri farklı bir beceriyi sınar (konumlanma, zamanlama, kontrol).
- Aşamalar can eşiklerinde değişir (%66, %33); geçişte kısa ateşkes.
- **Yenme yolu oyunun fiilleriyle uyumludur.** Silahsız oyunda boss "dayanarak" yenilir: enerji zamanla azalır, risk alan oyuncu (graze, dash ile içinden geçme) hızlandırır.
- Giriş animasyonu sırasında saldırı yoktur; ölüm animasyonu sırasında da.

### 4.3 Risk / ödül mekaniği

Bu oyunda **graze** (tehlikenin yanından sıyrılmak). Genel kalıp:
- Oyuncuyu tehlikeye **yaklaşmaya** teşvik eden, ama ölümcül olmayan bir eylem.
- Seri (combo) ile çarpan büyür; seri kısa bir süre içinde devam ettirilmezse sıfırlanır.
- **Denge uyarısı:** Risk ödülü, temel hedefi (hayatta kalmak) gölgede bırakmamalı. Puanın çoğu temel hedeften gelmeli.

### 4.4 Güçlendirmeler

- 2–4 tür, her biri farklı bir oyun durumunu değiştirir (koruma, yavaşlatma, temizleme).
- Sahada en fazla 2 adet, kısa ömürlü, kaybolmadan önce yanıp söner.
- HUD ve boss alanının altında doğar.

### 4.5 Adalet kontrol listesi

- [ ] Ölümcül her saldırıdan önce uyarı var mı?
- [ ] Kenar/duvar gibi ölüm sınırlarına yaklaşınca görsel uyarı var mı?
- [ ] Duraklatmadan dönerken geri sayım var mı?
- [ ] Sekme değişince oyun otomatik duruyor mu?
- [ ] "Geçit" olan desenlerde geçit dışından sızılamıyor mu? (aralıklar < oyuncu boyutu)
- [ ] Çekme/itme gibi kontrol bozan mekanikler kaçış eylemiyle (dash) kırılabiliyor mu?

---

## 5. Meta Sistemler (Tekrar Oynanabilirlik)

| Sistem | Amaç | Not |
|---|---|---|
| **Skor + seri** | "Bir tur daha" | Süre puanı + risk puanı × çarpan + boss bonusu |
| **Mod başına rekor** | Kişisel hedef | Süre ve skor ayrı saklanır |
| **Günlük meydan okuma** | Sosyal rekabet | Tarihten türetilen tohum: herkes aynı deseni görür |
| **Kostümler** | Uzun vadeli hedef | Başarımlarla açılır, menüde önizlenir |
| **Hayalet tekrar** | Kendinle yarış | En iyi turun yolu kaydedilir, saydam oynar |
| **Sonucu paylaş** | Yayılma | Wordle tarzı kısa metin + emoji çubuğu |
| **İlk oyun ipuçları** | Öğrenme | Zamanlanmış 3 ipucu + ilk boss ipucu, bir kez |

Kurallar:
- Oynanışı etkileyen **tüm rastgelelik tohumlanabilir** bir üreteçten gelir (günlük mod için şart).
- Görsel rastgelelik (parçacıklar) bu üreteci kullanmaz.
- Hayalet konumları ekran boyutuna göre **normalize** edilir.

---

## 6. Ses Tasarımı

- **Dosyasız, prosedürel ses** (Web Audio): küçük boyut, kolay ayar.
- **Tını, görsel temayla uyumludur.** Şeker teması → marimba, pop, çan. (Karanlık bilimkurgu → synth, metalik darbe.)
- **Uyarlanabilir müzik:** Fazlar ilerledikçe katman eklenir (bas → davul → süsleme → melodi). Boss gelince ton (minör) ve tempo değişir. Yavaş çekimde müzik de yavaşlar.
- **Ses = bilgi:** Seri merdiveni (yükselen notalar), "yetenek hazır" çanı, boss vurulma sesi (enerji azaldıkça pesleşir).
- **Mix:** Kompresör + ortak reverb + müzikte ritmik yankı; büyük anlarda müzik kısılır (ducking); efektler ekrandaki konuma göre stereo.
- Müzik ve efekt ayrı ayrı kapatılabilir; ayarlar kalıcıdır; ayar menüsü sessiz durumu gösterir.

---

## 7. Arayüz ve Kullanıcı Deneyimi

- **Menü:** başlık · mod kartları · günlük şerit · açıklama · kontrol ipuçları · büyük OYNA butonu · kostüm seçici · ayarlar butonu.
- **HUD bölgeleri:** sol üst = mod + ikincil sayaç, orta üst = ana sayaç, sağ üst = skor + aktif durumlar, alt orta = yetenek çubuğu, oyuncunun yanı = seri göstergesi.
- **Duraklatma:** tuş + gamepad + dokunmatik buton; odak kaybında otomatik; dönüşte geri sayım.
- **Ayarlar paneli:** müzik/efekt sesi, sarsıntı ve flaş, yüksek kontrast, hayalet, dil, ipuçlarını sıfırla. Fare, dokunmatik ve klavyeyle kullanılabilir.
- **Çok dillilik baştan:** Tüm metinler `t('anahtar')` ile sözlükten gelir; sayı ve tarih biçimi dile göre değişir.
- **Mobil:** sanal joystick + aksiyon butonu (bekleme halkalı), güvenli alan boşlukları, ekran oranına uyan arena, yatay mod önerisi.
- **Erişilebilirlik:** sarsıntı/flaş kapatma, yüksek kontrast, odak çerçeveleri, ARIA etiketleri.

---

## 8. Kod Mimarisi

Sıfır bağımlılık, ES modülleri, tek `<canvas>`.

| Modül | Sorumluluk | Saf mantık? (test edilebilir) |
|---|---|---|
| `config.js` | **Tüm denge sayıları**, fazlar, boss tanımları | ✓ |
| `theme.js` | Renk jetonları, yazı tipi, ortak çizim yardımcıları | — |
| `i18n.js` | Dil sözlüğü, `t()`, `upper()` | ✓ |
| `rng.js` | Tohumlanabilir rastgelelik, tarih anahtarı | ✓ |
| `score.js` | Skor, seri, çarpan | ✓ |
| `progress.js` / `skins.js` | İstatistik, başarım, kostüm | ✓ |
| `settings.js` | Kalıcı ayarlar + değişiklik dinleyicileri | ✓ |
| `tutorial.js` | Zamanlanmış ipuçları | ✓ |
| `ghost.js` / `share.js` | Tekrar kaydı, paylaşım metni | ✓ |
| `audio.js` | Ses grafiği, müzik sıralayıcı, efektler | (sahte AudioContext ile) |
| `effects.js` | Parçacık, şok dalgası, sarsıntı, bildirim | — |
| Varlıklar (`player`, `bullet`, `boss`, `pickup`) | Davranış + çizim | ✓ (davranış) |
| `waveManager.js` | Faz/desen üretimi, boss rotasyonu | ✓ |
| `ui.js` | Menü, HUD, ayarlar, ölüm ekranı | — |
| `game.js` | Durum makinesi + hepsini bağlayan koordinatör | — |

İlkeler:
- **Veri config'te, davranış kodda.** Yeni boss/faz çoğunlukla sadece config eklemekle yapılır.
- **Saf mantık ayrı modüllerde** → `node --test` ile tarayıcısız test edilir.
- **localStorage** anahtarları isim alanlıdır (`oyunAdi_...`) ve her erişim `try/catch` içindedir.
- **Performans:** pahalı çizimler (kırpma, desen) bir kez çizilip önbelleğe alınır; nesne havuzu ile çöp üretimi en aza indirilir; ölçmeden optimizasyon yapılmaz.
- Geçici bayraklar (ayar değişince) tek noktadan güncellenir (`settings.onChange`).

---

## 9. Geliştirme Süreci

1. Önce **çekirdek döngü** (hareket, tehlike, ölüm, yeniden başlat).
2. **Görsel kimlik** (palet + çıkartma stili + karakter).
3. **Fazlar ve ilk boss**.
4. **Ses** (efektler → uyarlanabilir müzik).
5. **Meta** (skor, rekor, kostüm, günlük, hayalet, paylaşım).
6. **Kullanıcı deneyimi** (duraklatma, ayarlar, ipuçları, dil, mobil).
7. **Cila ve performans**.

Her adımda:
- Testler yazılır/çalıştırılır (`npm test`).
- Tarayıcıda gerçekten oynanır, ekran görüntüsüyle kontrol edilir.
- Test için yapılan geçici değişiklikler (ölümsüzlük, kaydı kapatma) **sayfa yenilenerek** geri alınır; oyuncunun kayıtlarına yazılmaz.
- Ölçülen sorun düzeltilir (ör. "çubuklar 8 kat pahalı → önbellek").

---

## 10. Yeni Özellik Kontrol Listesi

- [ ] Dünya metaforuna uyuyor mu? (görsel + isim + ses)
- [ ] Tema jetonlarını mı kullanıyor?
- [ ] Okunabilir mi? (kontur, şekil, uyarı)
- [ ] Adil mi? (bölüm 4.5)
- [ ] Geri bildirimi var mı? (görsel + ses)
- [ ] Ayarı gerekiyorsa ayarlar panelinde mi?
- [ ] Metinleri sözlükte mi (tüm diller)?
- [ ] Denge sayıları config'te mi?
- [ ] Testi var mı?
- [ ] Mobilde ve masaüstünde denendi mi?

---

## 11. Uyarlama Tablosu (Farklı Oyun Türleri)

| Bu oyundaki kavram | Sonsuz koşu (runner) | Bulmaca | Platform | Nişancı (shooter) |
|---|---|---|---|---|
| Mermi / tehlike | Engeller | Süre baskısı, yanlış hamle | Düşmanlar, dikenler | Düşman ateşi |
| Graze (risk ödülü) | Engele "kıl payı" yakın geçiş | Az hamlede çözüm, zincir | Düşmana zıplayıp sekme | Yakın mesafe vuruş bonusu |
| Dash (kaçış yeteneği) | Kayma / çift zıplama | Geri alma / ipucu | Hava atılması | Kalkan / takla |
| Faz | Biyom / hız kademesi | Zorluk kademesi | Bölüm teması | Dalga |
| Boss (3 aşama) | Takip eden dev yaratık | "Boss bulmacası" (3 kural) | Bölüm sonu canavarı | Klasik boss |
| Boss'u dayanarak yenmek | Belli mesafe kaçmak | Süre dolmadan çözmek | Zayıf noktaya zıplamak | Hasar vermek |
| Güçlendirme | Mıknatıs, kalkan, yavaşlatma | Joker, ek süre | Can, hız, çift zıplama | Silah, kalkan, bomba |
| Günlük meydan okuma | Günlük parkur tohumu | Günün bulmacası | Günlük bölüm | Günlük dalga dizisi |
| Hayalet | En iyi koşu | En iyi çözüm yolu | En iyi süre koşusu | En iyi tur rotası |
| Kostüm | Karakter görünümü | Taş/kart teması | Karakter görünümü | Gemi/karakter görünümü |

Değişmeyenler: palet yapısı, çıkartma stili, okunabilirlik kuralları, juice tablosu, adalet listesi, meta sistemler, ses ilkeleri, UX ve mimari.

---

## 12. Prompt Şablonu

Aşağıdaki promptu, bu dosyayı ekleyerek kullanın. `[KÖŞELİ PARANTEZ]` içlerini doldurun.

```text
Ekteki "Oyun Tasarım Rehberi"ni (oyun-tasarim-rehberi.md) tasarım ve mimari standardı olarak kullanarak yeni bir web oyunu geliştirmeni istiyorum. Rehberdeki felsefeyi, görsel sistemi, oyun hissi kurallarını, adalet kontrol listesini, meta sistemleri, ses ilkelerini, UX ve kod mimarisini aynen uygula; sadece içeriği aşağıdaki oyuna göre değiştir. Rehberin 11. bölümündeki uyarlama tablosunu kullanarak her kavramın bu oyundaki karşılığını sen belirle ve bana önce kısa bir eşleme tablosu göster.

OYUN BİLGİLERİ
- Oyunun adı: [AD]
- Tür: [ör. sonsuz koşu / bulmaca / platform / nişancı / başka]
- Tek cümlelik fikir: [ör. "Bir kedi yavrusu düşen yün yumaklarından kaçar"]
- Dünya metaforu / tema: [ör. "örgü ve yün dünyası"]
- Ana renkler (2–3): [ör. krem, adaçayı yeşili, kiremit turuncusu]
- Kahraman: [kim/ne, nasıl bir kişiliği var]
- Oyuncunun fiilleri: [hareket nasıl, kaçış/özel yetenek ne]
- Tehlikeler: [neler]
- Risk/ödül eylemi: [ör. tehlikeye kıl payı yaklaşmak]
- Bosslar (en az 2 fikir): [ad + kişilik + yenme yolu]
- Hedef platform: [masaüstü + mobil tarayıcı]
- Diller: [ör. Türkçe + İngilizce]
- Ses tonu: [ör. sıcak akustik, yumuşak ksilofon]
- İstemediklerim / sınırlar: [ör. şiddet yok, karanlık tema yok]

ÇALIŞMA ŞEKLİ
1. Önce eşleme tablosunu ve palet jetonlarını (BG, INK, PRIMARY, ACCENT, SOFT, MUTED, SHADOW) öner, onayımı bekle.
2. Sonra rehberin 9. bölümündeki sırayla ilerle: çekirdek döngü → görsel kimlik → fazlar ve ilk boss → ses → meta → UX → cila.
3. Her adımda testleri yaz/çalıştır, oyunu tarayıcıda oyna ve ekran görüntüsüyle kontrol et; test için yaptığın geçici değişiklikleri sayfayı yenileyerek geri al.
4. Denge sayılarını config dosyasında, renkleri tema dosyasında, tüm metinleri dil sözlüğünde tut.
5. Her adımın sonunda ne yaptığını, neyi doğruladığını ve neyin doğrulanmadığını kısaca anlat; commit/push'u ben istediğimde yap.
6. Bana Türkçe cevap ver.
```
