import { useSyncExternalStore } from 'react';

// End of each account's refresh cooldown, in epoch milliseconds. Memory only: the server holds the truth
const endings = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => void listeners.delete(notify);
}

// Keyed by account id, so a vanity and its id share it
export function startCooldown(accountId: string, until: number): void {
    endings.set(accountId, until);
    listeners.forEach((notify) => notify());
}

export function useCooldownEnd(accountId: string): number {
    return useSyncExternalStore(
        subscribe,
        () => endings.get(accountId) ?? 0,
        () => 0
    );
}
