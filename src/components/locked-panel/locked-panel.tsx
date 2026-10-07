import type { ReactNode } from 'react';

import { StateMessage } from '@/components/state-message';

import './locked-panel.scss';

interface LockedPanelProps {
    title: string;
    body?: string;
    children?: ReactNode;
}

function Blocks({ count, kind }: { count: number; kind: 'kpi' | 'panel' | 'cover' }) {
    return Array.from({ length: count }, (_, index) => (
        <span className={`locked-panel__block locked-panel__block--${kind}`} key={index} />
    ));
}

// What a visitor sees instead of the dashboard and library when Steam privacy hides them
export function LockedPanel({ title, body, children }: LockedPanelProps) {
    return (
        <div className="locked-panel">
            <StateMessage body={body} title={title}>
                {children}
            </StateMessage>
            <div aria-hidden="true" className="locked-panel__ghost">
                <div className="locked-panel__kpis">
                    <Blocks count={4} kind="kpi" />
                </div>
                <div className="locked-panel__panels">
                    <Blocks count={2} kind="panel" />
                </div>
                <div className="locked-panel__covers">
                    <Blocks count={12} kind="cover" />
                </div>
            </div>
        </div>
    );
}
