import { isCustomId, type CategoryId } from '@core/backlog';

// Only an owner puts games in these, so a 0 would wrongly read as "none"
export function isShownState(state: CategoryId, count: number): boolean {
    return (state !== 'abandoned' && !isCustomId(state)) || count > 0;
}
