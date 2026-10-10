import { clsx } from 'clsx';
import { useId, type InputHTMLAttributes, type MouseEvent, type ReactNode, type Ref } from 'react';

import './text-field.scss';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-invalid' | 'className' | 'id'> {
    label: string;
    // Still read by assistive tech; the placeholder should then say the same
    hideLabel?: boolean;
    // Decorative, before the text
    icon?: ReactNode;
    // A control inside the frame, after the text; it drops below the text in a narrow field
    end?: ReactNode;
    // Hint, or the error when `invalid`
    message?: ReactNode;
    invalid?: boolean;
    // With a shadow, for a field that stands alone
    raised?: boolean;
    className?: string;
    ref?: Ref<HTMLInputElement>;
}

// A click on the icon or the padding still reaches the text
function focusInput(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('input, button, a, select') !== null) return;
    event.currentTarget.querySelector('input')?.focus();
}

export function TextField({
    label,
    hideLabel = false,
    icon,
    end,
    message,
    invalid = false,
    raised = false,
    className,
    ref,
    'aria-describedby': describedBy,
    ...input
}: TextFieldProps) {
    const id = useId();
    const messageId = message === undefined ? undefined : `${id}-message`;

    return (
        <div className={clsx('text-field', raised && 'text-field--raised', className)}>
            <label className={hideLabel ? 'visually-hidden' : 'text-field__label'} htmlFor={id}>
                {label}
            </label>
            <div
                className={clsx('text-field__frame', end !== undefined && 'text-field__frame--with-end')}
                onClick={focusInput}
            >
                {icon === undefined ? null : (
                    <span aria-hidden="true" className="text-field__icon">
                        {icon}
                    </span>
                )}
                <input
                    {...input}
                    aria-describedby={clsx(describedBy, messageId) || undefined}
                    aria-invalid={invalid}
                    className="text-field__input"
                    id={id}
                    ref={ref}
                />
                {end === undefined ? null : <span className="text-field__end">{end}</span>}
            </div>
            {message === undefined ? null : (
                <p
                    className={clsx('text-field__message', invalid && 'text-field__message--error')}
                    id={messageId}
                    role={invalid ? 'alert' : undefined}
                >
                    {message}
                </p>
            )}
        </div>
    );
}
