import { describe, expect, it } from 'vitest';
import * as entry from '../api/index.js';
import { createApp } from '../server/app.js';

const unused = (): never => {
    throw new Error('unused');
};

describe('api/index.ts', () => {
    it('exports a handler for every method the app routes', () => {
        const app = createApp(unused, { getAuth: unused, getAccounts: unused, getCronSecret: unused });
        const methods = new Set(app.routes.map((route) => route.method).filter((method) => method !== 'ALL'));
        expect(methods).toContain('PATCH');
        methods.forEach((method) => expect(entry).toHaveProperty(method));
    });
});
