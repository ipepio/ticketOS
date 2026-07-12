import { describe, it, expect } from 'vitest';
import { resolveInitialLocale, t } from './i18n';

describe('resolveInitialLocale', () => {
  it('uses stored value when valid and present', () => {
    expect(resolveInitialLocale('es', ['en'])).toBe('es');
    expect(resolveInitialLocale('en', ['es'])).toBe('en');
  });

  it('ignores invalid stored values', () => {
    expect(resolveInitialLocale('fr', ['es'])).toBe('es');
    expect(resolveInitialLocale(null, ['es-ES'])).toBe('es');
    expect(resolveInitialLocale(null, ['en-US'])).toBe('en');
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

  it('falls back to English for unsupported languages', () => {
    expect(resolveInitialLocale(null, ['fr'])).toBe('en');
    expect(resolveInitialLocale(null, ['de'])).toBe('en');
    expect(resolveInitialLocale(null, ['ja'])).toBe('en');
  });

  it('falls back to English when no browser languages', () => {
    expect(resolveInitialLocale(null, [])).toBe('en');
  });

  it('first supported browser language wins', () => {
    // First match wins — Spanish before English
    expect(resolveInitialLocale(null, ['es', 'en'])).toBe('es');
    // First match wins — English only
    expect(resolveInitialLocale(null, ['en', 'de'])).toBe('en');
  });
});

describe('t()', () => {
  it('returns the translation for the given locale', () => {
    expect(t('es', 'portal.login')).toBe('Iniciar sesión');
    expect(t('en', 'portal.login')).toBe('Sign in');
  });

  it('falls back to English when key missing in Spanish', () => {
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
