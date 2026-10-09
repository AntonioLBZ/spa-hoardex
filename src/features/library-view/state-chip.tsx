import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { useTranslations } from 'use-intl';

import { BACKLOG_STATES, type BacklogState } from '@core/backlog';
import type { BrowseEntry } from '@core/browse';
import { STATE_COLOR } from '@/lib/state-colors';
import type { StateEditor } from './state-editor';

import './state-chip.scss';

// Top layer: neither the card's overflow nor its `content-visibility` can clip the menu
const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

interface StateChipProps {
    entry: BrowseEntry;
    // Null: read only
    onChange: StateEditor['change'] | null;
    // Over a cover, or on a plain surface
    variant: 'overlay' | 'plain';
}

// The state of a game, with a pencil when set by hand; for an editor, the button of its state menu
export function StateChip({ entry, onChange, variant }: StateChipProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');
    const { game, state, manual } = entry;
    const note =
        manual === null
            ? null
            : game.playtime.totalMinutes > manual.minutesAtSet
              ? `${t('manual')} · ${t('playedSince')}`
              : t('manual');

    const className = `state-chip state-chip--${variant}`;
    const face = (
        <>
            <span aria-hidden="true" className="state-chip__swatch" style={{ backgroundColor: STATE_COLOR[state] }} />
            <span className="state-chip__label">{states(state)}</span>
            {note === null ? null : (
                <>
                    <PencilIcon />
                    <span className="visually-hidden"> {note}</span>
                </>
            )}
        </>
    );

    if (onChange === null) {
        return (
            <span className={className} title={note ?? undefined}>
                {face}
            </span>
        );
    }
    return (
        <StateMenu
            className={className}
            entry={entry}
            label={`${t('stateOf', { name: game.name })}: ${states(state)}${note === null ? '' : ` · ${note}`}`}
            onChange={onChange}
            title={note ?? undefined}
        >
            {face}
            <ChevronIcon />
        </StateMenu>
    );
}

interface StateMenuProps {
    entry: BrowseEntry;
    onChange: StateEditor['change'];
    className: string;
    label: string;
    title: string | undefined;
    children: ReactNode;
}

// Null: back to the computed state
const OPTIONS: readonly (BacklogState | null)[] = [null, ...BACKLOG_STATES];

