import { createFileRoute } from '@tanstack/react-router';

import { ProfilePage } from '../features/profile-page';

export const Route = createFileRoute('/demo')({ component: DemoRoute });

function DemoRoute() {
    return <ProfilePage source={{ kind: 'demo' }} />;
}
