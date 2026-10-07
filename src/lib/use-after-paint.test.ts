import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAfterPaint } from './use-after-paint';

describe('useAfterPaint', () => {
    it('is false on the first render and true on a later one', () => {
        const seen: boolean[] = [];
        const { result } = renderHook(() => {
            const ready = useAfterPaint();
            seen.push(ready);
            return ready;
        });

        expect(seen[0]).toBe(false);
        expect(result.current).toBe(true);
    });
});
