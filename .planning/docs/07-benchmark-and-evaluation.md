# 07 — Benchmark and Evaluation

## Goal

The benchmark should measure whether Cue materially improves generated Playwright work.

Do not treat policy compliance alone as proof of product value.

## Experimental design

Compare:

```text
same model + same task + same repository
```

under two conditions:

```text
A: vanilla repository
B: repository + Cue
```

Use repeated runs.

Store:

- model name/version,
- prompt/task,
- repository commit,
- Cue version,
- Playwright version,
- number of attempts,
- full generated output,
- execution results,
- token usage if available,
- timings,
- failures.

Do not discard unfavorable results.

## Recommended metrics

| Metric | Meaning |
| --- | --- |
| Compile success | Generated code is structurally valid |
| First-run pass rate | Test works without repair |
| Intended bug detection | Test catches the target defect |
| Locator existence | Referenced UI element exists |
| Locator uniqueness | Locator identifies intended element reliably |
| Invented locator rate | Hallucinated application facts |
| Browser exploration count | Cost of rediscovery |
| Knowledge reuse rate | Existing Cue knowledge reused |
| Token/context usage | Model context cost |
| Repair iterations | How much fixing is needed |
| Flaky rerun rate | Reliability |
| Policy violations | Governance quality |
| Time-to-valid-test | End-to-end productivity |

## Mutation-based validation

A green test is not enough.

For selected tasks:

1. Generate the test.
2. Confirm it passes against the correct application.
3. Introduce a controlled defect.
4. Confirm the test fails for the intended reason.

Example:

```diff
- authentication succeeds
+ authentication silently fails
```

A useful test should fail.

## Benchmark tasks

Include different task classes:

- login,
- form validation,
- role-restricted behavior,
- navigation,
- CRUD flow,
- API/UI combined flow,
- stale locator scenario,
- changed route,
- conflicting documentation,
- feature flag or environment variant.

## Benchmark output

Produce a reproducible report.

Example:

```text
Task: password change
Model: <version>
Runs: 10

Vanilla
  compile success      8/10
  first-run pass       4/10
  invented locators    7
  browser explorations 31
  mutation detected    3/10

Cue
  compile success      10/10
  first-run pass        8/10
  invented locators     1
  browser explorations  9
  mutation detected     8/10
```

The numbers above are illustrative only.

## Release requirement

Do not make strong product claims until at least one real benchmark has been run against a representative application using real model outputs.
