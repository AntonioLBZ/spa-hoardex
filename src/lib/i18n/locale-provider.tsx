import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';

import { detectLocale, readStoredLocale, storeLocale, type AppLocale } from './locale';
import { MESSAGES } from './messages';

interface LocaleContextValue {
    locale: AppLocale;
    setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState(() => detectLocale(readStoredLocale(), navigator.languages));

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const setLocale = useCallback((next: AppLocale) => {
        storeLocale(next);
        setLocaleState(next);
    }, []);

    const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

    return (
        <LocaleContext value={value}>
            <IntlProvider locale={locale} messages={MESSAGES[locale]}>
                {children}
            </IntlProvider>
        </LocaleContext>
    );
}

export function useLocale(): LocaleContextValue {
    const value = use(LocaleContext);
    if (value === null) throw new Error('useLocale needs a LocaleProvider');
    return value;
}
