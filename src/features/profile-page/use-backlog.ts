import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
    DEFAULT_CATEGORIES,
    MAX_BULK_CHANGE,
    type BacklogOverride,
    type BacklogState,
    type Categories,
    type CategoryId,
    type CustomId,
    type Overrides,
} from '@core/backlog';
import type { Game, ProfileAccess } from '@core/domain';
import {
    backlogQuery,
    deleteBacklogState,
    deleteCategory,
    meQuery,
    myBacklogQuery,
    patchCategory,
    patchStateColor,
    postCategory,
    putBacklogState,
    putBacklogStates,
    restoreState,
    type BacklogData,
    type CategoryFields,
} from '@/lib/api';
import type { StateEditor } from '@/features/library-view/state-editor';
import { useDemoBacklog } from './demo-backlog';
import type { ProfileSource } from './profile-page';

const EMPTY: Overrides = Object.freeze({});

export type BacklogEditor = StateEditor;

// The owner's own categories; each call rejects with an ApiError the caller shows
export interface CategoryEditor {
    create(fields: CategoryFields): Promise<void>;
    edit(id: CustomId, fields: CategoryFields): Promise<void>;
    // Null: back to the built-in colour
    recolor(state: BacklogState, color: string | null): Promise<void>;
    remove(id: CategoryId): Promise<void>;
    restore(state: BacklogState): Promise<void>;
}

interface Backlog {
    overrides: Overrides;
    categories: Categories;
    // Null for visitors: read only
    editor: BacklogEditor | null;
    // Null for visitors and the demo
    categoryEditor: CategoryEditor | null;
}

interface Change {
    games: readonly Game[];
    state: CategoryId | null;
}

type CategoryChange =
    | { kind: 'create'; fields: CategoryFields }
    | { kind: 'edit'; id: CustomId; fields: CategoryFields }
    | { kind: 'recolor'; state: BacklogState; color: string | null }
    | { kind: 'remove'; id: CategoryId }
    | { kind: 'restore'; state: BacklogState };

function overridesOf(access: ProfileAccess<BacklogData> | undefined): Overrides {
    return access?.kind === 'ok' ? access.data.overrides : EMPTY;
}

// A copy cached before categories existed has none
function categoriesOf(access: ProfileAccess<BacklogData> | undefined): Categories {
    return access?.kind === 'ok' ? (access.data.categories ?? DEFAULT_CATEGORIES) : DEFAULT_CATEGORIES;
}

function okAccess(data: BacklogData): ProfileAccess<BacklogData> {
    return { kind: 'ok', data };
}

// What each game's override becomes; a game already in that state keeps its own
function changesOf(overrides: Overrides, { games, state }: Change, now = new Date()) {
    const setAt = now.toISOString();
    return Object.fromEntries(
        games.map(({ id, playtime }) => {
            const current = overrides[id.externalId];
            const next =
                state === null
                    ? null
                    : current?.state === state
                      ? current
                      : { state, setAt, minutesAtSet: playtime.totalMinutes };
            return [id.externalId, next];
        })
    );
}

function applied(overrides: Overrides, change: Change): Overrides {
    const next: Record<string, BacklogOverride> = { ...overrides };
    for (const [appid, override] of Object.entries(changesOf(overrides, change))) {
        if (override === null) delete next[appid];
        else next[appid] = override;
    }
    return next;
}

// One request per MAX_BULK_CHANGE games; the last answer holds every state
async function save({ games, state }: Change): Promise<BacklogData> {
    const [game] = games;
    if (games.length === 1 && game !== undefined)
        return state === null ? deleteBacklogState(game.id.externalId) : putBacklogState(game.id.externalId, state);
    const appids = games.map((entry) => entry.id.externalId);
    let data: BacklogData = { overrides: EMPTY, categories: DEFAULT_CATEGORIES };
    for (let start = 0; start < appids.length; start += MAX_BULK_CHANGE)
        data = await putBacklogStates(appids.slice(start, start + MAX_BULK_CHANGE), state);
    return data;
}

