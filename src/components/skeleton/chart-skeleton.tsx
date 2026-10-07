import type { CSSProperties } from 'react';

import './skeleton.scss';

// Heights in percent: a plausible bar chart, not data
const GHOST_BARS = [35, 55, 80, 45, 65, 90, 50];

// Fills its parent, which sets the height of the chart it stands in for
export function ChartSkeleton({ shape }: { shape: 'bars' | 'donut' }) {
    if (shape === 'donut') {
        return (
            <div aria-hidden="true" className="chart-skeleton chart-skeleton--donut">
                <span className="chart-skeleton__ring" />
            </div>
        );
    }
    return (
        <div aria-hidden="true" className="chart-skeleton chart-skeleton--bars">
            {GHOST_BARS.map((height) => (
                <span className="chart-skeleton__bar" key={height} style={{ '--bar': height } as CSSProperties} />
            ))}
        </div>
    );
}
