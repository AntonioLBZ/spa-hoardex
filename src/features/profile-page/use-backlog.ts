import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { MAX_BULK_CHANGE, type BacklogOverride, type BacklogState, type Overrides } from '@core/backlog';
import type { Game, ProfileAccess } from '@core/domain';
import {
    backlogQuery,
    deleteBacklogState,
    meQuery,
    myBacklogQuery,
    putBacklogState,
    putBacklogStates,
    type BacklogData,
} from '@/lib/api';
import type { StateEditor } from '@/features/library-view/state-editor';
import { useDemoBacklog } from './demo-backlog';
import type { ProfileSource } from './profile-page';

const EMPTY: Overrides = Object.freeze({});

export type BacklogEditor = StateEditor;

interface Backlog {
    overrides: Overrides;
    // Null for visitors: read only
    editor: BacklogEditor | null;
}

interface Change {
    games: readonly Game[];
    state: BacklogState | null;
}

function overridesOf(access: ProfileAccess<BacklogData> | undefined): Overrides {
    return access?.kind === 'ok' ? access.data.overrides : EMPTY;
}

function okAccess(overrides: Overrides): ProfileAccess<BacklogData> {
    return { kind: 'ok', data: { overrides } };
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
async function save({ games, state }: Change): Promise<Overrides> {
    const [game] = games;
    if (games.length === 1 && game !== undefined)
        return state === null ? deleteBacklogState(game.id.externalId) : putBacklogState(game.id.externalId, state);
    const appids = games.map((entry) => entry.id.externalId);
    let overrides: Overrides = EMPTY;
    for (let start = 0; start < appids.length; start += MAX_BULK_CHANGE)
        overrides = await putBacklogStates(appids.slice(start, start + MAX_BULK_CHANGE), state);
    return overrides;
}

// Manual states of the page's profile, and a way to change them for its owner (or anyone, in the demo)
export function useBacklog(source: ProfileSource, profileId: string): Backlog {
    const demo = useDemoBacklog();
    const steam = useSteamBacklog(source.kind === 'steam' ? source.input : null, profileId);
    const { overrides: demoOverrides, update } = demo;
    const demoEditor = useMemo<BacklogEditor>(() => {
        const changeMany = (games: readonly Game[], state: BacklogState | null) =>
            update((current) => changesOf(current, { games, state }));
        return { change: (game, state) => changeMany([game], state), changeMany, failed: false };
    }, [update]);
    return source.kind === 'demo' ? { overrides: demoOverrides, editor: demoEditor } : steam;
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
            queryClient.setQueryData(key, okAccess(applied(overridesOf(previous), change)));
            return { previous };
        },
        onError: (_error, _change, context) => queryClient.setQueryData(key, context?.previous),
        onSuccess: (overrides) => queryClient.setQueryData(key, okAccess(overrides)),
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

    return { overrides: overridesOf(isOwner ? mine.data : visitor.data), editor };
}
