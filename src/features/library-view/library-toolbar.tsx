import { useEffect, useId, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { NATURAL_DIRECTION, SORTS, STATE_FILTERS, type Sort, type StateFilter } from '@core/browse';
import { STEP, riseStyle } from '@/lib/motion';
import { isShownState } from '@/lib/shown-states';
import { STATE_COLOR } from '@/lib/state-colors';
import { DEFAULT_SORT, VIEWS, compactLibrarySearch, directionOf, type LibrarySearch } from './library-search';
import { ToolbarIcon } from './toolbar-icon';

import './library-toolbar.scss';

interface LibraryToolbarProps {
    search: LibrarySearch;
    counts: Record<StateFilter, number>;
    total: number;
    onChange: (next: LibrarySearch) => void;
}

function isSort(value: string): value is Sort {
    return SORTS.some((sort) => sort === value);
}

export function LibraryToolbar({ search, counts, total, onChange }: LibraryToolbarProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');
    const format = useFormatter();
    const searchId = useId();
    const sortId = useId();
    const groupName = useId();
    const viewName = useId();
    const view = search.view ?? 'grid';
    const sort = search.sort ?? DEFAULT_SORT;
    const direction = directionOf(search);
    const reversed = direction !== NATURAL_DIRECTION[sort];
    const [text, setText] = useState(search.q ?? '');

    const searchRef = useRef<HTMLInputElement>(null);

    // Follow the URL when it changes elsewhere (back button, clear filters). While typing it only echoes the box,
    // and syncing then could put an older value back over the next keystrokes
    useEffect(() => {
        if (document.activeElement !== searchRef.current) setText(search.q ?? '');
    }, [search.q]);

    function onTextChange(event: ChangeEvent<HTMLInputElement>) {
        setText(event.target.value);
        onChange(compactLibrarySearch({ ...search, q: event.target.value }));
    }

    // A new sort starts in its natural direction
    function onSortChange(event: ChangeEvent<HTMLSelectElement>) {
        if (isSort(event.target.value))
            onChange(compactLibrarySearch({ ...search, sort: event.target.value, dir: undefined }));
    }

    function onReverse() {
        onChange(compactLibrarySearch({ ...search, dir: direction === 'asc' ? 'desc' : 'asc' }));
    }

    const options: { value: StateFilter | undefined; label: string; count: number }[] = [
        { value: undefined, label: t('all'), count: total },
        ...STATE_FILTERS.filter(
            (value) => value === 'backlog' || value === search.state || isShownState(value, counts[value])
        ).map((value) => ({
            value,
            label: value === 'backlog' ? t('backlog') : states(value),
            count: counts[value],
        })),
    ];

    return (
        <div className="library-toolbar rise-in" style={riseStyle(STEP.library)}>
            <div className="library-toolbar__search">
                <label className="visually-hidden" htmlFor={searchId}>
                    {t('search')}
                </label>
                <ToolbarIcon className="library-toolbar__search-icon" name="search" />
                <input
                    autoComplete="off"
                    className="library-toolbar__input"
                    id={searchId}
                    onChange={onTextChange}
                    placeholder={t('search')}
                    ref={searchRef}
                    type="search"
                    value={text}
                />
            </div>
            <div className="library-toolbar__group library-toolbar__sort">
                <label className="library-toolbar__sort-label" htmlFor={sortId}>
                    {t('sortLabel')}
                </label>
                <span className="library-toolbar__select-wrap">
                    <select className="library-toolbar__select" id={sortId} onChange={onSortChange} value={sort}>
                        {SORTS.map((option) => (
                            <option key={option} value={option}>
                                {t(`sort.${option}`)}
                            </option>
                        ))}
                    </select>
                    <ToolbarIcon className="library-toolbar__chevron" name="chevron" />
                </span>
                <button
                    aria-pressed={reversed}
                    className="library-toolbar__segment library-toolbar__reverse"
                    onClick={onReverse}
                    title={t(`order.${sort}.${direction}`)}
                    type="button"
                >
                    <ToolbarIcon name={direction === 'asc' ? 'up' : 'down'} />
                    <span className="visually-hidden">{t('order.reverse')}</span>
                </button>
            </div>
            <fieldset className="library-toolbar__group library-toolbar__views">
                <legend className="visually-hidden">{t('view.legend')}</legend>
                {VIEWS.map((option) => (
                    <label className="library-toolbar__view" key={option}>
                        <input
                            checked={view === option}
                            className="library-toolbar__view-input visually-hidden"
                            name={viewName}
                            onChange={() =>
                                onChange(
                                    compactLibrarySearch({ ...search, view: option === 'board' ? 'board' : undefined })
                                )
                            }
                            type="radio"
                        />
                        <span className="library-toolbar__segment">
                            <ToolbarIcon name={option} />
                            <span className="library-toolbar__view-text">{t(`view.${option}`)}</span>
                        </span>
                    </label>
                ))}
            </fieldset>
            {view === 'board' ? null : (
                <fieldset className="library-toolbar__filters">
                    <legend className="visually-hidden">{t('stateLegend')}</legend>
                    {options.map(({ value, label, count }) => (
                        <label className="library-toolbar__chip" key={value ?? 'all'}>
                            <input
                                checked={search.state === value}
                                className="library-toolbar__chip-input visually-hidden"
                                name={groupName}
                                onChange={() => onChange(compactLibrarySearch({ ...search, state: value }))}
                                type="radio"
                            />
                            <span className="library-toolbar__chip-label" style={chipStyle(value)}>
                                {value === undefined || value === 'backlog' ? null : (
                                    <span aria-hidden="true" className="library-toolbar__swatch" />
                                )}
                                {label} <span className="library-toolbar__chip-count">{format.number(count)}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
            )}
        </div>
    );
}

function chipStyle(value: StateFilter | undefined): CSSProperties | undefined {
    if (value === undefined || value === 'backlog') return undefined;
    return { '--chip-color': STATE_COLOR[value] } as CSSProperties;
}
