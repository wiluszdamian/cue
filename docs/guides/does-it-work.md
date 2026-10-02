# Does it actually work?

_How to measure whether Cue changes what an assistant writes — and what has not been measured yet._

<Callout type="warn">
  **No benchmark has been run yet.** Cue does not claim that assistants write better tests
  with it. The tool to measure that exists; the measurement does not.
</Callout>

That gap is deliberate rather than an oversight. It is easy to build a testing
tool that feels helpful and never check, and the check is cheap compared to the
cost of being wrong for a year.

## The two questions worth asking

Both are comparisons — the same prompts, the same model, once with Cue and
once without. An absolute number would mean nothing: models differ, prompts
differ, and today's score is not comparable with anybody else's.

**Does it break fewer rules?** Constitution violations per generated file.
Per file, so a chattier model does not look worse for free.

**Does it invent fewer selectors?** The share of written locators that name
something the knowledge base has actually seen. This is the number the whole
knowledge base exists to move.

## Running it

Two steps, deliberately separate. Recording asks a model, which needs
credentials and costs money. Scoring does not — it reads recorded answers, so
anyone can re-score somebody else's run and get the same result.

```bash
understudy-benchmark record ./recordings --project ./my-project
```

That asks every prompt twice, once with the project's `AGENTS.md` and knowledge
base in front of the model and once with nothing, and writes each answer as it
arrives. Credentials come from the Anthropic SDK, so an `ANTHROPIC_API_KEY` or
an `ant auth login` profile both work. It says how many calls it is about to
make before it makes any of them.

Re-running never pays twice: an answer already on disk is kept, so a run
interrupted at prompt nine resumes rather than starting over. `--force` replaces
them deliberately.

Then score what was recorded:

```bash
understudy-benchmark ./recordings --project ./my-project
```

Narrow it deliberately while you work:

```bash
understudy-benchmark ./recordings --project ./my-project --prompts login-success,slow-page
```

If recordings are missing, it lists **all** of them rather than stopping at the
first, and it never scores a partial set quietly — a sample that shrinks without
being mentioned is worse than no sample.

## What the report tells you

```
Constitution violations per generated file
  without Cue   3.40
  with Cue      0.60

Selectors naming something that actually exists
  without Cue   35%
  with Cue      92%
```

It always prints the sample size alongside, and it says plainly when the result
does **not** favour Cue. A benchmark that only ever confirms its author is
not a benchmark.

## How the scoring avoids flattering itself

Four choices, all made in the less favourable direction:

- **Both conditions get word-for-word the same instructions.** What is asked of
  the model — answer with files, put the path above each block — names no rule,
  no tag and no page object. Advice there would be handed to the bare run too,
  which is the layer's whole job; the only difference between the two runs is
  the project's own files.

- **A locator built from a variable is not counted either way.** Counting it as
  invented would flatter the with-knowledge-base run, where indirection is more
  common.
- **Matching is generous.** A correct element addressed a different way still
  counts as grounded. Being strict would inflate the gap.
- **Page objects are scored as page objects.** A good answer puts locators in
  one; scoring that file as a spec would mark down the better answer.

## What would count as failure

If the numbers barely move, the premise is wrong.

The project's own plan says so outright: _no measurable difference means the
premise is false._ Ten prompts on one model is enough to notice a large effect —
and a large effect is what is being claimed.
