import { clsx } from 'clsx';
import { memo, type CSSProperties, type DragEvent } from 'react';
import { useTranslations } from 'use-intl';

import type { BrowseEntry } from '@core/browse';
import { useCategoryCatalog } from '@/lib/categories';
import { useHours } from '@/lib/use-hours';
import { Cover } from './cover';
import { DRAG_TYPE } from './drag';
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
    // Null: not draggable
    onDragStart: ((appid: string) => void) | null;
    onDragEnd: () => void;
    dragging: boolean;
}

// The `li` belongs to GSAP's reveal; everything visual, hover and drag included, lives in the frame
export const GameCard = memo(function GameCard({
    entry,
    withImages,
    onChange,
    selected,
    onToggle,
    onDragStart,
    onDragEnd,
    dragging,
}: GameCardProps) {
    const t = useTranslations('library.select');
    const { game, state } = entry;
    const color = useCategoryCatalog().get(state).color;
    const hours = useHours();
    const selecting = selected !== null;
    const draggable = onDragStart !== null;

    function startDrag(event: DragEvent<HTMLDivElement>) {
        event.dataTransfer.setData(DRAG_TYPE, game.id.externalId);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(game.id.externalId);
    }

    return (
        <li className="game-card">
            <div
                className={clsx(
                    'game-card__frame',
                    selecting && 'game-card__frame--selecting',
                    selected === true && 'game-card__frame--selected',
                    draggable && 'game-card__frame--draggable',
                    dragging && 'game-card__frame--dragging'
                )}
                draggable={draggable}
                onDragEnd={draggable ? onDragEnd : undefined}
                onDragStart={draggable ? startDrag : undefined}
                style={{ '--state-color': color } as CSSProperties}
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
