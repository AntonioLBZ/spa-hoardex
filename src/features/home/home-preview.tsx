import type { CSSProperties } from 'react';

import type { BacklogState } from '@core/backlog';
import { STATE_COLOR } from '@/lib/state-colors';

// A drawing of the dashboard with made-up numbers: decoration only, the page says the same in words
const KPIS = [
    { value: 1840, unit: ' h' },
    { value: 312, unit: '' },
    { value: 48, unit: ' %' },
];

const SHARES: [BacklogState, number][] = [
    ['untouched', 34],
    ['tried', 14],
    ['inProgress', 12],
    ['paused', 16],
    ['finished', 24],
];

const YEARS = [0.35, 0.5, 0.82, 0.6, 0.96, 0.7, 0.44];

const COVERS: [BacklogState, BacklogState][] = [
    ['inProgress', 'paused'],
    ['finished', 'inProgress'],
    ['tried', 'abandoned'],
    ['untouched', 'finished'],
];

function vars(values: Record<string, string | number>) {
    return Object.fromEntries(Object.entries(values).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
}

const segments = SHARES.reduce<{ state: BacklogState; share: number; offset: number }[]>((list, [state, share]) => {
    const previous = list.at(-1);
    const offset = previous === undefined ? 0 : previous.offset + previous.share;
    return [...list, { state, share, offset }];
}, []);

export function HomePreview() {
    return (
        <div aria-hidden="true" className="home-preview">
            <div className="home-preview__window">
                <div className="home-preview__chrome">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="home-preview__kpis">
                    {KPIS.map(({ value, unit }, index) => (
                        <div className="home-preview__kpi" key={index} style={vars({ i: index })}>
                            <span className="home-preview__count" data-unit={unit} style={vars({ n: value })} />
                            <span className="home-preview__line" />
                        </div>
                    ))}
                </div>
                <div className="home-preview__charts">
                    <svg className="home-preview__donut" viewBox="0 0 42 42">
                        <g transform="rotate(-90 21 21)">
                            {segments.map(({ state, share, offset }) => (
                                <circle
                                    cx="21"
                                    cy="21"
                                    key={state}
                                    pathLength="100"
                                    r="15.9"
                                    strokeDasharray={`${share - 0.8} ${100 - share + 0.8}`}
                                    strokeDashoffset={-offset}
                                    style={{ stroke: STATE_COLOR[state] }}
                                />
                            ))}
                            <circle className="home-preview__sweep" cx="21" cy="21" pathLength="100" r="15.9" />
                        </g>
                    </svg>
                    <div className="home-preview__years">
                        {YEARS.map((height, index) => (
                            <span className="home-preview__year" key={index} style={vars({ h: height, i: index })} />
                        ))}
                    </div>
                </div>
                <ul className="home-preview__covers">
                    {COVERS.map(([from, to], index) => (
                        <li
                            className="home-preview__cover"
                            key={index}
                            style={vars({ from: STATE_COLOR[from], to: STATE_COLOR[to], i: index })}
                        >
                            <span className="home-preview__swatch" style={{ backgroundColor: STATE_COLOR[from] }} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
