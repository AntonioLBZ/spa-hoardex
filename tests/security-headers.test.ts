// The CSP in vercel.json blocks anything it does not list, so a code change can break images silently
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { steamCoverUrls } from '../core/adapters/steam/images.js';

interface Header {
    key: string;
    value: string;
}

const config = JSON.parse(readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')) as {
    headers: { source: string; headers: Header[] }[];
};

function directives(): Map<string, string[]> {
    const csp = config.headers
        .find((rule) => rule.source === '/(.*)')
        ?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
    expect(csp).toBeDefined();
    return new Map(
        (csp ?? '').split(';').map((part) => {
            const [name = '', ...sources] = part.trim().split(/\s+/);
            return [name, sources];
        })
    );
}

describe('Content-Security-Policy', () => {
    it('applies to every path and allows only the own origin for scripts and requests', () => {
        const policy = directives();
        expect(policy.get('default-src')).toEqual(["'self'"]);
        expect(policy.get('script-src')).toEqual(["'self'"]);
        expect(policy.get('connect-src')).toEqual(["'self'"]);
        expect(policy.get('object-src')).toEqual(["'none'"]);
        expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    });

    it('never falls back to inline code', () => {
        directives().forEach((sources) => {
            expect(sources).not.toContain("'unsafe-inline'");
            expect(sources).not.toContain("'unsafe-eval'");
        });
    });

    it('allows the host of every cover URL the app builds', () => {
        const allowed = directives().get('img-src') ?? [];
        for (const url of steamCoverUrls('1091500')) expect(allowed).toContain(new URL(url).origin);
    });

    it('allows the host Steam gives for avatars', () => {
        expect(directives().get('img-src')).toContain('https://avatars.steamstatic.com');
    });
});
