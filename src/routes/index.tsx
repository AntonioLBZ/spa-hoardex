import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { EntryForm } from '../features/entry-form';

import './entry.scss';

export const Route = createFileRoute('/')({ component: EntryRoute });

function EntryRoute() {
    const t = useTranslations('app');

    return (
        <div className="entry">
            <h1>{t('tagline')}</h1>
            <EntryForm />
        </div>
    );
}
