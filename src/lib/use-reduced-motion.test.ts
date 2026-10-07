import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './use-reduced-motion';

function stubMatchMedia(matches: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches, addEventListener: () => undefined, removeEventListener: () => undefined }))
    );
}

afterEach(() => vi.unstubAllGlobals());

describe('useReducedMotion', () => {
    it('is true when the user prefers reduced motion', () => {
        stubMatchMedia(true);
        expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    });

    it('is false otherwise', () => {
        stubMatchMedia(false);
        expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
    });

    it('is false where matchMedia does not exist', () => {
        vi.stubGlobal('matchMedia', undefined);
        expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
    });
});
