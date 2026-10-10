import { useSyncExternalStore } from 'react';

// What a dragged card carries; anything else dropped on a chip is ignored
export const DRAG_TYPE = 'application/x-hoardex-appid';

const COARSE = '(pointer: coarse)';

function subscribe(notify: () => void) {
    const query = window.matchMedia(COARSE);
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
}

// Touch screens get no drag and drop for now: the state menu and the selection bar do the same
export function useCanDrag(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => !window.matchMedia(COARSE).matches,
        () => false
    );
}
