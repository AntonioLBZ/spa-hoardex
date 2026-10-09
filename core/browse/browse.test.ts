import { describe, expect, it } from 'vitest';
import type { Game } from '../domain/index.js';
import { BACKLOG_STATES } from '../backlog/index.js';
import {
    browseLibrary,
    classifyLibrary,
    countByFilter,
    groupByState,
    STATE_FILTERS,
    type BrowseOptions,
} from './index.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function makeGame(appid: string, name: string, totalMinutes: number, lastPlayedAt: string | null): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes, recentMinutes: 0, lastPlayedAt, platforms: null },
    };
}

const GAMES = [
    makeGame('5', 'Echo Harbor', 4000, '2022-01-01T00:00:00Z'),
    makeGame('2', 'Álamo Run', 0, null),
    makeGame('4', 'Delta Forge', 300, '2026-09-20T00:00:00Z'),
    makeGame('1', 'Bright Tide', 20, '2026-09-30T00:00:00Z'),
    makeGame('3', 'Crimson Orbit', 900, '2026-03-01T00:00:00Z'),
];

const entries = classifyLibrary(GAMES, NOW);
const names = (options: BrowseOptions) => browseLibrary(entries, options).map((entry) => entry.game.name);

describe('classifyLibrary', () => {
    it('pairs each game with its library-only state', () => {
        expect(entries.map((entry) => [entry.game.name, entry.state])).toEqual([
            ['Echo Harbor', 'finished'],
            ['Álamo Run', 'untouched'],
            ['Delta Forge', 'inProgress'],
            ['Bright Tide', 'tried'],
            ['Crimson Orbit', 'paused'],
        ]);
        expect(entries.every((entry) => entry.manual === null && entry.computed === entry.state)).toBe(true);
    });

    it('shows a manual state over the computed one, and keeps both', () => {
        const manual = { state: 'abandoned', setAt: '2026-10-01T00:00:00Z', minutesAtSet: 4000 } as const;
        const [echo] = classifyLibrary(GAMES, NOW, { overrides: { '5': manual } });
        expect(echo).toMatchObject({ state: 'abandoned', computed: 'finished', manual });

        const withManual = classifyLibrary(GAMES, NOW, { overrides: { '5': manual } });
        expect(countByFilter(withManual)).toMatchObject({ abandoned: 1, finished: 0 });
        const abandoned = browseLibrary(withManual, { state: 'abandoned', sort: 'name' });
        expect(abandoned.map((entry) => entry.game.name)).toEqual(['Echo Harbor']);
    });
});

describe('countByFilter', () => {
    it('counts every state and the backlog', () => {
        expect(countByFilter(entries)).toEqual({
            backlog: 2,
            untouched: 1,
            tried: 1,
            inProgress: 1,
            paused: 1,
            finished: 1,
            abandoned: 0,
        });
    });

    it('has a count for every filter, empty library included', () => {
        expect(Object.keys(countByFilter([])).sort()).toEqual([...STATE_FILTERS].sort());
    });
});

describe('browseLibrary filters', () => {
    it('keeps every game without a state filter', () => {
        expect(names({ sort: 'name' })).toHaveLength(5);
    });

    it('filters by one state', () => {
        expect(names({ sort: 'name', state: 'paused' })).toEqual(['Crimson Orbit']);
        expect(names({ sort: 'name', state: 'abandoned' })).toEqual([]);
    });

    it('treats the backlog as untouched plus tried', () => {
        expect(names({ sort: 'name', state: 'backlog' })).toEqual(['Álamo Run', 'Bright Tide']);
    });

    it('searches the name ignoring case, accents and punctuation', () => {
        expect(names({ sort: 'name', query: 'alamo' })).toEqual(['Álamo Run']);
        expect(names({ sort: 'name', query: 'ECHO  harbor' })).toEqual(['Echo Harbor']);
        expect(names({ sort: 'name', query: 'delta-forge' })).toEqual(['Delta Forge']);
    });

    it('matches names with symbols and accents typed plainly', () => {
        const odd = classifyLibrary(
            [makeGame('9', 'Portal™ 2', 0, null), makeGame('8', 'Pokémon Arena', 0, null)],
            NOW
        );

        expect(browseLibrary(odd, { sort: 'name', query: 'portal 2' })).toHaveLength(1);
        expect(browseLibrary(odd, { sort: 'name', query: 'pokemon' })).toHaveLength(1);
    });

    it('matches everything for an empty or symbol-only query', () => {
        expect(names({ sort: 'name', query: '' })).toHaveLength(5);
        expect(names({ sort: 'name', query: '  ™ ' })).toHaveLength(5);
    });

    it('combines the state filter and the search', () => {
        expect(names({ sort: 'name', state: 'backlog', query: 'bright' })).toEqual(['Bright Tide']);
        expect(names({ sort: 'name', state: 'finished', query: 'bright' })).toEqual([]);
    });

    it('does not change the entries it is given', () => {
        const before = entries.map((entry) => entry.game.id.externalId);
        browseLibrary(entries, { sort: 'hours' });

        expect(entries.map((entry) => entry.game.id.externalId)).toEqual(before);
    });
});

describe('browseLibrary sorting', () => {
    it('sorts by hours, most played first', () => {
        expect(names({ sort: 'hours' })).toEqual([
            'Echo Harbor',
            'Crimson Orbit',
            'Delta Forge',
            'Bright Tide',
            'Álamo Run',
        ]);
    });

    it('sorts by last played, most recent first and never played last', () => {
        expect(names({ sort: 'recent' })).toEqual([
            'Bright Tide',
            'Delta Forge',
            'Crimson Orbit',
            'Echo Harbor',
            'Álamo Run',
        ]);
    });

    it('sorts names by the given locale, accents and numbers included', () => {
        const mixed = classifyLibrary(
            [makeGame('1', 'Zeta 10', 0, null), makeGame('2', 'Zeta 2', 0, null), makeGame('3', 'Árbol', 0, null)],
            NOW
        );

        expect(browseLibrary(mixed, { sort: 'name', locale: 'es' }).map((entry) => entry.game.name)).toEqual([
            'Árbol',
            'Zeta 2',
            'Zeta 10',
        ]);
    });

    it('breaks ties by name, then by appid', () => {
        const tied = classifyLibrary(
            [
                makeGame('20', 'Same Name', 60, null),
                makeGame('10', 'Same Name', 60, null),
                makeGame('30', 'Another', 60, null),
            ],
            NOW
        );

        expect(browseLibrary(tied, { sort: 'hours' }).map((entry) => entry.game.id.externalId)).toEqual([
            '30',
            '10',
            '20',
        ]);
    });

    it('treats an unparsable last-played date as never played', () => {
        const broken = classifyLibrary(
            [makeGame('1', 'Broken Date', 120, 'not a date'), makeGame('2', 'Dated', 120, '2026-01-01T00:00:00Z')],
            NOW
        );

        expect(browseLibrary(broken, { sort: 'recent' }).map((entry) => entry.game.name)).toEqual([
            'Dated',
            'Broken Date',
        ]);
    });
});

describe('groupByState', () => {
    it('puts each game in its state’s list, keeping the order, with every state present', () => {
        const groups = groupByState(browseLibrary(entries, { sort: 'name' }));
        expect(Object.keys(groups)).toEqual([...BACKLOG_STATES]);
        expect(groups.untouched.map((entry) => entry.game.name)).toEqual(['Álamo Run']);
        expect(groups.abandoned).toEqual([]);
        expect(Object.values(groups).flat()).toHaveLength(GAMES.length);
    });
});
