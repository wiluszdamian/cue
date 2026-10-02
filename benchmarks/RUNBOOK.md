# Running the first real benchmark

Everything up to the paid call is automated and free. The paid call is yours to run:
`record` is the only place this repository spends money, and nothing here holds
credentials. This page is the whole procedure, in order.

What it measures: the same model, asked the same seven tasks on the demo application,
once with nothing and once with Understudy's `AGENTS.md` and knowledge base in front of
it, five times each. Every answer is compiled, run once in a real browser, and — where the
task names a defect — run again with the defect switched on. See
[the guide](../docs/guides/does-it-work.md) for what each number means.

## 0. Once

```bash
pnpm install
pnpm build
pnpm --filter @understudy/demo-app exec playwright install chromium
```

Credentials come from the Anthropic SDK: set `ANTHROPIC_API_KEY`, or use an `ant auth
login` profile.

## 1. Check the machinery for free

```bash
pnpm verify
pnpm --filter @understudy/benchmark test:integration
```

Both must be green before anything is spent. The second one drives a real browser against
the demo application with hand-written answers: it proves the harness can tell a test that
works from one that does not.

## 2. Build the project the model is shown

```bash
node scripts/prepare-benchmark-project.mjs
```

This writes `benchmarks/project/`: Understudy installed, and a knowledge base of the demo
application made the way a user would make one (`extract`, then `survey` for the pages that
need no session, then the pages behind a login from captured snapshots). No model is called.
Look at `benchmarks/project/.agent-kb/app-map/` before going on: this is what the model
is told is true.

## 3. Record the answers (this is the paid step)

```bash
RESULTS=benchmarks/results/$(date +%F)-claude-opus-5-5
pnpm --filter @understudy/benchmark exec understudy-benchmark record "$RESULTS/recordings" \
  --project benchmarks/project --prompt-set 2 --runs 5 --model claude-opus-5-5
```

It prints the number of calls before it makes any: 7 prompts × 2 conditions × 5 runs = **70**.
Roughly, the input is small (about 70 tokens per call without Understudy, about 1,600 with it,
so ~65,000 in total) and the output is whatever the model writes: a test file is usually
1,000–3,000 tokens, so expect ~70,000–210,000 output tokens, and at most 16,000 per call
(1.1 million in the worst case). Price that with the current rates for the model you chose.

Each answer is written to disk before the next is asked, and re-running the same command
asks only for the gaps, so an interrupted run resumes instead of paying twice. Do not edit a
recording by hand, and do not use `--force` on a run you intend to publish: a recording that
changes under a result is how a benchmark stops being reproducible.

## 4. Score it (free, repeatable)

```bash
pnpm --filter @understudy/benchmark exec understudy-benchmark "$RESULTS/recordings" \
  --project benchmarks/project --prompt-set 2 --execute --report "$RESULTS/report"
```

This needs no credentials: anyone can re-score your recordings and get the same report.
Keep the project that was used alongside them, so the run can be reproduced:

```bash
mkdir -p "$RESULTS/project"
cp -r benchmarks/project/.agent-kb benchmarks/project/AGENTS.md "$RESULTS/project/"
```

## 5. Read it before you write about it

Open `$RESULTS/report/report.md` and read **Failures** first: every answer that did not
compile, did not pass, or did not notice its defect, each linked to its recording. Then:

- If the report says **hand-written fixtures**, something is wrong: these should be a
  model's answers, each with a `recordedAt`.
- If it says Understudy does **not** help on both static metrics, that is the result.
  `docs/07-benchmark-and-evaluation.md` in the planning pack is explicit that no measurable
  difference means the premise is false, and the report does not soften it.
- "Wrong route" locators are partly the checker's limit (it does not follow clicks), not
  only the model's.
- Seven prompts on one model on a small application, written by the tool's authors, is
  enough to see a large effect and not enough to publish a claim.

## 6. Commit it — unfavourable runs included

```bash
git add benchmarks/results
git commit -m "bench: first recorded run (claude-opus-5-5, 70 answers)"
```

Then update, with the numbers as they are and the limits as they are:

- `docs/guides/does-it-work.md` — replace the "no benchmark has been run" notice with what
  was measured, on what, with which model, how many answers, and the caveats above.
- `AGENTS.md`, section "Not yet built".
- The line on the README / landing page that says the project makes no claim.
- `CHANGELOG.md`.

Do not round in Understudy's favour, and do not drop a run because it was unflattering.
