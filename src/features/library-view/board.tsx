import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { BACKLOG_STATES, type BacklogState } from '@core/backlog';
import { groupByState, type BrowseEntry } from '@core/browse';
import { Button } from '@/components/button';
import { isShownState } from '@/lib/shown-states';
import { STATE_COLOR } from '@/lib/state-colors';
import { BoardCard, DRAG_TYPE } from './board-card';
import type { StateEditor } from './state-editor';

import './board.scss';

// Cards per column at first, and per "Show more"
export const COLUMN_FIRST = 12;
export const COLUMN_MORE = 24;

interface BoardProps {
    // Already searched and sorted; the state filter does not apply here
    entries: readonly BrowseEntry[];
    editor: StateEditor | null;
}

// One column per state. Native drag and drop moves a card; its select does the same without a pointer
export function Board({ entries, editor }: BoardProps) {
    const t = useTranslations('library');
    const groups = useMemo(() => groupByState(entries), [entries]);
    const byId = useMemo(() => new Map(entries.map((entry) => [entry.game.id.externalId, entry])), [entries]);
    const [dragged, setDragged] = useState<string | null>(null);
    const change = editor?.change ?? null;

    // Every column is a drop target for an editor; a reader only sees the states some game has
    const columns = BACKLOG_STATES.filter((state) => change !== null || isShownState(state, groups[state].length));

    const drop = useCallback(
        (state: BacklogState, appid: string) => {
            const entry = byId.get(appid);
            if (change !== null && entry !== undefined && entry.state !== state) change(entry.game, state);
        },
        [byId, change]
    );
    const endDrag = useCallback(() => setDragged(null), []);

    return (
        <div className="board">
            {change === null ? null : <p className="board__hint">{t('board.hint')}</p>}
            <div className="board__columns">
                {columns.map((state) => (
                    <BoardColumn
                        dragged={dragged}
                        entries={groups[state]}
                        key={state}
                        onChange={change}
                        onDragEnd={endDrag}
                        onDragStart={setDragged}
                        onDrop={drop}
                        state={state}
                    />
                ))}
            </div>
        </div>
    );
}

interface BoardColumnProps {
    state: BacklogState;
    entries: BrowseEntry[];
    onChange: StateEditor['change'] | null;
    dragged: string | null;
    onDragStart: (appid: string) => void;
    onDragEnd: () => void;
    onDrop: (state: BacklogState, appid: string) => void;
}

function BoardColumn({ state, entries, onChange, dragged, onDragStart, onDragEnd, onDrop }: BoardColumnProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');
    const format = useFormatter();
    const [shown, setShown] = useState(COLUMN_FIRST);
    const [over, setOver] = useState(false);
    const accepts = onChange !== null && dragged !== null;

    function dragOver(event: DragEvent<HTMLElement>) {
        if (!accepts || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
    }

    function dragLeave(event: DragEvent<HTMLElement>) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    }

    function drop(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        setOver(false);
        const appid = event.dataTransfer.getData(DRAG_TYPE);
        if (appid !== '') onDrop(state, appid);
    }

    const className = over ? 'board__column board__column--over' : 'board__column';

    return (
        <section
            aria-label={states(state)}
            className={className}
            onDragLeave={accepts ? dragLeave : undefined}
            onDragOver={accepts ? dragOver : undefined}
            onDrop={accepts ? drop : undefined}
        >
            <h3 className="board__heading">
                <span aria-hidden="true" className="board__swatch" style={{ backgroundColor: STATE_COLOR[state] }} />
                {states(state)}
                <span className="board__count">{format.number(entries.length)}</span>
            </h3>
            {entries.length === 0 ? (
                <p className="board__empty">{t('board.empty')}</p>
            ) : (
                <ul className="board__list">
                    {entries.slice(0, shown).map((entry) => (
                        <BoardCard
                            dragging={dragged === entry.game.id.externalId}
                            entry={entry}
                            key={entry.game.id.externalId}
                            onChange={onChange}
                            onDragEnd={onDragEnd}
                            onDragStart={onDragStart}
                        />
                    ))}
                </ul>
            )}
            {entries.length > shown ? (
                <Button className="button--secondary" onClick={() => setShown((count) => count + COLUMN_MORE)}>
                    {t('showMore', { next: Math.min(COLUMN_MORE, entries.length - shown) })}
                </Button>
            ) : null}
        </section>
    );
}
