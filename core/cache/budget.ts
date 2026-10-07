import type { CacheStore } from './store.js';

const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

export interface DailyBudget {
    // False once the daily cap is passed
    tryConsume(): Promise<boolean>;
}

export interface DailyBudgetOptions {
    store: CacheStore;
    name: string;
    limit: number;
    now?: () => Date;
    // A store failure lets the request through
    onStoreError?: (error: unknown) => void;
}

// One counter per UTC day: budget:{name}:YYYYMMDD
export function createDailyBudget({
    store,
    name,
    limit,
    now = () => new Date(),
    onStoreError,
}: DailyBudgetOptions): DailyBudget {
    return {
        async tryConsume() {
            const day = now().toISOString().slice(0, 10).replaceAll('-', '');
            try {
                return (await store.increment(`budget:${name}:${day}`, COUNTER_TTL_SECONDS)) <= limit;
            } catch (error) {
                onStoreError?.(error);
                return true;
            }
        },
    };
}
