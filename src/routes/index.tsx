import { Link, createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { EntryForm } from '@/features/entry-form';
import { riseStyle } from '@/lib/motion';

import './entry.scss';

export const Route = createFileRoute('/')({ component: EntryRoute });

function EntryRoute() {
    const t = useTranslations('app');
    const tEntry = useTranslations('entry');

    return (
        <div className="entry">
            <h1 className="rise-in" style={riseStyle(0)}>
                {t('tagline')}
            </h1>
            <EntryForm />
            <p className="entry__demo rise-in" style={riseStyle(2)}>
                <Link to="/demo">{tEntry('demo')}</Link>
            </p>
        </div>
    );
}
