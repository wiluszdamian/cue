# 21 — MCP: `get_context`

**Prio:** P1.4 · **Zależy od:** 20 · **Rozmiar:** M

## Cel

Jedno wywołanie na początku zadania: „test password change” ⇒ zwięzły pakiet faktów i polityki dopasowany do zadania,
mieszczący się w podanym budżecie tokenów.

## Projekt

Wejście: `{ task: string, maxTokens?: number (domyślnie 1200, max 3000), route?: string }`.

Deterministyczny retrieval (bez LLM — „deterministic before probabilistic”):
1. Tokenizacja zadania (lower-case, stop-words EN, prosty stemming końcówek `-ing/-ed/-s`).
2. Punktacja faktów: nazwy elementów, tytuły tras, ścieżki tras i API, `term.label` i `term.key`; bonus za trasę wskazaną w `route`.
3. Wybór: najlepsza trasa (lub 2), jej elementy pasujące do zadania, powiązane API, terminy.
4. Polityka: reguły constitution istotne dla pisania testu (tier MUST, wybrane przez topic ownership dla locatorów/asercji/tagów) — tylko tytuł + 1 linia.
5. Freshness + skrót dowodów dla każdego zwróconego faktu; ID faktów do pogłębienia przez `get_evidence`.
6. Przycinanie do `maxTokens` (estymator z `tools.ts`), w kolejności: najpierw odpadają alternatywy, potem terminy, potem API — nigdy polityka i nigdy informacja o świeżości.
7. Brak trafień ⇒ `status: unknown`, znane trasy (max 10), sugestia `understudy survey --route …` / `extract`.

Format jak przykład w docs/06 (sekcje: Applicable route, Known elements, API, Policy, Freshness, Evidence, Deeper: ids).

## Zadania

1. Funkcja `buildTaskContext(index, rules, input)` w engine (czysta), narzędzie MCP jako cienka nakładka.
2. Opcjonalnie komenda CLI `understudy context "<task>"` (ta sama funkcja) — przydatna do debugowania i do benchmarku (15, uwaga metodologiczna).
3. Testy: zadania z demo app (login, password change, add item) ⇒ właściwa trasa; budżet respektowany dla `maxTokens` 300/1200/3000 na wszystkich fixture'ach;
   zadanie bez związku ⇒ unknown.
4. Skill `understudy`/`compass`: instrukcja „zacznij od `get_context`” (ręczny SKILL.md + `pnpm generate`).

## Kryteria akceptacji (docs/09 → MCP)

- agent dostaje kompaktowy kontekst bez czytania całej KB ✓; budżet twardy, testowany ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm --filter @understudy/mcp test
pnpm generate
pnpm verify
```
