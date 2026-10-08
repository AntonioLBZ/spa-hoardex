// Mirrors --motion-* and --ease-* in assets/styles/_tokens.scss
export const DURATION = { swift: 0.2, reveal: 0.45, build: 0.9 } as const;

export const EASE = {
    settleCss: 'cubic-bezier(0.25, 1, 0.5, 1)',
    settleBezier: [0.25, 1, 0.5, 1],
    settleGsap: 'power3.out',
} as const;

// Seconds between steps of the page-load sequence and between cards, with a cap on the whole run of cards
export const STAGGER = { block: 0.06, card: 0.035, cardsTotal: 0.3 } as const;

export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
