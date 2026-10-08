import { createFileRoute } from '@tanstack/react-router';

import { PolicyPage } from '@/features/policy-page';

export const Route = createFileRoute('/privacy')({ component: PolicyPage });
