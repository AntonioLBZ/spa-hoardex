import { createFileRoute } from '@tanstack/react-router';

import { parseLibrarySearch } from '@/features/library-view/library-search';
import { ProfilePage } from '@/features/profile-page';

export const Route = createFileRoute('/demo')({ validateSearch: parseLibrarySearch, component: DemoRoute });

function DemoRoute() {
    return <ProfilePage source={{ kind: 'demo' }} />;
}
