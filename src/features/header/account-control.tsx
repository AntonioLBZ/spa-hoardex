import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { loginHref, meQuery, postLogout, profileQuery } from '@/lib/api';

// Nothing until the session is known, so a signed-in visitor never sees "Sign in" flash
export function AccountControl() {
    const t = useTranslations('account');
    const me = useQuery(meQuery());
    const here = useRouterState({ select: (state) => state.location.href });

    if (me.isPending) return null;
    const user = me.data?.user ?? null;

    if (user === null) {
        return (
            <a className="account-control__sign-in" href={loginHref(here)}>
                <PersonIcon />
                {t('signIn')} <span className="visually-hidden">{t('withSteam')}</span>
            </a>
        );
    }
    return <AccountMenu steamId={user.steamId} />;
}

function AccountMenu({ steamId }: { steamId: string }) {
    const t = useTranslations('account');
    const queryClient = useQueryClient();
    const menuId = useId();
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const profile = useQuery(profileQuery(steamId));
    const owner = profile.data?.kind === 'ok' ? profile.data.data : null;
    const logout = useMutation({
        mutationFn: postLogout,
        onSuccess: (signedOut) => queryClient.setQueryData(meQuery().queryKey, signedOut),
    });

    // Closes on Escape (back to the trigger) or on a press outside
    useEffect(() => {
        if (!open) return;
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;
            setOpen(false);
            trigger.current?.focus();
        }
        function onPointerDown(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <div className="account-control" ref={root}>
            <button
                aria-controls={menuId}
                aria-expanded={open}
                aria-label={t('menu')}
                className="account-control__trigger"
                onClick={() => setOpen((value) => !value)}
                ref={trigger}
                type="button"
            >
                {owner === null ? (
                    <PersonIcon />
                ) : (
                    <img
                        alt=""
                        className="account-control__avatar"
                        height="32"
                        referrerPolicy="no-referrer"
                        src={owner.avatarUrl}
                        width="32"
                    />
                )}
            </button>
            <div className="account-control__menu" hidden={!open} id={menuId}>
                <p className="account-control__name">{owner?.displayName ?? t('signedIn')}</p>
                <ul className="account-control__items">
                    <li>
                        <Link
                            className="account-control__item"
                            onClick={close}
                            params={{ profile: steamId }}
                            to="/p/$profile"
                        >
                            {t('myProfile')}
                        </Link>
                    </li>
                    <li>
                        <Link className="account-control__item" onClick={close} to="/account">
                            {t('account')}
                        </Link>
                    </li>
                    <li>
                        <button
                            aria-disabled={logout.isPending}
                            className="account-control__item"
                            onClick={() => {
                                if (logout.isPending) return;
                                close();
                                logout.mutate();
                            }}
                            type="button"
                        >
                            {t('signOut')}
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    );
}

function PersonIcon() {
    return (
        <svg aria-hidden="true" className="account-control__icon" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
    );
}
