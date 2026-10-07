import { useDeferredValue } from 'react';

// False on the first render and true on the next, which React schedules after the first one has been committed
export function useAfterPaint(): boolean {
    return useDeferredValue(true, false);
}
