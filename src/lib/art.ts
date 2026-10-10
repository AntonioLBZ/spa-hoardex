import { createContext } from 'react';

import { ART_BATCH_SIZE, entityKey, type EntityId, type GameArt } from '@core/domain';
import { fetchArt } from '@/lib/api';

// Whose library the covers belong to: the art endpoint only answers for games in it. Null: never ask
export const ArtOwnerContext = createContext<EntityId | null>(null);

// Covers that fail together go out in a few requests
const GATHER_MS = 50;

interface Waiting {
    owner: EntityId;
    resolvers: Map<string, (art: GameArt | null) => void>;
}

const answers = new Map<string, Promise<GameArt | null>>();
const queue = new Map<string, Waiting>();
let timer: ReturnType<typeof setTimeout> | undefined;

function send({ owner, resolvers }: Waiting) {
    const appids = [...resolvers.keys()].sort();
    const { source } = owner;
    for (let start = 0; start < appids.length; start += ART_BATCH_SIZE) {
        const batch = appids.slice(start, start + ART_BATCH_SIZE);
        const settle = (art: Record<string, GameArt> | null) => {
            for (const appid of batch) {
                // A failed request may be retried by a later mount
                if (art === null) answers.delete(entityKey({ source, externalId: appid }));
                resolvers.get(appid)?.(art?.[appid] ?? null);
            }
        };
        fetchArt(owner.externalId, batch).then(
            (result) => settle(result.kind === 'ok' ? result.data : null),
            () => settle(null)
        );
    }
}

function flush() {
    timer = undefined;
    const waiting = [...queue.values()];
    queue.clear();
    waiting.forEach(send);
}

// Store images of one game, null when there are none or they could not be fetched
export function requestArt(owner: EntityId, game: EntityId): Promise<GameArt | null> {
    const key = entityKey(game);
    const known = answers.get(key);
    if (known !== undefined) return known;

    const answer = new Promise<GameArt | null>((resolve) => {
        const ownerKey = entityKey(owner);
        const waiting = queue.get(ownerKey) ?? { owner, resolvers: new Map() };
        waiting.resolvers.set(game.externalId, resolve);
        queue.set(ownerKey, waiting);
    });
    answers.set(key, answer);
    timer ??= setTimeout(flush, GATHER_MS);
    return answer;
}

// Tests only: forget every answer
export function resetArt() {
    answers.clear();
    queue.clear();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
}
