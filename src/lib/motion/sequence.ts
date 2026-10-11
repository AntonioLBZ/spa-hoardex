import { STAGGER } from './tokens';

// Steps of the page-load sequence: each starts --motion-stagger after the previous one. The four KPIs take 0 to 3
export const STEP = { states: 4, top: 5, years: 6, playtime: 7, library: 8 } as const;

// The panel is still fading in when its data starts to move
const LEAD = 0.08;

// Seconds from the start of the sequence until the data of a step should move
export function stepDelay(step: number): number {
    return step * STAGGER.block + LEAD;
}
