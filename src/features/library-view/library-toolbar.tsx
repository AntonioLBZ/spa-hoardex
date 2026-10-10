import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { NATURAL_DIRECTION, SORTS, STATE_FILTERS, type Sort, type StateFilter } from '@core/browse';
import { RadioChip } from '@/components/radio-chip';
import { SegmentedButton, SegmentedControl, SegmentedTrack } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
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
    // Absent for readers: only an editor selects
    selecting?: boolean;
    onSelectingChange?: (selecting: boolean) => void;
}

function isSort(value: string): value is Sort {
    return SORTS.some((sort) => sort === value);
}

export function LibraryToolbar({
    search,
    counts,
    total,
    onChange,
    selecting = false,
    onSelectingChange,
}: LibraryToolbarProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');
    const format = useFormatter();
    const sortId = useId();
    const groupName = useId();
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
            <TextField
                autoComplete="off"
                className="library-toolbar__search"
                hideLabel
                icon={<ToolbarIcon name="search" />}
                label={t('search')}
                onChange={onTextChange}
                placeholder={t('search')}
                ref={searchRef}
                type="search"
                value={text}
            />
            <SegmentedTrack className="library-toolbar__sort">
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
                <SegmentedButton
                    aria-pressed={reversed}
                    className="library-toolbar__reverse"
                    onClick={onReverse}
                    title={t(`order.${sort}.${direction}`)}
                >
                    <ToolbarIcon name={direction === 'asc' ? 'up' : 'down'} />
                    <span className="visually-hidden">{t('order.reverse')}</span>
                </SegmentedButton>
            </SegmentedTrack>
            <SegmentedControl
                className="library-toolbar__views"
                legend={t('view.legend')}
                onChange={(option) =>
                    onChange(compactLibrarySearch({ ...search, view: option === 'board' ? 'board' : undefined }))
                }
                options={VIEWS.map((option) => ({
                    value: option,
                    label: t(`view.${option}`),
                    icon: <ToolbarIcon name={option} />,
                }))}
                value={view}
            />
            {onSelectingChange === undefined ? null : (
                <SegmentedTrack className="library-toolbar__selecting">
                    <SegmentedButton aria-pressed={selecting} onClick={() => onSelectingChange(!selecting)}>
                        <ToolbarIcon name="select" />
                        <span className="segmented__text">{t('select.start')}</span>
                    </SegmentedButton>
                </SegmentedTrack>
            )}
            {view === 'board' ? null : (
                <fieldset className="library-toolbar__filters">
                    <legend className="visually-hidden">{t('stateLegend')}</legend>
                    {options.map(({ value, label, count }) => (
                        <RadioChip
                            checked={search.state === value}
                            color={value === undefined || value === 'backlog' ? undefined : STATE_COLOR[value]}
                            count={format.number(count)}
                            key={value ?? 'all'}
                            label={label}
                            name={groupName}
                            onChange={() => onChange(compactLibrarySearch({ ...search, state: value }))}
                        />
                    ))}
                </fieldset>
            )}
        </div>
    );
}
