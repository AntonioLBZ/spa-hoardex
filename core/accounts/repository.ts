import {
    accountRowSchema,
    overrideRowSchema,
    settingsRowSchema,
    snapshotAccountRowSchema,
    snapshotResultSchema,
} from './schemas.js';
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

const SET_OVERRIDES = `
insert into backlog_overrides (user_id, game_source, game_id, state, minutes_at_set, set_at)
select $1, $2, g.game_id, $3, g.minutes, $4
from unnest($5::text[], $6::int[]) as g (game_id, minutes)
on conflict (user_id, game_source, game_id)
do update set state = excluded.state, minutes_at_set = excluded.minutes_at_set, set_at = excluded.set_at
where backlog_overrides.state is distinct from excluded.state`;

const CLEAR_OVERRIDES =
    'delete from backlog_overrides where user_id = $1 and game_source = $2 and game_id = any($3::text[])';

const GET_SETTINGS = `
select u.snapshots_opt_in_at, count(d.taken_on)::int as snapshot_days, max(d.taken_on)::text as last_snapshot_on
from users u left join snapshot_days d on d.user_id = u.id
where u.id = $1
group by u.id`;

const SNAPSHOTS_ON = 'update users set snapshots_opt_in_at = coalesce(snapshots_opt_in_at, $2) where id = $1';

// Data-modifying CTEs all run, referenced or not
const SNAPSHOTS_OFF = `
with stopped as (update users set snapshots_opt_in_at = null where id = $1),
history as (delete from playtime_snapshots where user_id = $1),
days as (delete from snapshot_days where user_id = $1)
select 1`;

const RECORD_SNAPSHOT = `
with day as (
    insert into snapshot_days (user_id, taken_on) values ($1, $3)
    on conflict do nothing
    returning taken_on
), changed as (
    insert into playtime_snapshots (user_id, game_source, game_id, taken_on, total_minutes)
    select $1, $2, g.game_id, $3, g.minutes
    from unnest($4::text[], $5::int[]) as g (game_id, minutes)
    left join lateral (
        select s.total_minutes from playtime_snapshots s
        where s.user_id = $1 and s.game_source = $2 and s.game_id = g.game_id
        order by s.taken_on desc
        limit 1
    ) previous on true
    where exists (select 1 from day) and g.minutes > 0 and previous.total_minutes is distinct from g.minutes
    on conflict do nothing
    returning 1
)
select (select count(*) from day)::int as taken, (select count(*) from changed)::int as changed`;

const LIST_SNAPSHOT_ACCOUNTS = `
select u.id as user_id, i.source, i.external_id from users u
join identities i on i.user_id = u.id
where u.snapshots_opt_in_at is not null and u.last_login_at >= $1 and u.id > $2
order by u.id
limit $3`;

const END_SESSIONS = 'update users set session_epoch = session_epoch + 1 where id = $1 returning session_epoch';

const DELETE_ACCOUNT = 'delete from users where id = $1';

// Below every uuid, for the first page
const FIRST_USER_ID = '00000000-0000-0000-0000-000000000000';

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

        async setOverrides(userId, gameSource, games, state, setAt) {
            const ids = games.map((game) => game.gameId);
            const minutes = games.map((game) => game.minutes);
            await run(SET_OVERRIDES, [userId, gameSource, state, setAt, ids, minutes]);
        },

        async clearOverrides(userId, gameSource, gameIds) {
            await run(CLEAR_OVERRIDES, [userId, gameSource, gameIds]);
        },

        async getSettings(userId) {
            const parsed = settingsRowSchema.safeParse((await run(GET_SETTINGS, [userId]))[0]);
            if (!parsed.success) throw new DatabaseError('Unexpected settings row');
            const { snapshots_opt_in_at, snapshot_days, last_snapshot_on } = parsed.data;
            return {
                snapshotsSince: snapshots_opt_in_at === null ? null : new Date(snapshots_opt_in_at).toISOString(),
                snapshotDays: snapshot_days,
                lastSnapshotOn: last_snapshot_on,
            };
        },

        async setSnapshots(userId, on, now) {
            await (on ? run(SNAPSHOTS_ON, [userId, now.toISOString()]) : run(SNAPSHOTS_OFF, [userId]));
        },

        async recordSnapshot(userId, gameSource, games, takenOn) {
            const ids = games.map((game) => game.gameId);
            const minutes = games.map((game) => game.minutes);
            const parsed = snapshotResultSchema.safeParse(
                (await run(RECORD_SNAPSHOT, [userId, gameSource, takenOn, ids, minutes]))[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected snapshot result');
            return parsed.data.taken > 0;
        },

        async listSnapshotAccounts(activeSince, afterUserId, limit) {
            const rows = await run(LIST_SNAPSHOT_ACCOUNTS, [
                activeSince.toISOString(),
                afterUserId ?? FIRST_USER_ID,
                limit,
            ]);
            return rows.map((row) => {
                const parsed = snapshotAccountRowSchema.safeParse(row);
                if (!parsed.success) throw new DatabaseError('Unexpected snapshot account row');
                const { user_id, source, external_id } = parsed.data;
                return { userId: user_id, identity: { source, externalId: external_id } };
            });
        },

        async endSessions(userId) {
            const parsed = accountRowSchema
                .pick({ session_epoch: true })
                .safeParse((await run(END_SESSIONS, [userId]))[0]);
            if (!parsed.success) throw new DatabaseError('Unexpected session epoch');
            return parsed.data.session_epoch;
        },

        async deleteAccount(userId) {
            await run(DELETE_ACCOUNT, [userId]);
        },
    };
}
