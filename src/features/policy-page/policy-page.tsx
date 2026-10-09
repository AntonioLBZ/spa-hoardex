import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { AUTH_TTL } from '@core/auth/ttl';
import { CACHE_TTL } from '@core/cache/ttl';
import { PageTitle } from '@/components/page-title';
import { toDuration } from './durations';
import { MailLink } from './mail-link';

import './policy-page.scss';

const VERCEL_PRIVACY_URL = 'https://vercel.com/legal/privacy-policy';

function PolicySection({ heading, children }: { heading: string; children: ReactNode }) {
    return (
        <section className="policy-page__section">
            <h2 className="policy-page__heading">{heading}</h2>
            {children}
        </section>
    );
}

export function PolicyPage() {
    const t = useTranslations('policy');
    const tPrivacy = useTranslations('privacy');

    // Every stated duration comes from the cache and sign-in TTLs
    function duration(seconds: number): string {
        const { unit, count } = toDuration(seconds);
        return t(`duration.${unit}`, { count });
    }
    const storageItems = [
        { key: 'alias', values: { duration: duration(CACHE_TTL.alias) } },
        { key: 'profile', values: { duration: duration(CACHE_TTL.profile) } },
        { key: 'library', values: { duration: duration(CACHE_TTL.library) } },
        { key: 'misses', values: { missing: duration(CACHE_TTL.notFound), locked: duration(CACHE_TTL.private) } },
        { key: 'cooldown', values: { refresh: duration(CACHE_TTL.refresh), retry: duration(CACHE_TTL.refreshRetry) } },
    ] as const;

    return (
        <article className="policy-page">
            <PageTitle title={t('title')} />
            <header className="policy-page__header">
                <h1 className="policy-page__title">{t('title')}</h1>
                <p className="policy-page__updated">{t('updated')}</p>
            </header>
            <p>{t('intro')}</p>
            <PolicySection heading={t('input.heading')}>
                <p>{t('input.body')}</p>
            </PolicySection>
            <PolicySection heading={t('storage.heading')}>
                <p>{t('storage.body')}</p>
                <ul className="policy-page__list">
                    {storageItems.map(({ key, values }) => (
                        <li key={key}>{t(`storage.items.${key}`, values)}</li>
                    ))}
                </ul>
                <p>{t('storage.after')}</p>
            </PolicySection>
            <PolicySection heading={t('hosting.heading')}>
                <p>{t('hosting.body')}</p>
                <p>
                    <a href={VERCEL_PRIVACY_URL} rel="noopener noreferrer" target="_blank">
                        {t('hosting.link')}
                        <span className="visually-hidden"> {tPrivacy('newTab')}</span>
                    </a>
                </p>
            </PolicySection>
            <PolicySection heading={t('signIn.heading')}>
                <p>{t('signIn.body', { login: duration(AUTH_TTL.login), session: duration(AUTH_TTL.session) })}</p>
            </PolicySection>
            <PolicySection heading={t('manual.heading')}>
                <p>{t('manual.body', { backlog: duration(CACHE_TTL.backlog) })}</p>
            </PolicySection>
            <PolicySection heading={t('analytics.heading')}>
                <p>{t('analytics.body')}</p>
            </PolicySection>
            <PolicySection heading={t('device.heading')}>
                <p>{t('device.body', { refresh: duration(CACHE_TTL.refresh) })}</p>
            </PolicySection>
            <PolicySection heading={t('steam.heading')}>
                <p>{t('steam.body')}</p>
            </PolicySection>
            <PolicySection heading={t('rights.heading')}>
                <p>
                    {t('rights.body', {
                        longest: duration(Math.max(...Object.values(CACHE_TTL))),
                        profile: duration(CACHE_TTL.profile),
                    })}
                </p>
                <p>
                    <MailLink />
                </p>
                <p>{t('rights.authority')}</p>
            </PolicySection>
        </article>
    );
}
