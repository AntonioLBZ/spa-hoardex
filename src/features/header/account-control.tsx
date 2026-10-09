import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { Button, ButtonLink } from '@/components/button';
import { loginHref, meQuery, postLogout } from '@/lib/api';

// Nothing until the session is known, so a signed-in visitor never sees "Sign in" flash
export function AccountControl() {
    const t = useTranslations('account');
    const queryClient = useQueryClient();
    const me = useQuery(meQuery());
    const here = useRouterState({ select: (state) => state.location.href });
    const logout = useMutation({
        mutationFn: postLogout,
        onSuccess: (signedOut) => queryClient.setQueryData(meQuery().queryKey, signedOut),
    });

    if (me.isPending) return null;
    const user = me.data?.user ?? null;

    if (user === null) {
        return (
            <ButtonLink className="button--secondary account-control" href={loginHref(here)}>
                {t('signIn')}
            </ButtonLink>
        );
    }

    return (
        <div className="account-control">
            <Link className="account-control__profile" params={{ profile: user.steamId }} to="/p/$profile">
                {t('myProfile')}
            </Link>
            <Button
                aria-disabled={logout.isPending}
                className="button--secondary"
                onClick={() => {
                    if (!logout.isPending) logout.mutate();
                }}
            >
                {t('signOut')}
            </Button>
        </div>
    );
}
