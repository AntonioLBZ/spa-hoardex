import { Link } from '@tanstack/react-router';
import type { ChangeEvent } from 'react';
import { useTranslations } from 'use-intl';

import { LOCALES, isLocale, useLocale } from '@/lib/i18n';

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
                {t('name')}
            </Link>
            <select aria-label={t('language')} className="header__language" onChange={onChange} value={locale}>
                {LOCALES.map((code) => (
                    <option key={code} lang={code} value={code}>
                        {LOCALE_NAMES[code]}
                    </option>
                ))}
            </select>
        </header>
    );
}
