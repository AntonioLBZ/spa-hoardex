import type { CSSProperties } from 'react';
import { useTranslations } from 'use-intl';

import type { LibrarySummary } from '../../../core/stats';
import { Panel } from '../../components/panel';
import { useHours } from './use-hours';

import './top-games.scss';

export function TopGames({ summary }: { summary: LibrarySummary }) {
    const t = useTranslations('dashboard.top');
    const hours = useHours();
    const longest = summary.topGames[0]?.minutes ?? 0;

    return (
        <Panel title={t('title')}>
            <ol className="top-games">
                {summary.topGames.map((game) => (
                    <li className="top-games__item" key={game.id.externalId}>
                        <span className="top-games__name">{game.name}</span>
                        <span className="top-games__hours">{hours(game.minutes)}</span>
                        <span
                            aria-hidden="true"
                            className="top-games__bar"
                            style={{ '--share': game.minutes / longest } as CSSProperties}
                        />
                    </li>
                ))}
            </ol>
        </Panel>
    );
}
