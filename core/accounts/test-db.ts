import { PGlite } from '@electric-sql/pglite';
import { readMigrations } from './migrations.js';
import type { Query } from './repository.js';

// Postgres in WASM with every migration applied; no network
export async function createTestDatabase() {
    const db = new PGlite();
    for (const { sql } of await readMigrations()) await db.exec(sql);
    const query: Query = async (text, params) => (await db.query(text, params)).rows;
    return {
        db,
        query,
        reset: () => db.exec('truncate users cascade'),
    };
}
