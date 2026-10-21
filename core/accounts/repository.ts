import { BACKLOG_STATES, type BacklogState, type CustomCategory } from '../backlog/index.js';
import {
    accountRowSchema,
    categoryCreateRowSchema,
    categoryDeleteRowSchema,
    categoryRowSchema,
    categoryUpdateRowSchema,
    overrideRowSchema,
    stateColorRowSchema,
    stateRestoreRowSchema,
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

// A first sign-in inserts user and identity in one statement, so a committed user without identity lost a race
const DELETE_ORPHAN_USERS = 'delete from users u where not exists (select 1 from identities i where i.user_id = u.id)';

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

const LIST_CATEGORIES = `
select 'custom' as kind, c.category_id as id, c.name, c.color, c.created_at from backlog_categories c
join identities i on i.user_id = c.user_id
where i.source = $1 and i.external_id = $2
union all
select 'removed', r.state, null, null, null from removed_states r
join identities i on i.user_id = r.user_id
where i.source = $1 and i.external_id = $2
union all
select 'color', s.state, null, s.color, null from state_colors s
join identities i on i.user_id = s.user_id
where i.source = $1 and i.external_id = $2
order by created_at, id`;

// Inserts only below the limit (built-in states still there plus own ones) and with a name of its own
const CREATE_CATEGORY = `
with total as (
    select (select count(*) from backlog_categories where user_id = $1)
        + $7 - (select count(*) from removed_states where user_id = $1) as n
), taken as (
    select exists (select 1 from backlog_categories where user_id = $1 and lower(name) = lower($3)) as taken
), inserted as (
    insert into backlog_categories (user_id, category_id, name, color, created_at)
    select $1, $2, $3, $4, $5 from total, taken where total.n < $6 and not taken.taken
    on conflict do nothing
    returning 1
)
select (select count(*) from inserted)::int as inserted, (select n from total)::int as total,
    (select taken from taken) as taken`;

const UPDATE_CATEGORY = `
with taken as (
    select exists (
        select 1 from backlog_categories where user_id = $1 and category_id <> $2 and lower(name) = lower($3)
    ) as taken
), updated as (
    update backlog_categories set name = $3, color = $4
    where user_id = $1 and category_id = $2 and not (select taken from taken)
    returning 1
)
select exists (select 1 from backlog_categories where user_id = $1 and category_id = $2) as found,
    (select taken from taken) as taken`;

// Only while no owned game ($3) is in it, stale states go with it; `found` sees the rows from before the delete
const DELETE_CATEGORY = `
with used as (
    select exists (
        select 1 from backlog_overrides
        where user_id = $1 and state = $2 and ($3::text[] is null or game_id = any($3::text[]))
    ) as used
), deleted as (
    delete from backlog_categories where user_id = $1 and category_id = $2 and not (select used from used)
    returning 1
), forgotten as (
    delete from backlog_overrides
    where user_id = $1 and state = $2 and not (select used from used)
        and exists (select 1 from backlog_categories where user_id = $1 and category_id = $2)
)
select exists (select 1 from backlog_categories where user_id = $1 and category_id = $2) as found,
    (select used from used) as used`;

// Its colour goes with it: restored, it comes back as it was built
const REMOVE_STATE = `
with removed as (insert into removed_states (user_id, state) values ($1, $2) on conflict do nothing),
uncolored as (delete from state_colors where user_id = $1 and state = $2)
select 1`;

// Only below the limit; `found` sees the rows as they were before the delete
const RESTORE_STATE = `
with total as (
    select (select count(*) from backlog_categories where user_id = $1)
        + $4 - (select count(*) from removed_states where user_id = $1) as n
), restored as (
    delete from removed_states where user_id = $1 and state = $2 and (select n from total) < $3
    returning 1
)
select (select count(*) from restored)::int as restored,
    exists (select 1 from removed_states where user_id = $1 and state = $2) as found`;

// Only while the state is there
const SET_STATE_COLOR = `
with removed as (
    select exists (select 1 from removed_states where user_id = $1 and state = $2) as removed
), saved as (
    insert into state_colors (user_id, state, color) select $1, $2, $3 where not (select removed from removed)
    on conflict (user_id, state) do update set color = excluded.color
    returning 1
)
select not (select removed from removed) as found`;

const CLEAR_STATE_COLOR = `
with cleared as (delete from state_colors where user_id = $1 and state = $2)
select not exists (select 1 from removed_states where user_id = $1 and state = $2) as found`;

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
                await run(DELETE_ORPHAN_USERS, []);
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

        async listCategories({ source, externalId }) {
            const removed: BacklogState[] = [];
            const custom: CustomCategory[] = [];
            const colors: Partial<Record<BacklogState, string>> = {};
            for (const row of await run(LIST_CATEGORIES, [source, externalId])) {
                const parsed = categoryRowSchema.safeParse(row);
                if (!parsed.success) throw new DatabaseError('Unexpected category row');
                const category = parsed.data;
                if (category.kind === 'removed') removed.push(category.id);
                else if (category.kind === 'color') colors[category.id] = category.color;
                else custom.push({ id: category.id, name: category.name, color: category.color });
            }
            return { removed, custom, colors };
        },

        async createCategory(userId, { id, name, color }, maxCategories, createdAt) {
            const parsed = categoryCreateRowSchema.safeParse(
                (
                    await run(CREATE_CATEGORY, [
                        userId,
                        id,
                        name,
                        color,
                        createdAt,
                        maxCategories,
                        BACKLOG_STATES.length,
                    ])
                )[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected category result');
            const { inserted, total, taken } = parsed.data;
            if (inserted > 0) return 'created';
            if (total >= maxCategories) return 'limit';
            return taken ? 'name' : 'taken';
        },

        async updateCategory(userId, id, { name, color }) {
            const parsed = categoryUpdateRowSchema.safeParse(
                (await run(UPDATE_CATEGORY, [userId, id, name, color]))[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected category result');
            if (!parsed.data.found) return 'notFound';
            return parsed.data.taken ? 'name' : 'updated';
        },

        async deleteCategory(userId, id, ownedGameIds) {
            const parsed = categoryDeleteRowSchema.safeParse(
                (await run(DELETE_CATEGORY, [userId, id, ownedGameIds === null ? null : [...ownedGameIds]]))[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected category result');
            if (!parsed.data.found) return 'notFound';
            return parsed.data.used ? 'notEmpty' : 'deleted';
        },

        async removeState(userId, state) {
            await run(REMOVE_STATE, [userId, state]);
        },

        async restoreState(userId, state, maxCategories) {
            const parsed = stateRestoreRowSchema.safeParse(
                (await run(RESTORE_STATE, [userId, state, maxCategories, BACKLOG_STATES.length]))[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected category result');
            if (parsed.data.restored > 0) return 'restored';
            return parsed.data.found ? 'limit' : 'notFound';
        },

        async setStateColor(userId, state, color) {
            const parsed = stateColorRowSchema.safeParse(
                (
                    await (color === null
                        ? run(CLEAR_STATE_COLOR, [userId, state])
                        : run(SET_STATE_COLOR, [userId, state, color]))
                )[0]
            );
            if (!parsed.success) throw new DatabaseError('Unexpected category result');
            return parsed.data.found ? 'updated' : 'notFound';
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
