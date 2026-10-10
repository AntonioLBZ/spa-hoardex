import { clsx } from 'clsx';

import './toolbar-icon.scss';

const PATHS = {
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    chevron: 'M6 9l6 6 6-6',
    down: 'M12 5v14M6 13l6 6 6-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    select: 'M4 4h16v16H4zM8 12l3 3 5-6',
} as const;

interface ToolbarIconProps {
    name: keyof typeof PATHS;
    className?: string;
}

export function ToolbarIcon({ name, className }: ToolbarIconProps) {
    return (
        <svg aria-hidden="true" className={clsx('toolbar-icon', className)} viewBox="0 0 24 24">
            <path d={PATHS[name]} />
        </svg>
    );
}
