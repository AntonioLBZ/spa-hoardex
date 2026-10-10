import { clsx } from 'clsx';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

import './segmented-control.scss';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
    legend: string;
    options: readonly SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

// Native radios in a bordered track
export function SegmentedControl<T extends string>({
    legend,
    options,
    value,
    onChange,
    className,
}: SegmentedControlProps<T>) {
    const name = useId();

    return (
        <fieldset className={clsx('segmented', className)}>
            <legend className="visually-hidden">{legend}</legend>
            {options.map((option) => (
                <label className="segmented__option" key={option.value}>
                    <input
                        checked={value === option.value}
                        className="segmented__input visually-hidden"
                        name={name}
                        onChange={() => onChange(option.value)}
                        type="radio"
                    />
                    <span className="segmented__segment">
                        {option.icon}
                        <span className="segmented__text">{option.label}</span>
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

// The same track around other controls; children can size themselves with --segmented-height and --segmented-inset
export function SegmentedTrack({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={clsx('segmented', className)}>{children}</div>;
}

// A plain button shaped like a segment, for a SegmentedTrack
export function SegmentedButton({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...rest} className={clsx('segmented__segment', className)} type={type} />;
}
