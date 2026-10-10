import type { CSSProperties } from 'react';

import './radio-chip.scss';

interface RadioChipProps {
    name: string;
    label: string;
    checked: boolean;
    onChange: () => void;
    // Already formatted
    count?: string;
    // A dot of this colour before the label; the chosen chip is tinted with it
    color?: string;
}

// One choice of a radio group drawn as a pill
export function RadioChip({ name, label, checked, onChange, count, color }: RadioChipProps) {
    const style = color === undefined ? undefined : ({ '--chip-color': color } as CSSProperties);

    return (
        <label className="radio-chip">
            <input
                checked={checked}
                className="radio-chip__input visually-hidden"
                name={name}
                onChange={onChange}
                type="radio"
            />
            <span className="radio-chip__label" style={style}>
                {color === undefined ? null : <span aria-hidden="true" className="radio-chip__swatch" />}
                {label} {count === undefined ? null : <span className="radio-chip__count">{count}</span>}
            </span>
        </label>
    );
}
