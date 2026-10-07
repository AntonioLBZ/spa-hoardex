import { useState } from 'react';

// Spike 0A: calls the API on the same origin and shows the raw result
export function App() {
    const [out, setOut] = useState('');

    async function call(path: string) {
        const res = await fetch(path);
        const body = await res.text();
        setOut(`${res.status} ${path}\nx-vercel-cache: ${res.headers.get('x-vercel-cache')}\n\n${body}`);
    }

    return (
        <main>
            <h1>Hoardex spike</h1>
            <button onClick={() => call('/api/health')}>/api/health</button>
            <button onClick={() => call('/api/resolve/gabelogannewell')}>/api/resolve/gabelogannewell</button>
            <pre>{out}</pre>
        </main>
    );
}
