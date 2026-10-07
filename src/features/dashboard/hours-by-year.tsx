import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '@core/stats';
import { LockedChart } from '@/components/locked-panel';
import { Panel } from '@/components/panel';
import { PrivacySettingsLink } from '@/components/privacy-settings-link';
import { useReducedMotion } from '@/lib/use-reduced-motion';

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
    const reducedMotion = useReducedMotion();

    if (summary.minutesByYear.length === 0) {
        // Played games but no last-played date at all: Steam did not send them
        if (summary.playedCount === 0) return null;
        return (
            <LockedChart body={t('locked')} title={t('title')}>
                {settingsUrl === null ? null : <PrivacySettingsLink href={settingsUrl} />}
            </LockedChart>
        );
    }

    const data = summary.minutesByYear.map(({ year, minutes }) => ({
        year: String(year),
        hours: Math.round(minutes / 60),
    }));

    return (
        <Panel title={t('title')}>
            <div aria-hidden="true" className="hours-by-year__chart">
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
                        <Bar
                            dataKey="hours"
                            fill="var(--color-accent)"
                            isAnimationActive={!reducedMotion}
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
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
