import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LocaleProvider } from '../i18n';
import { createQueryClient } from '../query-client';
import { createAppRouter } from '../../router';

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

interface StubbedAnswer {
    status?: number;
    body: unknown;
}

// Answers by exact request path; anything else is a failed test
export function stubApi(answers: Record<string, StubbedAnswer>) {
    const fetchMock = vi.fn((input: string | URL | Request) => {
        const answer = answers[String(input)];
        if (answer === undefined) return Promise.reject(new Error(`Unexpected request: ${String(input)}`));
        return Promise.resolve(Response.json(answer.body, { status: answer.status ?? 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}
