import { createFileRoute } from '@tanstack/react-router';

import { PageTitle } from '@/components/page-title';
import { Home } from '@/features/home';

interface EntrySearch {
    // Set by the Steam callback when a sign-in fails
    login?: 'failed';
}

export const Route = createFileRoute('/')({
    component: EntryRoute,
    validateSearch: (search: Record<string, unknown>): EntrySearch =>
        search.login === 'failed' ? { login: 'failed' } : {},
});

function EntryRoute() {
    const { login } = Route.useSearch();

    return (
        <>
            <PageTitle />
            <Home loginFailed={login === 'failed'} />
        </>
    );
}
