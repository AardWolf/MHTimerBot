module.exports = {
    'env': {
        'node': true,
        'commonjs': true,
        'es6': true
    },
    'extends': 'eslint:recommended',
    'globals': {
        'Atomics': 'readonly',
        'SharedArrayBuffer': 'readonly'
    },
    'parserOptions': {
        'ecmaVersion': 2018
    },
    'rules': {
        'indent': [
            'error',
            4,
            { "SwitchCase": 1 }
        ],
        'quotes': [
            'error',
            'single'
        ],
        'semi': [
            'error',
            'always'
        ],
        'no-var': [
            'warn'
        ],
        'prefer-const': [
            'error'
        ],
        'array-bracket-newline': [
            'error',
            'consistent'
        ],
        'comma-dangle': [
            'error',
            'always-multiline'
        ],
        'object-curly-spacing': [
            'error',
            'always'
        ],
        'object-curly-newline': [
            'error'
        ],
        'no-unneeded-ternary': [
            'error'
        ]
    }
};
