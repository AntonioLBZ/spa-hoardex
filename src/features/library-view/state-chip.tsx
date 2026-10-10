import { clsx } from 'clsx';
import { useTranslations } from 'use-intl';

import type { BrowseEntry } from '@core/browse';
import { useCategoryCatalog } from '@/lib/categories';
import { CategoryMenu } from './category-menu';
import type { StateEditor } from './state-editor';

import './state-chip.scss';

interface StateChipProps {
    entry: BrowseEntry;
    // Null: read only
    onChange: StateEditor['change'] | null;
    // Over a cover, or on a plain surface
    variant: 'overlay' | 'plain';
}

// The state of a game, in italics while computed; for an editor, the button of its state menu
export function StateChip({ entry, onChange, variant }: StateChipProps) {
    const t = useTranslations('library');
    const catalog = useCategoryCatalog();
    const { game, state, computed, manual } = entry;
    const shown = catalog.get(state);
    const note =
        manual === null ? t('automatic') : game.playtime.totalMinutes > manual.minutesAtSet ? t('playedSince') : null;

    const className = `state-chip state-chip--${variant}`;
    const face = (
        <>
            <span aria-hidden="true" className="state-chip__swatch" style={{ backgroundColor: shown.color }} />
            <span className={clsx('state-chip__label', manual === null && 'state-chip__label--automatic')}>
                {shown.label}
            </span>
            {note === null ? null : <span className="visually-hidden"> {note}</span>}
        </>
    );

    if (onChange === null) {
        return (
            <span className={className} title={note ?? undefined}>
                {face}
            </span>
        );
    }
    const current = manual?.state ?? null;
    return (
        <CategoryMenu
            buttonClassName={`${className} state-chip--button`}
            buttonLabel={`${t('stateOf', { name: game.name })}: ${shown.label}${note === null ? '' : ` · ${note}`}`}
            colorOf={(option) => catalog.get(option ?? computed).color}
            current={current}
            labelOf={(option) =>
                option === null
                    ? t('automaticOption', { state: catalog.get(computed).label })
                    : catalog.get(option).label
            }
            menuLabel={t('stateOf', { name: game.name })}
            onChoose={(option) => {
                if (option !== current) onChange(game, option);
            }}
            options={[null, ...catalog.list.map((category) => category.id)]}
            title={note ?? undefined}
        >
            {face}
            <ChevronIcon />
        </CategoryMenu>
    );
}

function ChevronIcon() {
    return (
        <svg aria-hidden="true" className="state-chip__chevron" viewBox="0 0 16 16">
            <path d="m4 6 4 4 4-4" />
        </svg>
    );
}
