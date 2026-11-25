// Interface language: Galician, Spanish or English. It starts in the system language and is
// changed from the selector at the top right; the choice is kept in the page's local storage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalysisMessage } from '../analysis/types';
import { en, type Catalog, type MessageKey } from './en';
import { es } from './es';
import { gl } from './gl';

export type Language = 'gl' | 'es' | 'en';

export const LANGUAGES: ReadonlyArray<{ code: Language; name: string }> = [
  { code: 'gl', name: 'Galego' },
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' }
];

const CATALOGS: Record<Language, Catalog> = { gl, es, en };
const LOCALES: Record<Language, string> = { gl: 'gl-ES', es: 'es-ES', en: 'en-GB' };
const STORAGE_KEY = 'moodlia-analyzer.language';

const isLanguage = (value: unknown): value is Language => value === 'gl' || value === 'es' || value === 'en';

/** The stored choice, or null when the user has not chosen yet. */
export function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** The first system language the app has, for the initial suggestion. */
export function systemLanguage(languages: readonly string[] = navigator.languages ?? [navigator.language]): Language {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

/** Fills {name} placeholders. */
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

interface I18n {
  language: Language;
  setLanguage(language: Language): void;
  t(key: MessageKey, values?: Record<string, string | number>): string;
  /** An analysis text in the current language. */
  message(entry: AnalysisMessage): string;
  /** An error from the main process: the app's own codes are translated, Moodle's messages are shown as sent. */
  error(error: { code: string; message: string }): string;
  date(seconds: number | null | undefined): string;
  dateTime(value: string | number | Date): string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Language | null>(storedLanguage);
  const language = stored ?? systemLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Without storage the choice lasts until the app closes.
    }
    setStored(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const catalog = CATALOGS[language];
    const locale = LOCALES[language];
    const t = (key: MessageKey, values?: Record<string, string | number>) => format(catalog[key] ?? en[key], values);
    return {
      language,
      setLanguage,
      t,
      message: (entry) => t(entry.key, entry.values),
      error: (error) => {
        const key = `error.${error.code}` as MessageKey;
        return key in catalog ? t(key) : error.message;
      },
      date: (seconds) => (seconds ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(seconds * 1000)) : t('access.never')),
      dateTime: (input) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(input))
    };
  }, [language, setLanguage]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n needs I18nProvider.');
  return value;
}

/** Selector to change the language at any time. */
export function LanguageSelect() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-select">
      <span className="visually-hidden">{t('language.label')}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        {LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
      </select>
    </label>
  );
}
