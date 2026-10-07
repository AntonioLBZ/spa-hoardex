import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { demoProfileQuery, profileQuery } from '@/lib/api';
import { LibrarySection } from './library-section';
import { Problem, problemFromError } from './problem';

import './profile-page.scss';

// A Steam profile typed by the visitor, or the fictional demo library
export type ProfileSource = { kind: 'steam'; input: string } | { kind: 'demo' };

export function ProfilePage({ source }: { source: ProfileSource }) {
    const t = useTranslations('profile');
    const profile = useQuery(source.kind === 'demo' ? demoProfileQuery() : profileQuery(source.input));

    if (profile.isPending) return <p role="status">{t('loadingProfile')}</p>;
    if (profile.isError)
        return <Problem kind={problemFromError(profile.error)} onRetry={() => void profile.refetch()} />;
    if (profile.data.kind !== 'ok') return <Problem kind={profile.data.kind} onRetry={() => void profile.refetch()} />;

    const { displayName, avatarUrl, id } = profile.data.data;

    return (
        <article className="profile-page">
            {source.kind === 'demo' ? (
                <p className="profile-page__notice" role="note">
                    {t('demoNotice')}
                </p>
            ) : null}
            <header className="profile-page__header">
                <img alt="" className="profile-page__avatar" height={64} src={avatarUrl} width={64} />
                <h1 className="profile-page__name">{displayName}</h1>
            </header>
            <LibrarySection source={source} steamId={id.externalId} />
        </article>
    );
}
