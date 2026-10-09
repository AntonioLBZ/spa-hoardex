// Applies db/migrations in order, once each. Runs in the Vercel build (vercel-build) and locally against the dev branch
// Run: node --env-file=.env.local scripts/migrate.ts
import { Pool } from '@neondatabase/serverless';
import { readMigrations } from '../core/accounts/migrations.ts';

// Preview and development use the dev branch; production only has the integration's variable
const url = process.env.DATABASE_URL || process.env.NEON_STORAGE_DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const LOCK = 'hoardex-migrations';
const pool = new Pool({ connectionString: url });
const client = await pool.connect();

try {
    // Two builds at once must not apply the same file twice
    await client.query('select pg_advisory_lock(hashtext($1))', [LOCK]);
    await client.query(
        'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())'
    );
    const { rows } = await client.query<{ name: string }>('select name from schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    for (const { name, sql } of await readMigrations()) {
        if (applied.has(name)) continue;
        await client.query('begin');
        try {
            await client.query(sql);
            await client.query('insert into schema_migrations (name) values ($1)', [name]);
            await client.query('commit');
            console.log(`[migrate] applied ${name}`);
        } catch (error) {
            await client.query('rollback');
            throw error;
        }
    }
    console.log(`[migrate] ${process.env.VERCEL_ENV ?? 'development'} is up to date`);
} finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [LOCK]).catch(() => {});
    client.release();
    await pool.end();
}
