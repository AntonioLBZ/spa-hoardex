import { readFile, readdir } from 'node:fs/promises';

export interface Migration {
    name: string;
    sql: string;
}

const MIGRATIONS_DIR = new URL('../../db/migrations/', import.meta.url);

// In name order: 001_…, 002_…
export async function readMigrations(dir: URL = MIGRATIONS_DIR): Promise<Migration[]> {
    const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), 'utf8') })));
}
