import { memo, type DragEvent } from 'react';

import type { BrowseEntry } from '@core/browse';
import { useHours } from '@/lib/use-hours';
import type { StateEditor } from './state-editor';
import { ManualNote, StateSelect } from './state-select';

import './board-card.scss';

// What a dragged card carries; anything else dropped on the board is ignored
export const DRAG_TYPE = 'application/x-hoardex-appid';

interface BoardCardProps {
    entry: BrowseEntry;
    // Null: read only, and not draggable
    onChange: StateEditor['change'] | null;
    dragging: boolean;
    onDragStart: (appid: string) => void;
    onDragEnd: () => void;
}

export const BoardCard = memo(function BoardCard({
    entry,
    onChange,
    dragging,
    onDragStart,
    onDragEnd,
}: BoardCardProps) {
    const { game } = entry;
    const hours = useHours();
    const editable = onChange !== null;

    function startDrag(event: DragEvent<HTMLLIElement>) {
        event.dataTransfer.setData(DRAG_TYPE, game.id.externalId);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(game.id.externalId);
    }

    return (
        <li
            className={dragging ? 'board-card board-card--dragging' : 'board-card'}
            draggable={editable}
            onDragEnd={editable ? onDragEnd : undefined}
            onDragStart={editable ? startDrag : undefined}
        >
            <p className="board-card__name" title={game.name}>
                {game.name}
            </p>
            <p className="board-card__hours">{hours(game.playtime.totalMinutes)}</p>
            {onChange === null ? null : (
                <StateSelect className="board-card__select" entry={entry} onChange={onChange} />
            )}
            <ManualNote className="board-card__note" entry={entry} />
        </li>
    );
});
