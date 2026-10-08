export type DurationUnit = 'day' | 'hour' | 'minute' | 'second';

// Whole seconds as the largest unit that divides them evenly
export function toDuration(seconds: number): { unit: DurationUnit; count: number } {
    if (seconds % 86400 === 0) return { unit: 'day', count: seconds / 86400 };
    if (seconds % 3600 === 0) return { unit: 'hour', count: seconds / 3600 };
    if (seconds % 60 === 0) return { unit: 'minute', count: seconds / 60 };
    return { unit: 'second', count: seconds };
}
