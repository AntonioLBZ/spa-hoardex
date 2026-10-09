import { memo } from 'react';
import { useTranslations } from 'use-intl';

import type { BrowseEntry } from '@core/browse';
import { STATE_COLOR } from '@/lib/state-colors';
import { useHours } from '@/lib/use-hours';
import { Cover } from './cover';
import type { StateEditor } from './state-editor';
import { ManualNote, StateSelect } from './state-select';

import './game-card.scss';

interface GameCardProps {
    entry: BrowseEntry;
    withImages: boolean;
    // Null: read only
    onChange: StateEditor['change'] | null;
}

export const GameCard = memo(function GameCard({ entry, withImages, onChange }: GameCardProps) {
    const { game, state } = entry;
    const states = useTranslations('dashboard.states');
    const hours = useHours();

    const swatch = (
        <span aria-hidden="true" className="game-card__swatch" style={{ backgroundColor: STATE_COLOR[state] }} />
    );

    return (
        <li className="game-card">
            <Cover id={game.id} name={game.name} withImages={withImages} />
            <p className="game-card__name" title={game.name}>
                {game.name}
            </p>
            <div className="game-card__meta">
                {onChange === null ? (
                    <span className="game-card__state">
                        {swatch}
                        {states(state)}
                    </span>
                ) : (
                    <span className="game-card__state game-card__state--editable">
                        {swatch}
                        <StateSelect className="game-card__select" entry={entry} onChange={onChange} />
                    </span>
                )}
                <span className="game-card__hours">{hours(game.playtime.totalMinutes)}</span>
            </div>
            <ManualNote className="game-card__note" entry={entry} />
        </li>
    );
});
