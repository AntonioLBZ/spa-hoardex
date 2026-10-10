-- Colours an owner gave the built-in states (ARCHITECTURE.md §19.17). It only adds, so the previous deployment keeps working
create table state_colors (
    user_id uuid not null references users (id) on delete cascade,
    state text not null check (state in ('untouched', 'tried', 'inProgress', 'paused', 'finished', 'abandoned')),
    color text not null check (color ~ '^(p[1-8]|#[0-9a-f]{6})$'),
    primary key (user_id, state)
);
