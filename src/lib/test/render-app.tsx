import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LocaleProvider } from '@/lib/i18n';
import { createQueryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';

export function renderApp(path: string) {
    const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    render(
        <LocaleProvider>
            <QueryClientProvider client={createQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </LocaleProvider>
    );
    return { router, user: userEvent.setup() };
}

const ME_PATH = '/api/me';
const BACKLOG_PREFIX = '/api/backlog/';
const NO_OVERRIDES = { kind: 'ok', data: { overrides: {} } };

interface StubbedAnswer {
    status?: number;
    body?: unknown;
    text?: string;
}

export function stubApi(answers: Record<string, StubbedAnswer>) {
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
        const answer = answers[String(input)];
        if (answer === undefined) return Promise.reject(new Error(`Unexpected request: ${String(input)}`));
        const status = answer.status ?? 200;
        return Promise.resolve(
            answer.text === undefined
                ? Response.json(answer.body, { status })
                : new Response(answer.text, { status, headers: { 'content-type': 'text/plain' } })
        );
    });
    // Signed out and without manual states by default, kept out of the recorded calls unless the test answers them
    const withDefaults = (input: string | URL | Request, init?: RequestInit) => {
        const path = String(input);
        if (answers[path] !== undefined) return fetchMock(input, init);
        if (path === ME_PATH) return Promise.resolve(Response.json({ user: null }));
        if (path.startsWith(BACKLOG_PREFIX)) return Promise.resolve(Response.json(NO_OVERRIDES));
        return fetchMock(input, init);
    };
    vi.stubGlobal('fetch', withDefaults);
    return fetchMock;
}
