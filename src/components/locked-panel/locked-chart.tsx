import type { ReactNode } from 'react';

import { Panel } from '@/components/panel';
import { ChartSkeleton } from '@/components/skeleton';

import './locked-chart.scss';

interface LockedChartProps {
    // The title of the chart that cannot be drawn
    title: string;
    body: string;
    // Step in the page-load sequence, as in `Panel`
    index?: number;
    className?: string;
    children?: ReactNode;
}

// A chart's place when Steam does not share the data behind it
export function LockedChart({ title, body, index, className, children }: LockedChartProps) {
    return (
        <Panel className={className} index={index} title={title}>
            <div aria-hidden="true" className="locked-chart__ghost">
                <ChartSkeleton shape="bars" />
            </div>
            <p className="locked-chart__body">{body}</p>
            {children === undefined ? null : <div className="locked-chart__actions">{children}</div>}
        </Panel>
    );
}
