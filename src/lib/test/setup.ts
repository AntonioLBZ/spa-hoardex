import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement it and the router calls it on navigation
window.scrollTo = () => undefined;

afterEach(cleanup);
