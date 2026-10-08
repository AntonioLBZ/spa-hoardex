import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';

import type { Library, ProfileAccess } from '@core/domain';
import { StateMessage } from '@/components/state-message';
import { parseLibrarySearch, type LibrarySearch } from '@/features/library-view/library-search';
import { Pending } from './pending';
import { Problem, problemFromError } from './problem';
import { settingsUrlFor } from './settings-url';
import { useProfileContent } from './use-profile-content';
import type { ProfileSource } from './profile-page';

interface LibrarySectionProps {
    source: ProfileSource;
    library: UseQueryResult<ProfileAccess<Library>>;
}

export function LibrarySection({ source, library }: LibrarySectionProps) {
    const t = useTranslations('profile');
    const rawSearch = useSearch({ strict: false });
    const search = useMemo(() => parseLibrarySearch(rawSearch), [rawSearch]);
    const navigate = useNavigate();
    const content = useProfileContent();
    // Filters are not navigation: replace the entry and keep the scroll position
    const onSearchChange = useCallback(
        (next: LibrarySearch) => void navigate({ to: '.', search: next, replace: true, resetScroll: false }),
        [navigate]
    );

    if (library.isPending) return <Pending label={t('loadingLibrary')} />;
    if (library.isError)
        return (
            <Problem kind={problemFromError(library.error)} onRetry={() => void library.refetch()} source={source} />
        );
    if (library.data.kind !== 'ok')
        return <Problem kind={library.data.kind} onRetry={() => void library.refetch()} source={source} />;
    if (library.data.data.games.length === 0) return <StateMessage title={t('emptyLibrary')} />;
    if (content === null) return <Pending label={t('loadingLibrary')} />;

    const { Dashboard, LibraryView } = content;

    return (
        <>
            <Dashboard library={library.data.data} settingsUrl={settingsUrlFor(source)} />
            <LibraryView
                library={library.data.data}
                onSearchChange={onSearchChange}
                search={search}
                withImages={source.kind === 'steam'}
            />
        </>
    );
}
