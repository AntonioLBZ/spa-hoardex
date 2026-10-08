import { animate } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';

import { DURATION, EASE } from '@/lib/motion/tokens';
import { useReducedMotion } from '@/lib/use-reduced-motion';

import './count-up.scss';

interface CountUpProps {
    value: number;
    format: (value: number) => string;
    // Seconds before the count starts
    delay?: number;
}

// Counts up to `value`. The final text stays in the DOM for assistive tech; the ticking copy is `aria-hidden`
export function CountUp({ value, format, delay = 0 }: CountUpProps) {
    const reducedMotion = useReducedMotion();
    const root = useRef<HTMLSpanElement>(null);
    const tick = useRef<HTMLSpanElement>(null);
    // What is on screen, so a new value counts on from there
    const shown = useRef(0);
    const latestFormat = useRef(format);

    useLayoutEffect(() => {
        latestFormat.current = format;
    });

    useLayoutEffect(() => {
        const rootNode = root.current;
        const tickNode = tick.current;
        if (reducedMotion || rootNode === null || tickNode === null) return;
        rootNode.dataset.running = '';
        tickNode.textContent = latestFormat.current(shown.current);
        const controls = animate(shown.current, value, {
            delay,
            duration: DURATION.build,
            ease: EASE.settleBezier,
            onUpdate: (current) => {
                shown.current = current;
                tickNode.textContent = latestFormat.current(current);
            },
            onComplete: () => delete rootNode.dataset.running,
        });
        return () => {
            controls.stop();
            delete rootNode.dataset.running;
        };
    }, [value, delay, reducedMotion]);

    if (reducedMotion) return <>{format(value)}</>;

    return (
        <span className="count-up" ref={root}>
            <span className="count-up__final">{format(value)}</span>
            <span aria-hidden="true" className="count-up__tick" ref={tick} />
        </span>
    );
}
