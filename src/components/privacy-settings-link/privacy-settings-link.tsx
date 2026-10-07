import { useTranslations } from 'use-intl';

import { ButtonLink } from '@/components/button';

// Opens the owner's Steam privacy settings in a new tab
export function PrivacySettingsLink({ href }: { href: string }) {
    const t = useTranslations('privacy');

    return (
        <ButtonLink href={href} rel="noopener noreferrer" target="_blank">
            {t('settings')}
            <span className="visually-hidden"> {t('newTab')}</span>
        </ButtonLink>
    );
}
