import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '@core/stats';
import { Panel } from '@/components/panel';
import { ChartSkeleton } from '@/components/skeleton';
import { Switch } from '@/components/switch';
import { STEP, useChartMotion } from '@/lib/motion';
import { useAfterPaint } from '@/lib/use-after-paint';
import { useHours } from '@/lib/use-hours';
import { TOOLTIP_PROPS } from './chart-style';

import './playtime-buckets.scss';

// Not the Backlog colour: a manual state can take a game out of the Backlog without playing it
const UNPLAYED_FILL = 'var(--color-content-muted)';

export function PlaytimeBuckets({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.playtime');
    const format = useFormatter();
    const hours = useHours();
    const chartMotion = useChartMotion(STEP.playtime);
    const ready = useAfterPaint();
    const [showUnplayed, setShowUnplayed] = useState(false);
    // Recharts restarts its animation when the data array is a new reference
    const data = useMemo(
        () =>
            summary.playtimeBuckets
                .filter(({ bucket }) => showUnplayed || bucket !== 'unplayed')
                .map(({ bucket, games, minutes }) => ({
                    bucket,
                    label: t(`buckets.${bucket}`),
                    games,
                    minutes,
                    fill: bucket === 'unplayed' ? UNPLAYED_FILL : 'var(--color-accent)',
                })),
        [summary.playtimeBuckets, showUnplayed, t]
    );

    if (summary.playedCount === 0) return null;

    return (
        <Panel className="dashboard__panel dashboard__panel--playtime" index={STEP.playtime} title={t('title')}>
            <Switch checked={showUnplayed} label={t('showUnplayed')} onChange={setShowUnplayed} />
            <div aria-hidden="true" className="playtime-buckets__chart">
                {ready ? (
                    <ResponsiveContainer height={180} width="100%">
                        <BarChart data={data} layout="vertical">
                            <XAxis
                                allowDecimals={false}
                                axisLine={false}
                                tickFormatter={(value: number) => format.number(value)}
                                tickLine={false}
                                type="number"
                            />
                            <YAxis
                                axisLine={false}
                                dataKey="label"
                                interval={0}
                                tickLine={false}
                                type="category"
                                width={72}
                            />
                            <Tooltip
                                {...TOOLTIP_PROPS}
                                formatter={(_, __, item) => [
                                    t('tooltip', {
                                        games: Number(item.payload.games),
                                        hours: hours(Number(item.payload.minutes)),
                                    }),
                                    '',
                                ]}
                                separator=""
                            />
                            <Bar dataKey="games" {...chartMotion} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <ChartSkeleton shape="bars" />
                )}
            </div>
            <table className="visually-hidden">
                <thead>
                    <tr>
                        <th scope="col">{t('range')}</th>
                        <th scope="col">{t('games')}</th>
                        <th scope="col">{t('hours')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.bucket}>
                            <th scope="row">{row.label}</th>
                            <td>{format.number(row.games)}</td>
                            <td>{hours(row.minutes)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Panel>
    );
}
