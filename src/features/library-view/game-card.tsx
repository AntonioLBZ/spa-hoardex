import { memo, type CSSProperties } from 'react';

import type { BrowseEntry } from '@core/browse';
import { STATE_COLOR } from '@/lib/state-colors';
import { useHours } from '@/lib/use-hours';
import { Cover } from './cover';
import type { StateEditor } from './state-editor';
import { StateChip } from './state-chip';

import './game-card.scss';

interface GameCardProps {
    entry: BrowseEntry;
    withImages: boolean;
    // Null: read only
    onChange: StateEditor['change'] | null;
}

// The `li` belongs to GSAP's reveal; everything visual, hover included, lives in the frame
export const GameCard = memo(function GameCard({ entry, withImages, onChange }: GameCardProps) {
    const { game, state } = entry;
    const hours = useHours();

    return (
        <li className="game-card">
            <div className="game-card__frame" style={{ '--state-color': STATE_COLOR[state] } as CSSProperties}>
                <Cover id={game.id} name={game.name} withImages={withImages} />
                <div className="game-card__caption">
                    <p className="game-card__name" title={game.name}>
                        {game.name}
                    </p>
                    <p className="game-card__hours">{hours(game.playtime.totalMinutes)}</p>
                </div>
                <div className="game-card__state">
                    <StateChip entry={entry} onChange={onChange} variant="overlay" />
                </div>
            </div>
        </li>
    );
});
