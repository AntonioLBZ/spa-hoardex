import type { Library, Profile, ProfileAccess } from '@core/domain';

// A non-200 answer from our API; access states are data, not errors
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string) {
        super(`API ${status}: ${code}`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

function errorCode(body: unknown): string {
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
        return body.error;
    }
    return 'unknown';
}

function isAccess(body: unknown): body is ProfileAccess<unknown> {
    return typeof body === 'object' && body !== null && 'kind' in body && typeof body.kind === 'string';
}

async function getAccess<T>(path: string, signal?: AbortSignal): Promise<ProfileAccess<T>> {
    const response = await fetch(path, { signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    if (!isAccess(body)) throw new ApiError(response.status, 'badResponse');
    return body as ProfileAccess<T>;
}

export function fetchProfile(input: string, signal?: AbortSignal) {
    return getAccess<Profile>(`/api/profile/${encodeURIComponent(input)}`, signal);
}

export function fetchDemoProfile(signal?: AbortSignal) {
    return getAccess<Profile>('/api/demo/profile', signal);
}

export function fetchDemoLibrary(signal?: AbortSignal) {
    return getAccess<Library>('/api/demo/library', signal);
}

// Same input as the profile (vanity, id or URL), so both requests can go out together
export function fetchLibrary(input: string, signal?: AbortSignal) {
    return getAccess<Library>(`/api/library/${encodeURIComponent(input)}`, signal);
}
