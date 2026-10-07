import { memo } from 'react';
import { useTranslations } from 'use-intl';

import type { BrowseEntry } from '@core/browse';
import { STATE_COLOR } from '@/lib/state-colors';
import { useHours } from '@/lib/use-hours';
import { Cover } from './cover';

import './game-card.scss';

interface GameCardProps {
    entry: BrowseEntry;
    withImages: boolean;
}

export const GameCard = memo(function GameCard({ entry: { game, state }, withImages }: GameCardProps) {
    const t = useTranslations('dashboard.states');
    const hours = useHours();

    return (
        <li className="game-card">
            <Cover id={game.id} name={game.name} withImages={withImages} />
            <p className="game-card__name" title={game.name}>
                {game.name}
            </p>
            <p className="game-card__meta">
                <span className="game-card__state">
                    <span
                        aria-hidden="true"
                        className="game-card__swatch"
                        style={{ backgroundColor: STATE_COLOR[state] }}
                    />
                    {t(state)}
                </span>
                <span className="game-card__hours">{hours(game.playtime.totalMinutes)}</span>
            </p>
        </li>
    );
});
