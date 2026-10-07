import type { ReactNode } from 'react';

import './state-message.scss';

interface StateMessageProps {
    title: string;
    body?: string;
    // `alert` interrupts assistive tech; use it for failures
    role?: 'status' | 'alert';
    children?: ReactNode;
}

export function StateMessage({ title, body, role = 'status', children }: StateMessageProps) {
    return (
        <section className="state-message" role={role}>
            <h2 className="state-message__title">{title}</h2>
            {body === undefined ? null : <p className="state-message__body">{body}</p>}
            {children === undefined ? null : <div className="state-message__actions">{children}</div>}
        </section>
    );
}
