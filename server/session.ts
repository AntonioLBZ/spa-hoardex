import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { isSteamId64 } from '../core/adapters/steam/profile-input.js';
import { AUTH_TTL } from '../core/auth/ttl.js';

export const SESSION_COOKIE = 'hx_session';
const SESSION_MAX_AGE_SECONDS = AUTH_TTL.session;
// Only the API reads the session
const SESSION_PATH = '/api';

export interface Session {
    steamId: string;
    // Must match the account's session_epoch; tokens from before epochs count as 0
    epoch: number;
}

// http only on localhost, where browsers still keep Secure cookies out
export function isSecure(c: Context): boolean {
    return new URL(c.req.url).protocol === 'https:';
}

export async function startSession(c: Context, secret: string, session: Session, now = new Date()): Promise<void> {
    const iat = Math.floor(now.getTime() / 1000);
    const claims = { sub: session.steamId, epoch: session.epoch, iat, exp: iat + SESSION_MAX_AGE_SECONDS };
    const token = await sign(claims, secret, 'HS256');
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: isSecure(c),
        sameSite: 'Lax',
        path: SESSION_PATH,
        maxAge: SESSION_MAX_AGE_SECONDS,
    });
}

// Null for a missing, forged, expired or malformed token
export async function readSession(c: Context, secret: string): Promise<Session | null> {
    const token = getCookie(c, SESSION_COOKIE);
    if (token === undefined) return null;
    try {
        const payload = await verify(token, secret, 'HS256');
        if (typeof payload.sub !== 'string' || !isSteamId64(payload.sub)) return null;
        const epoch = payload.epoch ?? 0;
        return Number.isInteger(epoch) ? { steamId: payload.sub, epoch: epoch as number } : null;
    } catch {
        return null;
    }
}

export function endSession(c: Context): void {
    deleteCookie(c, SESSION_COOKIE, { path: SESSION_PATH, secure: isSecure(c), httpOnly: true, sameSite: 'Lax' });
}
