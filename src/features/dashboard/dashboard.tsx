import { memo, useMemo } from 'react';

import { DEFAULT_CATEGORIES, type Categories, type Overrides } from '@core/backlog';
import type { Game } from '@core/domain';
import { summarizeLibrary } from '@core/stats';
import { CategoryProvider } from '@/lib/categories';
import { GamesByYear } from './games-by-year';
import { KpiGrid } from './kpi-grid';
import { PlaytimeBuckets } from './playtime-buckets';
import { StateBreakdown } from './state-breakdown';
import { TopGames } from './top-games';

import './dashboard.scss';

interface DashboardProps {
    // The games, not the library: a refresh renews its fetch time, but Query keeps the list if nothing changed
    games: Game[];
    // The owner's manual states; a stable reference, or the charts replay
    overrides?: Overrides;
    // The owner's categories; a stable reference too
    categories?: Categories;
    // Steam privacy settings of the profile; null for the demo
    settingsUrl?: string | null;
}

// Memoized: filters live in the URL and re-render the page per keystroke, which would replay the charts
const NO_OVERRIDES: Overrides = Object.freeze({});

export const Dashboard = memo(function Dashboard({
    games,
    overrides = NO_OVERRIDES,
    categories = DEFAULT_CATEGORIES,
    settingsUrl = null,
}: DashboardProps) {
    const summary = useMemo(
        () => summarizeLibrary(games, new Date(), { overrides, categories }),
        [games, overrides, categories]
    );

    return (
        <CategoryProvider categories={categories}>
            <div className="dashboard">
                <KpiGrid summary={summary} />
                <div className="dashboard__panels">
                    <StateBreakdown summary={summary} />
                    <TopGames summary={summary} />
                    <GamesByYear settingsUrl={settingsUrl} summary={summary} />
                    <PlaytimeBuckets summary={summary} />
                </div>
            </div>
        </CategoryProvider>
    );
});
