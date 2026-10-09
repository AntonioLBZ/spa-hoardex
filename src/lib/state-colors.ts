import type { BacklogState } from '@core/backlog';

export const STATE_COLOR: Record<BacklogState, string> = {
    completed: 'var(--color-state-completed)',
    untouched: 'var(--color-state-untouched)',
    tried: 'var(--color-state-tried)',
    inProgress: 'var(--color-state-in-progress)',
    paused: 'var(--color-state-paused)',
    finished: 'var(--color-state-finished)',
    abandoned: 'var(--color-state-abandoned)',
};
