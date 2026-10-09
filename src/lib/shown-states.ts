import type { BacklogState } from '@core/backlog';

// Only an owner sets these, so a 0 would wrongly read as "none"
const ONLY_WHEN_PRESENT: ReadonlySet<BacklogState> = new Set(['abandoned']);

export function isShownState(state: BacklogState, count: number): boolean {
    return !ONLY_WHEN_PRESENT.has(state) || count > 0;
}
