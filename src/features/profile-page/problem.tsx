import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import type { ProfileAccessKind } from '@core/domain';
import { Button } from '@/components/button';
import { StateMessage } from '@/components/state-message';
import { ApiError } from '@/lib/api';

export type ProblemKind = Exclude<ProfileAccessKind, 'ok'> | 'upstream';

// An input our API rejects reads as "not found" to the visitor
export function problemFromError(error: unknown): ProblemKind {
    return error instanceof ApiError && error.code === 'invalidInput' ? 'notFound' : 'upstream';
}

interface ProblemProps {
    kind: ProblemKind;
    onRetry?: () => void;
}

export function Problem({ kind, onRetry }: ProblemProps) {
    const t = useTranslations('problem');
    const tProfile = useTranslations('profile');
    const retryable = kind === 'upstream' || kind === 'rateLimited';

    return (
        <StateMessage
            body={t(`${kind}.body`)}
            role={kind === 'upstream' ? 'alert' : 'status'}
            title={t(`${kind}.title`)}
        >
            {retryable && onRetry !== undefined ? <Button onClick={onRetry}>{tProfile('retry')}</Button> : null}
            <Link to="/">{tProfile('back')}</Link>
        </StateMessage>
    );
}
