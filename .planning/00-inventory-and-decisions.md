# Inwentaryzacja i decyzje architektoniczne

Stan: commit `a94d4b7` (v0.8.0) + nieśledzony `packages/engine/src/schema/knowledge.ts`.
Zasada z `docs/AGENT-PROMPT.md`: **rzeczywistość kodu wygrywa z dokumentami planistycznymi.**

## 1. Inwentaryzacja (KEEP / EXTEND / REFACTOR / DEPRECATE / REMOVE / MISSING)

| Komponent | Gdzie | Klasa | Uwagi |
| --- | --- | --- | --- |
| Constitution → generatory (ESLint, docs, MCP, skills, pluginy) | `rules/`, `packages/*/scripts/generate*.mjs` | **KEEP** | Najmocniejsza część repo. Wszystkie nowe reguły tędy. |
| Silnik reguł (esquery + refinements + fixers) | `packages/engine/src/{analyze,detectors}` | **EXTEND** | Potrzebny nowy rodzaj detektora z dostępem do KB (ticket 12). |
| Instalator plan → manifest → apply, zarządzane regiony | `packages/cli/src/{install,manifest,sync}.ts` | **KEEP** | Nie ruszać kontraktu hashy/regionów. |
| Schemat `.agent-kb` v1 (route map, testids, surface, vocabulary, sources) | `packages/engine/src/schema/agent-kb.ts` | **REFACTOR** | Brak evidence per fakt, brak statusu cyklu życia, `confidence` miesza źródło z pewnością. → tickety 07–09. |
| `schema/knowledge.ts` (nieśledzony, niepodpięty) | `packages/engine/src/schema/knowledge.ts` | **REFACTOR → wchłonąć w 07** | Dobry zaczątek (provenance, fakty, zakaz verified z samej inferencji). Brak: `stale`, wersji schematu, konfliktów, encji route/component/action. |
| Store (zapis z redakcją, odczyt z freshness) | `agent-kb/store.ts` | **EXTEND** | Inwarianty (redakcja, freshness przy odczycie) zostają. Odczyt po cichu pomija zepsute pliki — doctor musi to raportować (22). |
| Freshness czysto czasowa (7/30 dni) | `agent-kb/freshness.ts` | **EXTEND** | Zostaje jako jeden z wymiarów; dochodzi zależność od plików/git (17). |
| `correlate` testid ↔ nazwa | `agent-kb/store.ts` | **KEEP** | |
| `resolveLocator` | `agent-kb/resolve-locator.ts` | **REFACTOR** (08) | Ma przejść przez Knowledge Core, zachowując zachowanie „unknown zamiast zgadywania”. |
| `extractLocators` (AST) | `agent-kb/extract-locators.ts` | **KEEP / EXTEND** (10) | Fundament analizatora locatorów. |
| Adapter test-ids, Next.js | `agent-kb/extract/adapters.ts` | **KEEP** | Regex OK dla atrybutów i ścieżek plików. |
| Adapter OpenAPI (regex po liniach) | j.w. | **REFACTOR** (05) | Nie działa dla typowego JSON (`"/users": {`) ani minified. |
| Adapter i18n (regex po liniach) | j.w. | **REFACTOR** (24) | Gubi zagnieżdżone klucze JSON/YAML. |
| Parser snapshotu playwright-cli | `agent-kb/snapshot.ts` | **REFACTOR** (04) | Jeden format na sztywno, brak wykrycia nieznanego formatu, brak fixtures z prawdziwego CLI. |
| `PlaywrightCliDriver` (`shell: true`, string join) | `packages/cli/src/survey.ts` | **REFACTOR** (02) | Bezpieczeństwo + `&` w URL. |
| `verify-map` | `packages/cli/src/verify-map.ts` | **DEPRECATE → `verify`** (06) | Drukuje „The map matches the application.” bez żadnej żywej weryfikacji. |
| `doctor` | `packages/cli/src/doctor.ts` | **EXTEND** (22) | Dziś diagnozuje instalację; brak diagnostyki wiedzy. |
| MCP: `explain_rule`, `resolve_owner`, `resolve_locator` | `packages/mcp/src/tools.ts` | **KEEP / EXTEND** (20, 21) | Budżety tokenów — zachować wzorzec dla nowych narzędzi. |
| Reguła `selectors-from-agent-kb` (manual) | `rules/constitution.yaml` | **REFACTOR** (12) | Ma stać się egzekwowana mechanicznie. |
| Benchmark (nagrania, compliance + grounding) | `packages/benchmark` | **EXTEND** (14–16) | Nie uruchamia testów, grounding globalny (nie per trasa), nagrania ręczne. |
| CI: lint/test matrix/drift/smoke | `.github/workflows/ci.yml` | **EXTEND** (13) | Brak prawdziwej przeglądarki. |
| Upstream workflow z TODO `compatibility.yaml` | `.github/workflows/upstream.yml` | **EXTEND** (23) | |
| `@latest` w generowanej konfiguracji MCP | `packages/cli/src/targets/agent-targets.ts` | **REFACTOR** (23) | |
| `confirm()` akceptuje bez TTY | `packages/cli/src/cli.ts:129` | **REFACTOR** (01) | Sprzeczne z README („nic nie zapisze bez potwierdzenia”). |
| ESLint plugin `meta.version: '0.1.0'` | `packages/eslint-plugin/src/index.ts:27` | **REFACTOR** (01) | package.json = 0.8.0. |
| Skills catalog (11 procedur) | `skills/*/SKILL.md` | **KEEP** (przegląd w P2) | |
| Aplikacja demo | — | **MISSING** (03) | |
| Analizator „locator vs KB” | — | **MISSING** (10) | |
| `understudy check`, `verify`, `discover` | — | **MISSING** (11, 06, 19) | |
| Encje: application, environment, component, role, state, action, data_requirement | — | **MISSING** (07 — tylko typy; ekstrakcja później) | |
| Konflikty faktów | — | **MISSING** (08) | |

