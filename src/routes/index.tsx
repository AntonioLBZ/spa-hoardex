import { Link, createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { EntryForm } from '../features/entry-form';

import './entry.scss';

export const Route = createFileRoute('/')({ component: EntryRoute });

function EntryRoute() {
    const t = useTranslations('app');
    const tEntry = useTranslations('entry');

    return (
        <div className="entry">
            <h1>{t('tagline')}</h1>
            <EntryForm />
            <p className="entry__demo">
                <Link to="/demo">{tEntry('demo')}</Link>
            </p>
        </div>
    );
}
