export interface FetchBudget {
    tryConsume(): Promise<boolean>;
}

// Counts each request; past the cap it answers like a Steam throttle (429, x-eresult 84)
export function withBudget(baseFetch: typeof fetch, budget: FetchBudget): typeof fetch {
    const budgeted = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (await budget.tryConsume()) return baseFetch(input, init);
        return new Response('{"response":{}}', { status: 429, headers: { 'x-eresult': '84' } });
    };
    return budgeted as typeof fetch;
}
