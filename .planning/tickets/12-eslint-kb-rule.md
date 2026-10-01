# 12 — Egzekwowana reguła `selectors-from-agent-kb` (ESLint + engine)

**Prio:** P0.6 · **Zależy od:** 10 (zalecane po 11) · **Rozmiar:** L

## Cel

Reguła, która dziś jest `detector.kind: manual`, staje się mechanicznie sprawdzana — tym samym analizatorem co `check`.
CLI i ESLint reużywają jednego analizatora (docs/09).

## Kontekst

- `rules/constitution.yaml` → `selectors-from-agent-kb` (manual, MUST, error). Jej `rationale` mówi wprost, że nie da się jej wykryć — trzeba to zaktualizować.
- `packages/engine/src/schema/constitution.ts` — `DetectorSchema` = ast | regex | manual.
- `packages/engine/src/analyze.ts` — `AnalyzeOptions` bez dostępu do wiedzy.
- `packages/eslint-plugin/src/create-rule.ts` — reguła z jedną statyczną wiadomością `violation`.
- `packages/engine/test/fixtures.test.ts` — każdy enforceable rule musi mieć `fixtures/<id>/{good,bad}.ts` + `expected.snap`,
  analizowane pod wirtualną ścieżką `tests/app/functional/fixture.spec.ts` **bez wiedzy o aplikacji**.
- AGENTS.md: „Adding or changing a rule” (kroki 1–4), „Messages are written for a model”, zakaz słabych detektorów.

## Projekt

1. Nowy rodzaj detektora w schemacie constitution:
   ```yaml
   detector:
     kind: knowledge
     check: locators        # jedyna wartość w v1; enum, żeby kolejne (np. routes) dochodziły jawnie
   ```
2. `AnalyzeOptions.knowledge?: KnowledgeIndex`. Brak indeksu ⇒ reguły `knowledge` **nie są uznane za spełnione**:
   trafiają do `skipped` z powodem „no .agent-kb loaded” (nie cicho zielone).
3. Mapowanie werdyktów na diagnostykę: raportowane `unknown`, `wrong-route`, `ambiguous`, `stale`, `unverified`;
   **nie** raportowane `known`, `undecidable`. Wiadomość = statyczny `message` z constitution + dynamiczny szczegół z `suggestion`
   (ESLint: `messages: { violation: '{{message}} {{detail}}' }` lub drugi messageId — wybierz i uzasadnij).
4. ESLint plugin: ładuje KB z najbliższego katalogu z `.agent-kb` w górę od `context.filename` (fallback `context.cwd`);
   cache w procesie z unieważnieniem po mtime katalogu `.agent-kb` (edytor trzyma proces długo). Brak `.agent-kb` ⇒ reguła milczy
   (ESLint nie ma „skipped”), ale `understudy check` i `doctor` mówią o tym głośno — opisz to w docs reguły.
5. Severity: `warn` w constitution (preset `recommended` = warn, `strict` = error — sprawdź, że generator to tak traktuje),
   do czasu aż benchmark/pilot pokaże niski odsetek fałszywych alarmów. Zapisz to w `rationale`.
6. Fixtures: rozszerz harness tak, by katalog fixture mógł zawierać `.agent-kb/` (np. `fixtures/selectors-from-agent-kb/.agent-kb/app-map/login.yaml`);
   jeśli jest — buduj indeks i podaj go do `analyze`. `bad.ts`: wymyślony testid + wymyślona nazwa przycisku; `good.ts`: locatory z KB.
   Zmiana harnessu musi zostać ogólna (żadnego `if (ruleId === 'selectors-from-agent-kb')`).
7. Parytet engine ↔ ESLint: istniejące testy parytetu (`packages/eslint-plugin/test/rules.test.ts`) mają objąć nową regułę.
8. `understudy check` (11) przechodzi na `analyze()` z tą regułą, jeśli to upraszcza kod — **jeden** punkt mapowania werdykt→diagnostyka.
9. `pnpm generate` (plugin, docs, skills, MCP `explain_rule`) i przegląd wygenerowanego opisu reguły — ma uczciwie mówić, czego reguła NIE sprawdza (`getByText` itd.).

## Nie ruszaj

Pozostałych reguł, analizatora (poza poprawkami błędów), plików generowanych ręcznie.

## Kryteria akceptacji (docs/09 → KB-aware locator checking)

- CLI i ESLint używają tego samego analizatora (test: oba zwracają te same pozycje dla tego samego pliku i KB) ✓;
- fixture bad/good + `expected.snap` ✓; reguła bez KB nie udaje sukcesu w engine ✓;
- `pnpm generate` + `pnpm verify` zielone, drift check czysty ✓.

## Weryfikacja

```bash
pnpm generate
pnpm verify
```
