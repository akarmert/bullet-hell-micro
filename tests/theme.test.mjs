import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME, applyTheme, resolveTheme, THEME_MODES } from '../js/theme.js';
import { Settings, SETTING_ROWS } from '../js/settings.js';
import { setLang } from '../js/i18n.js';

test('Tema: tercih + sistem ayarından gerçek tema çözülür', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('bozuk', true), 'light');
});

test('Tema: koyu paletle metin açık, zemin koyu; açığa dönünce eski renkler gelir', () => {
    const lightBg = THEME.BG;
    const lightText = THEME.TEXT;
    try {
        assert.equal(applyTheme('dark'), 'dark');
        assert.equal(THEME.dark, true);
        assert.notEqual(THEME.BG, lightBg);
        assert.equal(THEME.TEXT, '#F6EAFF');
        assert.equal(THEME.SURFACE, '#2E2150');
        assert.equal(THEME.BULLET_OUTLINE > 0, true, 'yüksek kontrast bayrağı korunur');
    } finally {
        applyTheme('light');
    }
    assert.equal(THEME.dark, false);
    assert.equal(THEME.BG, lightBg);
    assert.equal(THEME.TEXT, lightText);
});

test('Ayarlar: tema satırı sistem → açık → koyu arasında döner', () => {
    setLang('tr');
    assert.ok(SETTING_ROWS.some(r => r.id === 'theme' && r.type === 'choice'));
    const S = new Settings();
    assert.equal(S.get('theme'), 'system');
    assert.equal(S.display('theme'), 'sistem');
    S.adjust('theme', 1);
    assert.equal(S.get('theme'), 'light');
    S.adjust('theme', 1);
    assert.equal(S.get('theme'), 'dark');
    assert.equal(S.display('theme'), 'koyu');
    S.adjust('theme', 1);
    assert.equal(S.get('theme'), 'system');
    S.adjust('theme', -1);
    assert.equal(S.get('theme'), 'dark');
    assert.deepEqual(THEME_MODES, ['system', 'light', 'dark']);
});
