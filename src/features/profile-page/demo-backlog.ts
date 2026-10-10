import { useCallback, useSyncExternalStore } from 'react';

import { BACKLOG_STATES, upgradeState, type BacklogOverride, type Overrides } from '@core/backlog';

const STORAGE_KEY = 'hoardex:demo-backlog';
const EMPTY: Overrides = Object.freeze({});

// Kept in memory too, so blocked storage still allows editing for this page
let current: Overrides | null = null;
const listeners = new Set<() => void>();

function readOverride(value: unknown): BacklogOverride | null {
    if (typeof value !== 'object' || value === null) return null;
    const { state: stored, setAt, minutesAtSet } = value as Record<string, unknown>;
    const state = BACKLOG_STATES.find((known) => known === upgradeState(stored));
    if (state === undefined || typeof setAt !== 'string' || typeof minutesAtSet !== 'number') return null;
    return { state, setAt, minutesAtSet };
}

function readStored(): Overrides {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        if (typeof parsed !== 'object' || parsed === null) return EMPTY;
        return Object.fromEntries(
            Object.entries(parsed).flatMap(([appid, value]) => {
                const override = readOverride(value);
                return override === null ? [] : [[appid, override]];
            })
        );
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
    // Null for a game sends it back to the computed state
    const update = useCallback(
        (changesFor: (current: Overrides) => Readonly<Record<string, BacklogOverride | null>>) => {
            const current = snapshot();
            const next: Record<string, BacklogOverride> = { ...current };
            for (const [appid, override] of Object.entries(changesFor(current))) {
                if (override === null) delete next[appid];
                else next[appid] = override;
            }
            write(next);
        },
        []
    );
    return { overrides, update };
}

// Tests start from a clean store
export function resetDemoBacklog(): void {
    current = null;
}
