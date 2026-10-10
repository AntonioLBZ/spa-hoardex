import { clsx } from 'clsx';
import { memo, type CSSProperties } from 'react';
import { useTranslations } from 'use-intl';

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
    // Null outside selection
    selected: boolean | null;
    onToggle: (appid: string) => void;
}

// The `li` belongs to GSAP's reveal; everything visual, hover included, lives in the frame
export const GameCard = memo(function GameCard({ entry, withImages, onChange, selected, onToggle }: GameCardProps) {
    const t = useTranslations('library.select');
    const { game, state } = entry;
    const hours = useHours();
    const selecting = selected !== null;

    return (
        <li className="game-card">
            <div
                className={clsx(
                    'game-card__frame',
                    selecting && 'game-card__frame--selecting',
                    selected === true && 'game-card__frame--selected'
                )}
                style={{ '--state-color': STATE_COLOR[state] } as CSSProperties}
            >
                <Cover id={game.id} name={game.name} withImages={withImages} />
                <div className="game-card__caption">
                    <p className="game-card__name" title={game.name}>
                        {game.name}
                    </p>
                    <p className="game-card__hours">{hours(game.playtime.totalMinutes)}</p>
                </div>
                <div className="game-card__state">
                    <StateChip entry={entry} onChange={selecting ? null : onChange} variant="overlay" />
                </div>
                {selecting ? (
                    // The whole card is the checkbox's label
                    <label className="game-card__select">
                        <input
                            checked={selected}
                            className="game-card__checkbox"
                            onChange={() => onToggle(game.id.externalId)}
                            type="checkbox"
                        />
                        <span className="visually-hidden">{t('game', { name: game.name })}</span>
                    </label>
                ) : null}
            </div>
        </li>
    );
});
