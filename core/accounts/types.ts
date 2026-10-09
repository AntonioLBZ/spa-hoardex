import type { BacklogOverride, Overrides } from '../backlog/index.js';
import type { EntityId } from '../domain/index.js';

export type { BacklogOverride, Overrides };

export interface Account {
    userId: string;
    // Bumped to end every session at once
    sessionEpoch: number;
}

export interface AccountRepository {
    // Creates the user on first sign-in
    recordLogin(identity: EntityId, now: Date): Promise<Account>;
    findAccount(identity: EntityId): Promise<Account | null>;
    // Empty for an identity without an account
    listOverrides(identity: EntityId): Promise<Overrides>;
    setOverride(userId: string, game: EntityId, override: BacklogOverride): Promise<void>;
    clearOverride(userId: string, game: EntityId): Promise<void>;
}

// The database failed or answered something unexpected; never an access state
export class DatabaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}
