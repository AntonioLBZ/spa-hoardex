import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function kpi(label: string): HTMLElement {
    const item = screen.getByText(label).closest('div');
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
        expect(kpi('Backlog').textContent).toContain('2');
        expect(kpi('Backlog').textContent).toContain('40% of the library');
        expect(kpi('Last two weeks').textContent).toContain('2.5 h');
    });

    it('lists every shown state with its count and share, leaving out Abandoned', () => {
        renderDashboard();

        for (const name of ['Untouched', 'Tried', 'In progress', 'Paused', 'Finished']) {
            const row = screen.getByText(name).closest('li');
            expect(row?.textContent).toContain('1');
            expect(row?.textContent).toContain('20%');
        }
        expect(screen.queryByText('Abandoned')).toBeNull();
    });

    it('ranks the most played games with their hours', () => {
        renderDashboard();

        const ranked = within(screen.getByRole('region', { name: 'Most played' }))
            .getAllByRole('listitem')
            .map((item) => item.textContent);

        expect(ranked).toEqual(['Game 3100 h', 'Game 450 h', 'Game 521 h', 'Game 20.5 h']);
    });

    it('gives the hours by year as a table', () => {
        renderDashboard();

        const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);

        expect(rows.map((row) => row.textContent)).toEqual(['202421', '2026151']);
    });

    describe('when Steam sends no last-played dates', () => {
        const UNDATED: Library = {
            ...LIBRARY,
            games: [makeGame('1', 0, null), makeGame('2', 600, null), makeGame('3', 3000, null)],
        };
        const SETTINGS = 'https://steamcommunity.com/id/someone/edit/settings';

        it('keeps the hours-by-year panel and explains why it is empty', () => {
            renderDashboard(UNDATED, SETTINGS);

            const panel = screen.getByRole('region', { name: 'Hours by year of last play' });
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

            const panel = screen.getByRole('region', { name: 'Hours by year of last play' });
            expect(within(panel).queryByRole('link')).toBeNull();
        });

        it('stays out of the way when nobody has played anything', () => {
            renderDashboard({ ...LIBRARY, games: [makeGame('1', 0, null), makeGame('2', 0, null)] }, SETTINGS);

            expect(screen.queryByRole('region', { name: 'Hours by year of last play' })).toBeNull();
        });

        it('does not lock the panel when some games do have a date', () => {
            renderDashboard(LIBRARY, SETTINGS);

            expect(screen.queryByText(/did not share when/)).toBeNull();
            expect(screen.getByRole('table')).toBeTruthy();
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
        expect(screen.getByText('Sin tocar')).toBeTruthy();
    });
});
