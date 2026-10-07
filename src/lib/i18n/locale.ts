export const LOCALES = ['en', 'es'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';

const STORAGE_KEY = 'hoardex:locale';

export function isLocale(value: unknown): value is AppLocale {
    return LOCALES.some((locale) => locale === value);
}

// Stored preference, then the browser's languages, then English
export function detectLocale(stored: string | null, languages: readonly string[]): AppLocale {
    if (isLocale(stored)) return stored;
    for (const tag of languages) {
        const language = tag.toLowerCase().split('-')[0];
        if (isLocale(language)) return language;
    }
    return DEFAULT_LOCALE;
}

export function readStoredLocale(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function storeLocale(locale: AppLocale): void {
    try {
        localStorage.setItem(STORAGE_KEY, locale);
    } catch {
        // Storage can be blocked; the choice then lasts for the session only
    }
}
