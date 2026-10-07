import { queryOptions } from '@tanstack/react-query';

import { fetchDemoLibrary, fetchDemoProfile, fetchLibrary, fetchProfile } from './client';

export function profileQuery(input: string) {
    return queryOptions({
        queryKey: ['profile', input],
        queryFn: ({ signal }) => fetchProfile(input, signal),
    });
}

export function libraryQuery(input: string) {
    return queryOptions({
        queryKey: ['library', input],
        queryFn: ({ signal }) => fetchLibrary(input, signal),
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
