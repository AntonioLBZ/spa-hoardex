import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';

import {
    FALLBACK_STATE,
    MAX_CATEGORIES,
    canCreateCategory,
    isBuiltInState,
    isCustomId,
    type BacklogState,
    type Categories,
    type CategoryCounts,
} from '@core/backlog';
import { classifyLibrary, countByCategory } from '@core/browse';
import { Button } from '@/components/button';
import { useBacklog, type CategoryEditor } from '@/features/profile-page/use-backlog';
import { libraryQuery, myBacklogQuery } from '@/lib/api';
import { CategoryProvider, useCategoryCatalog, type CategoryView } from '@/lib/categories';
import { STATE_COLOR } from '@/lib/state-colors';
import { useCategoryError } from './category-error';
import { CategoryForm, StateColorForm } from './category-form';

import './categories-section.scss';

// The owner's categories: create, edit, delete and restore; a category goes only while no game is in it
export function CategoriesSection({ steamId }: { steamId: string }) {
    const t = useTranslations('accountPage.categories');
    const headingId = useId();
    const mine = useQuery(myBacklogQuery());
    const library = useQuery(libraryQuery(steamId));
    const { overrides, categories, categoryEditor } = useBacklog({ kind: 'steam', input: steamId }, steamId);
    const games = library.data?.kind === 'ok' ? library.data.data.games : null;
    // Null while the library is not known: no category can be called empty then
    const counts = useMemo(
        () =>
            games === null
                ? null
                : countByCategory(classifyLibrary(games, new Date(), { overrides, categories }), categories),
        [games, overrides, categories]
    );

    return (
        <section aria-labelledby={headingId} className="account-page__section">
            <h2 className="account-page__heading" id={headingId}>
                {t('heading')}
            </h2>
            <p>{t('body', { max: MAX_CATEGORIES })}</p>
            {mine.isPending ? (
                <p role="status">{t('loading')}</p>
            ) : mine.isError || categoryEditor === null ? (
                <p role="alert">{t('failed')}</p>
            ) : (
                <CategoryProvider categories={categories}>
                    <CategoryList
                        categories={categories}
                        counts={counts}
                        editor={categoryEditor}
                        libraryPending={library.isPending}
                    />
                </CategoryProvider>
            )}
        </section>
    );
}

interface CategoryListProps {
    categories: Categories;
    counts: CategoryCounts | null;
    libraryPending: boolean;
    editor: CategoryEditor;
}

function CategoryList({ categories, counts, libraryPending, editor }: CategoryListProps) {
    const t = useTranslations('accountPage.categories');
    const catalog = useCategoryCatalog();
    const [adding, setAdding] = useState(false);
    const canCreate = canCreateCategory(categories);

    return (
        <>
            <ul className="categories-section__list">
                {catalog.list.map((view) => (
                    <CategoryRow
                        count={counts === null ? null : (counts[view.id] ?? 0)}
                        editor={editor}
                        key={view.id}
                        libraryPending={libraryPending}
                        view={view}
                    />
                ))}
            </ul>
            {!canCreate ? (
                <p className="categories-section__note">{t('limit', { max: MAX_CATEGORIES })}</p>
            ) : adding ? (
                <div className="categories-section__new">
                    <h3 className="categories-section__subheading">{t('new')}</h3>
                    {categories.removed.length === 0 ? null : (
                        <RestoreChoices editor={editor} onDone={() => setAdding(false)} removed={categories.removed} />
                    )}
                    <CategoryForm
                        onCancel={() => setAdding(false)}
                        onSubmit={async (fields) => {
                            await editor.create(fields);
                            setAdding(false);
                        }}
                        submitLabel={t('create')}
                    />
                </div>
            ) : (
                <p>
                    <Button onClick={() => setAdding(true)} variant="secondary">
                        {t('new')}
                    </Button>
                </p>
            )}
        </>
    );
}

interface RestoreChoicesProps {
    removed: readonly BacklogState[];
    editor: CategoryEditor;
    onDone: () => void;
}

