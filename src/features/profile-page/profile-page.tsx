import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { OwnerBubble } from '@/components/owner-prompt';
import { riseStyle } from '@/lib/motion';
import { steamProfileLink } from '@/lib/steam-links';
import { LibrarySection } from './library-section';
import { Pending } from './pending';
import { Problem, problemFromError } from './problem';
import { RefreshControl } from './refresh-control';
import { ProfileTitle } from './profile-title';
import { libraryQueryFor, profileQueryFor } from './source-queries';

import './profile-page.scss';

// A Steam profile typed by the visitor, or the fictional demo library
export type ProfileSource = { kind: 'steam'; input: string } | { kind: 'demo' };

export function ProfilePage({ source }: { source: ProfileSource }) {
    return (
        <>
            <ProfileTitle source={source} />
            <ProfileContent source={source} />
            {source.kind === 'steam' ? <OwnerBubble /> : null}
        </>
    );
}

function ProfileContent({ source }: { source: ProfileSource }) {
    const t = useTranslations('profile');
    const tLibrary = useTranslations('library');
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

    const { id, displayName, avatarUrl, profileUrl } = profile.data.data;
    // The demo's profile is fictional: never a link to Steam
    const steamLink = source.kind === 'steam' ? steamProfileLink(profileUrl) : null;
    const identity = (
        <>
            <img
                alt=""
                className="profile-page__avatar"
                height={72}
                referrerPolicy="no-referrer"
                src={avatarUrl}
                width={72}
            />
            <div className="profile-page__identity">
                <p className="eyebrow">
                    {t(source.kind === 'demo' ? 'demoEyebrow' : 'eyebrow')}
                    {steamLink === null ? null : <ExternalIcon />}
                </p>
                <h1 className="profile-page__name gradient-text">{displayName}</h1>
            </div>
        </>
    );

    return (
        <article className="profile-page">
            {source.kind === 'demo' ? (
                <p className="profile-page__notice" role="note">
                    {t('demoNotice')} {tLibrary('demoEditing')}
                </p>
            ) : null}
            <header className="profile-page__header glow rise-in" style={riseStyle(0)}>
                {steamLink === null ? (
                    <div className="profile-page__who">{identity}</div>
                ) : (
                    <a
                        className="profile-page__who profile-page__who--link"
                        href={steamLink}
                        referrerPolicy="no-referrer"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {identity}
                        <span className="visually-hidden"> {t('steamLink')}</span>
                    </a>
                )}
                {source.kind === 'steam' && library.data?.kind === 'ok' ? (
                    <RefreshControl input={source.input} library={library.data.data} />
                ) : null}
            </header>
            <LibrarySection library={library} profileId={id.externalId} source={source} />
        </article>
    );
}

function ExternalIcon() {
    return (
        <svg aria-hidden="true" className="profile-page__external" viewBox="0 0 16 16">
            <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />
        </svg>
    );
}
