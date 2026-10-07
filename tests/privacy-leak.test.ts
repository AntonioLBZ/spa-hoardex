// Fails when a repo file carries a real SteamID or a term from fixtures/full/private-terms.json
// Failures name the file and the kind of leak, never the value
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isFakeSteamId } from '../scripts/lib/anonymize.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TERMS_FILE = `${ROOT}fixtures/full/private-terms.json`;
const MAX_BYTES = 2 * 1024 * 1024;

// Public ids allowed in docs and code: the docs example, account 0, the first account ids and the pattern limits
const PUBLIC_STEAMIDS = new Set([
    '76561197960287930',
    '76561197960265728',
    '76561197960265729',
    '76561197960265730',
    '76561199999999999',
    '76561100000000000',
]);
const STEAMID = /(?<!\d)765611\d{11}(?!\d)/g;

interface PrivateTerms {
    steamids: string[];
    strings: string[];
}

interface ScannedFile {
    path: string;
    text: string;
}

function listRepoFiles(): string[] {
    const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    return [...new Set(output.split('\0').filter(Boolean))].sort();
}

// Null for missing, large or binary files
function readText(path: string): string | null {
    try {
        const file = `${ROOT}${path}`;
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.size > MAX_BYTES) return null;
        const bytes = readFileSync(file);
        if (bytes.subarray(0, 8000).includes(0)) return null;
        return bytes.toString('utf8');
    } catch {
        return null;
    }
}

function readTerms(): PrivateTerms {
    const raw = JSON.parse(readFileSync(TERMS_FILE, 'utf8')) as Partial<PrivateTerms>;
    const clean = (list: unknown) =>
        Array.isArray(list) ? list.filter((term): term is string => typeof term === 'string' && term !== '') : [];
    return { steamids: clean(raw.steamids), strings: clean(raw.strings) };
}

// SteamID64s outside the fake window and the allowlist
function findStraySteamIds(text: string): string[] {
    return (text.match(STEAMID) ?? []).filter((id) => !isFakeSteamId(id) && !PUBLIC_STEAMIDS.has(id));
}

// Labels of the private terms found: ids exact, strings case-insensitive
function findPrivateTerms(text: string, terms: PrivateTerms): string[] {
    const lower = text.toLowerCase();
    return [
        ...terms.steamids.flatMap((id, i) => (text.includes(id) ? [`steamid #${i}`] : [])),
        ...terms.strings.flatMap((term, i) => (lower.includes(term.toLowerCase()) ? [`string #${i}`] : [])),
    ];
}

// Null when .env.local or the variable is missing
function readApiKey(): string | null {
    try {
        const line = readFileSync(`${ROOT}.env.local`, 'utf8')
            .split('\n')
            .find((entry) => entry.startsWith('STEAM_API_KEY='));
        const value = line
            ?.slice('STEAM_API_KEY='.length)
            .trim()
            .replace(/^["']|["']$/g, '');
        return value !== undefined && value.length >= 16 ? value : null;
    } catch {
        return null;
    }
}

const files: ScannedFile[] = listRepoFiles().flatMap((path) => {
    const text = readText(path);
    return text === null ? [] : [{ path, text }];
});

const termsAvailable = existsSync(TERMS_FILE);
if (!termsAvailable) {
    console.warn(
        'privacy-leak: fixtures/full/private-terms.json is missing, so the real-identity check is skipped. ' +
            'Create it with `node scripts/init-private-terms.ts` (needs the spike output).'
    );
}

describe('privacy leaks in repo files', () => {
    it('scans the docs and this test like any other file', () => {
        const paths = files.map((file) => file.path);
        expect(paths).toContain('ARCHITECTURE.md');
        expect(paths).toContain('AGENTS.md');
        expect(paths).toContain('tests/privacy-leak.test.ts');
        expect(paths.filter((path) => path.startsWith('fixtures/full/'))).toEqual([]);
    });

    it('only contains SteamID64s from the reserved fake range or the public allowlist', () => {
        const offenders = files.flatMap(({ path, text }) => {
            const stray = findStraySteamIds(text);
            return stray.length > 0 ? [`${path}: ${stray.length} SteamID64 outside the fake range`] : [];
        });
        expect(offenders).toEqual([]);
    });

    it.skipIf(!termsAvailable)('never contains the owner identifiers from private-terms.json', () => {
        const terms = readTerms();
        expect(terms.steamids.length).toBeGreaterThan(0);
        const offenders = files.flatMap(({ path, text }) => {
            const kinds = findPrivateTerms(text, terms);
            return kinds.length > 0 ? [`${path}: ${kinds.join(', ')}`] : [];
        });
        expect(offenders).toEqual([]);
    });
});

describe('secrets in repo files', () => {
    const apiKey = readApiKey();

    it.skipIf(apiKey === null)('never contains the Steam API key from .env.local', () => {
        const offenders = files.filter(({ text }) => text.includes(apiKey!)).map(({ path }) => path);
        expect(offenders).toEqual([]);
    });
});

describe('leak detectors', () => {
    // Built at runtime so this file holds no id-shaped literal
    const accountBase = 76561197960265728n;
    const real = String(accountBase + 123_456n);
    const fake = String(76561198000000000n + 5n);
    const outsideWindow = String(76561198000000000n + 10_000n);

    it('flags real-looking ids and passes fake and allowlisted ones', () => {
        expect(findStraySteamIds(`a ${fake} b 76561197960287930 c`)).toEqual([]);
        expect(findStraySteamIds(`a ${real} b ${outsideWindow}`)).toEqual([real, outsideWindow]);
        expect(findStraySteamIds(`profiles/${real}/`)).toEqual([real]);
    });

    it('ignores digit runs that merely contain the id prefix', () => {
        expect(findStraySteamIds(`9${real} ${real}9`)).toEqual([]);
    });

    it('matches private terms exactly for ids and case-insensitively for strings', () => {
        const terms = { steamids: [real], strings: ['Some Name'] };
        expect(findPrivateTerms(`x ${real} y`, terms)).toEqual(['steamid #0']);
        expect(findPrivateTerms('hello SOME name', terms)).toEqual(['string #0']);
        expect(findPrivateTerms('nothing here', terms)).toEqual([]);
    });
});
