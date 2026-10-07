// Test helpers: an injected fetch that serves fixtures, so no test touches the network
import { loadFixture } from '../../../fixtures/load.js';
import type { SteamDriftReport } from './drift.js';

// Fake, and long enough to be told apart from any other string
export const TEST_KEY = 'FAKE-TEST-KEY-0123456789ABCDEF';

export interface FakeCall {
    url: URL;
    init: RequestInit | undefined;
}

export interface FakeFetch {
    fetch: typeof fetch;
    calls: FakeCall[];
}

export type FakeHandler = (call: FakeCall) => Response | Promise<Response>;

export function createFakeFetch(handler: FakeHandler): FakeFetch {
    const calls: FakeCall[] = [];
    const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const call = { url: new URL(input instanceof Request ? input.url : input), init };
        calls.push(call);
        return handler(call);
    };
    return { fetch: fake as typeof fetch, calls };
}

export function reply(
    body: unknown,
    { status = 200, eresult = null }: { status?: number; eresult?: string | null } = {}
) {
    const headers = eresult === null ? undefined : { 'x-eresult': eresult };
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

export function fixtureReply(name: string): Response {
    const { status, eresult, body } = loadFixture(name);
    return reply(body, { status, eresult });
}

const PATHS = {
    vanity: '/ISteamUser/ResolveVanityURL/v1/',
    summaries: '/ISteamUser/GetPlayerSummaries/v2/',
    ownedGames: '/IPlayerService/GetOwnedGames/v1/',
} as const;

type Route = keyof typeof PATHS;

// Serves each endpoint from a fixture or a custom reply; unlisted endpoints fail the test
export function routes(table: Partial<Record<Route, string | (() => Response)>>): FakeHandler {
    return ({ url }) => {
        const route = (Object.keys(PATHS) as Route[]).find((name) => PATHS[name] === url.pathname);
        const serve = route === undefined ? undefined : table[route];
        if (serve === undefined) throw new Error(`unexpected request to ${url.pathname}`);
        return typeof serve === 'string' ? fixtureReply(serve) : serve();
    };
}

export function collectDrift(): { reports: SteamDriftReport[]; onDrift: (report: SteamDriftReport) => void } {
    const reports: SteamDriftReport[] = [];
    return { reports, onDrift: (report) => reports.push(report) };
}

// Fake SteamID64 inside the fake window, built at runtime
export function fakeSteamId(offset: number): string {
    return String(76561198000000000n + BigInt(offset));
}
