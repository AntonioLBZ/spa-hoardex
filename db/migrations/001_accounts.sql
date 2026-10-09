-- Accounts and manual backlog states (ARCHITECTURE.md §19.3). Migrations must stay compatible with the previous deployment
create table users (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    last_login_at timestamptz not null default now(),
    session_epoch integer not null default 0,
    snapshots_opt_in_at timestamptz
);

create table identities (
    source text not null,
    external_id text not null,
    user_id uuid not null references users (id) on delete cascade,
    primary key (source, external_id)
);

create index identities_user_id on identities (user_id);

create table backlog_overrides (
    user_id uuid not null references users (id) on delete cascade,
    game_source text not null,
    game_id text not null,
    state text not null check (state in ('completed', 'untouched', 'tried', 'inProgress', 'paused', 'finished', 'abandoned')),
    minutes_at_set integer not null check (minutes_at_set >= 0),
    set_at timestamptz not null,
    primary key (user_id, game_source, game_id)
);
