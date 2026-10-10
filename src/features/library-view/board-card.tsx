import { clsx } from 'clsx';
import { memo, type CSSProperties, type DragEvent } from 'react';

import type { BrowseEntry } from '@core/browse';
import { STATE_COLOR } from '@/lib/state-colors';
import { useHours } from '@/lib/use-hours';
import type { StateEditor } from './state-editor';
import { StateChip } from './state-chip';

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
            className={clsx('board-card', dragging && 'board-card--dragging')}
            draggable={editable}
            style={{ '--state-color': STATE_COLOR[entry.state] } as CSSProperties}
            onDragEnd={editable ? onDragEnd : undefined}
            onDragStart={editable ? startDrag : undefined}
        >
            <p className="board-card__name" title={game.name}>
                {game.name}
            </p>
            <div className="board-card__meta">
                <StateChip entry={entry} onChange={onChange} variant="plain" />
                <span className="board-card__hours">{hours(game.playtime.totalMinutes)}</span>
            </div>
        </li>
    );
});
