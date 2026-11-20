import { describe, it, expect } from 'vitest';
import { resolveInitialLocale, t } from './i18n';

describe('resolveInitialLocale', () => {
  it('uses stored value when valid and present', () => {
    expect(resolveInitialLocale('es', ['en'])).toBe('es');
    expect(resolveInitialLocale('en', ['es'])).toBe('en');
    expect(resolveInitialLocale('fr', ['en'])).toBe('fr');
    expect(resolveInitialLocale('de', ['en'])).toBe('de');
    expect(resolveInitialLocale('pt', ['en'])).toBe('pt');
    expect(resolveInitialLocale('it', ['en'])).toBe('it');
    expect(resolveInitialLocale('nl', ['en'])).toBe('nl');
    expect(resolveInitialLocale('ja', ['en'])).toBe('ja');
    expect(resolveInitialLocale('zh', ['en'])).toBe('zh');
  });

  it('ignores invalid stored values', () => {
    expect(resolveInitialLocale('xx', ['es'])).toBe('es');
    expect(resolveInitialLocale(null, ['es-ES'])).toBe('es');
    expect(resolveInitialLocale(null, ['en-US'])).toBe('en');
    expect(resolveInitialLocale('ru', ['en'])).toBe('en');
    expect(resolveInitialLocale('xx', [])).toBe('en');
  });

  it('stored value wins over every browser preference and an empty browser list', () => {
    expect(resolveInitialLocale('es', ['en-US', 'en-GB'])).toBe('es');
    expect(resolveInitialLocale('es', [])).toBe('es');
    expect(resolveInitialLocale('en', ['es-ES', 'es-MX'])).toBe('en');
  });

  it('matches es and es-* from browser languages', () => {
    expect(resolveInitialLocale(null, ['es'])).toBe('es');
    expect(resolveInitialLocale(null, ['es-ES'])).toBe('es');
    expect(resolveInitialLocale(null, ['es-MX'])).toBe('es');
  });

  it('matches en and en-* from browser languages', () => {
    expect(resolveInitialLocale(null, ['en'])).toBe('en');
    expect(resolveInitialLocale(null, ['en-US'])).toBe('en');
    expect(resolveInitialLocale(null, ['en-GB'])).toBe('en');
  });

  it('matches fr, de, pt, it, nl, ja, zh from browser languages', () => {
    expect(resolveInitialLocale(null, ['fr'])).toBe('fr');
    expect(resolveInitialLocale(null, ['fr-FR'])).toBe('fr');
    expect(resolveInitialLocale(null, ['de'])).toBe('de');
    expect(resolveInitialLocale(null, ['de-DE'])).toBe('de');
    expect(resolveInitialLocale(null, ['pt'])).toBe('pt');
    expect(resolveInitialLocale(null, ['pt-BR'])).toBe('pt');
    expect(resolveInitialLocale(null, ['it'])).toBe('it');
    expect(resolveInitialLocale(null, ['it-IT'])).toBe('it');
    expect(resolveInitialLocale(null, ['nl'])).toBe('nl');
    expect(resolveInitialLocale(null, ['nl-NL'])).toBe('nl');
    expect(resolveInitialLocale(null, ['ja'])).toBe('ja');
    expect(resolveInitialLocale(null, ['ja-JP'])).toBe('ja');
    expect(resolveInitialLocale(null, ['zh'])).toBe('zh');
    expect(resolveInitialLocale(null, ['zh-CN'])).toBe('zh');
  });

  it('falls back to English for unsupported languages', () => {
    expect(resolveInitialLocale(null, ['ko'])).toBe('en');
    expect(resolveInitialLocale(null, ['ru'])).toBe('en');
    expect(resolveInitialLocale(null, ['ar'])).toBe('en');
  });

  it('falls back to English when no browser languages', () => {
    expect(resolveInitialLocale(null, [])).toBe('en');
    expect(resolveInitialLocale(null, [''])).toBe('en');
  });

  it('first supported browser language wins', () => {
    expect(resolveInitialLocale(null, ['es', 'en'])).toBe('es');
    expect(resolveInitialLocale(null, ['en', 'de'])).toBe('en');
    expect(resolveInitialLocale(null, ['ko', 'fr'])).toBe('fr');
  });
});

describe('t()', () => {
  it('returns the translation for the given locale', () => {
    expect(t('es', 'portal.login')).toBe('Iniciar sesión');
    expect(t('en', 'portal.login')).toBe('Sign in');
    expect(t('fr', 'portal.login')).toBe('Connexion');
    expect(t('de', 'portal.login')).toBe('Anmelden');
    expect(t('pt', 'portal.login')).toBe('Entrar');
    expect(t('it', 'portal.login')).toBe('Accedi');
    expect(t('nl', 'portal.login')).toBe('Inloggen');
    expect(t('ja', 'portal.login')).toBe('ログイン');
    expect(t('zh', 'portal.login')).toBe('登录');
  });

  it('falls back to English when key missing in target locale', () => {
    // All keys should exist, but test fallback mechanism
    expect(t('es', 'portal.title_col')).toBe('Asunto');
  });

  it('interpolates variables', () => {
    expect(t('en', 'portal.magic_link_sent', { email: 'a@b.com' }))
      .toBe('Magic link sent to a@b.com. Check your inbox.');
  });

  it('returns key as last resort', () => {
    expect(t('es', 'nonexistent.key.xxx')).toBe('nonexistent.key.xxx');
  });
});
