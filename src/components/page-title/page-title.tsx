import { useTranslations } from 'use-intl';

// The tab title: "page · Hoardex", or just "Hoardex" without a page
export function PageTitle({ title }: { title?: string }) {
    const name = useTranslations('app')('name');

    return <title>{title === undefined ? name : `${title} · ${name}`}</title>;
}
