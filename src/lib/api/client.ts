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

export type RefreshOutcome =
    | { kind: 'refreshed'; cooldownSeconds: number; profile: ProfileAccess<Profile>; library: ProfileAccess<Library> }
    | { kind: 'cooldown'; retryAfterSeconds: number }
    // Steam is throttling, or the daily budget is spent
    | { kind: 'rateLimited'; retryAfterSeconds: number };

function isRecord(body: unknown): body is Record<string, unknown> {
    return typeof body === 'object' && body !== null;
}

// A refresh answers with the fresh data, or says when to come back; both are data, anything else is an ApiError
export async function postRefresh(input: string, signal?: AbortSignal): Promise<RefreshOutcome> {
    const response = await fetch(`/api/refresh/${encodeURIComponent(input)}`, { method: 'POST', signal });
    const body: unknown = await response.json().catch(() => null);

    if (response.status === 429 || response.status === 503) {
        const retryAfterSeconds = isRecord(body) ? body.retryAfterSeconds : undefined;
        if (typeof retryAfterSeconds !== 'number') throw new ApiError(response.status, errorCode(body));
        return { kind: response.status === 429 ? 'cooldown' : 'rateLimited', retryAfterSeconds };
    }
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    if (
        !isRecord(body) ||
        body.kind !== 'refreshed' ||
        typeof body.cooldownSeconds !== 'number' ||
        !isAccess(body.profile) ||
        !isAccess(body.library)
    ) {
        throw new ApiError(response.status, 'badResponse');
    }
    return body as RefreshOutcome;
}
