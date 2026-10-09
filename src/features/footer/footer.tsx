import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { LOCALES, useLocale } from '@/lib/i18n';

import './footer.scss';

const LOCALE_NAMES: Record<(typeof LOCALES)[number], string> = { en: 'English', es: 'Español' };

export function Footer() {
    const t = useTranslations('footer');
    const { locale, setLocale } = useLocale();

    return (
        <footer className="footer">
            <div className="footer__row">
                <p className="footer__links">
                    <Link to="/privacy">{t('privacy')}</Link>
                </p>
                <ul aria-label={t('language')} className="footer__languages">
                    {LOCALES.map((code) => (
                        <li key={code}>
                            <button
                                aria-pressed={code === locale}
                                className="footer__language"
                                lang={code}
                                onClick={() => setLocale(code)}
                                type="button"
                            >
                                {LOCALE_NAMES[code]}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            <p className="footer__disclaimer">{t('disclaimer')}</p>
            <p className="footer__disclaimer">{t('trademark', { year: new Date().getFullYear() })}</p>
        </footer>
    );
}
