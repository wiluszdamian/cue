# 05 — OpenAPI przez prawdziwy parser

**Prio:** P0.4 · **Zależy od:** 00 · **Rozmiar:** S/M

## Cel

Endpointy z OpenAPI czytane parserem JSON/YAML, nie regexem po liniach.
Równoważne dokumenty JSON i YAML dają identyczny wynik.

## Kontekst

- `packages/engine/src/agent-kb/extract/adapters.ts` → `openApiAdapter`: regex wymaga końca linii po dwukropku,
  więc nie łapie typowego `"/users": {` ani minified JSON.
- Pakiet `yaml` jest już zależnością engine (parsuje też JSON).
- `SourceFileRef` (`extract/scan.ts`) daje `lines` i `hash`; tekst = `lines.join('\n')`. Zachowaj gwarancję ze `scan.ts`:
  treść plików nie opuszcza adapterów.
- Test: `packages/engine/test/extract.test.ts` (dziś tylko YAML).

## Zadania

1. `parseDocument` z `yaml` + `LineCounter`, żeby każda operacja miała **numer linii** (`source: file:line`).
   Minified JSON ⇒ linia 1 dla wszystkiego — OK.
2. Obsłuż `paths.<path>.<method>` dla get/post/put/patch/delete/head/options/trace. Klucze path-item niebędące metodami
   (`parameters`, `summary`, `servers`, …) pomijaj. `$ref` na path-item: rozwiąż lokalny (`#/...`), zewnętrzny ⇒ wpis w `gaps`.
3. Wersja: `openapi: 3.x` lub `swagger: "2.0"`. W 2.0 prefiksuj `basePath` (udokumentuj w komentarzu).
4. Błędy: niepoprawna składnia / brak `paths` / nieznana wersja ⇒ wpis w `gaps` z nazwą pliku i powodem; reszta ekstrakcji trwa.
5. Nie zmieniaj `SurfaceSchema` (operationId/parametry dojdą w tickecie 09, jeśli będą potrzebne).
6. Testy: ten sam kontrakt w 3 postaciach (YAML, pretty JSON, minified JSON) ⇒ identyczny zbiór `(method, path)`;
   swagger 2.0 z basePath; zepsuty JSON ⇒ gap; dokument bez `paths` ⇒ gap; `$ref` lokalny.
   Użyj `examples/demo-app/openapi.*`, jeśli ticket 03 jest zrobiony; w przeciwnym razie fixtures w `packages/engine/test/fixtures-extract/openapi/`
   (**nie** w `test/fixtures/` — ten katalog jest zarezerwowany na pary reguł i test pilnuje 1:1 z constitution).

## Nie ruszaj

Pozostałych adapterów (i18n = ticket 24).

## Kryteria akceptacji (docs/09 → OpenAPI)

JSON ✓ · YAML ✓ · minified JSON ✓ · równoważne dokumenty normalizują się identycznie ✓ · nieobsługiwane wejście daje użyteczny komunikat ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm verify
```
