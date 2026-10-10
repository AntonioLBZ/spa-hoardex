import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { SNAPSHOT_ACTIVE_DAYS } from '@core/accounts/snapshots';
import { Button, ButtonLink } from '@/components/button';
import { PageTitle } from '@/components/page-title';
import { StateMessage } from '@/components/state-message';
import { Switch } from '@/components/switch';
import {
    accountQuery,
    deleteAccount,
    loginHref,
    meQuery,
    postEndSessions,
    putSnapshots,
    type AccountSettings,
} from '@/lib/api';

import { CategoriesSection } from './categories-section';

import './account-page.scss';

export function AccountPage() {
    const t = useTranslations('accountPage');
    const me = useQuery(meQuery());
    const steamId = me.data?.user?.steamId ?? null;

    if (me.isPending) return <p role="status">{t('loading')}</p>;
    if (steamId === null) {
        return (
            <StateMessage body={t('signedOutBody')} title={t('signedOut')}>
                <ButtonLink href={loginHref('/account')}>{t('signIn')}</ButtonLink>
            </StateMessage>
        );
    }
    return <AccountContent steamId={steamId} />;
}

function AccountContent({ steamId }: { steamId: string }) {
    const t = useTranslations('accountPage');
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const settings = useQuery(accountQuery());

    // Both end the session here too: forget everything the visitor's queries knew about it
    async function leave() {
        queryClient.setQueryData(meQuery().queryKey, { user: null });
        queryClient.removeQueries({ queryKey: ['me', 'account'] });
        queryClient.removeQueries({ queryKey: ['me', 'backlog'] });
        await navigate({ to: '/' });
    }

    return (
        <article className="account-page">
            <PageTitle title={t('title')} />
            <header className="account-page__header">
                <h1 className="account-page__title">{t('title')}</h1>
            </header>
            <section className="account-page__section">
                <h2 className="account-page__heading">{t('snapshots.heading')}</h2>
                <p>{t('snapshots.body', { days: SNAPSHOT_ACTIVE_DAYS })}</p>
                {settings.isPending ? (
                    <p role="status">{t('loading')}</p>
                ) : settings.isError ? (
                    <p role="alert">{t('failed')}</p>
                ) : (
                    <SnapshotsToggle settings={settings.data} />
                )}
            </section>
            <CategoriesSection steamId={steamId} />
            <SessionsSection onDone={leave} />
            <DeleteSection onDone={leave} />
        </article>
    );
}

// Turning it off deletes the saved days, so it asks first when there are any
function SnapshotsToggle({ settings }: { settings: AccountSettings }) {
    const t = useTranslations('accountPage.snapshots');
    const format = useFormatter();
    const queryClient = useQueryClient();
    const [asking, setAsking] = useState(false);
    const on = settings.snapshotsSince !== null;
    const change = useMutation({
        mutationFn: putSnapshots,
        onSuccess: (next) => {
            setAsking(false);
            queryClient.setQueryData(accountQuery().queryKey, next);
        },
    });

    return (
        <>
            <Switch
                busy={change.isPending || asking}
                checked={on}
                description={
                    on
                        ? t('on', {
                              since: format.dateTime(new Date(settings.snapshotsSince ?? 0), { dateStyle: 'long' }),
                              days: settings.snapshotDays,
                          })
                        : t('off')
                }
                label={t('label')}
                onChange={(checked) => {
                    if (!checked && settings.snapshotDays > 0) setAsking(true);
                    else change.mutate(checked);
                }}
            />
            {asking ? (
                <div
                    className="account-page__confirm"
                    role="group"
                    aria-label={t('confirm', { days: settings.snapshotDays })}
                >
                    <p className="account-page__warning">{t('confirm', { days: settings.snapshotDays })}</p>
                    <Button
                        aria-disabled={change.isPending}
                        variant="danger"
                        onClick={() => {
                            if (!change.isPending) change.mutate(false);
                        }}
                    >
                        {t('confirmAction')}
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(false)}>
                        {t('cancel')}
                    </Button>
                </div>
            ) : null}
            {change.isError ? <p role="alert">{t('failed')}</p> : null}
        </>
    );
}

function SessionsSection({ onDone }: { onDone: () => Promise<void> }) {
    const t = useTranslations('accountPage.sessions');
    const end = useMutation({ mutationFn: postEndSessions, onSuccess: onDone });

    return (
        <section className="account-page__section">
            <h2 className="account-page__heading">{t('heading')}</h2>
            <p>{t('body')}</p>
            <p>
                <Button
                    aria-disabled={end.isPending}
                    variant="secondary"
                    onClick={() => {
                        if (!end.isPending) end.mutate();
                    }}
                >
                    {t('action')}
                </Button>
            </p>
            {end.isError ? <p role="alert">{t('failed')}</p> : null}
        </section>
    );
}

// Two steps, without a browser dialog: the first click only asks
function DeleteSection({ onDone }: { onDone: () => Promise<void> }) {
    const t = useTranslations('accountPage.delete');
    const [asking, setAsking] = useState(false);
    const remove = useMutation({ mutationFn: deleteAccount, onSuccess: onDone });

    return (
        <section className="account-page__section">
            <h2 className="account-page__heading">{t('heading')}</h2>
            <p>{t('body')}</p>
            {asking ? (
                <div className="account-page__confirm" role="group" aria-label={t('confirm')}>
                    <p className="account-page__warning">{t('confirm')}</p>
                    <Button
                        aria-disabled={remove.isPending}
                        variant="danger"
                        onClick={() => {
                            if (!remove.isPending) remove.mutate();
                        }}
                    >
                        {t('confirmAction')}
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(false)}>
                        {t('cancel')}
                    </Button>
                </div>
            ) : (
                <p>
                    <Button variant="secondary" onClick={() => setAsking(true)}>
                        {t('action')}
                    </Button>
                </p>
            )}
            {remove.isError ? <p role="alert">{t('failed')}</p> : null}
        </section>
    );
}
