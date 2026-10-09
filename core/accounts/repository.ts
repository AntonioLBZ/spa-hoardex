import type { EntityId } from '../domain/index.js';
import { accountRowSchema, overrideRowSchema } from './schemas.js';
import { DatabaseError, type Account, type AccountRepository, type BacklogOverride } from './types.js';

// One parameterized statement; returns its rows
export type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

const RECORD_LOGIN = `
with found as (
    update users set last_login_at = $3
    where id = (select user_id from identities where source = $1 and external_id = $2)
    returning id, session_epoch
), created as (
    insert into users (last_login_at) select $3 where not exists (select 1 from found)
    returning id, session_epoch
), linked as (
    insert into identities (source, external_id, user_id) select $1, $2, id from created
    on conflict do nothing
    returning user_id
)
select id as user_id, session_epoch from found
union all
select c.id as user_id, c.session_epoch from created c join linked l on l.user_id = c.id`;

const FIND_ACCOUNT = `
select u.id as user_id, u.session_epoch from users u
join identities i on i.user_id = u.id
where i.source = $1 and i.external_id = $2`;

const LIST_OVERRIDES = `
select o.game_id, o.state, o.minutes_at_set, o.set_at from backlog_overrides o
join identities i on i.user_id = o.user_id
where i.source = $1 and i.external_id = $2 and o.game_source = $1`;

const SET_OVERRIDE = `
insert into backlog_overrides (user_id, game_source, game_id, state, minutes_at_set, set_at)
values ($1, $2, $3, $4, $5, $6)
on conflict (user_id, game_source, game_id)
do update set state = excluded.state, minutes_at_set = excluded.minutes_at_set, set_at = excluded.set_at`;

const CLEAR_OVERRIDE = 'delete from backlog_overrides where user_id = $1 and game_source = $2 and game_id = $3';

function toAccount(row: unknown): Account {
    const parsed = accountRowSchema.safeParse(row);
    if (!parsed.success) throw new DatabaseError('Unexpected account row');
    return { userId: parsed.data.user_id, sessionEpoch: parsed.data.session_epoch };
}

// Errors carry no SQL or values
export function createSqlRepository(query: Query): AccountRepository {
    async function run(text: string, params: unknown[]): Promise<unknown[]> {
        try {
            return await query(text, params);
        } catch (error) {
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError(error instanceof Error ? `Query failed: ${error.name}` : 'Query failed');
        }
    }

    return {
        async recordLogin({ source, externalId }, now) {
            // A second try covers two first sign-ins racing for the same identity
            for (let attempt = 0; attempt < 2; attempt++) {
                const [row] = await run(RECORD_LOGIN, [source, externalId, now.toISOString()]);
                if (row !== undefined) return toAccount(row);
            }
            throw new DatabaseError('Sign-in could not be recorded');
        },

        async findAccount({ source, externalId }) {
            const [row] = await run(FIND_ACCOUNT, [source, externalId]);
            return row === undefined ? null : toAccount(row);
        },

        async listOverrides({ source, externalId }) {
            const overrides: Record<string, BacklogOverride> = {};
            for (const row of await run(LIST_OVERRIDES, [source, externalId])) {
                const parsed = overrideRowSchema.safeParse(row);
                if (!parsed.success) throw new DatabaseError('Unexpected override row');
                const { game_id, state, minutes_at_set, set_at } = parsed.data;
                overrides[game_id] = { state, minutesAtSet: minutes_at_set, setAt: new Date(set_at).toISOString() };
            }
            return overrides;
        },

        async setOverride(userId, game: EntityId, { state, minutesAtSet, setAt }) {
            await run(SET_OVERRIDE, [userId, game.source, game.externalId, state, minutesAtSet, setAt]);
        },

        async clearOverride(userId, game: EntityId) {
            await run(CLEAR_OVERRIDE, [userId, game.source, game.externalId]);
        },
    };
}
