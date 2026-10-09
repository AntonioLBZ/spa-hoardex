import { Link } from '@tanstack/react-router';
import { Suspense, lazy, type ChangeEvent } from 'react';
import { useTranslations } from 'use-intl';

import { LOCALES, isLocale, useLocale } from '@/lib/i18n';

// Its own chunk: the session query would pull TanStack Query into the entry screen's bundle
const AccountControl = lazy(() => import('./account-control').then((module) => ({ default: module.AccountControl })));

import './header.scss';

const LOCALE_NAMES: Record<(typeof LOCALES)[number], string> = { en: 'English', es: 'Español' };

export function Header() {
    const t = useTranslations('app');
    const { locale, setLocale } = useLocale();

    function onChange(event: ChangeEvent<HTMLSelectElement>) {
        if (isLocale(event.target.value)) setLocale(event.target.value);
    }

    return (
        <header className="header">
            <Link className="header__brand" to="/">
                <img alt="" className="header__logo" height="24" src="/logo.svg" width="24" />
                {t('name')}
            </Link>
            <div className="header__actions">
                <Suspense fallback={null}>
                    <AccountControl />
                </Suspense>
                <select aria-label={t('language')} className="header__language" onChange={onChange} value={locale}>
                    {LOCALES.map((code) => (
                        <option key={code} lang={code} value={code}>
                            {LOCALE_NAMES[code]}
                        </option>
                    ))}
                </select>
            </div>
        </header>
    );
}
