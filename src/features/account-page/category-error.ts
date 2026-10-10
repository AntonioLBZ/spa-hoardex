import { useTranslations } from 'use-intl';

import { MAX_CATEGORIES } from '@core/backlog';
import { ApiError } from '@/lib/api';

const KNOWN = [
    'categoryLimit',
    'categoryName',
    'categoryNotEmpty',
    'fixedCategory',
    'unknownCategory',
    'library',
    'invalidInput',
] as const;

// What to tell the owner when a category change fails
export function useCategoryError(): (failure: unknown) => string {
    const t = useTranslations('accountPage.categories.errors');
    return (failure) => {
        const code = failure instanceof ApiError ? KNOWN.find((known) => known === failure.code) : undefined;
        return t(code ?? 'other', { max: MAX_CATEGORIES });
    };
}
