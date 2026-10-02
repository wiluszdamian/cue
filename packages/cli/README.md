# @wiluszdamian/cue

Preflight, scaffolding and agent wiring for [Cue](https://github.com/wiluszdamian/project-cue):
your Playwright conventions as ESLint rules an agent can't skip, plus a knowledge base of
your app's real routes and selectors.

The package installs a bin called `cue`. The bare name `cue` on npm is an unrelated
package, so in a project that has not installed this one yet, always spell it out:

```bash
npx @wiluszdamian/cue init
```

`init` detects your agents, shows a plan, and writes nothing until you say yes. Then:

```bash
npx @wiluszdamian/cue doctor
```

Every problem `doctor` reports comes with the command that fixes it. Once installed,
`cue <command>` resolves to the local bin; `cue --help` lists every command.

Documentation: [getting started](https://github.com/wiluszdamian/project-cue/blob/main/docs/start/install.md),
[commands](https://github.com/wiluszdamian/project-cue/blob/main/docs/help/commands.md).
