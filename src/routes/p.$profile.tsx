import { createFileRoute } from '@tanstack/react-router';

import { parseLibrarySearch } from '@/features/library-view';
import { ProfilePage } from '@/features/profile-page';

export const Route = createFileRoute('/p/$profile')({ validateSearch: parseLibrarySearch, component: ProfileRoute });

function ProfileRoute() {
    const { profile } = Route.useParams();
    return <ProfilePage source={{ kind: 'steam', input: profile }} />;
}