## 2. Decyzje architektoniczne (ADR)

### ADR-1: Bez nowych pakietów w P0 — moduły wewnątrz `@understudy/engine`

`docs/02` proponuje `packages/knowledge-core`, `acquisition`, `browser`, `verification`, `governance`.
Na tym etapie to byłby kosztowny refactor (generatory, publikacja, `workspace:*`, pluginy) bez zysku dla użytkownika.
Zamiast tego granice modułów w obrębie engine:

```text
packages/engine/src/
  knowledge/        ← Knowledge Core (07–09): model, serializacja, migracje, zapytania, konflikty
  agent-kb/         ← istniejący I/O + acquisition (extract, snapshot) — stopniowo przepinany na knowledge/
  verification/     ← analizator locatorów (10), statusy weryfikacji (06/17)
packages/cli/src/browser/  ← driver procesu playwright-cli (02)
```

Reguła zależności: `knowledge/` nie importuje niczego z `agent-kb/`, `verification/`, CLI ani `node:child_process`.
Wydzielenie do osobnych pakietów — P2, gdy kontrakty się ustabilizują.

### ADR-2: Status faktu vs świeżość vs konflikt — trzy osobne osie

- **`status` (zapisywany na dysku):** `inferred | observed | verified | stale`.
  `stale` = fakt *oblał* weryfikację (np. element zniknął przy żywym sprawdzeniu).
- **`freshness` (liczona, nigdy nie zapisywana):** `fresh | ageing | possibly-stale | stale-by-age`
  z wieku (`verifiedAt`) i — od ticketu 17 — ze zmian w plikach zależnych.
- **`conflicting` (liczony):** wynik porównania faktów o tym samym logicznym ID z różnymi wartościami.

Uzasadnienie: `docs/03` miesza te osie w jednym łańcuchu; zapisanie „possibly-stale” na dysku zestarzałoby się samo.
Reguła twarda: `verified` wymaga `verifiedAt` i co najmniej jednego evidence innego niż `agent-inference`
(przenosimy z istniejącego `knowledge.ts`).

### ADR-3: Obecny `confidence` (confirmed/runtime-only/code-only/unknown) zostaje jako *pokrycie źródeł*

To nie jest „pewność” w sensie `docs/03`, tylko informacja, które źródła widziały element.
W modelu v1 jest liczony z evidence (`browser` + `source-code` ⇒ `confirmed`), a na dysku v2 nie jest już źródłem prawdy.
Nowe pole `confidence: { level: low|medium|high, reason }` — opcjonalne, bez fałszywej precyzji.

### ADR-4: Kompatybilność `.agent-kb`

- Odczyt: v1 (dzisiejszy) i v2 (ticket 09). v1 migrowany w pamięci, bez przepisywania plików.
- Zapis: zawsze v2 (survey/extract po tickecie 09).
- `schemaVersion` > obsługiwanej ⇒ czytelny błąd „upgrade understudy”, nigdy ciche pominięcie.
- Format pozostaje: YAML per trasa w `.agent-kb/app-map/`, pliki produktu w `.agent-kb/product/`. Jeden plik grafu to P2 (lub nigdy).

### ADR-5: Jeden analizator locatorów, wielu konsumentów

`packages/engine/src/verification/locator-analyzer.ts` — czysta funkcja `(source, filePath, KnowledgeIndex) → findings`.
Konsumenci: `understudy check` (11), reguła ESLint (12), benchmark grounding (14), doctor (22).
Żaden konsument nie implementuje własnego dopasowywania.

### ADR-6: Nazwy komend

Docs używają `cue …`; dopóki rebranding (P2) się nie odbędzie, komendy to `understudy verify|check|discover`.
`verify-map` zostaje jako alias `verify` z ostrzeżeniem o deprecjacji (do usunięcia w kolejnej wersji minor).

### ADR-7: Prawdziwa przeglądarka w CI tylko w dedykowanym jobie

Testy jednostkowe nadal bez przeglądarki (FileDriver / fake runner). Job `e2e` (13) instaluje Chromium i `@playwright/cli`
w przypiętej wersji, na Linux + Windows.

## 3. Ryzyka

| Ryzyko | Mitygacja |
| --- | --- |
| Format `playwright-cli snapshot` zmieni się | 04: wykrywanie wersji formatu + fixtures; 23: matrix wersji i sygnał w upstream workflow |
| Analizator locatorów daje fałszywe alarmy → ludzie wyłączą regułę | 10: testy FP/FN jako kryterium; 12: `warn` w `recommended`, `error` w `strict` |
| `pnpm verify` nie działa lokalnie (node_modules wymaga reinstalacji) | 00 |
| Benchmark wymaga płatnego API | 16 wykonywany ręcznie przez właściciela repo; reszta na nagraniach |
| Migracja `.agent-kb` psuje istniejące instalacje | ADR-4 + testy round-trip i migracji w 09 |
