# Security policy

## Supported versions

Only the latest published version receives fixes.

## Reporting a vulnerability

Please report privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository rather than opening a public issue. Expect an acknowledgement
within a week.

## Notes on the threat model

Two areas of this project touch things worth being careful about, and both are
worth reporting on:

- **`extract` reads a repository the user may not own.** It must never write to
  the product repo, and only structure, names, and `file:line` references — never
  code contents — may reach `.agent-kb`. A path that leaks source, secrets from
  config files, tokens from URLs, or personal data from seed files is a security
  bug.
- **`.agent-kb` is committed.** Exploration output passes through a sensitive-data
  filter before it is written. A filter bypass is a security bug.

Neither command exists yet; the constraints are recorded here so they are treated
as requirements rather than discovered later.
