// Writes fixtures/full/private-terms.json (gitignored) from the spike output; never prints the values
// Run once after the spike: node scripts/init-private-terms.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPIKE = resolve(ROOT, 'fixtures/full/spike');
const TERMS = resolve(ROOT, 'fixtures/full/private-terms.json');

// SteamID64 = this base + the 32-bit account id
const ACCOUNT_BASE = 76561197960265728n;
// Default values that identify nobody
const COMMON_VALUES = new Set(['103582791429521408', 'fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb']);

const meta = JSON.parse(await readFile(resolve(SPIKE, 'meta.json'), 'utf8')) as { steamid?: unknown };
const summaries = JSON.parse(await readFile(resolve(SPIKE, 'public/GetPlayerSummaries.json'), 'utf8')) as {
    body?: { response?: { players?: Record<string, unknown>[] } };
};

const steamid = meta.steamid;
if (typeof steamid !== 'string' || !/^765611\d{11}$/.test(steamid)) throw new Error('spike meta.json has no SteamID64');
const player = summaries.body?.response?.players?.[0];
if (!player) throw new Error('spike GetPlayerSummaries.json has no player');

// The same account as SteamID2, SteamID3 and vanity
const account = BigInt(steamid) - ACCOUNT_BASE;
const vanity = typeof player.profileurl === 'string' ? /\/id\/([^/?#]+)/.exec(player.profileurl)?.[1] : undefined;
const strings = [
    player.realname,
    player.personaname,
    vanity,
    player.avatarhash,
    player.primaryclanid,
    `STEAM_0:${account % 2n}:${account / 2n}`,
    `[U:1:${account}]`,
].filter((term): term is string => typeof term === 'string' && term.length > 0 && !COMMON_VALUES.has(term));

await mkdir(dirname(TERMS), { recursive: true });
await writeFile(TERMS, `${JSON.stringify({ steamids: [steamid], strings: [...new Set(strings)] }, null, 2)}\n`);
console.log(`wrote fixtures/full/private-terms.json (1 steamid, ${new Set(strings).size} strings)`);
