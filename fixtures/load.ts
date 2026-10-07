// Node-only loader for the synthetic Steam responses in fixtures/steam (tests and MSW handlers)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Every time-dependent fixture value is computed relative to this instant
export const FIXTURE_NOW = new Date('2026-10-07T12:00:00Z');

export interface SteamFixture {
    status: number;
    // The `x-eresult` response header, null when Steam does not send it
    eresult: string | null;
    // Parsed JSON, or a string when the upstream body is not JSON
    body: unknown;
}

const STEAM_DIR = fileURLToPath(new URL('./steam/', import.meta.url));

// `name` is the file name without extension, e.g. `GetOwnedGames.library`
export function loadFixture(name: string): SteamFixture {
    return JSON.parse(readFileSync(`${STEAM_DIR}${name}.json`, 'utf8')) as SteamFixture;
}
