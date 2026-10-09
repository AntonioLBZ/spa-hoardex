// Spike 4.0: Neon latency over HTTP. Never prints the connection string
// Run: node --env-file=.env.local scripts/spike-neon.ts [queries]
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = neon(url);
const count = Number(process.argv[2] ?? 5);

for (let i = 0; i < count; i++) {
    const start = performance.now();
    const rows = await sql`select version() as version, current_database() as db`;
    const ms = Math.round(performance.now() - start);
    console.log(
        `query ${i + 1}: ${ms} ms`,
        i === 0 ? `${rows[0]?.db} · ${String(rows[0]?.version).split(' ')[1]}` : ''
    );
}
