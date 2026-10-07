import { useMemo } from 'react';

import type { Library } from '../../../core/domain';
import { summarizeLibrary } from '../../../core/stats';
import { HoursByYear } from './hours-by-year';
import { KpiGrid } from './kpi-grid';
import { StateBreakdown } from './state-breakdown';
import { TopGames } from './top-games';

import './dashboard.scss';

export function Dashboard({ library }: { library: Library }) {
    const summary = useMemo(() => summarizeLibrary(library.games, new Date()), [library]);

    return (
        <div className="dashboard">
            <KpiGrid summary={summary} />
            <div className="dashboard__panels">
                <StateBreakdown summary={summary} />
                <TopGames summary={summary} />
            </div>
            <HoursByYear summary={summary} />
        </div>
    );
}
