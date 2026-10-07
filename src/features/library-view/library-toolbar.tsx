import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { SORTS, type Sort, type StateFilter } from '@core/browse';
import { DEFAULT_SORT, SHOWN_FILTERS, compactLibrarySearch, type LibrarySearch } from './library-search';

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
        ...SHOWN_FILTERS.map((value) => ({
            value,
            label: value === 'backlog' ? t('backlog') : states(value),
            count: counts[value],
        })),
    ];

    return (
        <div className="library-toolbar">
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
        </div>
    );
}
