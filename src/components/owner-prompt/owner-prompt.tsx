import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { loginHref, meQuery } from '@/lib/api';

import './owner-prompt.scss';

const DISMISSED_KEY = 'hoardex:owner-prompt-dismissed';

function useSignedOut(): boolean {
    const me = useQuery(meQuery());
    return !me.isPending && (me.data?.user ?? null) === null;
}

function Content({ returnTo, titleId }: { returnTo: string; titleId: string }) {
    const t = useTranslations('home.owner');

    return (
        <>
            <p className="owner-prompt__title" id={titleId}>
                {t('title')}
            </p>
            <p className="owner-prompt__text">{t('text')}</p>
            <a className="owner-prompt__action" href={loginHref(returnTo)}>
                {t('action')}
                <span aria-hidden="true"> →</span>
            </a>
        </>
    );
}

// Only for a signed-out visitor, once the session is known
export function OwnerPrompt({ returnTo }: { returnTo: string }) {
    const titleId = useId();
    const signedOut = useSignedOut();

    if (!signedOut) return null;

    return (
        <aside aria-labelledby={titleId} className="owner-prompt">
            <Content returnTo={returnTo} titleId={titleId} />
        </aside>
    );
}

function readDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISSED_KEY) !== null;
    } catch {
        return false;
    }
}

function storeDismissed() {
    try {
        localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
        // Hidden for this page only
    }
}

// The same invitation floating over a profile, until the visitor closes it once
export function OwnerBubble() {
    const t = useTranslations('home.owner');
    const titleId = useId();
    const here = useRouterState({ select: (state) => state.location.href });
    const [dismissed, setDismissed] = useState(readDismissed);
    const signedOut = useSignedOut();

    if (dismissed || !signedOut) return null;

    return (
        <aside aria-labelledby={titleId} className="owner-prompt owner-prompt--bubble">
            <Content returnTo={here} titleId={titleId} />
            <button
                aria-label={t('dismiss')}
                className="owner-prompt__close"
                onClick={() => {
                    storeDismissed();
                    setDismissed(true);
                }}
                type="button"
            >
                <svg aria-hidden="true" className="owner-prompt__close-icon" viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </aside>
    );
}
