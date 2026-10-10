import type {
    BacklogData,
    BacklogOverride,
    BacklogState,
    Categories,
    CategoryId,
    CustomCategory,
    CustomId,
    Overrides,
} from '../backlog/index.js';
import type { EntityId } from '../domain/index.js';

export type { BacklogData, BacklogOverride, Categories, Overrides };

export interface CategoryFields {
    name: string;
    color: string;
}

export interface Account {
    userId: string;
    // Bumped to end every session at once
    sessionEpoch: number;
}

export interface AccountSettings {
    // ISO 8601; null when snapshots are off
    snapshotsSince: string | null;
    // Days a snapshot was taken, and the last one (YYYY-MM-DD)
    snapshotDays: number;
    lastSnapshotOn: string | null;
}

export interface GameMinutes {
    gameId: string;
    minutes: number;
}

// An account whose daily snapshot the cron takes
export interface SnapshotAccount {
    userId: string;
    identity: EntityId;
}

export interface AccountRepository {
    // Creates the user on first sign-in
    recordLogin(identity: EntityId, now: Date): Promise<Account>;
    findAccount(identity: EntityId): Promise<Account | null>;
    // Empty for an identity without an account
    listOverrides(identity: EntityId): Promise<Overrides>;
    // Games already in that state keep when and at how many minutes it was set
    setOverrides(
        userId: string,
        gameSource: string,
        games: readonly GameMinutes[],
        state: CategoryId,
        setAt: string
    ): Promise<void>;
    clearOverrides(userId: string, gameSource: string, gameIds: readonly string[]): Promise<void>;
    // Defaults for an identity without an account
    listCategories(identity: EntityId): Promise<Categories>;
    // `limit` past MAX_CATEGORIES, `name` when another of its own has it, `taken` if the id exists
    createCategory(
        userId: string,
        category: CustomCategory,
        maxCategories: number,
        createdAt: string
    ): Promise<'created' | 'limit' | 'name' | 'taken'>;
    updateCategory(userId: string, id: CustomId, fields: CategoryFields): Promise<'updated' | 'notFound' | 'name'>;
    // Only while no manual state uses it
    deleteCategory(userId: string, id: CustomId): Promise<'deleted' | 'notFound' | 'notEmpty'>;
    // Its colour goes with it
    removeState(userId: string, state: Exclude<BacklogState, 'untouched'>): Promise<void>;
    // Back below MAX_CATEGORIES; `notFound` unless it was removed
    restoreState(
        userId: string,
        state: BacklogState,
        maxCategories: number
    ): Promise<'restored' | 'limit' | 'notFound'>;
    // Null goes back to its own colour; `notFound` while removed
    setStateColor(userId: string, state: BacklogState, color: string | null): Promise<'updated' | 'notFound'>;
    getSettings(userId: string): Promise<AccountSettings>;
    // Turning them off deletes the history
    setSnapshots(userId: string, on: boolean, now: Date): Promise<void>;
    // Keeps only played games whose minutes changed; false when that day was already taken
    recordSnapshot(
        userId: string,
        gameSource: string,
        games: readonly GameMinutes[],
        takenOn: string
    ): Promise<boolean>;
    // Opted in and signed in since `activeSince`, by user id after `afterUserId`
    listSnapshotAccounts(activeSince: Date, afterUserId: string | null, limit: number): Promise<SnapshotAccount[]>;
    // Ends every session at once; returns the new epoch
    endSessions(userId: string): Promise<number>;
    // Everything of the account goes with it
    deleteAccount(userId: string): Promise<void>;
}

// The database failed or answered something unexpected; never an access state
export class DatabaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}
