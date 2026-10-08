import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { PageTitle } from './components/page-title';
import { StateMessage } from './components/state-message';
import { routeTree } from './routeTree.gen';

function NotFound() {
    const t = useTranslations('notFound');
    return (
        <>
            <PageTitle title={t('title')} />
            <StateMessage body={t('body')} title={t('title')} />
        </>
    );
}

export function createAppRouter(history?: RouterHistory) {
    return createRouter({ routeTree, history, defaultNotFoundComponent: NotFound, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createAppRouter>;
    }
}
