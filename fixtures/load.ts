// Loads the synthetic Steam responses in fixtures/steam
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reference instant for time-dependent fixture values
export const FIXTURE_NOW = new Date('2026-10-07T12:00:00Z');

export interface SteamFixture {
    status: number;
    // x-eresult header, null if absent
    eresult: string | null;
    // Parsed JSON, or a string if not JSON
    body: unknown;
}

const STEAM_DIR = fileURLToPath(new URL('./steam/', import.meta.url));

// name: file name without extension, e.g. `GetOwnedGames.library`
export function loadFixture(name: string): SteamFixture {
    return JSON.parse(readFileSync(`${STEAM_DIR}${name}.json`, 'utf8')) as SteamFixture;
}
