-- Opt-in playtime history (ARCHITECTURE.md §19.8): one row per game whose minutes changed since its previous row
create table playtime_snapshots (
    user_id uuid not null references users (id) on delete cascade,
    game_source text not null,
    game_id text not null,
    taken_on date not null,
    total_minutes integer not null check (total_minutes >= 0),
    primary key (user_id, game_source, game_id, taken_on)
);

-- One row per user and day a snapshot was taken, even when nothing changed
create table snapshot_days (
    user_id uuid not null references users (id) on delete cascade,
    taken_on date not null,
    primary key (user_id, taken_on)
);
