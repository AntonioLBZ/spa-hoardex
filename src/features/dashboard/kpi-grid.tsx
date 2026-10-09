import type { CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '@core/stats';
import { CountUp } from '@/components/count-up';
import { riseStyle, stepDelay } from '@/lib/motion';
import { hoursDigits, useHours } from '@/lib/use-hours';

import './kpi-grid.scss';

export function KpiGrid({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.kpi');
    const format = useFormatter();
    const hours = useHours();

    const backlogShare = summary.gameCount === 0 ? 0 : summary.backlogCount / summary.gameCount;
    const integer = (value: number) => format.number(Math.round(value));
    const items = [
        {
            key: 'games',
            tint: 'var(--color-accent)',
            label: t('games'),
            value: summary.gameCount,
            text: integer,
            detail: t('gamesDetail', { count: format.number(summary.playedCount) }),
        },
        {
            key: 'hours',
            tint: 'var(--color-state-paused)',
            label: t('hours'),
            value: summary.totalMinutes,
            // The decimals follow the final figure, so the number does not change width while it counts
            text: (minutes: number) => hours(minutes, hoursDigits(summary.totalMinutes)),
            detail: null,
        },
        {
            key: 'backlog',
            tint: 'var(--color-state-tried)',
            label: t('backlog'),
            value: summary.backlogCount,
            text: integer,
            detail: t('backlogDetail', {
                share: format.number(backlogShare, { style: 'percent', maximumFractionDigits: 0 }),
            }),
        },
        {
            key: 'recent',
            tint: 'var(--color-state-finished)',
            label: t('recent'),
            value: summary.recentMinutes,
            text: (minutes: number) => hours(minutes, 1),
            detail: null,
        },
    ];

    return (
        <dl className="kpi-grid">
            {items.map((item, index) => (
                <div
                    className="kpi-grid__item rise-in"
                    key={item.key}
                    style={{ ...riseStyle(index), '--tint': item.tint } as CSSProperties}
                >
                    <dt className="kpi-grid__label">{item.label}</dt>
                    <dd className="kpi-grid__value">
                        <CountUp delay={stepDelay(index)} format={item.text} value={item.value} />
                    </dd>
                    {item.detail === null ? null : <dd className="kpi-grid__detail">{item.detail}</dd>}
                </div>
            ))}
        </dl>
    );
}
