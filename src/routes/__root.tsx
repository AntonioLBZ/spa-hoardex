import { Outlet, createRootRoute } from '@tanstack/react-router';

import { Footer } from '@/features/footer';
import { Header } from '@/features/header';

import './root.scss';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
    return (
        <div className="root">
            <Header />
            <main className="root__main">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
