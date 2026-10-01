# 07 — Knowledge Core v1: model domenowy

**Prio:** P0.5 · **Zależy od:** 00 · **Rozmiar:** M

## Cel

Typowany, wersjonowany model wiedzy w pamięci — bez I/O, bez CLI, bez procesów.
Na nim opierają się: adapter (08), zapis v2 (09), analizator (10), MCP (20–21).

## Kontekst

- Nieśledzony `packages/engine/src/schema/knowledge.ts` — zaczątek (provenance, fakty route/locator/test-id/api/term,
  reguła „verified wymaga verifiedAt i nie może opierać się tylko na agent-inference”). **Wchłoń go i usuń stary plik.**
- `packages/engine/src/schema/agent-kb.ts` — obecny schemat dyskowy v1 (zostaje bez zmian w tym tickecie).
- Docs: `.planning/docs/03-knowledge-core.md`. Decyzje: ADR-1, ADR-2, ADR-3 w `.planning/00-inventory-and-decisions.md`.

## Projekt

Lokalizacja: `packages/engine/src/knowledge/` (`model.ts`, `ids.ts`, `validate.ts`, `serialize.ts`, `index.ts`).
Reguła zależności: **żadnych importów** z `agent-kb/`, `node:fs`, `node:child_process`, CLI.

```ts
export const KNOWLEDGE_MODEL_VERSION = 1;

type FactStatus = 'inferred' | 'observed' | 'verified' | 'stale';        // ADR-2: zapisywany
type EvidenceType = 'source-code' | 'browser' | 'existing-test' | 'page-object'
                  | 'openapi' | 'manual' | 'import' | 'agent-inference';

interface Evidence {
  id: string;                    // stabilne, deterministyczne (hash treści) — ten sam dowód = to samo id
  type: EvidenceType;
  file?: string; line?: number; symbol?: string;
  route?: string;                // ścieżka, NIGDY host (redakcja: host należy do środowiska)
  environment?: string;
  commit?: string;
  observedAt?: string;           // ISO
  snapshotHash?: string;
  tool?: { name: string; version?: string };   // np. playwright-cli 0.1.3, snapshot format id
}

interface FactBase {
  id: string;                    // logiczne ID, patrz ids.ts
  kind: FactKind;
  status: FactStatus;
  evidence: readonly string[];   // id-ki Evidence, min. 1
  confidence?: { level: 'low' | 'medium' | 'high'; reason: string };   // ADR-3
  verifiedAt?: string;
  verifiedAgainst?: { commit?: string; environment?: string; role?: string; locale?: string };
  dependencies?: { files: readonly { path: string; hash?: string }[] };  // użyje ticket 17
}

type FactKind = 'application' | 'environment' | 'route' | 'component' | 'role' | 'state'
              | 'action' | 'locator' | 'test-id' | 'api' | 'term' | 'data-requirement';
```

Pola specyficzne (minimum):
- `route`: `path`, `title?`, `application?`
- `locator`: `route` (id faktu route), `role`, `name?`, `level?`, `expression` (gotowe wyrażenie Playwright), `testId?`
- `test-id`: `testId`
- `api`: `method?`, `path`
- `term`: `key`, `label`
- `action`: `route`, `component?`, `intent`, `locator?` (id faktu locator), `requires?: { roles?: string[]; states?: string[] }`
- `application`, `environment` (`name`, `application?`; **bez** baseUrl na dysku — to konfiguracja, nie wiedza), `component`, `role`, `state`, `data-requirement`: `name` + opcjonalny `description`.
  Te encje dziś nie są ekstrahowane — model ma je tylko umieć reprezentować (docs/03: „Do not over-engineer”).

`ids.ts` — deterministyczne ID: `route:/login`, `locator:/login#button:log in` (normalizacja nazwy: lower-case, zwinięte spacje),
`test-id:login-submit`, `api:GET /api/items`, `term:auth.login.submit`. Funkcje + testy kolizji/normalizacji.

`validate.ts` — `validateKnowledge(kb): KnowledgeIssue[]`:
- `verified` ⇒ `verifiedAt` obecne i ≥1 evidence typu innego niż `agent-inference`;
- `inferred` ⇔ wszystkie evidence to `agent-inference` lub `confidence.level === 'low'` — **fakt z samą inferencją nie może mieć statusu wyższego niż `inferred`**;
- integralność referencji: `locator.route`, `action.route`, `action.locator`, każde id w `evidence` istnieje;
- duplikaty ID.

`serialize.ts` — `toJSON(kb)` / `fromJSON(data)` przez zod (`strictObject`), round-trip bezstratny,
nieznana `modelVersion` > obsługiwanej ⇒ `UnsupportedKnowledgeVersionError` z instrukcją aktualizacji.

`KnowledgeBase` = `{ modelVersion, facts: Fact[], evidence: Evidence[] }` — zwykłe struktury, bez silnika grafów.

## Zadania

1. Zaimplementuj powyższe; eksport publiczny z `packages/engine/src/index.ts` (sekcja `knowledge`).
2. Usuń `packages/engine/src/schema/knowledge.ts` (treść przeniesiona/zastąpiona).
3. Testy (`packages/engine/test/knowledge/*.test.ts`): round-trip dla każdego rodzaju faktu; każda reguła walidacji
   (pozytywny i negatywny przypadek); „inferred i verified nie do pomylenia”; nieobsługiwana wersja; zepsute wejście (zod error czytelny).

## Nie ruszaj

`agent-kb/*`, CLI, MCP, ESLint, constitution, schemat dyskowy v1.

## Kryteria akceptacji (docs/09 → Knowledge Core v1, część modelowa)

- wersja jawna ✓; encje serializują się i deserializują ✓; provenance zachowane ✓;
- inferred i verified nie do pomylenia (test) ✓; złe referencje dają czytelny błąd ✓.
- Test architektoniczny: pliki w `src/knowledge/` nie importują `node:fs`, `node:child_process` ani `../agent-kb` (prosty grep w vitest).

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm verify
```
