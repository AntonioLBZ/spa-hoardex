import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { MailLink } from './mail-link';

import './policy-page.scss';

const STORAGE_ITEMS = ['alias', 'profile', 'library', 'misses', 'cooldown'] as const;
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

    return (
        <article className="policy-page">
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
                    {STORAGE_ITEMS.map((item) => (
                        <li key={item}>{t(`storage.items.${item}`)}</li>
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
            <PolicySection heading={t('analytics.heading')}>
                <p>{t('analytics.body')}</p>
            </PolicySection>
            <PolicySection heading={t('device.heading')}>
                <p>{t('device.body')}</p>
            </PolicySection>
            <PolicySection heading={t('steam.heading')}>
                <p>{t('steam.body')}</p>
            </PolicySection>
            <PolicySection heading={t('rights.heading')}>
                <p>{t('rights.body')}</p>
                <p>
                    <MailLink />
                </p>
                <p>{t('rights.authority')}</p>
            </PolicySection>
        </article>
    );
}
