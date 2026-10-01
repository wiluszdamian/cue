# 11 — `understudy check <files...>`

**Prio:** P0.6 · **Zależy od:** 10 · **Rozmiar:** S/M

## Cel

Komenda CLI, którą agent (lub hook, lub CI) uruchamia po napisaniu testu, żeby dowiedzieć się, które
locatory nie mają pokrycia w wiedzy o aplikacji — z gotową podpowiedzią naprawy.

## Kontekst

- Analizator: `analyzeLocators` (ticket 10), `loadKnowledge` + `indexKnowledge` (08).
- Reportery engine: `packages/engine/src/reporters/` (human, json, sarif, github, agent) operują na `Diagnostic`.
- Rejestr komend: `packages/cli/src/commands.ts`, help w `cli.ts`, `docs/help/commands.md`, test `advice.test.ts`.
- Docs: `.planning/docs/05` — przykład wyjścia `cue check`.

## Projekt

```text
understudy check [paths/globs...] [--format human|json|agent|sarif|github] [--ci=advisory|strict] [--cwd <dir>]
```

- Bez argumentów: pliki `**/*.{spec,test}.{ts,tsx}` + pliki z adnotacją `understudy-route` (poza `node_modules`, `dist`).
- Każdy finding ≠ `known`/`undecidable` mapowany na `Diagnostic` z `ruleId: 'selectors-from-agent-kb'` (ta sama reguła, którą 12 uczyni egzekwowaną),
  wiadomość: co jest nie tak, dlaczego, co zamiast (najbliższy znany locator albo `understudy survey --route …`).
- Exit codes:
  | Werdykt | advisory | strict |
  | --- | --- | --- |
  | `unknown`, `wrong-route` | 1 | 1 |
  | `ambiguous`, `stale`, `unverified` | 0 (warning) | 1 |
  | pusta KB | 0 + komunikat „nothing known yet: run extract/survey” | 1 |
- Podsumowanie na końcu: `N locators: K known, U unknown, … , D undecidable (not judged)` — `undecidable` zawsze widoczne, nigdy ukryte.
- Format human jak w docs/05 (plik:linia, locator, najbliższa wiedza, trasa, wiek weryfikacji, sugerowana akcja).

## Zadania

1. `packages/cli/src/check.ts` + rejestracja komendy + help + `docs/help/commands.md`.
2. Testy CLI z fixture projektem (tmp dir z `.agent-kb` v2 i kilkoma plikami testów): każdy wiersz tabeli exit codes, każdy format wyjścia (snapshot), glob domyślny.
3. Dopisz `check` do skilla, który opisuje workflow pisania testu (`skills/compose/SKILL.md` lub `inspect` — sprawdź, który pasuje) jako krok po napisaniu testu; `pnpm generate`.
4. `CHANGELOG.md`.

## Nie ruszaj

Analizatora (poprawki błędów — tak, ale opisz), ESLint, constitution.

## Kryteria akceptacji

- Wynik dla planted-bad testu zawiera najbliższy znany locator i komendę survey.
- Exit codes zgodne z tabelą (testy).
- `pnpm verify` zielone (w tym `advice.test.ts`).

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm generate
pnpm verify
```
