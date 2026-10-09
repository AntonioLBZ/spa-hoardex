import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { BacklogState, Overrides } from '@core/backlog';
import type { Game, ProfileAccess } from '@core/domain';
import {
    backlogQuery,
    deleteBacklogState,
    meQuery,
    myBacklogQuery,
    putBacklogState,
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
    game: Game;
    state: BacklogState | null;
}

function overridesOf(access: ProfileAccess<BacklogData> | undefined): Overrides {
    return access?.kind === 'ok' ? access.data.overrides : EMPTY;
}

function okAccess(overrides: Overrides): ProfileAccess<BacklogData> {
    return { kind: 'ok', data: { overrides } };
}

function applied(overrides: Overrides, { game, state }: Change, now = new Date()): Overrides {
    const { [game.id.externalId]: _previous, ...rest } = overrides;
    if (state === null) return rest;
    return {
        ...rest,
        [game.id.externalId]: { state, setAt: now.toISOString(), minutesAtSet: game.playtime.totalMinutes },
    };
}

// Manual states of the page's profile, and a way to change them for its owner (or anyone, in the demo)
export function useBacklog(source: ProfileSource, profileId: string): Backlog {
    const demo = useDemoBacklog();
    const steam = useSteamBacklog(source.kind === 'steam' ? source.input : null, profileId);
    const demoEditor = useMemo<BacklogEditor>(
        () => ({
            change: (game, state) =>
                demo.set(game.id.externalId, applied({}, { game, state })[game.id.externalId] ?? null),
            failed: false,
        }),
        [demo.set]
    );
    return source.kind === 'demo' ? { overrides: demo.overrides, editor: demoEditor } : steam;
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
        mutationFn: ({ game, state }: Change) =>
            state === null ? deleteBacklogState(game.id.externalId) : putBacklogState(game.id.externalId, state),
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
        () => (isOwner ? { change: (game, state) => mutate({ game, state }), failed } : null),
        [isOwner, mutate, failed]
    );

    return { overrides: overridesOf(isOwner ? mine.data : visitor.data), editor };
}
