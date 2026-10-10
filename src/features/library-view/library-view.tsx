import { useCallback, useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import type { BacklogState, Overrides } from '@core/backlog';
import { browseLibrary, classifyLibrary, countByFilter } from '@core/browse';
import type { Library } from '@core/domain';
import { Button } from '@/components/button';
import { ArtOwnerContext } from '@/lib/art';
import { useLocale } from '@/lib/i18n';
import { STEP, riseStyle } from '@/lib/motion';
import { Board } from './board';
import { GameCard } from './game-card';
import { DEFAULT_SORT, directionOf, type LibrarySearch } from './library-search';
import { LibraryToolbar } from './library-toolbar';
import { SelectionBar } from './selection-bar';
import type { StateEditor } from './state-editor';
import { useGridReveal } from './use-grid-reveal';
import { NEXT_BATCH, useRevealedCount } from './use-revealed-count';

import './library-view.scss';

interface LibraryViewProps {
    library: Library;
    // False for games whose images do not exist, such as the demo library
    withImages: boolean;
    search: LibrarySearch;
    onSearchChange: (next: LibrarySearch) => void;
    overrides?: Overrides;
    // Null or absent: read only
    editor?: StateEditor | null;
}

const NO_OVERRIDES: Overrides = Object.freeze({});

export function LibraryView({
    library,
    withImages,
    search,
    onSearchChange,
    overrides = NO_OVERRIDES,
    editor = null,
}: LibraryViewProps) {
    const t = useTranslations('library');
    const { locale } = useLocale();
    const titleId = useId();
    const entries = useMemo(
        () => classifyLibrary(library.games, new Date(), { overrides }),
        [library.games, overrides]
    );
    const counts = useMemo(() => countByFilter(entries), [entries]);
    const entryById = useMemo(() => new Map(entries.map((entry) => [entry.game.id.externalId, entry])), [entries]);
    // Typing stays responsive while the list catches up
    const settled = useDeferredValue(search);
    const board = settled.view === 'board';
    const visible = useMemo(
        () =>
            browseLibrary(entries, {
                // Each state is a column on the board
                state: board ? undefined : settled.state,
                query: settled.q,
                sort: settled.sort ?? DEFAULT_SORT,
                direction: directionOf(settled),
                locale,
            }),
        [entries, settled, locale, board]
    );

    const order = `${settled.sort ?? ''}|${settled.dir ?? ''}`;
    const resetKey = `${settled.state ?? ''}|${order}|${settled.q ?? ''}`;
    const { count, hasMore, showMore } = useRevealedCount(visible.length, resetKey);
    // Typing in the search box does not fade the list on every keystroke
    const grid = useRef<HTMLUListElement>(null);
    useGridReveal(grid, `${settled.state ?? ''}|${order}`);
    // Stable across refreshes, which bring a new owner object
    const ownerId = library.owner.externalId;
    const ownerSource = library.owner.source;
    // Null outside selection; only an editor selects
    const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
    const selection = editor === null ? null : picked;
    const toggle = useCallback(
        (appid: string) =>
            setPicked((current) => {
                if (current === null) return current;
                const next = new Set(current);
                if (!next.delete(appid)) next.add(appid);
                return next;
            }),
        []
    );
    // Games refreshed out of the library drop out of the selection
    const selectedGames = useMemo(
        () => [...(selection ?? [])].flatMap((appid) => entryById.get(appid)?.game ?? []),
        [selection, entryById]
    );
    const allSelected = visible.every((entry) => selection?.has(entry.game.id.externalId));
    const changeMany = editor?.changeMany;
    const moveSelection = useCallback(
        (state: BacklogState | null) => {
            changeMany?.(selectedGames, state);
            setPicked(new Set());
        },
        [changeMany, selectedGames]
    );

    const artOwner = useMemo(
        () => (withImages ? { source: ownerSource, externalId: ownerId } : null),
        [withImages, ownerSource, ownerId]
    );

    return (
        <ArtOwnerContext value={artOwner}>
            <section
                aria-labelledby={titleId}
                className="library-view"
                onKeyDown={(event) => {
                    if (event.key === 'Escape' && !event.defaultPrevented && selection !== null) setPicked(null);
                }}
            >
                <h2 className="library-view__title rise-in" id={titleId} style={riseStyle(STEP.library)}>
                    {t('title')}
                </h2>
                <LibraryToolbar
                    counts={counts}
                    onChange={onSearchChange}
                    onSelectingChange={editor === null ? undefined : (on) => setPicked(on ? new Set<string>() : null)}
                    search={search}
                    selecting={selection !== null}
                    total={entries.length}
                />
                <p className="library-view__count" role="status">
                    {t('count', { shown: visible.length, total: entries.length })}
                </p>
                {editor?.failed ? (
                    <p className="library-view__failed" role="alert">
                        {t('saveFailed')}
                    </p>
                ) : null}
                {board ? (
                    <Board
                        editor={editor}
                        entries={visible}
                        key={`${order}|${settled.q ?? ''}`}
                        onMoveSelection={moveSelection}
                        onToggle={toggle}
                        selection={selection}
                    />
                ) : visible.length === 0 ? (
                    <div className="library-view__empty">
                        <p>{t('empty')}</p>
                        <Button onClick={() => onSearchChange({})}>{t('clear')}</Button>
                    </div>
                ) : (
                    <ul className="library-view__grid" ref={grid}>
                        {visible.slice(0, count).map((entry) => (
                            <GameCard
                                entry={entry}
                                key={entry.game.id.externalId}
                                onChange={editor?.change ?? null}
                                onToggle={toggle}
                                selected={selection === null ? null : selection.has(entry.game.id.externalId)}
                                withImages={withImages}
                            />
                        ))}
                    </ul>
                )}
                {!board && hasMore ? (
                    <div className="library-view__more">
                        <p className="library-view__shown">
                            {t('shownOf', { shown: count, matching: visible.length })}
                        </p>
                        <Button onClick={showMore}>
                            {t('showMore', { next: Math.min(NEXT_BATCH, visible.length - count) })}
                        </Button>
                    </div>
                ) : null}
                {selection === null ? null : (
                    <SelectionBar
                        allSelected={allSelected}
                        count={selectedGames.length}
                        matching={visible.length}
                        onClear={() => setPicked(new Set())}
                        onDone={() => setPicked(null)}
                        onMove={moveSelection}
                        onSelectAll={() =>
                            setPicked(
                                (current) =>
                                    new Set([...(current ?? []), ...visible.map((entry) => entry.game.id.externalId)])
                            )
                        }
                    />
                )}
            </section>
        </ArtOwnerContext>
    );
}
