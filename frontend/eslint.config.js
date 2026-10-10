import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Design tokens live in src/design/tokens.css only. Anywhere else a hex colour or an arbitrary
// pixel value (Tailwind `w-[104px]`) is a bug.
const HEX = '#[0-9a-fA-F]{3,8}\\b';
const ARBITRARY = '\\[-?[0-9.]+(px|rem|em)\\]';
const tokenRule = (re) => [
  { selector: `Literal[value=/${re}/]`, message: 'Use a design token (src/design/tokens.css).' },
  {
    selector: `TemplateElement[value.raw=/${re}/]`,
    message: 'Use a design token (src/design/tokens.css).',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'no-restricted-syntax': ['error', ...tokenRule(HEX), ...tokenRule(ARBITRARY)],
    },
  },
  {
    // tokens may be written out where they are defined / compared
    files: ['src/design/tokens.test.ts', '*.config.{js,ts}', 'src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  { files: ['**/*.{js,mjs}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
