import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { LibrarySection } from './library-section';
import { Pending } from './pending';
import { Problem, problemFromError } from './problem';
import { libraryQueryFor, profileQueryFor } from './source-queries';

import './profile-page.scss';

// A Steam profile typed by the visitor, or the fictional demo library
export type ProfileSource = { kind: 'steam'; input: string } | { kind: 'demo' };

export function ProfilePage({ source }: { source: ProfileSource }) {
    const t = useTranslations('profile');
    const profile = useQuery(profileQueryFor(source));
    // Started together with the profile: the library takes the same input, so it does not wait to learn the id
    const library = useQuery(libraryQueryFor(source));

    if (profile.isPending) return <Pending header label={t('loadingProfile')} />;
    if (profile.isError)
        return (
            <Problem kind={problemFromError(profile.error)} onRetry={() => void profile.refetch()} source={source} />
        );
    if (profile.data.kind !== 'ok')
        return <Problem kind={profile.data.kind} onRetry={() => void profile.refetch()} source={source} />;

    const { displayName, avatarUrl } = profile.data.data;

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
            <LibrarySection library={library} source={source} />
        </article>
    );
}
