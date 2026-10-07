import { useId, type ReactNode } from 'react';

import './panel.scss';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
    const titleId = useId();

    return (
        <section aria-labelledby={titleId} className="panel">
            <h2 className="panel__title" id={titleId}>
                {title}
            </h2>
            {children}
        </section>
    );
}
