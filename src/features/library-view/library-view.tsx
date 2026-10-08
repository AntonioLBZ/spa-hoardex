import { useDeferredValue, useId, useMemo, useRef } from 'react';
import { useTranslations } from 'use-intl';

import { browseLibrary, classifyLibrary, countByFilter } from '@core/browse';
import type { Library } from '@core/domain';
import { Button } from '@/components/button';
import { useLocale } from '@/lib/i18n';
import { STEP, riseStyle } from '@/lib/motion';
import { GameCard } from './game-card';
import { DEFAULT_SORT, type LibrarySearch } from './library-search';
import { LibraryToolbar } from './library-toolbar';
import { useGridReveal } from './use-grid-reveal';
import { NEXT_BATCH, useRevealedCount } from './use-revealed-count';

import './library-view.scss';

interface LibraryViewProps {
    library: Library;
    // False for games whose images do not exist, such as the demo library
    withImages: boolean;
    search: LibrarySearch;
    onSearchChange: (next: LibrarySearch) => void;
}

export function LibraryView({ library, withImages, search, onSearchChange }: LibraryViewProps) {
    const t = useTranslations('library');
    const { locale } = useLocale();
    const titleId = useId();
    const entries = useMemo(() => classifyLibrary(library.games, new Date()), [library]);
    const counts = useMemo(() => countByFilter(entries), [entries]);
    // Typing stays responsive while the list catches up
    const settled = useDeferredValue(search);
    const visible = useMemo(
        () =>
            browseLibrary(entries, {
                state: settled.state,
                query: settled.q,
                sort: settled.sort ?? DEFAULT_SORT,
                locale,
            }),
        [entries, settled, locale]
    );

    const resetKey = `${settled.state ?? ''}|${settled.sort ?? ''}|${settled.q ?? ''}`;
    const { count, hasMore, showMore, sentinelRef } = useRevealedCount(visible.length, resetKey);
    // Typing in the search box does not fade the list on every keystroke
    const grid = useRef<HTMLUListElement>(null);
    useGridReveal(grid, `${settled.state ?? ''}|${settled.sort ?? ''}`);

    return (
        <section aria-labelledby={titleId} className="library-view">
            <h2 className="library-view__title rise-in" id={titleId} style={riseStyle(STEP.library)}>
                {t('title')}
            </h2>
            <LibraryToolbar counts={counts} onChange={onSearchChange} search={search} total={entries.length} />
            <p className="library-view__count" role="status">
                {t('count', { shown: visible.length, total: entries.length })}
            </p>
            {visible.length === 0 ? (
                <div className="library-view__empty">
                    <p>{t('empty')}</p>
                    <Button onClick={() => onSearchChange({})}>{t('clear')}</Button>
                </div>
            ) : (
                <ul className="library-view__grid" ref={grid}>
                    {visible.slice(0, count).map((entry) => (
                        <GameCard entry={entry} key={entry.game.id.externalId} withImages={withImages} />
                    ))}
                </ul>
            )}
            {hasMore ? (
                <div className="library-view__more">
                    <div aria-hidden="true" ref={sentinelRef} />
                    <p className="library-view__shown">{t('shownOf', { shown: count, matching: visible.length })}</p>
                    <Button onClick={showMore}>
                        {t('showMore', { next: Math.min(NEXT_BATCH, visible.length - count) })}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
