import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '@core/stats';
import { LockedChart } from '@/components/locked-panel';
import { Panel } from '@/components/panel';
import { PrivacySettingsLink } from '@/components/privacy-settings-link';
import { ChartSkeleton } from '@/components/skeleton';
import { STEP, useChartMotion } from '@/lib/motion';
import { useAfterPaint } from '@/lib/use-after-paint';

import './hours-by-year.scss';

const TOOLTIP_STYLE = {
    backgroundColor: 'var(--color-bg-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--size-border-radius)',
    color: 'var(--color-content)',
};

interface HoursByYearProps {
    summary: LibrarySummary;
    // Where the owner can review privacy; null when there is none to point to
    settingsUrl: string | null;
}

export function HoursByYear({ summary, settingsUrl }: HoursByYearProps) {
    const t = useTranslations('dashboard.years');
    const format = useFormatter();
    const chartMotion = useChartMotion(STEP.years);
    const ready = useAfterPaint();
    // Recharts restarts its animation when the data array is a new reference
    const data = useMemo(
        () =>
            summary.minutesByYear.map(({ year, minutes }) => ({ year: String(year), hours: Math.round(minutes / 60) })),
        [summary.minutesByYear]
    );

    if (summary.minutesByYear.length === 0) {
        // Played games but no last-played date at all: Steam did not send them
        if (summary.playedCount === 0) return null;
        return (
            <LockedChart body={t('locked')} index={STEP.years} title={t('title')}>
                {settingsUrl === null ? null : <PrivacySettingsLink href={settingsUrl} />}
            </LockedChart>
        );
    }

    return (
        <Panel index={STEP.years} title={t('title')}>
            <div aria-hidden="true" className="hours-by-year__chart">
                {ready ? (
                    <ResponsiveContainer height={220} width="100%">
                        <BarChart data={data}>
                            <XAxis axisLine={false} dataKey="year" tickLine={false} />
                            <YAxis
                                axisLine={false}
                                tickFormatter={(value: number) => format.number(value)}
                                tickLine={false}
                                width={48}
                            />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                cursor={{ fill: 'var(--color-border)', opacity: 0.4 }}
                                formatter={(value) => [format.number(Number(value)), t('hours')]}
                            />
                            <Bar dataKey="hours" fill="var(--color-accent)" {...chartMotion} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <ChartSkeleton shape="bars" />
                )}
            </div>
            <table className="visually-hidden">
                <thead>
                    <tr>
                        <th scope="col">{t('year')}</th>
                        <th scope="col">{t('hours')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.year}>
                            <th scope="row">{row.year}</th>
                            <td>{format.number(row.hours)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Panel>
    );
}
