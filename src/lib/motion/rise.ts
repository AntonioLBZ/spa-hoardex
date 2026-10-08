import type { CSSProperties } from 'react';

// Position in the page-load sequence, read by `.rise-in`
export function riseStyle(index: number): CSSProperties {
    return { '--i': index } as CSSProperties;
}
