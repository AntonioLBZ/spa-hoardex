import { useId, type ReactNode } from 'react';

import './switch.scss';

interface SwitchProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    // Ignores changes but keeps focus, unlike `disabled`
    busy?: boolean;
    // Shown under the label and read as the switch's description
    description?: ReactNode;
}

// A checkbox with the switch role: on and off, applied at once
export function Switch({ label, checked, onChange, busy = false, description }: SwitchProps) {
    const id = useId();

    return (
        <div className="switch">
            <input
                aria-describedby={description === undefined ? undefined : `${id}-description`}
                aria-disabled={busy}
                checked={checked}
                className="switch__input"
                id={id}
                onChange={(event) => {
                    if (!busy) onChange(event.target.checked);
                }}
                role="switch"
                type="checkbox"
            />
            <label className="switch__label" htmlFor={id}>
                {label}
            </label>
            {description === undefined ? null : (
                <p className="switch__description" id={`${id}-description`} role="status">
                    {description}
                </p>
            )}
        </div>
    );
}
