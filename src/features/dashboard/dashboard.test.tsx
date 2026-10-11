import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Categories } from '@core/backlog';
import type { Game, Library } from '@core/domain';
import { LocaleProvider } from '@/lib/i18n';
import { Dashboard } from './dashboard';

const stateBreakdownRenders = vi.hoisted(() => vi.fn());

vi.mock('./state-breakdown', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./state-breakdown')>();
    return {
        StateBreakdown: (props: Parameters<typeof actual.StateBreakdown>[0]) => {
            stateBreakdownRenders();
            return actual.StateBreakdown(props);
        },
    };
});

const NOW = new Date('2026-10-07T12:00:00.000Z');

function makeGame(appid: string, totalMinutes: number, lastPlayedAt: string | null, recentMinutes = 0): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes, recentMinutes, lastPlayedAt, platforms: null },
    };
}

const LIBRARY: Library = {
    owner: { source: 'steam', externalId: '76561198000000001' },
    fetchedAt: NOW.toISOString(),
    games: [
        makeGame('1', 0, null),
        makeGame('2', 30, '2026-10-01T00:00:00Z', 30),
        makeGame('3', 6000, '2026-08-01T00:00:00Z', 120),
        makeGame('4', 3000, '2026-03-01T00:00:00Z'),
        makeGame('5', 1230, '2024-05-01T00:00:00Z'),
    ],
};

function renderDashboard(library: Library = LIBRARY, settingsUrl?: string | null) {
    render(
        <LocaleProvider>
            <Dashboard games={library.games} settingsUrl={settingsUrl} />
        </LocaleProvider>
    );
}

function cells(region: string): string[][] {
    const rows = within(screen.getByRole('region', { name: region }))
        .getAllByRole<HTMLTableRowElement>('row')
        .slice(1);
    return rows.map((row) => Array.from(row.cells, (cell) => cell.textContent ?? ''));
}

