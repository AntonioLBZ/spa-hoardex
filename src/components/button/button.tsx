import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

import './button.scss';

function buttonClass(className: string | undefined) {
    return className === undefined ? 'button' : `button ${className}`;
}

export function Button({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...rest} className={buttonClass(className)} type={type} />;
}

// A link that looks like a button
export function ButtonLink({ className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a {...rest} className={buttonClass(className)} />;
}
