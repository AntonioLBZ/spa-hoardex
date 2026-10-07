export type Source = 'steam';

// Identity across stores; externalId is the SteamID64 or the appid
export interface EntityId {
    source: Source;
    externalId: string;
}

// Stable string form, e.g. `steam:1091500`
export function entityKey({ source, externalId }: EntityId): string {
    return `${source}:${externalId}`;
}
