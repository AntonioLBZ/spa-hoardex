import { useFormatter, useTranslations } from 'use-intl';

const TEN_HOURS = 600;

// One decimal under ten hours, where a rounded figure would hide the difference
export function hoursDigits(minutes: number): number {
    return minutes < TEN_HOURS ? 1 : 0;
}

export function useHours() {
    const format = useFormatter();
    const t = useTranslations('dashboard.unit');

    return (minutes: number, maximumFractionDigits = hoursDigits(minutes)) =>
        t('hours', { hours: format.number(minutes / 60, { maximumFractionDigits }) });
}
