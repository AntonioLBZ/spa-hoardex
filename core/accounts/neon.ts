import { neon } from '@neondatabase/serverless';
import type { Query } from './repository.js';

// Neon over HTTP: one request per statement, no pool to keep warm
export function createNeonQuery(connectionString: string): Query {
    const sql = neon(connectionString);
    return (text, params) => sql.query(text, params);
}
