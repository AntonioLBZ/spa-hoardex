import { useId, type ReactNode } from 'react';

import { riseStyle } from '@/lib/motion';

import './panel.scss';

interface PanelProps {
    title: string;
    children: ReactNode;
    // Step in the page-load sequence; without it the panel appears at once
    index?: number;
    className?: string;
}

export function Panel({ title, children, index, className }: PanelProps) {
    const titleId = useId();

    return (
        <section
            aria-labelledby={titleId}
            className={['panel', index === undefined ? null : 'rise-in', className].filter(Boolean).join(' ')}
            style={index === undefined ? undefined : riseStyle(index)}
        >
            <h2 className="panel__title" id={titleId}>
                {title}
            </h2>
            {children}
        </section>
    );
}
