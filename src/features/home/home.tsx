import { Link } from '@tanstack/react-router';
import { Suspense, lazy, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { buttonClass } from '@/components/button';
import { EntryForm } from '@/features/entry-form';
import { riseStyle } from '@/lib/motion';
import { STATE_COLOR } from '@/lib/state-colors';
import { HomePreview } from './home-preview';

// With the header's account control: the session query keeps TanStack Query out of this route's chunk
const OwnerPrompt = lazy(() => import('@/components/owner-prompt').then((module) => ({ default: module.OwnerPrompt })));

import './home.scss';

const FEATURES = [
    { key: 'dashboard', color: STATE_COLOR.inProgress, icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
    { key: 'backlog', color: STATE_COLOR.tried, icon: <path d="M4 6h16M4 12h10M4 18h6" /> },
    { key: 'board', color: STATE_COLOR.finished, icon: <path d="M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v6h-4z" /> },
    { key: 'history', color: STATE_COLOR.paused, icon: <path d="M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /> },
] as const;

export function Home({ loginFailed }: { loginFailed: boolean }) {
    const t = useTranslations('home');
    const tApp = useTranslations('app');
    const tEntry = useTranslations('entry');

    return (
        <div className="home">
            <section className="home__hero glow">
                <div className="home__intro">
                    <p className="eyebrow rise-in" style={riseStyle(0)}>
                        {t('eyebrow')}
                    </p>
                    <h1 className="home__title rise-in" style={riseStyle(1)}>
                        {tApp.rich('tagline', {
                            mark: (chunks: ReactNode) => (
                                <span className="home__highlight gradient-text">{chunks}</span>
                            ),
                        })}
                    </h1>
                    <p className="home__lead rise-in" style={riseStyle(2)}>
                        {t('lead')}
                    </p>
                    {loginFailed && (
                        <p className="home__login-failed" role="alert">
                            {tEntry('loginFailed')}
                        </p>
                    )}
                    <EntryForm />
                    <Suspense fallback={null}>
                        <OwnerPrompt returnTo="/" />
                    </Suspense>
                    <p className="home__demo rise-in" style={riseStyle(4)}>
                        <Link className={buttonClass({ variant: 'secondary' })} to="/demo">
                            {t('demo')}
                        </Link>
                        <span className="home__demo-note">{t('demoNote')}</span>
                    </p>
                </div>
                <HomePreview />
            </section>

            <section aria-labelledby="home-features" className="home__features">
                <h2 className="home__features-title" id="home-features">
                    {t('featuresTitle')}
                </h2>
                <ul className="home__feature-list">
                    {FEATURES.map(({ key, color, icon }, index) => (
                        <li className="home__feature" key={key} style={riseStyle(index)}>
                            <svg
                                aria-hidden="true"
                                className="home__feature-icon"
                                fill="none"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                style={{ color }}
                                viewBox="0 0 24 24"
                            >
                                {icon}
                            </svg>
                            <h3 className="home__feature-title">{t(`features.${key}.title`)}</h3>
                            <p className="home__feature-text">{t(`features.${key}.text`)}</p>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
