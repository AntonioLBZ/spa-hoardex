import { createFileRoute } from '@tanstack/react-router';

import { ProfilePage } from '../features/profile-page';

export const Route = createFileRoute('/p/$profile')({ component: ProfileRoute });

function ProfileRoute() {
    const { profile } = Route.useParams();
    return <ProfilePage input={profile} />;
}
