import { useLayoutEffect, useRef, type RefObject } from 'react';

import { isBusy } from '@/lib/motion/busy';
import { gsap, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE, MOTION_QUERY, STAGGER } from '@/lib/motion/tokens';

// Past this many cards entering at once (a fast scroll), they simply appear
const MAX_STAGGERED = 48;

// Delay per card for a diagonal wave, from the rectangles the observer already measured: GSAP's `grid` stagger would read the layout
export function waveDelays(entries: IntersectionObserverEntry[]): number[] {
    const sorted = (values: number[]) => Array.from(new Set(values.map(Math.round))).sort((a, b) => a - b);
    const columns = sorted(entries.map((entry) => entry.boundingClientRect.left));
    const rows = sorted(entries.map((entry) => entry.boundingClientRect.top));
    const ranks = entries.map(
        ({ boundingClientRect: { left, top } }) => columns.indexOf(Math.round(left)) + rows.indexOf(Math.round(top))
    );
    const step = Math.min(STAGGER.card, STAGGER.cardsTotal / Math.max(...ranks, 1));
    return ranks.map((rank) => rank * step);
}

interface Reveal {
    hide: (cards: Element[]) => void;
    fadeList: () => void;
}

// New cards fade in, in a wave, as they enter the screen; cards already shown never animate again.
// A new filter or order fades the whole list once. Only opacity: a translation cost 300 ms of long frames at CPU x6.
// Nothing is hidden without motion or IntersectionObserver
export function useGridReveal(grid: RefObject<HTMLUListElement | null>, fadeKey: string) {
    const reveal = useRef<Reveal | null>(null);
    const shown = useRef(new WeakSet<Element>());
    // Hidden by the current setup; a new setup starts empty, as its styles were reverted
    const hidden = useRef(new WeakSet<Element>());
    const lastFadeKey = useRef(fadeKey);

    useGSAP(
        () => {
            const media = gsap.matchMedia();
            media.add(MOTION_QUERY, (_context, contextSafe) => {
                if (typeof IntersectionObserver === 'undefined' || contextSafe === undefined) return;
                hidden.current = new WeakSet();
                // The typings return a bare `Function`
                const safe = <T extends (...args: never[]) => void>(callback: T) => contextSafe(callback) as T;

                const show = safe((entries: IntersectionObserverEntry[]) => {
                    const cards = entries.map((entry) => entry.target);
                    cards.forEach((card) => shown.current.add(card));
                    if (isBusy() || cards.length > MAX_STAGGERED) {
                        gsap.set(cards, { clearProps: 'opacity' });
                        return;
                    }
                    const delays = waveDelays(entries);
                    gsap.to(cards, {
                        opacity: 1,
                        duration: DURATION.reveal,
                        ease: EASE.settleGsap,
                        clearProps: 'opacity',
                        stagger: (index: number) => delays[index] ?? 0,
                    });
                });

                const observer = new IntersectionObserver(
                    (entries) => {
                        const entering: IntersectionObserverEntry[] = [];
                        for (const entry of entries) {
                            if (entry.isIntersecting) entering.push(entry);
                            if (entry.isIntersecting || !entry.target.isConnected) observer.unobserve(entry.target);
                        }
                        if (entering.length > 0) show(entering);
                    },
                    { threshold: 0.1 }
                );

                reveal.current = {
                    hide: safe((cards: Element[]) => {
                        gsap.set(cards, { opacity: 0 });
                        cards.forEach((card) => {
                            hidden.current.add(card);
                            observer.observe(card);
                        });
                    }),
                    fadeList: safe(() => {
                        if (grid.current === null) return;
                        gsap.fromTo(
                            grid.current,
                            { opacity: 0.55 },
                            {
                                opacity: 1,
                                duration: DURATION.swift,
                                ease: EASE.settleGsap,
                                clearProps: 'opacity',
                                overwrite: true,
                            }
                        );
                    }),
                };

                return () => {
                    observer.disconnect();
                    reveal.current = null;
                };
            });
            return () => media.revert();
        },
        { scope: grid }
    );

    // After every commit: hides cards that just mounted, before they are painted
    useLayoutEffect(() => {
        const fresh = Array.from(grid.current?.children ?? []).filter(
            (card) => !shown.current.has(card) && !hidden.current.has(card)
        );
        if (fresh.length > 0) reveal.current?.hide(fresh);
    });

    useLayoutEffect(() => {
        if (lastFadeKey.current === fadeKey) return;
        lastFadeKey.current = fadeKey;
        reveal.current?.fadeList();
    }, [fadeKey]);
}
