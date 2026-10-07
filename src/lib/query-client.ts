import { QueryClient } from '@tanstack/react-query';

// Access states are data, so nothing is retried; staleTime matches the CDN's s-maxage
export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
        },
    });
}
