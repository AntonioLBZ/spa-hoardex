import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '../../../core/stats';
import { useHours } from './use-hours';

import './kpi-grid.scss';

export function KpiGrid({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.kpi');
    const format = useFormatter();
    const hours = useHours();

    const backlogShare = summary.gameCount === 0 ? 0 : summary.backlogCount / summary.gameCount;
    const items = [
        {
            key: 'games',
            label: t('games'),
            value: format.number(summary.gameCount),
            detail: t('gamesDetail', { count: format.number(summary.playedCount) }),
        },
        { key: 'hours', label: t('hours'), value: hours(summary.totalMinutes), detail: null },
        {
            key: 'backlog',
            label: t('backlog'),
            value: format.number(summary.backlogCount),
            detail: t('backlogDetail', {
                share: format.number(backlogShare, { style: 'percent', maximumFractionDigits: 0 }),
            }),
        },
        { key: 'recent', label: t('recent'), value: hours(summary.recentMinutes, 1), detail: null },
    ];

    return (
        <dl className="kpi-grid">
            {items.map((item) => (
                <div className="kpi-grid__item" key={item.key}>
                    <dt className="kpi-grid__label">{item.label}</dt>
                    <dd className="kpi-grid__value">{item.value}</dd>
                    {item.detail === null ? null : <dd className="kpi-grid__detail">{item.detail}</dd>}
                </div>
            ))}
        </dl>
    );
}
