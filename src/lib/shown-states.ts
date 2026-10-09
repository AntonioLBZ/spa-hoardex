import type { BacklogState } from '@core/backlog';

// Until achievements arrive only an owner sets these, so a 0 would wrongly read as "none"
const ONLY_WHEN_PRESENT: ReadonlySet<BacklogState> = new Set(['completed', 'abandoned']);

export function isShownState(state: BacklogState, count: number): boolean {
    return !ONLY_WHEN_PRESENT.has(state) || count > 0;
}
