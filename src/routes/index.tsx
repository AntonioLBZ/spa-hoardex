import { Link, createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { PageTitle } from '@/components/page-title';
import { EntryForm } from '@/features/entry-form';
import { riseStyle } from '@/lib/motion';

import './entry.scss';

interface EntrySearch {
    // Set by the Steam callback when a sign-in fails
    login?: 'failed';
}

export const Route = createFileRoute('/')({
    component: EntryRoute,
    validateSearch: (search: Record<string, unknown>): EntrySearch =>
        search.login === 'failed' ? { login: 'failed' } : {},
});

function EntryRoute() {
    const t = useTranslations('app');
    const tEntry = useTranslations('entry');
    const { login } = Route.useSearch();

    return (
        <div className="entry">
            <PageTitle />
            <h1 className="rise-in" style={riseStyle(0)}>
                {t('tagline')}
            </h1>
            {login === 'failed' && (
                <p className="entry__login-failed" role="alert">
                    {tEntry('loginFailed')}
                </p>
            )}
            <EntryForm />
            <p className="entry__demo rise-in" style={riseStyle(2)}>
                <Link to="/demo">{tEntry('demo')}</Link>
            </p>
        </div>
    );
}
