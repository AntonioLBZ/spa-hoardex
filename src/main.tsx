import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { startAnalytics } from './lib/analytics';
import { LocaleProvider } from './lib/i18n';
import { createQueryClient } from './lib/query-client';
import { createAppRouter } from './router';

import './assets/styles/main.scss';

const queryClient = createQueryClient();
const router = createAppRouter();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <LocaleProvider>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </LocaleProvider>
    </StrictMode>
);

startAnalytics(router);
