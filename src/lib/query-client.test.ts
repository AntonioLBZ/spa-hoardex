import { describe, expect, it } from 'vitest';

import { ApiError, meQuery } from '@/lib/api';
import { createQueryClient } from './query-client';

const SIGNED_IN = { user: { steamId: '76561198000000001' } };

function signedInClient() {
    const client = createQueryClient();
    client.setQueryData(meQuery().queryKey, SIGNED_IN);
    return client;
}

describe('createQueryClient', () => {
    it('shows the visitor as signed out when a read finds the session ended', async () => {
        const client = signedInClient();
        const read = client.fetchQuery({
            queryKey: ['me', 'backlog'],
            queryFn: () => Promise.reject(new ApiError(401, 'signedOut')),
        });
        await expect(read).rejects.toBeInstanceOf(ApiError);
        expect(client.getQueryData(meQuery().queryKey)).toEqual({ user: null });
    });

    it('shows the visitor as signed out when a change finds the session ended', async () => {
        const client = signedInClient();
        const write = client
            .getMutationCache()
            .build(client, { mutationFn: () => Promise.reject(new ApiError(401, 'signedOut')) })
            .execute(undefined);
        await expect(write).rejects.toBeInstanceOf(ApiError);
        expect(client.getQueryData(meQuery().queryKey)).toEqual({ user: null });
    });

    it('keeps the session on any other error', async () => {
        const client = signedInClient();
        const read = client.fetchQuery({
            queryKey: ['me', 'backlog'],
            queryFn: () => Promise.reject(new ApiError(403, 'origin')),
        });
        await expect(read).rejects.toBeInstanceOf(ApiError);
        expect(client.getQueryData(meQuery().queryKey)).toEqual(SIGNED_IN);
    });
});
