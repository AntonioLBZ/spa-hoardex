import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { profileQuery } from '../../lib/api';
import { LibrarySummary } from './library-summary';
import { Problem, problemFromError } from './problem';

import './profile-page.scss';

export function ProfilePage({ input }: { input: string }) {
    const t = useTranslations('profile');
    const profile = useQuery(profileQuery(input));

    if (profile.isPending) return <p role="status">{t('loadingProfile')}</p>;
    if (profile.isError)
        return <Problem kind={problemFromError(profile.error)} onRetry={() => void profile.refetch()} />;
    if (profile.data.kind !== 'ok') return <Problem kind={profile.data.kind} onRetry={() => void profile.refetch()} />;

    const { displayName, avatarUrl, id } = profile.data.data;

    return (
        <article className="profile-page">
            <header className="profile-page__header">
                <img alt="" className="profile-page__avatar" height={64} src={avatarUrl} width={64} />
                <h1 className="profile-page__name">{displayName}</h1>
            </header>
            <LibrarySummary steamId={id.externalId} />
        </article>
    );
}
