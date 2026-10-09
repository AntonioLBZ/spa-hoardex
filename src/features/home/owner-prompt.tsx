import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { loginHref, meQuery } from '@/lib/api';

// Only for a signed-out visitor, once the session is known
export function OwnerPrompt() {
    const t = useTranslations('home.owner');
    const me = useQuery(meQuery());

    if (me.isPending || (me.data?.user ?? null) !== null) return null;

    return (
        <aside className="home__owner">
            <p className="home__owner-title">{t('title')}</p>
            <p className="home__owner-text">{t('text')}</p>
            <a className="home__owner-action" href={loginHref('/')}>
                {t('action')}
                <span aria-hidden="true"> →</span>
            </a>
        </aside>
    );
}
