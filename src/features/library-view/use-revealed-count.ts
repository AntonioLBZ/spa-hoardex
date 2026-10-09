import { useCallback, useState } from 'react';

// The same on every screen; 24 and 48 fill whole rows at 2, 3, 4 and 6 columns
export const FIRST_BATCH = 24;
export const NEXT_BATCH = 48;

// How many cards to render: a first batch, more only on request, back to the first when `resetKey` changes
export function useRevealedCount(total: number, resetKey: string) {
    const [state, setState] = useState({ key: resetKey, count: FIRST_BATCH });
    const requested = state.key === resetKey ? state.count : FIRST_BATCH;
    const count = Math.min(requested, total);

    const showMore = useCallback(
        () =>
            setState((current) => ({
                key: resetKey,
                count: (current.key === resetKey ? current.count : FIRST_BATCH) + NEXT_BATCH,
            })),
        [resetKey]
    );

    return { count, hasMore: count < total, showMore };
}
