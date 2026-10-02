# Test recordings — not results

**These are hand-written fixtures that exercise the scoring harness.**

They are not benchmark results. No number derived from them means anything about
whether Cue works.

They exist so the scoring, the comparison and the report can be tested without a
model or an API key. They were written by the same person who wrote the scoring,
which is precisely why they cannot be evidence: a fixture proves the code does
what its author intended, never that the intention was right about the world.

A real run is two commands, against a directory that is not this one:

```
cue-benchmark record <dir> --project <project>
cue-benchmark <dir> --project <project>
```

The first needs credentials and costs money; the second needs neither.

Real recordings should live outside this directory, and should carry the model
name and the date. Until such a run exists, the project makes no claim that
assistants write better tests with Cue — see the note on the landing page.
