// Pulls saved responses out of a Postman collection. Pure.
import type { Json } from './anonymize.js';

export interface SavedResponse {
    // Folder names followed by the request name
    path: string[];
    code: number;
    body: Json;
}

// Folders have `item`, requests have `response`
export function collectResponses(items: unknown, path: string[] = []): SavedResponse[] {
    if (!Array.isArray(items)) return [];
    const found: SavedResponse[] = [];
    for (const item of items as unknown[]) {
        if (typeof item !== 'object' || item === null) continue;
        const { name, item: children, response } = item as { name?: unknown; item?: unknown; response?: unknown };
        const here = typeof name === 'string' ? [...path, name] : path;
        found.push(...collectResponses(children, here));
        if (!Array.isArray(response)) continue;
        for (const saved of response as unknown[]) {
            if (typeof saved !== 'object' || saved === null) continue;
            const { code, body } = saved as { code?: unknown; body?: unknown };
            found.push({ path: here, code: typeof code === 'number' ? code : 0, body: parseBody(body) });
        }
    }
    return found;
}

// Empty or non-JSON bodies are kept as plain strings
export function parseBody(body: unknown): Json {
    if (typeof body !== 'string') return null;
    try {
        return JSON.parse(body) as Json;
    } catch {
        return body;
    }
}

export function slug(name: string): string {
    return name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// <folders>-<request>.<code>.json, with -2, -3... for repeats
export function fileNames(responses: SavedResponse[]): string[] {
    const seen = new Map<string, number>();
    return responses.map(({ path, code }) => {
        const stem = path.map(slug).filter(Boolean).join('-') || 'response';
        const key = `${stem}.${code}`;
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        return `${count === 1 ? stem : `${stem}-${count}`}.${code}.json`;
    });
}

// Recursive key sort for stable diffs
export function sortKeys(value: Json): Json {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        return Object.fromEntries(keys.map((key) => [key, sortKeys(value[key] as Json)]));
    }
    return value;
}

// JSON.parse rounds integers past 2^53
export function countUnsafeIntegers(value: Json): number {
    if (typeof value === 'number') return Number.isInteger(value) && !Number.isSafeInteger(value) ? 1 : 0;
    if (Array.isArray(value)) return value.reduce((sum: number, child) => sum + countUnsafeIntegers(child), 0);
    if (value !== null && typeof value === 'object') {
        return Object.values(value).reduce((sum: number, child) => sum + countUnsafeIntegers(child), 0);
    }
    return 0;
}
