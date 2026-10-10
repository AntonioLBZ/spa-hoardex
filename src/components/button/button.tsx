import { clsx } from 'clsx';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import './button.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'medium' | 'small';

interface ButtonLook {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
}

// For router links and other elements that must look like a button
export function buttonClass({ variant = 'primary', size = 'medium', className }: ButtonLook = {}): string {
    return clsx('button', `button--${variant}`, size === 'small' && 'button--small', className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook;

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
    return <button {...rest} className={buttonClass({ variant, size, className })} type={type} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & ButtonLook;

// A link that looks like a button
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
    return <a {...rest} className={buttonClass({ variant, size, className })} />;
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    // The accessible name: the button shows only its icon
    label: string;
    children: ReactNode;
}

export function IconButton({ label, className, type = 'button', children, ...rest }: IconButtonProps) {
    return (
        <button {...rest} aria-label={label} className={clsx('icon-button', className)} title={label} type={type}>
            {children}
        </button>
    );
}
