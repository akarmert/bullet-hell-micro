// ============================================================
// share.js — Sonucu Paylaş
// Wordle tarzı kısa sonuç metni; telefonda paylaşım menüsü,
// masaüstünde panoya kopyalama.
// ============================================================

import { formatScore } from './score.js';
import { t } from './i18n.js';

/**
 * @param {object} r { title, modeLabel, dateText, score, timeText, timeMs, graze, bestCombo, bossKills, url }
 */
export function buildShareText(r) {
    const candies = Math.max(1, Math.min(10, Math.floor((r.timeMs || 0) / 10000) + 1));
    const bar = '🍬'.repeat(candies) + (r.bossKills > 0 ? '👑'.repeat(Math.min(5, r.bossKills)) : '');
    const head = r.dateText ? `${r.modeLabel} · ${r.dateText}` : r.modeLabel;
    const lines = [
        `${r.title || 'Bullet Hell Micro'} — ${head}`,
        `★ ${formatScore(r.score)} · ⏱ ${r.timeText}`,
        `✨ graze ${r.graze} · ${t('share.combo')} ${r.bestCombo}${r.bossKills ? ` · boss ${r.bossKills}` : ''}`,
        bar
    ];
    if (r.url) lines.push(r.url);
    return lines.join('\n');
}

/**
 * Paylaşım menüsü (varsa) veya pano
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareText(text, preferNative = false) {
    try {
        if (preferNative && navigator.share) {
            await navigator.share({ text });
            return 'shared';
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return 'failed';
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return 'copied';
        }
    } catch (e) {
        // Aşağıdaki eski yönteme düş
    }
    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok ? 'copied' : 'failed';
    } catch (e) {
        return 'failed';
    }
}
