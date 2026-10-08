import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { PageTitle } from '@/components/page-title';
import type { ProfileSource } from './profile-page';
import { profileQueryFor } from './source-queries';

// Shares the profile query with the page, so it asks for nothing more
export function ProfileTitle({ source }: { source: ProfileSource }) {
    const t = useTranslations('metadata');
    const profile = useQuery(profileQueryFor(source));

    if (source.kind === 'demo') return <PageTitle title={t('demo')} />;
    return <PageTitle title={profile.data?.kind === 'ok' ? profile.data.data.displayName : undefined} />;
}
