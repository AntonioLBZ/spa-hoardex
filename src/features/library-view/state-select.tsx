import type { ChangeEvent } from 'react';
import { useTranslations } from 'use-intl';

import { BACKLOG_STATES } from '@core/backlog';
import type { BrowseEntry } from '@core/browse';
import type { StateEditor } from './state-editor';

// Empty value: back to the computed state
const AUTOMATIC = '';

interface StateSelectProps {
    entry: BrowseEntry;
    onChange: StateEditor['change'];
    className: string;
}

// Native select: keyboard, screen readers and phones work without code of ours; also the way to undo a drag
export function StateSelect({ entry: { game, computed, manual }, onChange, className }: StateSelectProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');

    function onSelect(event: ChangeEvent<HTMLSelectElement>) {
        const next = BACKLOG_STATES.find((candidate) => candidate === event.target.value) ?? null;
        if (next !== null || event.target.value === AUTOMATIC) onChange(game, next);
    }

    return (
        <select
            aria-label={t('stateOf', { name: game.name })}
            className={className}
            onChange={onSelect}
            value={manual?.state ?? AUTOMATIC}
        >
            <option value={AUTOMATIC}>{t('automatic', { state: states(computed) })}</option>
            {BACKLOG_STATES.map((option) => (
                <option key={option} value={option}>
                    {states(option)}
                </option>
            ))}
        </select>
    );
}

// "Set by hand", and whether the game was played since
export function ManualNote({ entry: { game, manual }, className }: { entry: BrowseEntry; className: string }) {
    const t = useTranslations('library');
    if (manual === null) return null;
    const playedSince = game.playtime.totalMinutes > manual.minutesAtSet;
    return (
        <p className={className}>
            {t('manual')}
            {playedSince ? ` · ${t('playedSince')}` : null}
        </p>
    );
}
