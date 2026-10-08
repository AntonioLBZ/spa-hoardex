import { queryOptions } from '@tanstack/react-query';

import type { Library, ProfileAccess } from '@core/domain';
import { fetchDemoLibrary, fetchDemoProfile, fetchLibrary, fetchProfile } from './client';

export function profileQuery(input: string) {
    return queryOptions({
        queryKey: ['profile', input],
        queryFn: ({ signal }) => fetchProfile(input, signal),
    });
}

// After a refresh the CDN may still hold the previous GET for a few minutes: never go back to an older library
export function newerLibrary(
    previous: ProfileAccess<Library> | undefined,
    next: ProfileAccess<Library>
): ProfileAccess<Library> {
    if (previous?.kind !== 'ok' || next.kind !== 'ok') return next;
    return Date.parse(previous.data.fetchedAt) > Date.parse(next.data.fetchedAt) ? previous : next;
}

export function libraryQuery(input: string) {
    return queryOptions({
        queryKey: ['library', input],
        queryFn: async ({ client, queryKey, signal }) =>
            newerLibrary(client.getQueryData<ProfileAccess<Library>>(queryKey), await fetchLibrary(input, signal)),
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
