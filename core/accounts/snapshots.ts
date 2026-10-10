import type { EntityId, Library, ProfileAccess } from '../domain/index.js';
import type { AccountRepository, GameMinutes } from './types.js';

// Only accounts signed in within this window get daily snapshots, so a forgotten account stops costing Steam calls
export const SNAPSHOT_ACTIVE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

// UTC day, YYYY-MM-DD
export function snapshotDay(now: Date): string {
    return now.toISOString().slice(0, 10);
}

export function snapshotGames(library: Library): GameMinutes[] {
    return library.games
        .filter((game) => game.playtime.totalMinutes > 0)
        .map((game) => ({ gameId: game.id.externalId, minutes: game.playtime.totalMinutes }));
}

// False when today's snapshot already exists
export function takeSnapshot(repository: AccountRepository, userId: string, library: Library, now: Date) {
    return repository.recordSnapshot(userId, library.owner.source, snapshotGames(library), snapshotDay(now));
}

export interface SnapshotRunOptions {
    repository: AccountRepository;
    getLibrary(identity: EntityId): Promise<ProfileAccess<Library>>;
    now?: () => Date;
    // Epoch ms; no new account starts after it
    deadline: number;
    pageSize?: number;
    concurrency?: number;
}

export interface SnapshotRunResult {
    taken: number;
    // Already taken today
    skipped: number;
    // Private, rate limited or failing; tried again tomorrow
    failed: number;
    // The deadline came first
    unfinished: boolean;
}

// The daily cron: every opted-in, recently active account, a few at a time
export async function runSnapshots({
    repository,
    getLibrary,
    now = () => new Date(),
    deadline,
    pageSize = 50,
    concurrency = 4,
}: SnapshotRunOptions): Promise<SnapshotRunResult> {
    const result: SnapshotRunResult = { taken: 0, skipped: 0, failed: 0, unfinished: false };
    const activeSince = new Date(now().getTime() - SNAPSHOT_ACTIVE_DAYS * MS_PER_DAY);
    let after: string | null = null;

    for (;;) {
        const page = await repository.listSnapshotAccounts(activeSince, after, pageSize);
        if (page.length === 0) return result;
        after = page[page.length - 1]!.userId;

        let next = 0;
        const worker = async () => {
            while (next < page.length) {
                if (Date.now() >= deadline) {
                    result.unfinished = true;
                    return;
                }
                const { userId, identity } = page[next++]!;
                try {
                    const library = await getLibrary(identity);
                    if (library.kind !== 'ok') result.failed += 1;
                    else if (await takeSnapshot(repository, userId, library.data, now())) result.taken += 1;
                    else result.skipped += 1;
                } catch {
                    result.failed += 1;
                }
            }
        };
        await Promise.all(Array.from({ length: concurrency }, worker));
        if (result.unfinished || page.length < pageSize) return result;
    }
}
