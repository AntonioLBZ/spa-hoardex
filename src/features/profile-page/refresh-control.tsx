import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import type { Library } from '@core/domain';
import { Button } from '@/components/button';
import { ApiError, libraryQuery, postRefresh, profileQuery } from '@/lib/api';
import { startCooldown, useCooldownEnd } from './refresh-cooldowns';

import './refresh-control.scss';

type Notice =
    | { kind: 'done' }
    | { kind: 'cooldown'; minutes: number }
    | { kind: 'rateLimited' }
    | { kind: 'tooManyRequests' }
    | { kind: 'failed' };

// How often the countdown and the "updated" age catch up
const TICK_MS = 10_000;

const minutesIn = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

interface RefreshControlProps {
    input: string;
    library: Library;
}

export function RefreshControl({ input, library }: RefreshControlProps) {
    const t = useTranslations('refresh');
    const format = useFormatter();
    const queryClient = useQueryClient();
    const accountId = library.owner.externalId;
    const until = useCooldownEnd(accountId);
    const [now, setNow] = useState(() => Date.now());
    const [notice, setNotice] = useState<Notice | null>(null);
    const metaId = useId();

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const refresh = useMutation({
        mutationFn: () => postRefresh(input),
        onMutate: () => setNotice(null),
        onSuccess: (outcome) => {
            const clock = Date.now();
            setNow(clock);
            if (outcome.kind === 'refreshed') {
                queryClient.setQueryData(profileQuery(input).queryKey, outcome.profile);
                queryClient.setQueryData(libraryQuery(input).queryKey, outcome.library);
                if (outcome.cooldownSeconds > 0) startCooldown(accountId, clock + outcome.cooldownSeconds * 1000);
                setNotice({ kind: 'done' });
                return;
            }
            startCooldown(accountId, clock + outcome.retryAfterSeconds * 1000);
            setNotice(
                outcome.kind === 'cooldown'
                    ? { kind: 'cooldown', minutes: minutesIn(outcome.retryAfterSeconds) }
                    : { kind: 'rateLimited' }
            );
        },
        // No wait time: the firewall, not our cooldown
        onError: (error) =>
            setNotice(
                error instanceof ApiError && error.status === 429 ? { kind: 'tooManyRequests' } : { kind: 'failed' }
            ),
    });

    const coolingDown = until > now;
    const blocked = refresh.isPending || coolingDown;
    // Gone with the cooldown it explained; a failure stays until the next try
    const failure = notice?.kind === 'failed' || notice?.kind === 'tooManyRequests';
    const shown = notice !== null && (coolingDown || failure) ? notice : null;
    const fetchedAt = Math.min(Date.parse(library.fetchedAt), now);
    const parts = [
        Number.isNaN(fetchedAt) ? null : t('updatedAgo', { ago: format.relativeTime(fetchedAt, now) }),
        coolingDown ? t('availableIn', { minutes: minutesIn((until - now) / 1000) }) : null,
    ];

    return (
        <div className="refresh-control">
            <Button
                aria-describedby={coolingDown ? metaId : undefined}
                aria-disabled={blocked}
                variant="secondary"
                onClick={() => {
                    if (!blocked) refresh.mutate();
                }}
            >
                {refresh.isPending ? t('busy') : t('action')}
            </Button>
            <p className="refresh-control__meta" id={metaId}>
                {parts.filter((part) => part !== null).join(' · ')}
            </p>
            <p className="refresh-control__notice" role="status">
                {shown === null
                    ? ''
                    : shown.kind === 'cooldown'
                      ? t('cooldown', { minutes: shown.minutes })
                      : t(shown.kind)}
            </p>
        </div>
    );
}
