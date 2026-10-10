import { useEffect, useState, type RefObject } from 'react';

export interface ScrollEdges {
    // Content hidden before or after what the row shows
    start: boolean;
    end: boolean;
}

const NONE: ScrollEdges = { start: false, end: false };

// Which ends of a sideways scroller hide content; `content` changes when its children do
export function useScrollEdges(ref: RefObject<HTMLElement | null>, content: string): ScrollEdges {
    const [edges, setEdges] = useState(NONE);

    useEffect(() => {
        const element = ref.current;
        if (element === null) return;
        const update = () => {
            const max = element.scrollWidth - element.clientWidth;
            const start = element.scrollLeft > 1;
            const end = element.scrollLeft < max - 1;
            setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
        };
        update();
        element.addEventListener('scroll', update, { passive: true });
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        observer?.observe(element);
        return () => {
            element.removeEventListener('scroll', update);
            observer?.disconnect();
        };
    }, [ref, content]);

    return edges;
}
