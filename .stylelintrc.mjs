const config = {
    extends: 'stylelint-config-standard-scss',
    plugins: ['stylelint-order', 'stylelint-selector-bem-pattern'],
    rules: {
        // Keep everything in order
        'order/order': [
            {
                type: 'at-rule',
                name: 'extend',
            },
            {
                type: 'at-rule',
                name: 'include',
            },
            'custom-properties',
            'declarations',
        ],
        'order/properties-alphabetical-order': true,
        'function-no-unknown': true,

        /* Declarations */
        'declaration-no-important': true,

        /* Block-Element-Modifier (BEM) */
        'selector-class-pattern': '^([a-z-]*[a-z]+)?(__[a-z-]*[a-z]+)?(--[a-z-]*[a-z]+)?$',
        'plugin/selector-bem-pattern': {
            componentName: '^[a-z]+(?:-[a-z]+)*$',
            componentSelectors: '^([.][a-z-]*[a-z]+)?(__[a-z-]*[a-z]+)?(--[a-z-]*[a-z]+)?$',
        },
    },
};

export default config;
