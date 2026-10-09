import { useMemo } from 'react';
import { Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useFormatter, useTranslations } from 'use-intl';

import { BACKLOG_STATES } from '@core/backlog';
import type { LibrarySummary } from '@core/stats';
import { Panel } from '@/components/panel';
import { CountUp } from '@/components/count-up';
import { ChartSkeleton } from '@/components/skeleton';
import { STEP, stepDelay, useChartMotion } from '@/lib/motion';
import { useAfterPaint } from '@/lib/use-after-paint';
import { isShownState } from '@/lib/shown-states';
import { STATE_COLOR } from '@/lib/state-colors';

import './state-breakdown.scss';

export function StateBreakdown({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.states');
    const format = useFormatter();
    const chartMotion = useChartMotion(STEP.states);
    // The donut is the costly part: the rest of the page paints first
    const ready = useAfterPaint();

    // Recharts restarts its animation when the data array is a new reference
    const rows = useMemo(
        () =>
            BACKLOG_STATES.filter((state) => isShownState(state, summary.stateCounts[state])).map((state) => ({
                state,
                name: t(state),
                value: summary.stateCounts[state],
                share: summary.gameCount === 0 ? 0 : summary.stateCounts[state] / summary.gameCount,
                fill: STATE_COLOR[state],
            })),
        [summary, t]
    );
    const slices = useMemo(() => rows.filter((row) => row.value > 0), [rows]);

    return (
        <Panel index={STEP.states} title={t('title')}>
            <div className="state-breakdown">
                <div aria-hidden="true" className="state-breakdown__chart">
                    {ready ? (
                        <ResponsiveContainer height={200} width="100%">
                            <PieChart>
                                <Pie
                                    data={slices}
                                    dataKey="value"
                                    innerRadius="62%"
                                    {...chartMotion}
                                    nameKey="name"
                                    outerRadius="100%"
                                    stroke="none"
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <ChartSkeleton shape="donut" />
                    )}
                    <p className="state-breakdown__total">
                        <strong className="state-breakdown__total-value">
                            <CountUp
                                delay={stepDelay(STEP.states)}
                                format={(value) => format.number(Math.round(value))}
                                value={summary.gameCount}
                            />
                        </strong>
                        <span className="state-breakdown__total-label">{t('total')}</span>
                    </p>
                </div>
                <ul className="state-breakdown__legend">
                    {rows.map((row) => (
                        <li className="state-breakdown__item" key={row.state}>
                            <span
                                aria-hidden="true"
                                className="state-breakdown__swatch"
                                style={{ backgroundColor: row.fill }}
                            />
                            <span className="state-breakdown__name">{row.name}</span>
                            <span className="state-breakdown__count">{format.number(row.value)}</span>
                            <span className="state-breakdown__share">
                                {format.number(row.share, { style: 'percent', maximumFractionDigits: 0 })}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </Panel>
    );
}
