import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement it and the router calls it on navigation
window.scrollTo = () => undefined;

// jsdom has no matchMedia and GSAP calls it unguarded. Reduced motion by default, so tests see the final states
window.matchMedia = (query: string) =>
    ({
        matches: /prefers-reduced-motion:\s*reduce/.test(query),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    }) satisfies MediaQueryList;

afterEach(cleanup);
