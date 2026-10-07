import type { ReactNode } from 'react';

import { PageSkeleton } from '@/components/skeleton';
import { StateMessage } from '@/components/state-message';

import './locked-panel.scss';

interface LockedPanelProps {
    title: string;
    body?: string;
    children?: ReactNode;
}

// What a visitor sees instead of the dashboard and library when Steam privacy hides them
export function LockedPanel({ title, body, children }: LockedPanelProps) {
    return (
        <div className="locked-panel">
            <StateMessage body={body} title={title}>
                {children}
            </StateMessage>
            <div aria-hidden="true" className="locked-panel__ghost">
                <PageSkeleton />
            </div>
        </div>
    );
}
