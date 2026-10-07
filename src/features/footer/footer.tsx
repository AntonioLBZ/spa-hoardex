import { useTranslations } from 'use-intl';

import './footer.scss';

export function Footer() {
    const t = useTranslations('footer');

    return (
        <footer className="footer">
            <p className="footer__disclaimer">{t('disclaimer')}</p>
            <p className="footer__disclaimer">{t('trademark', { year: new Date().getFullYear() })}</p>
        </footer>
    );
}
