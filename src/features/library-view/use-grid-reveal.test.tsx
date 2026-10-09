import { render } from '@testing-library/react';
import { useRef } from 'react';
import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGridReveal, waveDelays } from './use-grid-reveal';

const busy = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/motion/busy', () => ({ isBusy: () => busy.value }));

class FakeObserver {
    static instances: FakeObserver[] = [];
    observed: Element[] = [];

    constructor(private readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        FakeObserver.instances.push(this);
    }

    observe(target: Element) {
        this.observed.push(target);
    }

    unobserve(target: Element) {
        this.observed = this.observed.filter((observed) => observed !== target);
    }

    disconnect() {
        this.observed = [];
    }

    enter(...targets: Element[]) {
        this.callback(
            targets.map((target, index) => ({
                isIntersecting: true,
                target,
                boundingClientRect: { left: (index % 2) * 160, top: Math.floor(index / 2) * 300 } as DOMRectReadOnly,
            }))
        );
    }
}

function stubMotion(reduced: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduced ? /:\s*reduce\)/.test(query) : /no-preference/.test(query),
        media: query,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
}

function Grid({ count, fadeKey = 'a' }: { count: number; fadeKey?: string }) {
    const grid = useRef<HTMLUListElement>(null);
    useGridReveal(grid, fadeKey);

    return (
        <ul data-testid="grid" ref={grid}>
            {Array.from({ length: count }, (_, index) => (
                <li key={index}>{index}</li>
            ))}
        </ul>
    );
}

const observer = () => FakeObserver.instances.at(-1)!;
const cards = (container: HTMLElement) => Array.from(container.querySelectorAll('li'));

beforeEach(() => {
    FakeObserver.instances = [];
    busy.value = false;
    vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
    gsap.globalTimeline.clear();
});

describe('useGridReveal', () => {
    it('hides the cards that mount and watches them', () => {
        stubMotion(false);
        const { container } = render(<Grid count={3} />);

        expect(cards(container).map((card) => card.style.opacity)).toEqual(['0', '0', '0']);
        expect(observer().observed).toHaveLength(3);
    });

    it('rises a card when it enters the screen and stops watching it', () => {
        stubMotion(false);
        const { container } = render(<Grid count={3} />);
        const [first] = cards(container);
        observer().enter(first!);

        expect(gsap.getTweensOf(first!)).toHaveLength(1);
        expect(observer().observed).toHaveLength(2);
    });

    it('delays cards along the diagonal of their rows and columns', () => {
        const rect = (left: number, top: number) =>
            ({ boundingClientRect: { left, top } }) as IntersectionObserverEntry;
        const delays = waveDelays([rect(0, 0), rect(160, 0), rect(0, 300), rect(160, 300)]);

        expect(delays[0]).toBe(0);
        expect(delays[1]).toBeCloseTo(0.035);
        expect(delays[2]).toBeCloseTo(0.035);
        expect(delays[3]).toBeCloseTo(0.07);
    });

    it('squeezes a long wave into the cap on its total time', () => {
        const rect = (left: number, top: number) =>
            ({ boundingClientRect: { left, top } }) as IntersectionObserverEntry;
        const delays = waveDelays([rect(0, 0), rect(160, 0), rect(320, 0), rect(480, 0), rect(640, 0), rect(800, 0)]);

        expect(Math.max(...delays)).toBeCloseTo(0.175);
        const tall = waveDelays(Array.from({ length: 12 }, (_, row) => rect(0, row * 300)));
        expect(Math.max(...tall)).toBeCloseTo(0.3);
    });

    it('shows a card at once when the main thread is busy', () => {
        stubMotion(false);
        busy.value = true;
        const { container } = render(<Grid count={2} />);
        const [first] = cards(container);
        observer().enter(first!);

        expect(first!.style.opacity).toBe('');
        expect(gsap.getTweensOf(first!)).toHaveLength(0);
    });

    it('hides only the cards that are new when more arrive', () => {
        stubMotion(false);
        const { container, rerender } = render(<Grid count={3} />);
        const [first] = cards(container);
        observer().enter(first!);
        rerender(<Grid count={5} />);

        expect(cards(container).map((card) => card.style.opacity)).toEqual(['0', '0', '0', '0', '0']);
        expect(observer().observed).toHaveLength(4);
    });

    it('does not hide a card again once it has been shown', () => {
        stubMotion(false);
        busy.value = true;
        const { container, rerender } = render(<Grid count={2} />);
        observer().enter(...cards(container));
        rerender(<Grid count={2} fadeKey="a" />);

        expect(cards(container).map((card) => card.style.opacity)).toEqual(['', '']);
        expect(observer().observed).toHaveLength(0);
    });

    it('fades the list once when the filter or order changes, not on first render or the same key', () => {
        stubMotion(false);
        const { getByTestId, rerender } = render(<Grid count={2} />);
        expect(gsap.getTweensOf(getByTestId('grid'))).toHaveLength(0);

        rerender(<Grid count={2} />);
        expect(gsap.getTweensOf(getByTestId('grid'))).toHaveLength(0);

        rerender(<Grid count={2} fadeKey="b" />);
        expect(gsap.getTweensOf(getByTestId('grid'))).toHaveLength(1);
    });

    it('leaves everything visible with reduced motion', () => {
        stubMotion(true);
        const { container } = render(<Grid count={3} />);

        expect(cards(container).map((card) => card.style.opacity)).toEqual(['', '', '']);
        expect(FakeObserver.instances).toHaveLength(0);
    });

    it('leaves everything visible where IntersectionObserver does not exist', () => {
        stubMotion(false);
        vi.stubGlobal('IntersectionObserver', undefined);
        const { container } = render(<Grid count={3} />);

        expect(cards(container).map((card) => card.style.opacity)).toEqual(['', '', '']);
    });

    it('restores the cards when it unmounts', () => {
        stubMotion(false);
        const { container, unmount } = render(<Grid count={2} />);
        const [first, second] = cards(container);
        unmount();

        expect(first!.style.opacity).toBe('');
        expect(second!.style.opacity).toBe('');
    });
});
