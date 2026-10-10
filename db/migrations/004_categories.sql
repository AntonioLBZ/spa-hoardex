-- Owner-made categories and removed built-in states (ARCHITECTURE.md §19.16). It only adds and relaxes, so the previous deployment keeps working
create table backlog_categories (
    user_id uuid not null references users (id) on delete cascade,
    category_id text not null check (category_id ~ '^c-[0-9a-f]{8}$'),
    name text not null check (char_length(name) between 1 and 24),
    color text not null check (color ~ '^(p[1-8]|#[0-9a-f]{6})$'),
    created_at timestamptz not null,
    primary key (user_id, category_id)
);

create unique index backlog_categories_name on backlog_categories (user_id, lower(name));

-- "untouched" (shown as Backlog) can never be removed
create table removed_states (
    user_id uuid not null references users (id) on delete cascade,
    state text not null check (state in ('tried', 'inProgress', 'paused', 'finished', 'abandoned')),
    primary key (user_id, state)
);

-- A manual state may also be one of the owner's categories
alter table backlog_overrides drop constraint backlog_overrides_state_check;
alter table backlog_overrides add constraint backlog_overrides_state_check check (
    state in ('completed', 'untouched', 'tried', 'inProgress', 'paused', 'finished', 'abandoned')
    or state ~ '^c-[0-9a-f]{8}$'
);
