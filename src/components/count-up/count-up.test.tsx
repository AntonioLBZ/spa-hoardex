import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CountUp } from './count-up';

const animate = vi.hoisted(() => vi.fn());

vi.mock('motion/react', () => ({ animate }));

function stubMotion(reduced: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reduced, addEventListener: () => undefined, removeEventListener: () => undefined }))
    );
}

const plain = (value: number) => String(Math.round(value));

afterEach(() => {
    vi.unstubAllGlobals();
    animate.mockReset();
});

describe('CountUp', () => {
    it('renders the plain value and runs nothing with reduced motion', () => {
        stubMotion(true);
        const { container } = render(<CountUp format={plain} value={171} />);

        expect(container.textContent).toBe('171');
        expect(container.querySelector('[aria-hidden]')).toBeNull();
        expect(animate).not.toHaveBeenCalled();
    });

    it('keeps the final value readable and hides the ticking copy from assistive tech', () => {
        stubMotion(false);
        animate.mockReturnValue({ stop: () => undefined });
        const { container } = render(<CountUp format={plain} value={171} />);

        expect(container.querySelector('.count-up__final')?.textContent).toBe('171');
        expect(container.querySelector('.count-up__final')?.closest('[aria-hidden]')).toBeNull();
        expect(container.querySelector('.count-up__tick')?.getAttribute('aria-hidden')).toBe('true');
        expect(container.querySelector<HTMLElement>('.count-up')?.dataset.running).toBe('');
    });

    it('counts from zero to the value, after the delay', () => {
        stubMotion(false);
        animate.mockReturnValue({ stop: () => undefined });
        render(<CountUp delay={0.2} format={plain} value={171} />);

        expect(animate).toHaveBeenCalledWith(0, 171, expect.objectContaining({ delay: 0.2 }));
    });

    it('does not count again when it renders with the same value', () => {
        stubMotion(false);
        animate.mockReturnValue({ stop: () => undefined });
        const { rerender } = render(<CountUp format={plain} value={171} />);
        rerender(<CountUp format={(value) => `${Math.round(value)}`} value={171} />);

        expect(animate).toHaveBeenCalledTimes(1);
    });

    it('counts on from what is shown when the value changes', () => {
        stubMotion(false);
        animate.mockImplementation((_from: number, _to: number, options: { onUpdate: (value: number) => void }) => {
            options.onUpdate(40);
            return { stop: () => undefined };
        });
        const { rerender } = render(<CountUp format={plain} value={100} />);
        rerender(<CountUp format={plain} value={150} />);

        expect(animate).toHaveBeenLastCalledWith(40, 150, expect.any(Object));
    });

    it('stops counting on unmount', () => {
        stubMotion(false);
        const stop = vi.fn();
        animate.mockReturnValue({ stop });
        render(<CountUp format={plain} value={171} />).unmount();

        expect(stop).toHaveBeenCalled();
    });
});
