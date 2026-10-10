import { clsx } from 'clsx';

import './toolbar-icon.scss';

const PATHS = {
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    chevron: 'M6 9l6 6 6-6',
    down: 'M12 5v14M6 13l6 6 6-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
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
