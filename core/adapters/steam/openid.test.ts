import { describe, expect, it, vi } from 'vitest';
import { STEAM_OPENID_ENDPOINT, buildSteamLoginUrl, verifySteamLogin } from './openid.js';

const ID = '76561198000000001';
const RETURN_TO = 'https://hoardex.example/api/auth/steam/callback?state=abc';
const NOW = new Date('2026-10-09T16:00:00Z');

function assertion(overrides: Record<string, string | null> = {}) {
    const fields: Record<string, string | null> = {
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
        'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
        'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
        'openid.return_to': RETURN_TO,
        'openid.response_nonce': '2026-10-09T15:59:30ZsomeUniquePart',
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'c2lnbmF0dXJl',
        ...overrides,
    };
    const query = new URLSearchParams({ state: 'abc' });
    for (const [name, value] of Object.entries(fields)) if (value !== null) query.set(name, value);
    return query;
}

function steamAnswering(text: string, status = 200) {
    return vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(text, { status }))
    );
}

function verify(
    query: URLSearchParams,
    fetch = steamAnswering('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')
) {
    const claimNonce = vi.fn(() => Promise.resolve(true));
    const result = verifySteamLogin(query, { expectedReturnTo: RETURN_TO, claimNonce, fetch, now: () => NOW });
    return { result, fetch, claimNonce };
}

describe('buildSteamLoginUrl', () => {
    it('asks Steam to pick the identity and come back to our callback', () => {
        const url = new URL(buildSteamLoginUrl({ realm: 'https://hoardex.example', returnTo: RETURN_TO }));
        expect(url.origin + url.pathname).toBe(STEAM_OPENID_ENDPOINT);
        expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
        expect(url.searchParams.get('openid.return_to')).toBe(RETURN_TO);
        expect(url.searchParams.get('openid.realm')).toBe('https://hoardex.example');
        expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
    });
});

describe('verifySteamLogin', () => {
    it('accepts a valid assertion once Steam confirms it, and posts back every openid field', async () => {
        const { result, fetch } = verify(assertion());
        expect(await result).toEqual({ kind: 'ok', steamId: ID });
        const [url, init] = fetch.mock.calls[0]!;
        expect(url).toBe(STEAM_OPENID_ENDPOINT);
        const body = init?.body as URLSearchParams;
        expect(body.get('openid.mode')).toBe('check_authentication');
        expect(body.get('openid.sig')).toBe('c2lnbmF0dXJl');
        expect(body.has('state')).toBe(false);
    });

    it('fails when Steam says the assertion is not valid', async () => {
        const { result } = verify(assertion(), steamAnswering('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'));
        expect(await result).toEqual({ kind: 'invalid', reason: 'rejected' });
    });

    it.each([
        ['another mode', { 'openid.mode': 'cancel' }],
        ['another provider', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
        ['a claimed id on another host', { 'openid.claimed_id': `https://evil.example/openid/id/${ID}` }],
        [
            'an identity that differs from the claimed id',
            { 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000002' },
        ],
        [
            'an id outside the SteamID64 range',
            { 'openid.claimed_id': 'https://steamcommunity.com/openid/id/12345678901234567' },
        ],
        ['return_to left unsigned', { 'openid.signed': 'op_endpoint,claimed_id,identity,response_nonce' }],
        ['no signature', { 'openid.sig': null }],
    ])('rejects %s without asking Steam', async (_case, overrides) => {
        const { result, fetch } = verify(assertion(overrides));
        expect(await result).toEqual({ kind: 'invalid', reason: 'malformed' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects an assertion meant for another callback', async () => {
        const { result, fetch } = verify(assertion({ 'openid.return_to': 'https://evil.example/callback' }));
        expect(await result).toEqual({ kind: 'invalid', reason: 'returnTo' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['2026-10-09T15:50:00Zold', '2026-10-09T16:10:00Zfuture', 'not-a-date'])(
        'rejects the nonce %s as stale',
        async (nonce) => {
            const { result } = verify(assertion({ 'openid.response_nonce': nonce }));
            expect(await result).toEqual({ kind: 'invalid', reason: 'stale' });
        }
    );

    it('rejects a nonce that was already used', async () => {
        const fetch = steamAnswering('is_valid:true');
        const result = await verifySteamLogin(assertion(), {
            expectedReturnTo: RETURN_TO,
            claimNonce: () => Promise.resolve(false),
            fetch,
            now: () => NOW,
        });
        expect(result).toEqual({ kind: 'invalid', reason: 'replayed' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('reports a Steam failure as upstream', async () => {
        expect(await verify(assertion(), steamAnswering('', 503)).result).toEqual({
            kind: 'invalid',
            reason: 'upstream',
        });
        const failing = vi.fn(() => Promise.reject(new TypeError('network')));
        expect(await verify(assertion(), failing).result).toEqual({ kind: 'invalid', reason: 'upstream' });
    });
});
