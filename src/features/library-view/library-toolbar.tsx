import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { SORTS, STATE_FILTERS, type Sort, type StateFilter } from '@core/browse';
import { STEP, riseStyle } from '@/lib/motion';
import { isShownState } from '@/lib/shown-states';
import { DEFAULT_SORT, VIEWS, compactLibrarySearch, type LibrarySearch } from './library-search';

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

    function onSortChange(event: ChangeEvent<HTMLSelectElement>) {
        if (isSort(event.target.value)) onChange(compactLibrarySearch({ ...search, sort: event.target.value }));
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
            <div className="library-toolbar__field library-toolbar__field--search">
                <label className="library-toolbar__label" htmlFor={searchId}>
                    {t('search')}
                </label>
                <input
                    autoComplete="off"
                    className="library-toolbar__input"
                    id={searchId}
                    onChange={onTextChange}
                    ref={searchRef}
                    type="search"
                    value={text}
                />
            </div>
            <div className="library-toolbar__field">
                <label className="library-toolbar__label" htmlFor={sortId}>
                    {t('sortLabel')}
                </label>
                <select
                    className="library-toolbar__select"
                    id={sortId}
                    onChange={onSortChange}
                    value={search.sort ?? DEFAULT_SORT}
                >
                    {SORTS.map((sort) => (
                        <option key={sort} value={sort}>
                            {t(`sort.${sort}`)}
                        </option>
                    ))}
                </select>
            </div>
            <fieldset className="library-toolbar__views">
                <legend className="visually-hidden">{t('view.legend')}</legend>
                {VIEWS.map((option) => (
                    <label className="library-toolbar__chip" key={option}>
                        <input
                            checked={view === option}
                            className="library-toolbar__chip-input visually-hidden"
                            name={viewName}
                            onChange={() =>
                                onChange(
                                    compactLibrarySearch({ ...search, view: option === 'board' ? 'board' : undefined })
                                )
                            }
                            type="radio"
                        />
                        <span className="library-toolbar__chip-label">{t(`view.${option}`)}</span>
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
                            <span className="library-toolbar__chip-label">
                                {label} <span className="library-toolbar__chip-count">{format.number(count)}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
            )}
        </div>
    );
}
