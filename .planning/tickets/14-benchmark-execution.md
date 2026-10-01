# 14 — Benchmark: kompilacja i uruchamianie wygenerowanych testów

**Prio:** P0.7 · **Zależy od:** 03, 10 · **Rozmiar:** L

## Cel

Benchmark przestaje oceniać tylko zgodność z regułami. Każdy wygenerowany test jest kompilowany i uruchamiany
na aplikacji demo, a locatory oceniane analizatorem (10) z kontekstem trasy.

## Kontekst

- `packages/benchmark/src/{runner,scoring,agent,live-agent,prompts,report,cli}.ts`.
- `scoreGrounding` — globalny zbiór nazw z całej KB (nie per trasa, nie unikalność). Do zastąpienia analizatorem.
- `prompts.ts` — `PROMPT_SET_VERSION = 1`, prompty „login-success”, „slow-page”, … bez powiązania z konkretną aplikacją.
- Nagrania w `test/recordings/` to **ręczne fixtures**, nie wyniki (README tamże) — ta zasada zostaje.
- Live agent = pojedyncze completion bez narzędzi (`live-agent.ts`).

## Projekt

1. **Prompt set v2** (nowa wersja, v1 zostaje dla porównywalności starych nagrań): zadania na aplikacji demo, klasy z docs/07:
   login, form validation (signup), role-restricted (admin security), navigation, CRUD (items), API/UI combined, slow page.
   Każdy prompt ma: `id`, `text`, `app: 'demo'`, `exercises` (reguły), `mutation?` (id mutacji z 03 — użyje 15).
2. **Workspace wykonania** per (prompt × condition × run): kopia `examples/demo-app` do tmp; pliki odpowiedzi zapisane pod ścieżkami z odpowiedzi
   (walidacja: ścieżka względna, w obrębie workspace — odrzuć `..` i absolutne).
3. **Compile:** type-check wygenerowanych plików kompilatorem TS dostępnym w workspace (engine używa TS 6.0.3 API — użyj go tutaj,
   nie bare `tsc`); wynik: ok / lista błędów.
4. **Run:** `playwright test <pliki>` na uruchomionej demo app (jedna instancja na cały run, `baseURL` przez env), timeout per test,
   wynik: passed / failed / timedOut / didNotRun + skrócony błąd. Retries = 0 (first-run pass).
5. **Locator validity:** `analyzeLocators` (10) z KB zbudowaną przez extract+survey na demo app (artefakt przygotowany raz, zapisany w workspace benchmarku);
   metryki: known / unknown (invented) / wrong-route / ambiguous / undecidable — zastępują `scoreGrounding` (zostaw stary scoring
   tylko dla prompt set v1).
6. Wyniki per próbka: `{ compile, run, locators, compliance, durationMs }`; agregaty per condition.
7. Testy jednostkowe na nagraniach-fixtures (ręcznych, oznaczonych jak dziś) — w tym jeden test przechodzący i jeden padający
   z prawdziwym uruchomieniem Playwright **tylko w trybie integracyjnym** (osobny skrypt `test:integration`, nie w `pnpm test`).

## Nie ruszaj

`record` (płatne wywołanie) poza dodaniem nowych pól metadanych, jeśli konieczne; constitution.

## Kryteria akceptacji

- `understudy-benchmark <dir> --project <demo>` na nagraniach-fixtures produkuje compile/run/locator metrics.
- Wygenerowany test, który odwołuje się do nieistniejącego przycisku, ma `run: failed` i `locators.unknown ≥ 1`.
- Ścieżki z odpowiedzi modelu nie mogą pisać poza workspace (test).
- `pnpm verify` zielone; `test:integration` zielone lokalnie (wklej wynik).

## Weryfikacja

```bash
pnpm --filter @understudy/benchmark test
pnpm --filter @understudy/benchmark test:integration
pnpm verify
```
