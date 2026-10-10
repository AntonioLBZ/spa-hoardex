import { describe, expect, it } from 'vitest';
import type { Game } from '../domain/index.js';
import {
    DEFAULT_CATEGORIES,
    MAX_CATEGORIES,
    canCreateCategory,
    categoryIds,
    computedState,
    countByState,
    hasCategory,
    isCategoryId,
    normalizeCategoryColor,
    normalizeCategoryName,
    resolveState,
    sameCategoryName,
    type BacklogOverride,
    type Categories,
    type CategoryId,
    type CustomCategory,
} from './index.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
    return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function makeGame(totalMinutes: number, lastPlayedAt: string | null, appid = '1'): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: true,
        playtime: { totalMinutes, recentMinutes: 0, lastPlayedAt, platforms: null },
    };
}

function custom(id: `c-${string}`, name = 'Co-op'): CustomCategory {
    return { id, name, color: 'p1' };
}

function override(state: CategoryId): BacklogOverride {
    return { state, setAt: '2026-10-01T00:00:00Z', minutesAtSet: 0 };
}

describe('categoryIds', () => {
    it('lists the built-in states by default', () => {
        expect(categoryIds(DEFAULT_CATEGORIES)).toEqual([
            'untouched',
            'tried',
            'inProgress',
            'paused',
            'finished',
            'abandoned',
        ]);
    });

    it('leaves removed ones out and puts custom ones last, in creation order', () => {
        const categories: Categories = {
            removed: ['tried', 'abandoned'],
            custom: [custom('c-0000000b'), custom('c-0000000a')],
        };
        expect(categoryIds(categories)).toEqual([
            'untouched',
            'inProgress',
            'paused',
            'finished',
            'c-0000000b',
            'c-0000000a',
        ]);
    });

    it('never drops the fallback, even if stored as removed', () => {
        expect(categoryIds({ removed: ['untouched'], custom: [] })).toContain('untouched');
        expect(hasCategory({ removed: ['untouched'], custom: [] }, 'untouched')).toBe(true);
    });
});

describe('hasCategory and isCategoryId', () => {
    const categories: Categories = { removed: ['paused'], custom: [custom('c-12345678')] };

    it('knows which categories the account has', () => {
        expect(hasCategory(categories, 'inProgress')).toBe(true);
        expect(hasCategory(categories, 'paused')).toBe(false);
        expect(hasCategory(categories, 'c-12345678')).toBe(true);
        expect(hasCategory(categories, 'c-87654321')).toBe(false);
        expect(hasCategory(categories, 'nope')).toBe(false);
    });

    it('checks only the shape of an id', () => {
        expect(isCategoryId('paused')).toBe(true);
        expect(isCategoryId('c-87654321')).toBe(true);
        expect(isCategoryId('c-8765432')).toBe(false);
        expect(isCategoryId('c-ABCDEF12')).toBe(false);
        expect(isCategoryId('backlog')).toBe(false);
        expect(isCategoryId(7)).toBe(false);
    });
});

describe('canCreateCategory', () => {
    it('allows up to the limit, built-in ones included', () => {
        const six = Array.from({ length: MAX_CATEGORIES - 6 }, (_, i) => custom(`c-${String(i).padStart(8, '0')}`));
        expect(canCreateCategory(DEFAULT_CATEGORIES)).toBe(true);
        expect(canCreateCategory({ removed: [], custom: six.slice(1) })).toBe(true);
        expect(canCreateCategory({ removed: [], custom: six })).toBe(false);
        expect(canCreateCategory({ removed: ['tried'], custom: six })).toBe(true);
    });
});

describe('computedState', () => {
    it('follows the rules while their category exists', () => {
        expect(computedState(makeGame(25, daysAgo(3)), NOW)).toBe('tried');
        expect(computedState(makeGame(600, daysAgo(200)), NOW)).toBe('paused');
    });

    it('falls straight to the fallback when the category is removed', () => {
        const categories: Categories = { removed: ['tried', 'paused'], custom: [] };
        expect(computedState(makeGame(25, daysAgo(3)), NOW, categories)).toBe('untouched');
        expect(computedState(makeGame(600, daysAgo(200)), NOW, categories)).toBe('untouched');
        expect(computedState(makeGame(600, daysAgo(800)), NOW, categories)).toBe('finished');
    });
});

describe('resolveState', () => {
    const game = makeGame(600, daysAgo(10));

    it('lets a manual category win while it exists', () => {
        const categories: Categories = { removed: [], custom: [custom('c-12345678')] };
        expect(resolveState(game, NOW, override('c-12345678'), { categories })).toBe('c-12345678');
        expect(resolveState(game, NOW, override('abandoned'))).toBe('abandoned');
    });

    it('ignores a manual category that is gone', () => {
        expect(resolveState(game, NOW, override('c-12345678'))).toBe('inProgress');
        expect(
            resolveState(game, NOW, override('abandoned'), { categories: { removed: ['abandoned'], custom: [] } })
        ).toBe('inProgress');
    });

    it('applies the fallback after ignoring it', () => {
        const categories: Categories = { removed: ['inProgress', 'abandoned'], custom: [] };
        expect(resolveState(game, NOW, override('abandoned'), { categories })).toBe('untouched');
    });
});

describe('countByState with categories', () => {
    it('has a key for every category and counts the cascade in the fallback', () => {
        const categories: Categories = { removed: ['tried'], custom: [custom('c-12345678')] };
        const games = [makeGame(0, null, '1'), makeGame(30, daysAgo(2), '2'), makeGame(600, daysAgo(2), '3')];
        const counts = countByState(games, NOW, { categories, overrides: { '3': override('c-12345678') } });
        expect(counts).toEqual({
            untouched: 2,
            inProgress: 0,
            paused: 0,
            finished: 0,
            abandoned: 0,
            'c-12345678': 1,
        });
    });
});

describe('normalizeCategoryName', () => {
    it('trims and collapses spaces', () => {
        expect(normalizeCategoryName('  Co-op   with  friends ')).toBe('Co-op with friends');
    });

    it('rejects empty, too long, control characters and non-strings', () => {
        expect(normalizeCategoryName('   ')).toBeNull();
        expect(normalizeCategoryName('x'.repeat(25))).toBeNull();
        expect(normalizeCategoryName('a\u0000b')).toBeNull();
        expect(normalizeCategoryName(7)).toBeNull();
    });

    it('counts characters, not code units', () => {
        expect(normalizeCategoryName('🎮'.repeat(24))).toBe('🎮'.repeat(24));
    });
});

describe('normalizeCategoryColor', () => {
    it('accepts palette tokens and hex colours in lower case', () => {
        expect(normalizeCategoryColor('p8')).toBe('p8');
        expect(normalizeCategoryColor('#A1B2C3')).toBe('#a1b2c3');
    });

    it('rejects anything else', () => {
        for (const raw of ['p9', '#abc', 'red', 'url(x)', '#a1b2c3;', null])
            expect(normalizeCategoryColor(raw)).toBeNull();
    });
});

describe('sameCategoryName', () => {
    it('ignores case', () => {
        expect(sameCategoryName('Co-op', 'CO-OP')).toBe(true);
        expect(sameCategoryName('Co-op', 'Coop')).toBe(false);
    });
});
