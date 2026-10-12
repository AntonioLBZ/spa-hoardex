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
import { TOOLTIP_PROPS } from './chart-style';

import './games-by-year.scss';

const PANEL_CLASS = 'dashboard__panel dashboard__panel--years';

interface GamesByYearProps {
    summary: LibrarySummary;
    // Where the owner can review privacy; null when there is none to point to
    settingsUrl: string | null;
}

export function GamesByYear({ summary, settingsUrl }: GamesByYearProps) {
    const t = useTranslations('dashboard.years');
    const format = useFormatter();
    const chartMotion = useChartMotion(STEP.years);
    const ready = useAfterPaint();
    // Recharts restarts its animation when the data array is a new reference
    const data = useMemo(
        () => summary.gamesByYear.map(({ year, games }) => ({ year: String(year), games })),
        [summary.gamesByYear]
    );

    if (summary.gamesByYear.length === 0) {
        // Played games but no last-played date at all: Steam did not send them
        if (summary.playedCount === 0) return null;
        return (
            <LockedChart body={t('locked')} className={PANEL_CLASS} index={STEP.years} title={t('title')}>
                {settingsUrl === null ? null : <PrivacySettingsLink href={settingsUrl} />}
            </LockedChart>
        );
    }

    return (
        <Panel className={PANEL_CLASS} index={STEP.years} title={t('title')}>
            <div aria-hidden="true" className="games-by-year__chart">
                {ready ? (
                    <ResponsiveContainer height={220} width="100%">
                        <BarChart data={data}>
                            <XAxis axisLine={false} dataKey="year" tickLine={false} />
                            <YAxis
                                allowDecimals={false}
                                axisLine={false}
                                tickFormatter={(value: number) => format.number(value)}
                                tickLine={false}
                                width={48}
                            />
                            <Tooltip
                                {...TOOLTIP_PROPS}
                                formatter={(value) => [format.number(Number(value)), t('games')]}
                            />
                            <Bar dataKey="games" fill="var(--color-accent)" {...chartMotion} radius={[4, 4, 0, 0]} />
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
                        <th scope="col">{t('games')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.year}>
                            <th scope="row">{row.year}</th>
                            <td>{format.number(row.games)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Panel>
    );
}
