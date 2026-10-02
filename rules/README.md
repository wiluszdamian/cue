# `rules/` — the part that is ours

Deliberately small. Everything below this directory is generated from it; nothing
here is generated.

| File                | What it holds                             |
| ------------------- | ----------------------------------------- |
| `constitution.yaml` | The rules Cue owns. Source of truth.      |
| `tags.yaml`         | Canonical test tags and their CI meaning. |

## What regenerates from this directory

Run `pnpm generate` after any change here:

- `packages/eslint-plugin/src/generated/constitution.ts` — the constitution baked
  into the published plugin, so it works with no `rules/` directory present
- `docs/constitution.md` — the index, with the enforced/manual split
- `docs/rules/<id>.md` — one page per rule, linked from every violation message

`pnpm sync:check` compares all of it byte-for-byte and fails if it is stale. CI
runs that check, so a constitution change that was not regenerated cannot merge.

## Adding a rule

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-rule). The short version:

1. Add the entry here
2. Add `packages/engine/test/fixtures/<rule-id>/{good,bad}.ts`
3. `pnpm generate && pnpm verify`

## Not yet here

The blueprint places three more files in this directory. They arrive with the
steps that need them:

- `ownership.yaml` — the arbitration table: which source owns which topic, and
  who wins on a conflict. Generated into `AGENTS.md`, not into a skill, because a
  skill cannot announce that it outranks another skill.
- `version-delta.md` — ~30 hand-maintained lines on what changed in recent
  Playwright releases that models do not know yet.
- `skills/*.md` and `workflows/*.md` — the prescriptive skills Cue owns.
