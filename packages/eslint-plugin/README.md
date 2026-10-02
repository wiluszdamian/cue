# @wiluszdamian/cue-eslint-plugin

ESLint rules generated from the [Cue](https://github.com/wiluszdamian/project-cue)
constitution. They work with no agent involved: a test that breaks a convention fails
the build, and every message says what is wrong and what to write instead.

```bash
npm install --save-dev @wiluszdamian/cue-eslint-plugin
```

```js
// eslint.config.mjs
import cue from '@wiluszdamian/cue-eslint-plugin';

export default [...cue.configs.recommended];
```

`recommended` uses each rule's own severity; `strict` promotes every rule to error.
`npx @wiluszdamian/cue init` writes this config for you when the project has none.

Every rule, with examples: [rule reference](https://github.com/wiluszdamian/project-cue/blob/main/docs/reference/constitution.md).

## Contributing

The rules are generated. Edit `rules/constitution.yaml` at the repository root and run
`pnpm generate` — never `src/generated/constitution.ts`.
