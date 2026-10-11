import typescriptEslint from 'typescript-eslint';

export default [
    {
        ignores: ['dist/', 'out/', '.vscode-test/', 'samples/'],
    },
    {
        files: ['**/*.ts'],
    },
    {
        plugins: {
            '@typescript-eslint': typescriptEslint.plugin,
        },

        languageOptions: {
            parser: typescriptEslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },

        rules: {
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],

            '@typescript-eslint/no-explicit-any': 'error',

            curly: 'error',
            eqeqeq: 'error',
            'no-throw-literal': 'error',
            semi: 'error',
        },
    },
];
