import type { CSSProperties, ReactNode } from 'react';

import { Panel } from '@/components/panel';

import './locked-chart.scss';

// Heights in percent: a plausible bar chart, not data
const GHOST_BARS = [35, 55, 80, 45, 65, 90, 50];

interface LockedChartProps {
    // The title of the chart that cannot be drawn
    title: string;
    body: string;
    children?: ReactNode;
}

// A chart's place when Steam does not share the data behind it
export function LockedChart({ title, body, children }: LockedChartProps) {
    return (
        <Panel title={title}>
            <div aria-hidden="true" className="locked-chart__ghost">
                {GHOST_BARS.map((height) => (
                    <span className="locked-chart__bar" key={height} style={{ '--bar': height } as CSSProperties} />
                ))}
            </div>
            <p className="locked-chart__body">{body}</p>
            {children === undefined ? null : <div className="locked-chart__actions">{children}</div>}
        </Panel>
    );
}