// Built-in categories the owner deleted, one press away from coming back
function RestoreChoices({ removed, editor, onDone }: RestoreChoicesProps) {
    const t = useTranslations('accountPage.categories');
    const describe = useCategoryError();
    const catalog = useCategoryCatalog();
    const labelId = useId();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function restore(state: BacklogState) {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await editor.restore(state);
            onDone();
        } catch (failure) {
            setError(describe(failure));
        } finally {
            setPending(false);
        }
    }

    return (
        <div aria-labelledby={labelId} className="categories-section__restore" role="group">
            <p className="categories-section__restore-label" id={labelId}>
                {t('restore')}
            </p>
            <ul className="categories-section__chips">
                {removed.map((state) => {
                    const { label } = catalog.get(state);
                    return (
                        <li key={state}>
                            <button
                                aria-disabled={pending}
                                aria-label={t('restoreLabel', { name: label })}
                                className="categories-section__chip"
                                onClick={() => void restore(state)}
                                type="button"
                            >
                                <PlusIcon />
                                <span
                                    aria-hidden="true"
                                    className="categories-section__swatch"
                                    style={{ backgroundColor: STATE_COLOR[state] }}
                                />
                                {label}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {error === null ? null : (
                <p className="categories-section__error" role="alert">
                    {error}
                </p>
            )}
            <p className="categories-section__or">{t('orCreate')}</p>
        </div>
    );
}

function PlusIcon() {
    return (
        <svg aria-hidden="true" className="categories-section__plus" viewBox="0 0 16 16">
            <path d="M8 3v10M3 8h10" />
        </svg>
    );
}

interface CategoryRowProps {
    view: CategoryView;
    // Null while the library is not known
    count: number | null;
    libraryPending: boolean;
    editor: CategoryEditor;
}

function CategoryRow({ view, count, libraryPending, editor }: CategoryRowProps) {
    const t = useTranslations('accountPage.categories');
    const describe = useCategoryError();
    const reasonId = useId();
    const [mode, setMode] = useState<'idle' | 'editing' | 'asking'>('idle');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { id, label, color, custom, stored } = view;

    // Why it cannot go, if it cannot
    const reason =
        id === FALLBACK_STATE
            ? t('fixed')
            : count === null
              ? libraryPending
                  ? null
                  : t('noLibrary')
              : count > 0
                ? t('notEmpty', { count })
                : null;
    const blocked = reason !== null || count === null;

    async function remove() {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await editor.remove(id);
        } catch (failure) {
            setError(describe(failure));
            setMode('idle');
        } finally {
            setPending(false);
        }
    }

    return (
        <li className="categories-section__item">
            <div className="categories-section__row">
                <span aria-hidden="true" className="categories-section__swatch" style={{ backgroundColor: color }} />
                <span className="categories-section__name">{label}</span>
                {custom ? null : <span className="categories-section__tag">{t('builtIn')}</span>}
                <span className="categories-section__count">{count === null ? null : t('games', { count })}</span>
                <span className="categories-section__actions">
                    {mode !== 'idle' ? null : (
                        <Button
                            aria-label={t('editLabel', { name: label })}
                            onClick={() => setMode('editing')}
                            size="small"
                            variant="ghost"
                        >
                            {t('edit')}
                        </Button>
                    )}
                    {mode === 'idle' ? (
                        <Button
                            aria-describedby={reason === null ? undefined : reasonId}
                            aria-disabled={blocked}
                            aria-label={t('deleteLabel', { name: label })}
                            onClick={blocked ? undefined : () => setMode('asking')}
                            size="small"
                            variant="ghost"
                        >
                            {t('delete')}
                        </Button>
                    ) : null}
                </span>
            </div>
            {reason === null ? null : (
                <p className="categories-section__reason" id={reasonId}>
                    {reason}
                </p>
            )}
            {mode === 'asking' ? (
                <div
                    className="account-page__confirm"
                    role="group"
                    aria-label={t('confirm', { name: label, builtIn: String(!custom) })}
                >
                    <p className="account-page__warning">{t('confirm', { name: label, builtIn: String(!custom) })}</p>
                    <Button aria-disabled={pending} onClick={() => void remove()} variant="danger">
                        {t('confirmAction', { name: label })}
                    </Button>
                    <Button onClick={() => setMode('idle')} variant="secondary">
                        {t('cancel')}
                    </Button>
                </div>
            ) : null}
            {mode !== 'editing' ? null : isBuiltInState(id) ? (
                <StateColorForm
                    initial={stored}
                    onCancel={() => setMode('idle')}
                    onSubmit={async (next) => {
                        await editor.recolor(id, next);
                        setMode('idle');
                    }}
                    own={STATE_COLOR[id]}
                    submitLabel={t('save')}
                />
            ) : isCustomId(id) && stored !== null ? (
                <CategoryForm
                    initial={{ name: label, color: stored }}
                    onCancel={() => setMode('idle')}
                    onSubmit={async (fields) => {
                        await editor.edit(id, fields);
                        setMode('idle');
                    }}
                    submitLabel={t('save')}
                />
            ) : null}
            {error === null ? null : (
                <p className="categories-section__error" role="alert">
                    {error}
                </p>
            )}
        </li>
    );
}
