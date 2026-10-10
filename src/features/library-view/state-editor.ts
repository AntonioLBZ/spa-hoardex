import type { CategoryId } from '@core/backlog';
import type { Game } from '@core/domain';

// How the owner (or a demo visitor) changes a game's state
export interface StateEditor {
    // null goes back to the computed state
    change(game: Game, state: CategoryId | null): void;
    // Several games in one request
    changeMany(games: readonly Game[], state: CategoryId | null): void;
    // The last change could not be saved
    failed: boolean;
}
