import { useReducedMotion } from '@/lib/use-reduced-motion';
import { stepDelay } from './sequence';
import { DURATION, EASE } from './tokens';

// Animation props shared by the charts; `step` is the panel's place in the page-load sequence
export function useChartMotion(step = 0) {
    const reducedMotion = useReducedMotion();

    return {
        isAnimationActive: !reducedMotion,
        animationBegin: Math.round(stepDelay(step) * 1000),
        animationDuration: Math.round(DURATION.build * 1000),
        animationEasing: EASE.settleCss,
    };
}
