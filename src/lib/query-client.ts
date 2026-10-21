import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError, meQuery, type Me } from '@/lib/api';

const SIGNED_OUT: Me = { user: null };

// Access states are data, so nothing is retried; staleTime matches the CDN's s-maxage
export function createQueryClient() {
    // The session can end on another device while this tab still shows the visitor as signed in
    function endSessionOn401(error: unknown) {
        if (error instanceof ApiError && error.status === 401 && error.code === 'signedOut') {
            client.setQueryData(meQuery().queryKey, SIGNED_OUT);
        }
    }

    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError: endSessionOn401 }),
        mutationCache: new MutationCache({ onError: endSessionOn401 }),
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
        },
    });
    return client;
}
