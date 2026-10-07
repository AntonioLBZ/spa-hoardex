import { queryOptions } from '@tanstack/react-query';

import { fetchDemoLibrary, fetchDemoProfile, fetchLibrary, fetchProfile } from './client';

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

export function demoProfileQuery() {
    return queryOptions({
        queryKey: ['demo', 'profile'],
        queryFn: ({ signal }) => fetchDemoProfile(signal),
    });
}

export function demoLibraryQuery() {
    return queryOptions({
        queryKey: ['demo', 'library'],
        queryFn: ({ signal }) => fetchDemoLibrary(signal),
    });
}