function kpi(label: string): HTMLElement {
    const item = screen.getByText(label, { selector: 'dt' }).closest('div');
    if (item === null) throw new Error(`No KPI for ${label}`);
    return item;
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('Dashboard', () => {
    it('shows the headline figures', () => {
        renderDashboard();

        expect(kpi('Games').textContent).toContain('5');
        expect(kpi('Games').textContent).toContain('4 played');
        expect(kpi('Hours played').textContent).toContain('171 h');
        expect(kpi('Hours played').textContent).toContain('≈ 7.1 days · median 35 h a game');
        expect(kpi('Backlog').textContent).toContain('1');
        expect(kpi('Backlog').textContent).toContain('20% of the library');
        expect(kpi('Last two weeks').textContent).toContain('2.5 h');
        expect(kpi('Last two weeks').textContent).toContain('in 2 games');
    });

    it('leaves out the details that have nothing to say', () => {
        renderDashboard({ ...LIBRARY, games: [makeGame('1', 0, null), makeGame('2', 90, '2026-01-01T00:00:00Z')] });

        expect(kpi('Hours played').textContent).toBe('Hours played1.5 hmedian 1.5 h a game');
        expect(kpi('Last two weeks').textContent).toBe('Last two weeks0 h');
    });

    it('lists every shown state with its count and share, leaving out Abandoned', () => {
        renderDashboard();

        const states = within(screen.getByRole('region', { name: 'Backlog states' }));
        for (const name of ['Backlog', 'Tried', 'In progress', 'Paused', 'Finished']) {
            const row = states.getByText(name).closest('li');
            expect(row?.textContent).toContain('1');
            expect(row?.textContent).toContain('20%');
        }
        expect(screen.queryByText('Abandoned')).toBeNull();
    });

    it('shows the owner’s categories with their colours and counts removed ones in the Backlog', () => {
        const categories: Categories = {
            removed: ['tried'],
            custom: [{ id: 'c-12345678', name: 'Co-op', color: '#123456' }],
            colors: { paused: '#abcdef', inProgress: 'p2' },
        };
        const overrides = { '3': { state: 'c-12345678', setAt: NOW.toISOString(), minutesAtSet: 6000 } } as const;
        render(
            <LocaleProvider>
                <Dashboard categories={categories} games={LIBRARY.games} overrides={overrides} />
            </LocaleProvider>
        );

        const states = within(screen.getByRole('region', { name: 'Backlog states' }));
        expect(states.queryByText('Tried')).toBeNull();
        expect(states.getByText('Backlog').closest('li')?.textContent).toContain('40%');
        const coop = states.getByText('Co-op').closest('li');
        expect(coop?.textContent).toContain('20%');
        expect(coop?.querySelector<HTMLElement>('.state-breakdown__swatch')?.style.backgroundColor).toBe(
            'rgb(18, 52, 86)'
        );
        expect(kpi('Backlog').textContent).toContain('2');
        const swatch = (name: string) =>
            states.getByText(name).closest('li')?.querySelector<HTMLElement>('.state-breakdown__swatch')?.style;
        expect(swatch('Paused')?.backgroundColor).toBe('rgb(171, 205, 239)');
        expect(swatch('In progress')?.backgroundColor).toBe('var(--color-category-p2)');
        expect(swatch('Finished')?.backgroundColor).toBe('var(--color-state-finished)');
    });

    it('ranks the most played games with their hours', () => {
        renderDashboard();

        const ranked = within(screen.getByRole('region', { name: 'Most played' }))
            .getAllByRole('listitem')
            .map((item) => item.textContent);

        expect(ranked).toEqual(['Game 3100 h', 'Game 450 h', 'Game 521 h', 'Game 20.5 h']);
    });

    it('says how few games hold half the hours', () => {
        renderDashboard();

        const panel = screen.getByRole('region', { name: 'Most played' });
        expect(within(panel).getByText('Half your hours went into a single game.')).toBeTruthy();
    });

    it('gives the share of the top ten when the library has more played games', () => {
        const games = Array.from({ length: 12 }, (_, index) => makeGame(String(index), (index + 1) * 60, null));
        renderDashboard({ ...LIBRARY, games });

        const panel = screen.getByRole('region', { name: 'Most played' });
        expect(
            within(panel).getByText('Your top 10 add up to 96% of your hours. Half your hours went into 4 games.')
        ).toBeTruthy();
    });

    it('gives the games by year as a table', () => {
        renderDashboard();

        expect(cells('Games by year of last play')).toEqual([
            ['2024', '1'],
            ['2026', '3'],
        ]);
    });

    it('buckets the played games by hours and shows the unplayed ones on demand', async () => {
        const user = userEvent.setup();
        renderDashboard();
        const played = [
            ['< 1 h', '1', '0.5 h'],
            ['1–10 h', '0', '0 h'],
            ['10–50 h', '1', '21 h'],
            ['50–100 h', '1', '50 h'],
            ['100+ h', '1', '100 h'],
        ];

        expect(cells('Hours per game')).toEqual(played);

        await user.click(screen.getByRole('switch', { name: 'Show unplayed' }));

        expect(cells('Hours per game')).toEqual([['Unplayed', '1', '0 h'], ...played]);
    });

    describe('when Steam sends no last-played dates', () => {
        const UNDATED: Library = {
            ...LIBRARY,
            games: [makeGame('1', 0, null), makeGame('2', 600, null), makeGame('3', 3000, null)],
        };
        const SETTINGS = 'https://steamcommunity.com/id/someone/edit/settings';

        it('keeps the games-by-year panel and explains why it is empty', () => {
            renderDashboard(UNDATED, SETTINGS);

            const panel = screen.getByRole('region', { name: 'Games by year of last play' });
            expect(within(panel).getByText(/did not share when these games were last played/)).toBeTruthy();
            expect(within(panel).queryByRole('table')).toBeNull();
            expect(
                within(panel)
                    .getByRole('link', { name: /^Open Steam privacy settings/ })
                    .getAttribute('href')
            ).toBe(SETTINGS);
        });

        it('offers no link when there is no profile to point to', () => {
            renderDashboard(UNDATED, null);

            const panel = screen.getByRole('region', { name: 'Games by year of last play' });
            expect(within(panel).queryByRole('link')).toBeNull();
        });

        it('stays out of the way when nobody has played anything', () => {
            renderDashboard({ ...LIBRARY, games: [makeGame('1', 0, null), makeGame('2', 0, null)] }, SETTINGS);

            expect(screen.queryByRole('region', { name: 'Games by year of last play' })).toBeNull();
            expect(screen.queryByRole('region', { name: 'Hours per game' })).toBeNull();
        });

        it('still buckets the hours, which need no dates', () => {
            renderDashboard(UNDATED, SETTINGS);

            expect(cells('Hours per game')).toHaveLength(5);
        });

        it('does not lock the panel when some games do have a date', () => {
            renderDashboard(LIBRARY, SETTINGS);

            expect(screen.queryByText(/did not share when/)).toBeNull();
            const panel = screen.getByRole('region', { name: 'Games by year of last play' });
            expect(within(panel).getByRole('table')).toBeTruthy();
        });
    });

    it('does not render again when only its parent does, so the charts do not replay their animation', () => {
        const page = (
            <LocaleProvider>
                <Dashboard games={LIBRARY.games} settingsUrl={null} />
            </LocaleProvider>
        );
        const { rerender } = render(page);
        stateBreakdownRenders.mockClear();

        rerender(
            <LocaleProvider>
                <Dashboard games={LIBRARY.games} settingsUrl={null} />
            </LocaleProvider>
        );

        expect(stateBreakdownRenders).not.toHaveBeenCalled();
    });

    it('speaks Spanish when that is the stored language', () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderDashboard();

        expect(screen.getByText('Horas jugadas')).toBeTruthy();
        expect(screen.getByText('Probado')).toBeTruthy();
    });
});
