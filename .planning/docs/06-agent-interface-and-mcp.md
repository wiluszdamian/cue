# 06 — Agent Interface and MCP

## Goal

Agents should not need to read the entire repository, all skills, and the whole `.agent-kb` to answer a small question.

Cue should provide a compact agent-facing resolution layer.

## Recommended operations

### Resolution

```text
resolve_locator
resolve_route
resolve_action
resolve_component
resolve_api
resolve_role
resolve_state
```

### Knowledge inspection

```text
get_evidence
get_freshness
find_knowledge
get_conflicts
```

### Policy

```text
explain_policy
resolve_owner
```

### Task-oriented context

Most important:

```text
get_context
```

Example:

```json
{
  "task": "test password change",
  "maxTokens": 1500
}
```

Possible response:

```text
Applicable route:
admin.security → /admin/settings/security

Required role:
admin

Required state:
authenticated

Known action:
settings.password.change

Verified locator:
getByRole("button", { name: "Change password" })

Policy:
- use verified KB locators
- no arbitrary hard waits

Freshness:
fresh

Evidence:
browser survey + source code
```

## Context budgeting

Cue should optimize for small context.

Prefer:

- compact structured responses,
- only relevant facts,
- short provenance summaries,
- links/IDs for deep inspection.

Avoid dumping the entire KB into the model context.

## Agent workflow

Preferred:

```text
task arrives
   ↓
agent asks Cue for context
   ↓
Cue returns policy + relevant facts
   ↓
fresh enough?
  /       \
yes        no
 |          |
reuse      targeted acquisition
  \         /
   implementation
        ↓
      cue check
        ↓
   affected tests
        ↓
     cue verify
```

## Integration strategy

Core knowledge APIs should be agent-independent.

Integrations may generate:

- Claude Code configuration,
- Cursor rules,
- Codex instructions,
- OpenCode configuration,
- Gemini CLI integration,
- other agent adapters.

But those adapters should consume the same stable Knowledge Core and policy interfaces.

## Failure behavior

If Cue does not know:

```text
resolve_locator("settings.password.change")
```

it should return something like:

```yaml
status: unknown
suggested_action:
  type: targeted-survey
  target: settings.password.change
```

It should not invent a plausible locator.
