import { clsx } from 'clsx';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type ReactNode,
    type RefObject,
} from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { hasCategory, type CategoryCounts, type CategoryId } from '@core/backlog';
import { NATURAL_DIRECTION, SORTS, type Sort } from '@core/browse';
import { RadioChip } from '@/components/radio-chip';
import { SegmentedButton, SegmentedTrack } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { useCategoryCatalog } from '@/lib/categories';
import { STEP, riseStyle } from '@/lib/motion';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { isShownState } from '@/lib/shown-states';
import { DRAG_TYPE } from './drag';
import { DEFAULT_SORT, compactLibrarySearch, directionOf, type LibrarySearch } from './library-search';
import { ToolbarIcon } from './toolbar-icon';
import { useScrollEdges } from './use-scroll-edges';

import './library-toolbar.scss';

interface LibraryToolbarProps {
    search: LibrarySearch;
    counts: CategoryCounts;
    total: number;
    onChange: (next: LibrarySearch) => void;
    // Absent for readers: only an editor selects, and sees every category
    selecting?: boolean;
    onSelectingChange?: (selecting: boolean) => void;
    // While a card is dragged, each category chip takes it
    dragging?: boolean;
    onDropOn?: (state: CategoryId, appid: string) => void;
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
    dragging = false,
    onDropOn,
}: LibraryToolbarProps) {
    const t = useTranslations('library');
    const catalog = useCategoryCatalog();
    const format = useFormatter();
    const sortId = useId();
    const groupName = useId();
    const editing = onSelectingChange !== undefined;
    // A category the account does not have filters nothing
    const active = hasCategory(catalog.categories, search.state) ? search.state : undefined;
    const sort = search.sort ?? DEFAULT_SORT;
    const direction = directionOf(search);
    const reversed = direction !== NATURAL_DIRECTION[sort];
    const [text, setText] = useState(search.q ?? '');

    const searchRef = useRef<HTMLInputElement>(null);
    const strip = useRef<HTMLFieldSetElement>(null);

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

    const options: { value: CategoryId | undefined; label: string; count: number; color?: string }[] = [
        { value: undefined, label: t('all'), count: total },
        ...catalog.list
            .filter(({ id }) => editing || id === active || isShownState(id, counts[id] ?? 0))
            .map(({ id, label, color }) => ({ value: id, label, count: counts[id] ?? 0, color })),
    ];
    const edges = useScrollEdges(strip, options.map((option) => `${option.label}${option.count}`).join('|'));

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
            {onSelectingChange === undefined ? null : (
                <SegmentedTrack className="library-toolbar__selecting">
                    <SegmentedButton aria-pressed={selecting} onClick={() => onSelectingChange(!selecting)}>
                        <ToolbarIcon name="select" />
                        <span className="segmented__text">{t('select.start')}</span>
                    </SegmentedButton>
                </SegmentedTrack>
            )}
            <div
                className={clsx(
                    'library-toolbar__strip',
                    edges.start && 'library-toolbar__strip--more-start',
                    edges.end && 'library-toolbar__strip--more-end'
                )}
            >
                <fieldset className="library-toolbar__filters" ref={strip}>
                    <legend className="visually-hidden">{t('stateLegend')}</legend>
                    {options.map(({ value, label, count, color }) => {
                        const chip = (
                            <RadioChip
                                checked={active === value}
                                color={color}
                                count={format.number(count)}
                                key={value ?? 'all'}
                                label={label}
                                name={groupName}
                                onChange={() => onChange(compactLibrarySearch({ ...search, state: value }))}
                            />
                        );
                        return value === undefined || onDropOn === undefined ? (
                            chip
                        ) : (
                            <DropTarget accepts={dragging} key={value} onDrop={(appid) => onDropOn(value, appid)}>
                                {chip}
                            </DropTarget>
                        );
                    })}
                </fieldset>
                {edges.start ? (
                    <MoreButton direction={-1} dragging={dragging} label={t('moreBefore')} strip={strip} />
                ) : null}
                {edges.end ? (
                    <MoreButton direction={1} dragging={dragging} label={t('moreAfter')} strip={strip} />
                ) : null}
            </div>
        </div>
    );
}

interface MoreButtonProps {
    // Towards the start or the end of the row
    direction: -1 | 1;
    label: string;
    strip: RefObject<HTMLElement | null>;
    // While a card is dragged, resting it on the arrow keeps the row moving
    dragging: boolean;
}

// Pixels per frame while a dragged card rests on an arrow
const DRAG_SCROLL_STEP = 6;

// For a mouse: the chips are radios, so the keyboard already reaches them with the arrows
function MoreButton({ direction, label, strip, dragging }: MoreButtonProps) {
    const reducedMotion = useReducedMotion();
    const frame = useRef(0);

    const stop = () => {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
    };

    // Gone at the row's end, or once the drag is over
    useEffect(() => {
        if (!dragging) stop();
        return stop;
    }, [dragging]);

    // Most of a row at a time, for a mouse without a sideways wheel
    function onClick() {
        const element = strip.current;
        element?.scrollBy({
            left: direction * element.clientWidth * 0.75,
            behavior: reducedMotion ? 'auto' : 'smooth',
        });
    }

    function onDragEnter(event: DragEvent<HTMLButtonElement>) {
        if (!dragging || !event.dataTransfer.types.includes(DRAG_TYPE) || frame.current !== 0) return;
        const step = () => {
            strip.current?.scrollBy({ left: direction * DRAG_SCROLL_STEP });
            frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
    }

    function onDragLeave(event: DragEvent<HTMLButtonElement>) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stop();
    }

    return (
        <button
            aria-label={label}
            className={clsx(
                'library-toolbar__more',
                `library-toolbar__more--${direction < 0 ? 'start' : 'end'}`,
                dragging && 'library-toolbar__more--ready'
            )}
            onClick={onClick}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            title={label}
            type="button"
        >
            <ToolbarIcon name={direction < 0 ? 'left' : 'right'} />
        </button>
    );
}

interface DropTargetProps {
    accepts: boolean;
    onDrop: (appid: string) => void;
    children: ReactNode;
}

// Takes only a card of this library: other dragged things carry no appid of ours
function DropTarget({ accepts, onDrop, children }: DropTargetProps) {
    const [over, setOver] = useState(false);

    function dragOver(event: DragEvent<HTMLElement>) {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
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
        if (appid !== '') onDrop(appid);
    }

    return (
        <span
            className={clsx(
                'library-toolbar__drop',
                accepts && 'library-toolbar__drop--ready',
                accepts && over && 'library-toolbar__drop--over'
            )}
            onDragLeave={accepts ? dragLeave : undefined}
            onDragOver={accepts ? dragOver : undefined}
            onDrop={accepts ? drop : undefined}
        >
            {children}
        </span>
    );
}
