import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'hoardex:refresh-cooldowns';

// End of each account's refresh cooldown, in epoch milliseconds. A hint: the server holds the truth
const endings = new Map<string, number>();
const listeners = new Set<() => void>();
// The last text read from storage and what it parsed to
let stored: { raw: string | null; endings: Map<string, number> } | null = null;

function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => void listeners.delete(notify);
}

// What earlier pages (or other tabs) stored, as account id to cooldown end; parsed again only when the text changes
function readStored(): ReadonlyMap<string, number> {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch {
        // Blocked storage: only this page's cooldowns count
    }
    if (stored?.raw === raw) return stored.endings;

    const parsedEndings = new Map<string, number>();
    try {
        const parsed: unknown = JSON.parse(raw ?? '{}');
        if (typeof parsed === 'object' && parsed !== null) {
            for (const [accountId, until] of Object.entries(parsed)) {
                if (typeof until === 'number') parsedEndings.set(accountId, until);
            }
        }
    } catch {
        // Unreadable text
    }
    stored = { raw, endings: parsedEndings };
    return parsedEndings;
}

// Keyed by account id, so a vanity and its id share it
export function startCooldown(accountId: string, until: number): void {
    endings.set(accountId, until);
    const running = [...new Map(readStored()).set(accountId, until)].filter(([, end]) => end > Date.now());
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(running)));
    } catch {
        // Blocked storage: the cooldown then lasts for this page only
    }
    listeners.forEach((notify) => notify());
}

export function useCooldownEnd(accountId: string): number {
    return useSyncExternalStore(
        subscribe,
        () => Math.max(endings.get(accountId) ?? 0, readStored().get(accountId) ?? 0),
        () => 0
    );
}
