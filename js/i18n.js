// ============================================================
// i18n.js — Dil Desteği (Türkçe / English)
// t('anahtar', { param }) ile metin; eksik çeviride Türkçeye düşer.
// ============================================================

let lang = 'tr';

const STRINGS = {
    tr: {
        // Menü
        'menu.settings': '⚙ ayarlar',
        'menu.pickMode': 'mod seç',
        'menu.best': 'en iyi ★ {score}',
        // Bilgi ("i") paneli: nasıl oynanır
        'info.title': 'nasıl oynanır',
        'info.move.title': 'hareket',
        'info.move.mouse': 'fareyle karakteri yönlendir ya da WASD / ok tuşlarını kullan',
        'info.move.touch': 'alttaki sol joystick ile kaç',
        'info.dash.title': 'DASH',
        'info.dash.mouse': 'sağ tık, shift veya space: kısa süre dokunulmazsın, mermilerin içinden geçebilirsin',
        'info.dash.touch': 'sağdaki DASH butonu: kısa süre dokunulmazsın, mermilerin içinden geçebilirsin',
        'info.graze.title': 'graze',
        'info.graze.text': 'mermilerin yanından kıl payı sıyrıl: puan ve seri çarpanı kazanırsın',
        'info.edge.title': 'kenarlar',
        'info.edge.text': 'arenanın kenarına değmek de oyunu bitirir',
        'info.boss.title': 'bosslar',
        'info.boss.text': 'yakınında graze yaparak ve dash ile içinden geçerek erit',
        'info.candy.title': 'şeker',
        'info.candy.text': 'sahada beliren şeker paraları topla (1, 5, 10, 50, 100); değeri yüksek olan daha nadir çıkar ve daha çabuk kaybolur. Tur sonunda puanına göre de şeker kazanırsın; bazı kostümleri şekerle alabilirsin',
        'hud.candies': '🍬 {n}',
        'info.keys.title': 'kısayollar',
        'info.keys.text': 'P duraklat · B müzik · N efektler · O ayarlar · I bilgi · ← → kostüm · ↑ ↓ Tab menüde gezin · oyun bitince Enter tekrar, M menü, C paylaş',
        'info.close': 'kapatmak için tıkla · ESC',
        'info.closeTouch': 'kapatmak için dokun',
        'menu.play': 'OYNA ▶ {mode}',
        'menu.locked': 'kilitli · {hint}',
        'menu.costumes': 'kostüm {count}',

        // Modlar
        'mode.classic.label': 'CLASSIC',
        'mode.classic.desc': 'fazlar, bosslar ve kaos · ne kadar dayanabilirsin?',
        'mode.endless.label': 'ENDLESS',
        'mode.endless.desc': 'mermiler durmadan hızlanır ve sıklaşır · sınır yok',
        'mode.hardcore.label': 'HARDCORE',
        'mode.hardcore.desc': 'yüksek hız, yoğun mermi yağmuru ve agresif nişan',
        'mode.chaos.label': 'CHAOS',
        'mode.chaos.desc': 'kenar, spiral, aim ve seken lazerler aynı anda aktif',
        'mode.daily.label': 'GÜNLÜK',
        'mode.daily.desc': 'bugün herkese aynı desen · arkadaşlarınla yarış',

        // Ayarlar
        'settings.title': 'ayarlar',
        'settings.musicVolume': 'müzik sesi',
        'settings.sfxVolume': 'efekt sesi',
        'settings.shake': 'sarsıntı ve flaş',
        'settings.contrast': 'yüksek kontrast',
        'settings.ghost': 'hayalet (en iyi tur)',
        'settings.lang': 'dil',
        'settings.tutorial': 'ipuçlarını tekrar göster',
        'settings.close': 'kapat ✕',
        'settings.help': '↑ ↓ seç · ← → değiştir · ESC kapat',
        'settings.mutedSfx': 'sessiz · N',
        'settings.mutedMusic': 'sessiz · B',
        'settings.on': 'açık',
        'settings.off': 'kapalı',

        // HUD
        'hud.graze': 'graze {n}',
        'hud.best': 'en iyi ★ {score}',
        'hud.shield': 'kalkan {pips}',
        'hud.slowmo': 'yavaş {s}s',
        'hud.dashReady': 'DASH hazır · sağ tık / space / shift',
        'hud.dashCharging': 'dash doluyor…',
        'hud.ghost': 'en iyi',
        'hud.combo': 'seri {n}',

        // Duraklatma
        'pause.title': 'duraklatıldı',
        'pause.resumeTouch': 'devam etmek için dokun',
        'pause.resume': 'tıkla · space · P · ESC → devam',
        'pause.menu': 'M → ana menü',

        // Ölüm ekranı
        'dead.title': 'OYUN BİTTİ',
        'dead.newRecord': '★ yeni rekor! ★',
        'dead.score': 'skor',
        'dead.time': 'süre',
        'dead.graze': 'graze',
        'dead.combo': 'en uzun seri',
        'dead.best': 'en iyi ★ {score} · {time}',
        'dead.bossKills': '✓ {n} boss yenildi',
        'dead.bossHp': '{title} enerjisi %{hp}',
        'dead.unlocked': '🎁 yeni kostüm: {names}',
        'dead.retryBtn': '↻ TEKRAR OYNA',
        'dead.cause.wall': '🧱 kenara çarptın',
        'dead.cause.bullet': '🍬 şekere çarptın',
        'dead.cause.boss': '👑 {boss} ile çarpıştın',

        // Bildirimler
        'banner.phase': 'FAZ: {name}',
        'banner.bossIncoming': '⚠ {title} GELİYOR!',
        'banner.bossStage': '{title}: {stage}',
        'banner.bossDefeated': '★ {title} YENİLDİ! ★',
        'banner.musicOn': '♪ müzik açık',
        'banner.musicOff': '♪ müzik kapalı',
        'banner.sfxOn': '♫ efektler açık',
        'banner.sfxOff': '♫ efektler kapalı',
        'banner.tipsReset': 'ipuçları sıfırlandı',
        'banner.ghostPassed': '👻 hayaletini geride bıraktın!',
        'banner.shieldBroken': 'KALKAN PATLADI!',
        'banner.shieldLeft': 'POF! {pips}',
        'banner.copied': '✓ sonuç kopyalandı',
        'banner.copyFailed': 'kopyalanamadı',
        'banner.shieldPicked': 'KALKAN {pips}',
        'banner.slowmo': 'YAVAŞ ÇEKİM!',
        'banner.emp': 'POP! ({n} MERMİ)',

        // Güçlendirmeler
        'pickup.shield': 'KALKAN',
        'pickup.slowmo': 'YAVAŞ',
        'pickup.emp': 'POP!',

        // Bosslar
        'boss.jelly.title': 'Jöle Kral',
        'boss.jelly.stage0': 'BLOOM',
        'boss.jelly.stage1': 'FANG',
        'boss.jelly.stage2': 'VORTEX',
        'boss.cloud.title': 'Pamuk Bulut',
        'boss.cloud.stage0': 'YAĞMUR',
        'boss.cloud.stage1': 'DUVAR',
        'boss.cloud.stage2': 'GİRDAP',
        'boss.barHint': 'graze + dash = hasar',

        // İpuçları
        'tip.walls.mouse': 'fareyle kaç · kenarlara değme!',
        'tip.walls.touch': 'joystick ile kaç · kenarlara değme!',
        'tip.graze': 'mermilerin yanından sıyrıl → graze = puan',
        'tip.dash.mouse': 'sağ tık / space → DASH: kısa süre dokunulmazsın',
        'tip.dash.touch': 'DASH butonu: kısa süre dokunulmazsın',
        'tip.boss': 'boss: yakınında graze yap, dash ile içinden geç!',

        // Kostümler
        'skin.classic.name': 'Klasik', 'skin.classic.hint': 'başlangıç kostümü',
        'skin.strawberry.name': 'Çilek', 'skin.strawberry.hint': 'tek turda 50 graze yap',
        'skin.lavender.name': 'Lavanta', 'skin.lavender.hint': '30 saniye hayatta kal',
        'skin.chocolate.name': 'Çikolata', 'skin.chocolate.hint': "Jöle Kral'ı erit",
        'skin.party.name': 'Parti', 'skin.party.hint': "20'lik graze serisi yap",
        'skin.bow.name': 'Fiyonk', 'skin.bow.hint': '3 farklı gün günlük meydan okuma oyna',
        'skin.cotton.name': 'Pamuk', 'skin.cotton.hint': "Pamuk Bulut'u dağıt",
        'skin.royal.name': 'Kraliyet', 'skin.royal.hint': "HARDCORE'da 30 saniye dayan",
        'skin.caramel.name': 'Karamel', 'skin.caramel.hint': 'şekerle alınır',
        'skin.bubblegum.name': 'Sakız', 'skin.bubblegum.hint': 'şekerle alınır',
        'skin.night.name': 'Gece', 'skin.night.hint': 'şekerle alınır',
        'skin.chef.name': 'Şef', 'skin.chef.hint': 'şekerle alınır',
        'shop.buy': '🍬 {price} · al',
        'shop.confirm': 'emin misin? 🍬 {price}',
        'shop.need': '🍬 {price} · {need} eksik',
        'shop.bought': '{name} alındı!',
        'dead.candies': '+{n} 🍬',

        // Paylaşım
        'share.combo': 'seri',

        // HTML
        'dom.menu': 'ANA MENÜ',
        'dom.share': 'PAYLAŞ',
        'dom.rotate': 'Yatay oynamak için cihazı çevir.',
        'dom.pause': 'Duraklat',
        'dom.joystick': "Hareket joystick'i",
        'dom.canvas': 'Bullet Hell Micro oyun alanı',
        'dom.info': 'Nasıl oynanır'
    },
    en: {
        'menu.settings': '⚙ settings',
        'menu.pickMode': 'pick a mode',
        'menu.best': 'best ★ {score}',
        'info.title': 'how to play',
        'info.move.title': 'move',
        'info.move.mouse': 'steer with the mouse or use WASD / arrow keys',
        'info.move.touch': 'dodge with the joystick on the bottom left',
        'info.dash.title': 'DASH',
        'info.dash.mouse': 'right click, shift or space: briefly invincible, pass through bullets',
        'info.dash.touch': 'the DASH button on the right: briefly invincible, pass through bullets',
        'info.graze.title': 'graze',
        'info.graze.text': 'skim right past bullets: earn points and a combo multiplier',
        'info.edge.title': 'edges',
        'info.edge.text': 'touching the edge of the arena also ends the run',
        'info.boss.title': 'bosses',
        'info.boss.text': 'melt them by grazing close and dashing through them',
        'info.candy.title': 'candy',
        'info.candy.text': 'grab candy coins that pop up (1, 5, 10, 50, 100); bigger ones are rarer and vanish faster. Each run also earns candy from your score; buy some costumes with it',
        'hud.candies': '🍬 {n}',
        'info.keys.title': 'shortcuts',
        'info.keys.text': 'P pause · B music · N sound fx · O settings · I info · ← → costume · ↑ ↓ Tab navigate · after a run Enter again, M menu, C share',
        'info.close': 'click or ESC to close',
        'info.closeTouch': 'tap to close',
        'menu.play': 'PLAY ▶ {mode}',
        'menu.locked': 'locked · {hint}',
        'menu.costumes': 'costume {count}',

        'mode.classic.desc': 'phases, bosses and chaos · how long can you last?',
        'mode.endless.desc': 'bullets keep getting faster and denser · no limit',
        'mode.hardcore.desc': 'fast bullets, dense waves and aggressive aim',
        'mode.chaos.desc': 'edge, spiral, aimed and bouncing shots all at once',
        'mode.daily.label': 'DAILY',
        'mode.daily.desc': 'same pattern for everyone today · race your friends',

        'settings.title': 'settings',
        'settings.musicVolume': 'music volume',
        'settings.sfxVolume': 'sound fx volume',
        'settings.shake': 'shake and flash',
        'settings.contrast': 'high contrast',
        'settings.ghost': 'ghost (best run)',
        'settings.lang': 'language',
        'settings.tutorial': 'show tips again',
        'settings.close': 'close ✕',
        'settings.help': '↑ ↓ select · ← → change · ESC close',
        'settings.mutedSfx': 'muted · N',
        'settings.mutedMusic': 'muted · B',
        'settings.on': 'on',
        'settings.off': 'off',

        'hud.graze': 'graze {n}',
        'hud.best': 'best ★ {score}',
        'hud.shield': 'shield {pips}',
        'hud.slowmo': 'slow {s}s',
        'hud.dashReady': 'DASH ready · right click / space / shift',
        'hud.dashCharging': 'dash charging…',
        'hud.ghost': 'best',
        'hud.combo': 'combo {n}',

        'pause.title': 'paused',
        'pause.resumeTouch': 'tap to continue',
        'pause.resume': 'click · space · P · ESC → resume',
        'pause.menu': 'M → main menu',

        'dead.title': 'GAME OVER',
        'dead.newRecord': '★ new record! ★',
        'dead.score': 'score',
        'dead.time': 'time',
        'dead.graze': 'graze',
        'dead.combo': 'longest combo',
        'dead.best': 'best ★ {score} · {time}',
        'dead.bossKills': '✓ {n} boss defeated',
        'dead.bossHp': '{title} energy {hp}%',
        'dead.unlocked': '🎁 new costume: {names}',
        'dead.retryBtn': '↻ PLAY AGAIN',
        'dead.cause.wall': '🧱 you hit the edge',
        'dead.cause.bullet': '🍬 a candy hit you',
        'dead.cause.boss': '👑 you bumped into {boss}',

        'banner.phase': 'PHASE: {name}',
        'banner.bossIncoming': '⚠ {title} INCOMING!',
        'banner.bossStage': '{title}: {stage}',
        'banner.bossDefeated': '★ {title} DEFEATED! ★',
        'banner.musicOn': '♪ music on',
        'banner.musicOff': '♪ music off',
        'banner.sfxOn': '♫ sound fx on',
        'banner.sfxOff': '♫ sound fx off',
        'banner.tipsReset': 'tips reset',
        'banner.ghostPassed': '👻 you outlasted your ghost!',
        'banner.shieldBroken': 'SHIELD POPPED!',
        'banner.shieldLeft': 'POP! {pips}',
        'banner.copied': '✓ result copied',
        'banner.copyFailed': 'could not copy',
        'banner.shieldPicked': 'SHIELD {pips}',
        'banner.slowmo': 'SLOW MOTION!',
        'banner.emp': 'POP! ({n} BULLETS)',

        'pickup.shield': 'SHIELD',
        'pickup.slowmo': 'SLOW',
        'pickup.emp': 'POP!',

        'boss.jelly.title': 'Jelly King',
        'boss.cloud.title': 'Cotton Cloud',
        'boss.cloud.stage0': 'RAIN',
        'boss.cloud.stage1': 'WALLS',
        'boss.cloud.stage2': 'WHIRL',
        'boss.barHint': 'graze + dash = damage',

        'tip.walls.mouse': 'dodge with the mouse · don’t touch the edges!',
        'tip.walls.touch': 'dodge with the joystick · don’t touch the edges!',
        'tip.graze': 'skim past bullets → graze = points',
        'tip.dash.mouse': 'right click / space → DASH: briefly invincible',
        'tip.dash.touch': 'DASH button: briefly invincible',
        'tip.boss': 'boss: graze near it, dash through it!',

        'skin.classic.name': 'Classic', 'skin.classic.hint': 'starter costume',
        'skin.strawberry.name': 'Strawberry', 'skin.strawberry.hint': 'graze 50 times in one run',
        'skin.lavender.name': 'Lavender', 'skin.lavender.hint': 'survive 30 seconds',
        'skin.chocolate.name': 'Chocolate', 'skin.chocolate.hint': 'melt the Jelly King',
        'skin.party.name': 'Party', 'skin.party.hint': 'reach a 20-graze combo',
        'skin.bow.name': 'Bow', 'skin.bow.hint': 'play the daily challenge on 3 days',
        'skin.cotton.name': 'Cotton', 'skin.cotton.hint': 'scatter the Cotton Cloud',
        'skin.royal.name': 'Royal', 'skin.royal.hint': 'last 30 seconds in HARDCORE',
        'skin.caramel.name': 'Caramel', 'skin.caramel.hint': 'buy with candy',
        'skin.bubblegum.name': 'Bubblegum', 'skin.bubblegum.hint': 'buy with candy',
        'skin.night.name': 'Night', 'skin.night.hint': 'buy with candy',
        'skin.chef.name': 'Chef', 'skin.chef.hint': 'buy with candy',
        'shop.buy': '🍬 {price} · buy',
        'shop.confirm': 'sure? 🍬 {price}',
        'shop.need': '🍬 {price} · need {need}',
        'shop.bought': '{name} unlocked!',
        'dead.candies': '+{n} 🍬',

        'share.combo': 'combo',

        'dom.menu': 'MAIN MENU',
        'dom.share': 'SHARE',
        'dom.rotate': 'Rotate your device to play in landscape.',
        'dom.pause': 'Pause',
        'dom.joystick': 'Movement joystick',
        'dom.canvas': 'Bullet Hell Micro play area',
        'dom.info': 'How to play'
    }
};

export const LANGS = ['tr', 'en'];
export const LANG_NAMES = { tr: 'Türkçe', en: 'English' };

export function detectLang() {
    try {
        const l = (typeof navigator !== 'undefined' && navigator.language) || 'tr';
        return l.toLowerCase().startsWith('tr') ? 'tr' : 'en';
    } catch (e) {
        return 'tr';
    }
}

export function setLang(value) {
    lang = LANGS.includes(value) ? value : 'tr';
}

export function getLang() {
    return lang;
}

/**
 * @param {string} key
 * @param {object} params {ad} yer tutucuları
 * @param {string} fallback Sözlükte yoksa
 */
export function t(key, params = null, fallback = null) {
    let text = STRINGS[lang][key] ?? STRINGS.tr[key] ?? fallback ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
    }
    return text;
}

/** Dile uygun büyük harf (Türkçede i → İ) */
export function upper(text) {
    return String(text).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US');
}
