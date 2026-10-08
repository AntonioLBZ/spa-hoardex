// The files the browser and crawlers fetch before any script runs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../src/assets/locales/en.json' with { type: 'json' };

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('static head and public files', () => {
    it('links a favicon that exists in public/', () => {
        const href = /<link rel="icon" href="\/([^"]+)"/.exec(read('index.html'))?.[1];
        expect(href).toBeDefined();
        expect(existsSync(fileURLToPath(new URL(`../public/${href}`, import.meta.url)))).toBe(true);
    });

    it('draws the favicon and the header logo from the same chest', () => {
        // The mask with its cuts and the group with the two shapes
        const chest = (file: string) => read(file).match(/<mask[\s\S]*?<\/mask>|<g mask[\s\S]*?<\/g>/g);
        expect(chest('public/logo.svg')).toHaveLength(2);
        expect(chest('public/logo.svg')).toEqual(chest('public/favicon.svg'));
    });

    it('describes the site and colours the browser bar for both themes', () => {
        const html = read('index.html');
        expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{20,}"/);
        expect(html).toMatch(/theme-color[^>]+prefers-color-scheme: light/);
        expect(html).toMatch(/theme-color[^>]+prefers-color-scheme: dark/);
    });

    it('writes the description in index.html as the English message', () => {
        const content = /<meta\s+name="description"\s+content="([^"]+)"/.exec(read('index.html'))?.[1];
        expect(content).toBe(en.metadata.description);
    });

    it('keeps crawlers out of profile pages and the API', () => {
        const rules = read('public/robots.txt').split('\n');
        expect(rules).toContain('User-agent: *');
        expect(rules).toContain('Disallow: /p/');
        expect(rules).toContain('Disallow: /api/');
    });
});
