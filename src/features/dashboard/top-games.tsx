import type { CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import type { LibrarySummary } from '@core/stats';
import { Panel } from '@/components/panel';
import { STEP } from '@/lib/motion';
import { useHours } from '@/lib/use-hours';

import './top-games.scss';

export function TopGames({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.top');
    const format = useFormatter();
    const hours = useHours();
    const longest = summary.topGames[0]?.minutes ?? 0;
    // The share only says something when the list leaves some played games out
    const note = [
        summary.playedCount > summary.topGames.length
            ? t('share', {
                  count: summary.topGames.length,
                  share: format.number(summary.topShare, { style: 'percent', maximumFractionDigits: 0 }),
              })
            : null,
        t('half', { count: summary.halfHoursGameCount }),
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');

    return (
        <Panel className="dashboard__panel dashboard__panel--top" index={STEP.top} title={t('title')}>
            <ol className="top-games">
                {summary.topGames.map((game, rank) => (
                    <li className="top-games__item" key={game.id.externalId}>
                        <span className="top-games__name">{game.name}</span>
                        <span className="top-games__hours">{hours(game.minutes)}</span>
                        <span
                            aria-hidden="true"
                            className="top-games__bar"
                            style={{ '--bar': rank, '--share': game.minutes / longest } as CSSProperties}
                        />
                    </li>
                ))}
            </ol>
            {summary.totalMinutes > 0 ? <p className="top-games__note">{note}</p> : null}
        </Panel>
    );
}
