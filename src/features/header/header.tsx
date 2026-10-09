import { Link } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { useTranslations } from 'use-intl';

// Its own chunk: the session query would pull TanStack Query into the entry screen's bundle
const AccountControl = lazy(() => import('./account-control').then((module) => ({ default: module.AccountControl })));

import './header.scss';

export function Header() {
    const t = useTranslations('app');

    return (
        <header className="header">
            <Link className="header__brand" to="/">
                <img alt="" className="header__logo" height="24" src="/logo.svg" width="24" />
                {t('name')}
            </Link>
            <Suspense fallback={null}>
                <AccountControl />
            </Suspense>
        </header>
    );
}
