import { memo, useMemo } from 'react';

import type { Overrides } from '@core/backlog';
import type { Game } from '@core/domain';
import { summarizeLibrary } from '@core/stats';
import { HoursByYear } from './hours-by-year';
import { KpiGrid } from './kpi-grid';
import { StateBreakdown } from './state-breakdown';
import { TopGames } from './top-games';

import './dashboard.scss';

interface DashboardProps {
    // The games, not the library: a refresh renews the library's fetch time, but Query keeps the list if nothing changed
    games: Game[];
    // The owner's manual states; a stable reference, or the charts replay
    overrides?: Overrides;
    // Steam privacy settings of the profile; null for the demo
    settingsUrl?: string | null;
}

// Memoized: the filters below live in the URL and re-render the page on every keystroke, which would replay the chart animations
const NO_OVERRIDES: Overrides = Object.freeze({});

export const Dashboard = memo(function Dashboard({
    games,
    overrides = NO_OVERRIDES,
    settingsUrl = null,
}: DashboardProps) {
    const summary = useMemo(() => summarizeLibrary(games, new Date(), { overrides }), [games, overrides]);

    return (
        <div className="dashboard">
            <KpiGrid summary={summary} />
            <div className="dashboard__panels">
                <StateBreakdown summary={summary} />
                <TopGames summary={summary} />
            </div>
            <HoursByYear settingsUrl={settingsUrl} summary={summary} />
        </div>
    );
});
