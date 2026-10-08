import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'hoardex:refresh-cooldowns';

// End of each account's refresh cooldown, in epoch milliseconds. A hint: the server holds the truth
const endings = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => void listeners.delete(notify);
}

// What earlier pages (or other tabs) stored, as account id to cooldown end
function readStored(): Map<string, number> {
    const stored = new Map<string, number>();
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        if (typeof parsed === 'object' && parsed !== null) {
            for (const [accountId, until] of Object.entries(parsed)) {
                if (typeof until === 'number') stored.set(accountId, until);
            }
        }
    } catch {
        // Blocked or unreadable storage: only this page's cooldowns count
    }
    return stored;
}

// Keyed by account id, so a vanity and its id share it
export function startCooldown(accountId: string, until: number): void {
    endings.set(accountId, until);
    const stored = readStored().set(accountId, until);
    const running = [...stored].filter(([, end]) => end > Date.now());
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
