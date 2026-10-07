import { queryOptions } from '@tanstack/react-query';

import { fetchLibrary, fetchProfile } from './client';

export function profileQuery(input: string) {
    return queryOptions({
        queryKey: ['profile', input],
        queryFn: ({ signal }) => fetchProfile(input, signal),
    });
}

export function libraryQuery(steamId: string) {
    return queryOptions({
        queryKey: ['library', steamId],
        queryFn: ({ signal }) => fetchLibrary(steamId, signal),
    });
}
