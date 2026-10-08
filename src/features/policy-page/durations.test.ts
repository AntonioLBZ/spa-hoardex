import { describe, expect, it } from 'vitest';

import { toDuration } from './durations';

describe('toDuration', () => {
    it.each([
        [86_400, 'day', 1],
        [172_800, 'day', 2],
        [7200, 'hour', 2],
        [3600, 'hour', 1],
        [600, 'minute', 10],
        [60, 'minute', 1],
        [90, 'second', 90],
    ])('writes %i seconds as %s x%i', (seconds, unit, count) => {
        expect(toDuration(seconds)).toEqual({ unit, count });
    });
});
