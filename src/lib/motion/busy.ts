const LONG_FRAME_MS = 100;
const BUSY_HOLD_MS = 1500;

let busyUntil = 0;

// Long Animation Frames exist only in Chromium; elsewhere the main thread is never reported busy
try {
    new PerformanceObserver((list) => {
        for (const frame of list.getEntries())
            if (frame.duration > LONG_FRAME_MS) busyUntil = frame.startTime + frame.duration + BUSY_HOLD_MS;
    }).observe({ type: 'long-animation-frame' });
} catch {
    // Not supported
}

// True for a moment after a long frame, so reveals skip their tween instead of piling on a struggling device
export function isBusy(): boolean {
    return performance.now() < busyUntil;
}
