import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import type { ProfileAccessKind } from '@core/domain';
import { Button } from '@/components/button';
import { LockedPanel } from '@/components/locked-panel';
import { PrivacySettingsLink } from '@/components/privacy-settings-link';
import { StateMessage } from '@/components/state-message';
import { ApiError } from '@/lib/api';
import type { ProfileSource } from './profile-page';
import { settingsUrlFor } from './settings-url';

export type ProblemKind = Exclude<ProfileAccessKind, 'ok'> | 'upstream' | 'tooManyRequests';

// Privacy states: the owner can fix them in Steam
const LOCKED_KINDS: readonly ProblemKind[] = ['profilePrivate', 'libraryPrivate', 'wishlistPrivate'];

// A GET 429 can only be the firewall: our API answers 429 to the refresh POST alone
export function problemFromError(error: unknown): ProblemKind {
    if (!(error instanceof ApiError)) return 'upstream';
    if (error.code === 'invalidInput') return 'notFound';
    return error.status === 429 ? 'tooManyRequests' : 'upstream';
}

interface ProblemProps {
    kind: ProblemKind;
    source: ProfileSource;
    onRetry?: () => void;
}

export function Problem({ kind, source, onRetry }: ProblemProps) {
    const t = useTranslations('problem');
    const tProfile = useTranslations('profile');
    const locked = LOCKED_KINDS.includes(kind);
    // After changing the setting in Steam, try again
    const retryable = locked || kind === 'upstream' || kind === 'rateLimited' || kind === 'tooManyRequests';
    const settingsUrl = locked ? settingsUrlFor(source) : null;

    const actions = (
        <>
            {settingsUrl === null ? null : <PrivacySettingsLink href={settingsUrl} />}
            {retryable && onRetry !== undefined ? <Button onClick={onRetry}>{tProfile('retry')}</Button> : null}
            <Link to="/">{tProfile('back')}</Link>
        </>
    );

    if (locked) {
        return (
            <LockedPanel body={t(`${kind}.body`)} title={t(`${kind}.title`)}>
                {actions}
            </LockedPanel>
        );
    }

    return (
        <StateMessage
            body={t(`${kind}.body`)}
            role={kind === 'upstream' ? 'alert' : 'status'}
            title={t(`${kind}.title`)}
        >
            {actions}
        </StateMessage>
    );
}
