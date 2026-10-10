import type { BacklogData, CategoryId, CustomId } from '@core/backlog';
import type { GameArt, Library, Profile, ProfileAccess } from '@core/domain';

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

// Store images of some games of that account's library, by appid
export function fetchArt(owner: string, appids: readonly string[], signal?: AbortSignal) {
    return getAccess<Record<string, GameArt>>(
        `/api/art/${encodeURIComponent(owner)}?appids=${appids.join(',')}`,
        signal
    );
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

export interface Me {
    user: { steamId: string } | null;
}

function isMe(body: unknown): body is Me {
    if (!isRecord(body) || !('user' in body)) return false;
    return body.user === null || (isRecord(body.user) && typeof body.user.steamId === 'string');
}

export async function fetchMe(signal?: AbortSignal): Promise<Me> {
    const response = await fetch('/api/me', { signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    if (!isMe(body)) throw new ApiError(response.status, 'badResponse');
    return body;
}

export async function postLogout(): Promise<Me> {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    return { user: null };
}

// A plain navigation: Steam's page is a full redirect, and the CSP's form-action would block a form
export function loginHref(returnTo: string): string {
    return `/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export type { BacklogData };

// Anyone's manual states, cached by the CDN like the library
export function fetchBacklog(input: string, signal?: AbortSignal) {
    return getAccess<BacklogData>(`/api/backlog/${encodeURIComponent(input)}`, signal);
}

// The signed-in owner's, past the CDN: after a reload it must not see an older copy
export function fetchMyBacklog(signal?: AbortSignal) {
    return getAccess<BacklogData>('/api/me/backlog', signal);
}

// Answers with every manual state and category after the change
async function writeBacklog(path: string, init: RequestInit): Promise<BacklogData> {
    const response = await fetch(path, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    if (!isAccess(body) || body.kind !== 'ok') throw new ApiError(response.status, 'badResponse');
    return (body as { data: BacklogData }).data;
}

function jsonBody(method: string, body: unknown): RequestInit {
    return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function putBacklogState(appid: string, state: CategoryId): Promise<BacklogData> {
    return writeBacklog(`/api/me/backlog/${encodeURIComponent(appid)}`, jsonBody('PUT', { state }));
}

export function deleteBacklogState(appid: string): Promise<BacklogData> {
    return writeBacklog(`/api/me/backlog/${encodeURIComponent(appid)}`, { method: 'DELETE' });
}

// Up to MAX_BULK_CHANGE games; null sends them back to the computed state
export function putBacklogStates(appids: readonly string[], state: CategoryId | null): Promise<BacklogData> {
    return writeBacklog('/api/me/backlog', jsonBody('PUT', { appids, state }));
}

export interface CategoryFields {
    name: string;
    // A palette token or #rrggbb
    color: string;
}

export function postCategory(fields: CategoryFields): Promise<BacklogData> {
    return writeBacklog('/api/me/categories', jsonBody('POST', fields));
}

export function patchCategory(id: CustomId, fields: CategoryFields): Promise<BacklogData> {
    return writeBacklog(`/api/me/categories/${encodeURIComponent(id)}`, jsonBody('PATCH', fields));
}

// Only while no game is in it; the Backlog never
export function deleteCategory(id: CategoryId): Promise<BacklogData> {
    return writeBacklog(`/api/me/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface AccountSettings {
    // ISO 8601; null when snapshots are off
    snapshotsSince: string | null;
    snapshotDays: number;
    // YYYY-MM-DD
    lastSnapshotOn: string | null;
}

function isSettings(body: unknown): body is AccountSettings {
    return isRecord(body) && typeof body.snapshotDays === 'number' && 'snapshotsSince' in body;
}

async function accountCall<T>(path: string, init: RequestInit, check: (body: unknown) => body is T): Promise<T> {
    const response = await fetch(path, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorCode(body));
    if (!check(body)) throw new ApiError(response.status, 'badResponse');
    return body;
}

export function fetchAccount(signal?: AbortSignal) {
    return accountCall('/api/me/account', { signal }, isSettings);
}

// Off deletes the recorded history
export function putSnapshots(snapshots: boolean) {
    return accountCall(
        '/api/me/settings',
        { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshots }) },
        isSettings
    );
}

export function postEndSessions() {
    return accountCall('/api/me/sessions/end', { method: 'POST' }, isMe);
}

export function deleteAccount() {
    return accountCall('/api/me', { method: 'DELETE' }, isMe);
}
