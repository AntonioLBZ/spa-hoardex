import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TextField } from './text-field';

describe('TextField', () => {
    it('focuses the text when the icon is clicked', async () => {
        render(<TextField icon={<svg data-testid="icon" />} label="Search" />);

        await userEvent.click(screen.getByTestId('icon'));

        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }));
    });

    it('leaves a control inside the frame its own click', async () => {
        render(<TextField end={<button type="button">Go</button>} label="Profile" />);

        await userEvent.click(screen.getByRole('button', { name: 'Go' }));

        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Go' }));
    });

    it('keeps a given description next to its message', () => {
        render(
            <>
                <p id="outside">Outside hint</p>
                <TextField aria-describedby="outside" label="Name" message="Own hint" />
            </>
        );

        expect(screen.getByRole('textbox').getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
        expect(screen.getByRole('textbox', { description: 'Outside hint Own hint' })).toBeTruthy();
    });

    it('marks the text invalid and announces the error', () => {
        render(<TextField invalid label="Name" message="Not a profile" />);

        expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByRole('alert').textContent).toBe('Not a profile');
    });
});
