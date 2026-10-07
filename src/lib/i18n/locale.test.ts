import { describe, expect, it } from 'vitest';

import { detectLocale } from './locale';

describe('detectLocale', () => {
    it('prefers a stored locale over the browser languages', () => {
        expect(detectLocale('es', ['en-US'])).toBe('es');
    });

    it('ignores a stored value that is not a supported locale', () => {
        expect(detectLocale('fr', ['es-ES'])).toBe('es');
    });

    it('matches the language part of a regional tag, ignoring case', () => {
        expect(detectLocale(null, ['ES-mx'])).toBe('es');
    });

    it('takes the first supported language in the browser order', () => {
        expect(detectLocale(null, ['fr-FR', 'es', 'en'])).toBe('es');
    });

    it('falls back to English', () => {
        expect(detectLocale(null, ['fr-FR', 'de'])).toBe('en');
        expect(detectLocale(null, [])).toBe('en');
    });
});
