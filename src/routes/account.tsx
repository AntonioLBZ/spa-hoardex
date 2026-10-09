import { createFileRoute } from '@tanstack/react-router';

import { AccountPage } from '@/features/account-page';

export const Route = createFileRoute('/account')({ component: AccountPage });
