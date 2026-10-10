import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import {
    DEFAULT_CATEGORIES,
    PALETTE,
    categoryIds,
    isBuiltInState,
    type Categories,
    type CategoryId,
} from '@core/backlog';
import { STATE_COLOR } from './state-colors';

// A palette token follows the theme; a hex colour is the same in both
export function colorValue(color: string): string {
    return PALETTE.some((token) => token === color) ? `var(--color-category-${color})` : color;
}

export interface CategoryView {
    id: CategoryId;
    // Translated for built-in states, the owner's own name otherwise
    label: string;
    color: string;
    custom: boolean;
    // A palette token or #rrggbb; null for a built-in state in its own colour
    stored: string | null;
}

export interface CategoryCatalog {
    categories: Categories;
    // In display order
    list: readonly CategoryView[];
    // Any id, even one the account no longer has
    get(id: CategoryId): CategoryView;
}

function useBuildCatalog(categories: Categories): CategoryCatalog {
    const states = useTranslations('dashboard.states');
    return useMemo(() => {
        const custom = new Map(categories.custom.map((category) => [category.id, category]));
        const get = (id: CategoryId): CategoryView => {
            if (isBuiltInState(id)) {
                const stored = categories.colors?.[id] ?? null;
                const color = stored === null ? STATE_COLOR[id] : colorValue(stored);
                return { id, label: states(id), color, custom: false, stored };
            }
            const own = custom.get(id);
            return {
                id,
                label: own?.name ?? states('untouched'),
                color: own === undefined ? STATE_COLOR.untouched : colorValue(own.color),
                custom: true,
                stored: own?.color ?? null,
            };
        };
        return { categories, list: categoryIds(categories).map(get), get };
    }, [categories, states]);
}

const CatalogContext = createContext<CategoryCatalog | null>(null);

// Labels and colours of one account's categories for everything below
export function CategoryProvider({ categories, children }: { categories: Categories; children: ReactNode }) {
    return <CatalogContext value={useBuildCatalog(categories)}>{children}</CatalogContext>;
}

// The built-in states when no provider is above
export function useCategoryCatalog(): CategoryCatalog {
    const provided = useContext(CatalogContext);
    const fallback = useBuildCatalog(DEFAULT_CATEGORIES);
    return provided ?? fallback;
}
