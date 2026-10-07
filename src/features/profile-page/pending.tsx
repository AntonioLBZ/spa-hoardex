import { PageSkeleton } from '@/components/skeleton';

// A skeleton of the page, with the loading text for assistive technology
export function Pending({ label, header = false }: { label: string; header?: boolean }) {
    return (
        <div role="status">
            <span className="visually-hidden">{label}</span>
            <PageSkeleton header={header} />
        </div>
    );
}
