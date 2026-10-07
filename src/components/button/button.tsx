import type { ButtonHTMLAttributes } from 'react';

import './button.scss';

export function Button({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...rest} className={className === undefined ? 'button' : `button ${className}`} type={type} />;
}