function saveCategory(change: CategoryChange): Promise<BacklogData> {
    switch (change.kind) {
        case 'create':
            return postCategory(change.fields);
        case 'edit':
            return patchCategory(change.id, change.fields);
        case 'recolor':
            return patchStateColor(change.state, change.color);
        case 'remove':
            return deleteCategory(change.id);
        case 'restore':
            return restoreState(change.state);
    }
}

// Manual states of the page's profile, and a way to change them for its owner (or anyone, in the demo)
export function useBacklog(source: ProfileSource, profileId: string): Backlog {
    const demo = useDemoBacklog();
    const steam = useSteamBacklog(source.kind === 'steam' ? source.input : null, profileId);
    const { overrides: demoOverrides, update } = demo;
    const demoEditor = useMemo<BacklogEditor>(() => {
        const changeMany = (games: readonly Game[], state: CategoryId | null) =>
            update((current) => changesOf(current, { games, state }));
        return { change: (game, state) => changeMany([game], state), changeMany, failed: false };
    }, [update]);
    return source.kind === 'demo'
        ? { overrides: demoOverrides, categories: DEFAULT_CATEGORIES, editor: demoEditor, categoryEditor: null }
        : steam;
}

function useSteamBacklog(input: string | null, profileId: string): Backlog {
    const queryClient = useQueryClient();
    const me = useQuery({ ...meQuery(), enabled: input !== null });
    const isOwner = input !== null && me.data?.user?.steamId === profileId;
    const visitor = useQuery({ ...backlogQuery(input ?? ''), enabled: input !== null && !isOwner });
    const mine = useQuery({ ...myBacklogQuery(), enabled: isOwner });
    const key = myBacklogQuery().queryKey;

    // One change at a time: the server's copy of every state is rewritten after each one
    const mutation = useMutation({
        scope: { id: 'backlog' },
        mutationFn: save,
        onMutate: async (change: Change) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<ProfileAccess<BacklogData>>(key);
            const overrides = applied(overridesOf(previous), change);
            queryClient.setQueryData(key, okAccess({ overrides, categories: categoriesOf(previous) }));
            return { previous };
        },
        onError: (_error, _change, context) => queryClient.setQueryData(key, context?.previous),
        onSuccess: (data) => queryClient.setQueryData(key, okAccess(data)),
    });

    // Not optimistic: only the server knows whether a category fits or is empty
    const categoryMutation = useMutation({
        scope: { id: 'backlog' },
        mutationFn: saveCategory,
        onSuccess: (data) => queryClient.setQueryData(key, okAccess(data)),
    });

    const { mutate } = mutation;
    const failed = mutation.isError;
    const editor = useMemo<BacklogEditor | null>(
        () =>
            isOwner
                ? {
                      change: (game, state) => mutate({ games: [game], state }),
                      changeMany: (games, state) => mutate({ games, state }),
                      failed,
                  }
                : null,
        [isOwner, mutate, failed]
    );

    const { mutateAsync } = categoryMutation;
    const categoryEditor = useMemo<CategoryEditor | null>(
        () =>
            isOwner
                ? {
                      create: async (fields) => void (await mutateAsync({ kind: 'create', fields })),
                      edit: async (id, fields) => void (await mutateAsync({ kind: 'edit', id, fields })),
                      recolor: async (state, color) => void (await mutateAsync({ kind: 'recolor', state, color })),
                      remove: async (id) => void (await mutateAsync({ kind: 'remove', id })),
                      restore: async (state) => void (await mutateAsync({ kind: 'restore', state })),
                  }
                : null,
        [isOwner, mutateAsync]
    );

    const data = isOwner ? mine.data : visitor.data;
    return { overrides: overridesOf(data), categories: categoriesOf(data), editor, categoryEditor };
}
