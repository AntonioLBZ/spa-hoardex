import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';

import { StateMessage } from '@/components/state-message';
import { Dashboard } from '@/features/dashboard';
import { LibraryView, parseLibrarySearch, type LibrarySearch } from '@/features/library-view';
import { demoLibraryQuery, libraryQuery } from '@/lib/api';
import { Problem, problemFromError } from './problem';
import type { ProfileSource } from './profile-page';

export function LibrarySection({ source, steamId }: { source: ProfileSource; steamId: string }) {
    const t = useTranslations('profile');
    const library = useQuery(source.kind === 'demo' ? demoLibraryQuery() : libraryQuery(steamId));
    const rawSearch = useSearch({ strict: false });
    const search = useMemo(() => parseLibrarySearch(rawSearch), [rawSearch]);
    const navigate = useNavigate();
    // Filters are not navigation: replace the entry and keep the scroll position
    const onSearchChange = useCallback(
        (next: LibrarySearch) => void navigate({ to: '.', search: next, replace: true, resetScroll: false }),
        [navigate]
    );

    if (library.isPending) return <p role="status">{t('loadingLibrary')}</p>;
    if (library.isError)
        return <Problem kind={problemFromError(library.error)} onRetry={() => void library.refetch()} />;
    if (library.data.kind !== 'ok') return <Problem kind={library.data.kind} onRetry={() => void library.refetch()} />;
    if (library.data.data.games.length === 0) return <StateMessage title={t('emptyLibrary')} />;

    return (
        <>
            <Dashboard library={library.data.data} />
            <LibraryView
                library={library.data.data}
                onSearchChange={onSearchChange}
                search={search}
                withImages={source.kind === 'steam'}
            />
        </>
    );
}
