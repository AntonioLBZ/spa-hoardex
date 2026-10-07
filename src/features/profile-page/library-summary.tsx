import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { libraryQuery } from '../../lib/api';
import { Problem, problemFromError } from './problem';

export function LibrarySummary({ steamId }: { steamId: string }) {
    const t = useTranslations('profile');
    const library = useQuery(libraryQuery(steamId));

    if (library.isPending) return <p role="status">{t('loadingLibrary')}</p>;
    if (library.isError)
        return <Problem kind={problemFromError(library.error)} onRetry={() => void library.refetch()} />;
    if (library.data.kind !== 'ok') return <Problem kind={library.data.kind} onRetry={() => void library.refetch()} />;

    return <p className="profile-page__games">{t('games', { count: library.data.data.games.length })}</p>;
}
