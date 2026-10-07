import { useFormatter, useTranslations } from 'use-intl';

const TEN_HOURS = 600;

// One decimal under ten hours, where a rounded figure would hide the difference
export function useHours() {
    const format = useFormatter();
    const t = useTranslations('dashboard.unit');

    return (minutes: number, maximumFractionDigits = minutes < TEN_HOURS ? 1 : 0) =>
        t('hours', { hours: format.number(minutes / 60, { maximumFractionDigits }) });
}
