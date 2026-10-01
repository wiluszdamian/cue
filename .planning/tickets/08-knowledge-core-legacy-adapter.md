# 08 — Knowledge Core: wczytywanie istniejącego `.agent-kb` + zapytania + konflikty

**Prio:** P0.5 · **Zależy od:** 07 · **Rozmiar:** M

## Cel

Jedno miejsce, które czyta cały `.agent-kb` do modelu z ticketu 07, oraz indeks zapytań używany
przez wszystkich konsumentów. `resolveLocator` przechodzi na ten indeks **bez zmiany zachowania**.

## Kontekst

- `packages/engine/src/agent-kb/store.ts` — `readAllRouteMaps`, `readTestIds`, `correlate`.
- `.agent-kb/product/{testids,surface,vocabulary}.yaml`, `.agent-kb/product/sources.json` (pisane przez `extract/run.ts`).
- `packages/engine/src/agent-kb/resolve-locator.ts` + testy w `packages/engine/test/agent-kb.test.ts` i `packages/mcp/test/tools.test.ts`.
- ADR-3: mapowanie obecnego `confidence` na status/evidence.

## Projekt

```ts
// packages/engine/src/agent-kb/load-knowledge.ts   (I/O jest tutaj, nie w knowledge/)
export interface LoadIssue { path: string; severity: 'error' | 'warning'; message: string }
export function loadKnowledge(root: string): { kb: KnowledgeBase; issues: LoadIssue[] };

// packages/engine/src/knowledge/query.ts   (czyste)
export interface KnowledgeIndex {
  routes(): RouteFact[];
  route(path: string): RouteFact | undefined;
  locatorsOn(route: string): LocatorFact[];
  allLocators(): LocatorFact[];
  byTestId(id: string): (LocatorFact | TestIdFact)[];
  apis(): ApiFact[];
  terms(): TermFact[];
  fact(id: string): Fact | undefined;
  evidenceFor(factId: string): Evidence[];
  freshness(fact: Fact, now: Date): Freshness;   // na razie wiek z verifiedAt (agent-kb/freshness.ts przenieś lub zaimportuj w CZYSTEJ formie)
  conflicts(): Conflict[];
}
export function indexKnowledge(kb: KnowledgeBase): KnowledgeIndex;

export interface Conflict {
  factId: string;
  field: string;
  values: readonly { value: unknown; evidence: readonly string[] }[];
}
```

Mapowanie v1 → model:

| Źródło v1 | Fakt | Status | Evidence |
| --- | --- | --- | --- |
| route map | `route` (`path`, `title`) | `observed` | `browser` (route, observedAt=exploredAt, snapshotHash) |
| element `confidence: confirmed` | `locator` | `verified` (verifiedAt = map.verifiedAt) | `browser` + `source-code` (z `testids.yaml`: file/line) |
| element `runtime-only` | `locator` | `observed` | `browser` |
| element `code-only` / `unknown` | `locator` | `inferred` | `browser` (i warning) |
| `testids.yaml` | `test-id` | `observed` | `source-code` (+ `commit` z pliku) |
| `surface.yaml` route | `route` (scal z route map o tym samym path — **dwa evidence, jeden fakt**) | `observed` | `source-code` |
| `surface.yaml` endpoint | `api` | `observed` | `source-code` lub `openapi` (po rozszerzeniu pliku źródła) |
| `vocabulary.yaml` | `term` | `observed` | `source-code` |

Konflikty: przy scalaniu faktów o tym samym ID różne wartości pola (np. ten sam `test-id` przypisany
do dwóch różnych elementów, różny `title` trasy z dwóch dowodów) ⇒ `Conflict`, **nigdy cichy merge** (docs/03 „Conflict model”).
Zepsuty plik ⇒ `LoadIssue` (nie wyjątek, nie ciche pominięcie).

## Zadania

1. `loadKnowledge` + `indexKnowledge` jak wyżej.
2. Przepisz `resolveLocator` na `KnowledgeIndex` (scoring słów może zostać, ale jako funkcja nad `LocatorFact`).
   **Wszystkie istniejące testy resolve-locator i MCP mają przejść bez zmian oczekiwań.** Jeśli któryś musi się zmienić — opisz dlaczego w PR.
3. Testy: mapowanie każdego wiersza tabeli; scalanie route z dwóch źródeł; wykrywanie konfliktów (syntetyczne dane);
   zepsuty YAML ⇒ issue; pusty katalog ⇒ pusta baza bez błędów; parytet `resolveLocator` (stare testy).

## Nie ruszaj

Formatu na dysku (to 09), CLI poza tym, co wynika z `resolveLocator`, constitution.

## Kryteria akceptacji

- Stare dane `.agent-kb` (v1) są obsługiwane wg jawnej polityki (ADR-4) — test na fixture v1.
- `resolveLocator` i MCP `resolve_locator` dają identyczne wyniki jak przed zmianą.
- Konflikty są jawne i odpytywalne.
- `pnpm verify` zielone.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm --filter @understudy/mcp test
pnpm verify
```
