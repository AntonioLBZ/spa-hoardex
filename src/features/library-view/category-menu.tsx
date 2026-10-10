import { clsx } from 'clsx';
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

import type { CategoryId } from '@core/backlog';

import './category-menu.scss';

// Top layer: neither the card's overflow nor its `content-visibility` can clip the menu
const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

// Null: back to the computed state
export type CategoryOption = CategoryId | null;

interface CategoryMenuProps {
    options: readonly CategoryOption[];
    // Undefined: a menu of actions, with no current choice
    current?: CategoryOption;
    labelOf: (option: CategoryOption) => string;
    // Null: no single colour, drawn as a ring
    colorOf: (option: CategoryOption) => string | null;
    onChoose: (option: CategoryOption) => void;
    menuLabel: string;
    buttonLabel: string;
    buttonClassName: string;
    title?: string;
    disabled?: boolean;
    children: ReactNode;
}

// A button and its menu of categories: roving focus, a letter jumps, Enter picks, Space picks on release
export function CategoryMenu({
    options,
    current,
    labelOf,
    colorOf,
    onChoose,
    menuLabel,
    buttonLabel,
    buttonClassName,
    title,
    disabled = false,
    children,
}: CategoryMenuProps) {
    const menuId = useId();
    const button = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const radio = current !== undefined;

    const show = () => {
        if (disabled) return;
        setActive(radio ? Math.max(options.indexOf(current), 0) : 0);
        setOpen(true);
    };

    const close = useCallback((returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) button.current?.focus();
    }, []);

    function choose(option: CategoryOption) {
        close(true);
        onChoose(option);
    }

    useLayoutEffect(() => {
        const element = menu.current;
        if (!open || element === null) return;
        if (POPOVER && !element.matches(':popover-open')) {
            element.showPopover();
            place(element, button.current);
        }
        element.querySelectorAll<HTMLElement>('.category-menu__option')[active]?.focus({ preventScroll: true });
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
        const last = options.length - 1;
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
                return choose(options[active] ?? null);
            // Picked on release, or the button that gets the focus back would take the release as a click
            case ' ':
                return event.preventDefault();
        }
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const key = event.key.toLocaleLowerCase();
            const ordered = [...options.keys()].map((offset) => (active + 1 + offset) % options.length);
            const match = ordered.find((index) =>
                labelOf(options[index] ?? null)
                    .toLocaleLowerCase()
                    .startsWith(key)
            );
            if (match !== undefined) move(match);
        }
    }

    return (
        <span className="category-menu">
            <button
                aria-controls={open ? menuId : undefined}
                aria-disabled={disabled || undefined}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={buttonLabel}
                className={buttonClassName}
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
                    aria-label={menuLabel}
                    className={clsx('category-menu__list', !POPOVER && 'category-menu__list--inline')}
                    id={menuId}
                    onBlur={(event) => {
                        const next = event.relatedTarget as Node | null;
                        if (next !== null && !menu.current?.contains(next) && next !== button.current) close(false);
                    }}
                    onKeyDown={onMenuKey}
                    onKeyUp={(event) => {
                        if (event.key === ' ') choose(options[active] ?? null);
                    }}
                    popover={POPOVER ? 'manual' : undefined}
                    ref={menu}
                    role="menu"
                >
                    {options.map((option, index) => {
                        const color = colorOf(option);
                        return (
                            <div
                                aria-checked={radio ? option === current : undefined}
                                className={clsx(
                                    'category-menu__option',
                                    option === null && 'category-menu__option--automatic'
                                )}
                                key={option ?? 'automatic'}
                                onClick={() => choose(option)}
                                onPointerMove={() => {
                                    if (index !== active) setActive(index);
                                }}
                                role={radio ? 'menuitemradio' : 'menuitem'}
                                tabIndex={index === active ? 0 : -1}
                            >
                                <span
                                    aria-hidden="true"
                                    className={clsx(
                                        'category-menu__swatch',
                                        color === null && 'category-menu__swatch--ring'
                                    )}
                                    style={color === null ? undefined : { backgroundColor: color }}
                                />
                                <span className="category-menu__label">{labelOf(option)}</span>
                                {radio ? <CheckIcon /> : null}
                            </div>
                        );
                    })}
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

function CheckIcon() {
    return (
        <svg aria-hidden="true" className="category-menu__check" viewBox="0 0 16 16">
            <path d="m3.5 8.5 3 3 6-7" />
        </svg>
    );
}
