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

export type ProblemKind = Exclude<ProfileAccessKind, 'ok'> | 'upstream';

// Privacy states: the owner can fix them in Steam
const LOCKED_KINDS: readonly ProblemKind[] = ['profilePrivate', 'libraryPrivate', 'wishlistPrivate'];

// An input our API rejects reads as "not found" to the visitor
export function problemFromError(error: unknown): ProblemKind {
    return error instanceof ApiError && error.code === 'invalidInput' ? 'notFound' : 'upstream';
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
    const retryable = locked || kind === 'upstream' || kind === 'rateLimited';
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
