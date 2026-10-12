// Shared by every dashboard tooltip; Recharts takes inline styles, so they read the theme through CSS variables
export const TOOLTIP_PROPS = {
    contentStyle: {
        backgroundColor: 'var(--color-bg-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--size-border-radius)',
        color: 'var(--color-content)',
    },
    cursor: { fill: 'var(--color-border)', opacity: 0.4 },
    // Otherwise the item takes the bar's `fill` prop, which a bar coloured per row does not have
    itemStyle: { color: 'var(--color-accent)' },
};
