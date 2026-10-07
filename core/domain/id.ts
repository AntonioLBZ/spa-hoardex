export type Source = 'steam';

// Identity across stores. For Steam, `externalId` is the SteamID64 (profiles) or the appid (games), as a string
export interface EntityId {
    source: Source;
    externalId: string;
}

// Stable string form, e.g. `steam:1091500`, for cache keys and React keys
export function entityKey({ source, externalId }: EntityId): string {
    return `${source}:${externalId}`;
}
