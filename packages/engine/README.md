# @wiluszdamian/cue-engine

The core of [Cue](https://github.com/wiluszdamian/cue): the constitution loader,
detectors, analyzer, reporters and the knowledge base model. The CLI
([`@wiluszdamian/cue`](https://www.npmjs.com/package/@wiluszdamian/cue)), the ESLint plugin
and the MCP server are built on it; most projects install one of those rather than this.

It also ships a small bin, `cue-engine`:

```text
cue-engine validate  <rulesDir>              check rules/ loads and is internally consistent
cue-engine analyze   <rulesDir> [glob...]    run the constitution over files
cue-engine who-owns  <rulesDir> <question>   resolve a topic against the ownership table
```

`analyze` takes `--reporter pretty | json | sarif | github | agent`.
