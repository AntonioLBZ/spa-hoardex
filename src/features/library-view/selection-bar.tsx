import { useId, useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import type { CategoryId } from '@core/backlog';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { useCategoryCatalog, type CategoryCatalog } from '@/lib/categories';
import { ToolbarIcon } from './toolbar-icon';

import './selection-bar.scss';

const AUTOMATIC = 'automatic';

interface SelectionBarProps {
    // Selected games still in the library
    count: number;
    // Games the current search and filters show, and whether all of them are selected
    matching: number;
    allSelected: boolean;
    onSelectAll: () => void;
    onClear: () => void;
    // Null: back to the computed state
    onMove: (state: CategoryId | null) => void;
    onDone: () => void;
}

function targetOf(catalog: CategoryCatalog, value: string): CategoryId | null | undefined {
    if (value === AUTOMATIC) return null;
    return catalog.list.find((category) => category.id === value)?.id;
}

// Sticky at the end of the library: it floats while scrolling through the cards
export function SelectionBar({
    count,
    matching,
    allSelected,
    onSelectAll,
    onClear,
    onMove,
    onDone,
}: SelectionBarProps) {
    const t = useTranslations('library.select');
    const catalog = useCategoryCatalog();
    const format = useFormatter();
    const targetId = useId();
    const [value, setValue] = useState('');
    const target = targetOf(catalog, value);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (count > 0 && target !== undefined) onMove(target);
    }

    return (
        <Card as="section" aria-label={t('label')} className="selection-bar">
            <p className="selection-bar__count" role="status">
                {t('count', { count })}
            </p>
            <div className="selection-bar__pick">
                <Button
                    aria-disabled={allSelected}
                    onClick={allSelected ? undefined : onSelectAll}
                    size="small"
                    variant="ghost"
                >
                    {t('all', { count: format.number(matching) })}
                </Button>
                <Button
                    aria-disabled={count === 0}
                    onClick={count === 0 ? undefined : onClear}
                    size="small"
                    variant="ghost"
                >
                    {t('none')}
                </Button>
            </div>
            <form className="selection-bar__move" onSubmit={submit}>
                <label className="selection-bar__label" htmlFor={targetId}>
                    {t('moveLabel')}
                </label>
                <span className="selection-bar__select-wrap">
                    <select
                        className="selection-bar__select"
                        id={targetId}
                        onChange={(event) => setValue(event.target.value)}
                        value={value}
                    >
                        <option disabled value="">
                            {t('choose')}
                        </option>
                        <option value={AUTOMATIC}>{t('automatic')}</option>
                        {catalog.list.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.label}
                            </option>
                        ))}
                    </select>
                    <ToolbarIcon className="selection-bar__chevron" name="chevron" />
                </span>
                <Button aria-disabled={count === 0 || target === undefined} size="small" type="submit">
                    {t('move')}
                </Button>
            </form>
            <Button className="selection-bar__done" onClick={onDone} size="small" variant="secondary">
                {t('done')}
            </Button>
        </Card>
    );
}
