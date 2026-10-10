import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
    it('reports the new value', async () => {
        const onChange = vi.fn();
        render(<Switch checked={false} label="History" onChange={onChange} />);

        await userEvent.click(screen.getByRole('switch', { name: 'History' }));

        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('ignores changes while busy but keeps focus', async () => {
        const onChange = vi.fn();
        render(<Switch busy checked={false} label="History" onChange={onChange} />);
        const control = screen.getByRole('switch', { name: 'History' });

        await userEvent.click(control);

        expect(onChange).not.toHaveBeenCalled();
        expect(control.getAttribute('aria-disabled')).toBe('true');
        expect(document.activeElement).toBe(control);
    });
});
