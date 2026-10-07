import { useCallback, useEffect, useRef, useState } from 'react';

export const FIRST_BATCH = 48;
export const NEXT_BATCH = 96;
// 48 + 3 batches: past it only the button loads more, so what follows the grid stays reachable
export const AUTOLOAD_LIMIT = 336;
const PRELOAD_DISTANCE = '800px';

// How many cards to render: a first batch, more on demand or near the end of the list, back to the first when `resetKey` changes
export function useRevealedCount(total: number, resetKey: string) {
    const [state, setState] = useState({ key: resetKey, count: FIRST_BATCH });
    const requested = state.key === resetKey ? state.count : FIRST_BATCH;
    const count = Math.min(requested, total);
    const hasMore = count < total;

    const showMore = useCallback(
        () =>
            setState((current) => ({
                key: resetKey,
                count: (current.key === resetKey ? current.count : FIRST_BATCH) + NEXT_BATCH,
            })),
        [resetKey]
    );

    const sentinelRef = useRef<HTMLDivElement>(null);
    const autoload = hasMore && count < AUTOLOAD_LIMIT && typeof IntersectionObserver !== 'undefined';

    // Observing again after each batch asks for the current state, so a tall screen keeps loading
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!autoload || sentinel === null) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) showMore();
            },
            { rootMargin: `0px 0px ${PRELOAD_DISTANCE} 0px` }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [autoload, count, showMore]);

    return { count, hasMore, showMore, sentinelRef };
}