function StateMenu({ entry: { game, computed, manual }, onChange, className, label, title, children }: StateMenuProps) {
    const t = useTranslations('library');
    const states = useTranslations('dashboard.states');
    const menuId = useId();
    const button = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const current = manual?.state ?? null;
    const [active, setActive] = useState(0);

    const labelOf = (option: BacklogState | null) =>
        option === null ? t('automaticOption', { state: states(computed) }) : states(option);

    const show = () => {
        setActive(Math.max(OPTIONS.indexOf(current), 0));
        setOpen(true);
    };

    const close = useCallback((returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) button.current?.focus();
    }, []);

    function choose(option: BacklogState | null) {
        close(true);
        if (option !== current) onChange(game, option);
    }

    useLayoutEffect(() => {
        const element = menu.current;
        if (!open || element === null) return;
        if (POPOVER && !element.matches(':popover-open')) {
            element.showPopover();
            place(element, button.current);
        }
        element.querySelectorAll<HTMLElement>('[role="menuitemradio"]')[active]?.focus({ preventScroll: true });
    }, [open, active]);

    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false);
        };
        let frame = 0;
        const follow = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => place(menu.current, button.current));
        };
        document.addEventListener('pointerdown', outside, true);
        window.addEventListener('scroll', follow, { capture: true, passive: true });
        window.addEventListener('resize', follow);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('scroll', follow, { capture: true });
            window.removeEventListener('resize', follow);
        };
    }, [open, close]);

    function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        show();
    }

    function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
        const last = OPTIONS.length - 1;
        const move = (index: number) => {
            event.preventDefault();
            setActive(index);
        };
        switch (event.key) {
            case 'ArrowDown':
                return move(active === last ? 0 : active + 1);
            case 'ArrowUp':
                return move(active === 0 ? last : active - 1);
            case 'Home':
                return move(0);
            case 'End':
                return move(last);
            case 'Escape':
                event.preventDefault();
                return close(true);
            case 'Tab':
                return close(false);
            case 'Enter':
                event.preventDefault();
                return choose(OPTIONS[active] ?? null);
            // Picked on release, or the button that gets the focus back would take the release as a click
            case ' ':
                return event.preventDefault();
        }
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const key = event.key.toLocaleLowerCase();
            const ordered = [...OPTIONS.keys()].map((offset) => (active + 1 + offset) % OPTIONS.length);
            const match = ordered.find((index) =>
                labelOf(OPTIONS[index] ?? null)
                    .toLocaleLowerCase()
                    .startsWith(key)
            );
            if (match !== undefined) move(match);
        }
    }

    return (
        <span className="state-chip__anchor">
            <button
                aria-controls={open ? menuId : undefined}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={label}
                className={`${className} state-chip--button`}
                onClick={() => (open ? close(true) : show())}
                onKeyDown={onButtonKey}
                ref={button}
                title={title}
                type="button"
            >
                {children}
            </button>
            {open ? (
                <div
                    aria-label={t('stateOf', { name: game.name })}
                    className={POPOVER ? 'state-chip__menu' : 'state-chip__menu state-chip__menu--inline'}
                    id={menuId}
                    onBlur={(event) => {
                        const next = event.relatedTarget as Node | null;
                        if (next !== null && !menu.current?.contains(next) && next !== button.current) close(false);
                    }}
                    onKeyDown={onMenuKey}
                    onKeyUp={(event) => {
                        if (event.key === ' ') choose(OPTIONS[active] ?? null);
                    }}
                    popover={POPOVER ? 'manual' : undefined}
                    ref={menu}
                    role="menu"
                >
                    {OPTIONS.map((option, index) => (
                        <div
                            aria-checked={option === current}
                            className={
                                option === null
                                    ? 'state-chip__option state-chip__option--automatic'
                                    : 'state-chip__option'
                            }
                            key={option ?? 'automatic'}
                            onClick={() => choose(option)}
                            onPointerMove={() => {
                                if (index !== active) setActive(index);
                            }}
                            role="menuitemradio"
                            tabIndex={index === active ? 0 : -1}
                        >
                            <span
                                aria-hidden="true"
                                className="state-chip__swatch"
                                style={{ backgroundColor: STATE_COLOR[option ?? computed] }}
                            />
                            <span className="state-chip__option-label">{labelOf(option)}</span>
                            <CheckIcon />
                        </div>
                    ))}
                </div>
            ) : null}
        </span>
    );
}

// Below the button, or above when it does not fit, kept inside the viewport
function place(menu: HTMLElement | null, anchor: HTMLElement | null) {
    if (!POPOVER || menu === null || anchor === null) return;
    const from = anchor.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const fitsBelow = from.bottom + MENU_GAP + height <= window.innerHeight - VIEWPORT_MARGIN;
    const fitsAbove = from.top - MENU_GAP - height >= VIEWPORT_MARGIN;
    const top = fitsBelow || !fitsAbove ? from.bottom + MENU_GAP : from.top - MENU_GAP - height;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    menu.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
    menu.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(from.left, maxLeft))}px`;
}

function PencilIcon() {
    return (
        <svg aria-hidden="true" className="state-chip__icon" viewBox="0 0 16 16">
            <path d="M10.6 2.6a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L6 12.8 2.5 13.5l.7-3.5z" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg aria-hidden="true" className="state-chip__icon state-chip__icon--chevron" viewBox="0 0 16 16">
            <path d="m4 6 4 4 4-4" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg aria-hidden="true" className="state-chip__check" viewBox="0 0 16 16">
            <path d="m3.5 8.5 3 3 6-7" />
        </svg>
    );
}
