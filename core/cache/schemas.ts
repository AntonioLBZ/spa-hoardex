import { z } from 'zod';
import type { EntityId, Library, Profile, ProfileAccess } from '../domain/index.js';

// Validates Redis values on read; a mismatch is a cache miss
const entityId: z.ZodType<EntityId> = z.object({ source: z.literal('steam'), externalId: z.string() });

const profile: z.ZodType<Profile> = z.object({
    id: entityId,
    displayName: z.string(),
    avatarUrl: z.string(),
    profileUrl: z.string(),
    visibility: z.enum(['public', 'friends', 'private']),
    createdAt: z.string().nullable(),
});

const library: z.ZodType<Library> = z.object({
    owner: entityId,
    games: z.array(
        z.object({
            id: entityId,
            name: z.string(),
            iconUrl: z.string().nullable(),
            hasVisibleStats: z.boolean(),
            playtime: z.object({
                totalMinutes: z.number(),
                recentMinutes: z.number(),
                lastPlayedAt: z.string().nullable(),
                platforms: z
                    .object({
                        windowsMinutes: z.number(),
                        macMinutes: z.number(),
                        linuxMinutes: z.number(),
                        deckMinutes: z.number(),
                        disconnectedMinutes: z.number(),
                        approximate: z.literal(true),
                    })
                    .nullable(),
            }),
        })
    ),
    fetchedAt: z.string(),
});

const ok = <T>(data: z.ZodType<T>) => z.object({ kind: z.literal('ok'), data });
const bare = <K extends 'notFound' | 'profilePrivate' | 'libraryPrivate'>(kind: K) =>
    z.object({ kind: z.literal(kind) });

// Cacheable results (rateLimited is transient)
export type CachedProfile = Extract<ProfileAccess<Profile>, { kind: 'ok' | 'notFound' }>;
export type CachedLibrary = Extract<
    ProfileAccess<Library>,
    { kind: 'ok' | 'notFound' | 'profilePrivate' | 'libraryPrivate' }
>;

export const cachedProfileSchema: z.ZodType<CachedProfile> = z.discriminatedUnion('kind', [
    ok(profile),
    bare('notFound'),
]);

export const cachedLibrarySchema: z.ZodType<CachedLibrary> = z.discriminatedUnion('kind', [
    ok(library),
    bare('notFound'),
    bare('profilePrivate'),
    bare('libraryPrivate'),
]);

// Alias to account; a null id means it does not exist
export interface CachedAlias {
    id: EntityId | null;
}

export const cachedAliasSchema: z.ZodType<CachedAlias> = z.object({ id: entityId.nullable() });
