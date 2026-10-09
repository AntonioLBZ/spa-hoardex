import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../src/assets/locales/en.json' with { type: 'json' };

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('static head and public files', () => {
    it('links icons that all exist in public/', () => {
        const hrefs = [...read('index.html').matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g)].map(
            (match) => match[1]
        );
        expect(hrefs).toEqual(['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']);
        for (const href of hrefs) {
            expect(existsSync(fileURLToPath(new URL(`../public/${href}`, import.meta.url)))).toBe(true);
        }
    });

    it('gives iOS a 180 px PNG', () => {
        const png = readFileSync(fileURLToPath(new URL('../public/apple-touch-icon.png', import.meta.url)));
        expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
    });

    it('packs the .ico with the 16, 32 and 48 px frames', () => {
        const ico = readFileSync(fileURLToPath(new URL('../public/favicon.ico', import.meta.url)));
        expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
        expect([0, 1, 2].map((index) => ico.readUInt8(6 + index * 16))).toEqual([16, 32, 48]);
    });

    it('draws the favicon and the header logo from the same chest', () => {
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
