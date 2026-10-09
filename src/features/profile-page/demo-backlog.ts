import { useCallback, useSyncExternalStore } from 'react';

import { BACKLOG_STATES, type BacklogOverride, type Overrides } from '@core/backlog';

const STORAGE_KEY = 'hoardex:demo-backlog';
const EMPTY: Overrides = Object.freeze({});

// Kept in memory too, so blocked storage still allows editing for this page
let current: Overrides | null = null;
const listeners = new Set<() => void>();

function isOverride(value: unknown): value is BacklogOverride {
    if (typeof value !== 'object' || value === null) return false;
    const { state, setAt, minutesAtSet } = value as Record<string, unknown>;
    return (
        BACKLOG_STATES.some((known) => known === state) && typeof setAt === 'string' && typeof minutesAtSet === 'number'
    );
}

function readStored(): Overrides {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        if (typeof parsed !== 'object' || parsed === null) return EMPTY;
        return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isOverride(value)));
    } catch {
        return EMPTY;
    }
}

function snapshot(): Overrides {
    return (current ??= readStored());
}

function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => void listeners.delete(notify);
}

function write(next: Overrides): void {
    current = next;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Blocked storage: the change lasts for this page only
    }
    listeners.forEach((notify) => notify());
}

// The demo's manual states live in this browser only
export function useDemoBacklog() {
    const overrides = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
    const set = useCallback((appid: string, override: BacklogOverride | null) => {
        const { [appid]: _previous, ...rest } = snapshot();
        write(override === null ? rest : { ...rest, [appid]: override });
    }, []);
    return { overrides, set };
}

// Tests start from a clean store
export function resetDemoBacklog(): void {
    current = null;
}
