import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { StateMessage } from '../../components/state-message';
import { demoLibraryQuery, libraryQuery } from '../../lib/api';
import { Dashboard } from '../dashboard';
import type { ProfileSource } from './profile-page';
import { Problem, problemFromError } from './problem';

export function LibrarySection({ source, steamId }: { source: ProfileSource; steamId: string }) {
    const t = useTranslations('profile');
    const library = useQuery(source.kind === 'demo' ? demoLibraryQuery() : libraryQuery(steamId));

    if (library.isPending) return <p role="status">{t('loadingLibrary')}</p>;
    if (library.isError)
        return <Problem kind={problemFromError(library.error)} onRetry={() => void library.refetch()} />;
    if (library.data.kind !== 'ok') return <Problem kind={library.data.kind} onRetry={() => void library.refetch()} />;
    if (library.data.data.games.length === 0) return <StateMessage title={t('emptyLibrary')} />;

    return <Dashboard library={library.data.data} />;
}
