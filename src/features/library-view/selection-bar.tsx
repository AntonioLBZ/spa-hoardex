import { useFormatter, useTranslations } from 'use-intl';

import type { CategoryId } from '@core/backlog';
import { Button, IconButton, buttonClass } from '@/components/button';
import { useCategoryCatalog } from '@/lib/categories';
import { CategoryMenu } from './category-menu';
import { ToolbarIcon } from './toolbar-icon';

import './selection-bar.scss';

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

// A dock floating over the end of the library: what is selected, how to change it, and where it goes
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
    const empty = count === 0;

    return (
        <section aria-label={t('label')} className="selection-bar">
            <IconButton className="selection-bar__done" label={t('done')} onClick={onDone}>
                <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
            </IconButton>
            <p className="selection-bar__count" role="status">
                {empty
                    ? t('empty')
                    : t.rich('count', {
                          count,
                          n: (chunks) => (
                              <span className="selection-bar__badge" key={count}>
                                  {chunks}
                              </span>
                          ),
                      })}
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
                <Button aria-disabled={empty} onClick={empty ? undefined : onClear} size="small" variant="ghost">
                    {t('none')}
                </Button>
            </div>
            <div className="selection-bar__move">
                <CategoryMenu
                    buttonClassName={buttonClass({ size: 'small', className: 'selection-bar__move-button' })}
                    buttonLabel={t('moveLabel')}
                    colorOf={(option) => (option === null ? null : catalog.get(option).color)}
                    disabled={empty}
                    labelOf={(option) => (option === null ? t('automatic') : catalog.get(option).label)}
                    menuLabel={t('moveMenu', { count })}
                    onChoose={onMove}
                    options={[null, ...catalog.list.map((category) => category.id)]}
                >
                    {t('moveLabel')}
                    <ToolbarIcon name="chevron" />
                </CategoryMenu>
            </div>
        </section>
    );
}
