import { useSyncExternalStore } from 'react';

type ProfileContent = typeof import('./profile-content');

let content: ProfileContent | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

// Starts at once; a failed load is tried again on the next request
function load() {
    loading ??= import('./profile-content').then(
        (module) => {
            content = module;
            listeners.forEach((notify) => notify());
        },
        () => {
            loading = null;
        }
    );
}

load();

// Recharts, Motion and GSAP load beside the API call. Not React.lazy: its first render suspends even when loaded, and React then holds the content back 300 ms
export function useProfileContent(): ProfileContent | null {
    return useSyncExternalStore(
        (notify) => {
            listeners.add(notify);
            load();
            return () => void listeners.delete(notify);
        },
        () => content,
        () => null
    );
}
