import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

import './card.scss';

interface CardProps extends HTMLAttributes<HTMLElement> {
    as?: 'div' | 'section' | 'article' | 'aside';
}

// The raised surface under panels, KPIs and messages
export function Card({ as: Element = 'div', className, ...rest }: CardProps) {
    return <Element {...rest} className={clsx('card', className)} />;
}
