# 17 — Świeżość oparta o zależności i git (`possibly-stale`)

**Prio:** P1.1 · **Zależy od:** 09 · **Rozmiar:** M

## Cel

Czas nie jest jedynym sygnałem. Fakt, którego plik źródłowy zmienił się po weryfikacji, jest `possibly-stale`
z konkretnym powodem — a niezwiązane zmiany niczego nie unieważniają.

## Kontekst

- `dependencies.files[{path, hash}]` w faktach v2 (09); `sources.json` ma hashe plików z `extract`.
- `packages/engine/src/agent-kb/freshness.ts` (wiek), `KnowledgeIndex.freshness` (08), `verify` (06) z czystą funkcją `overall`.
- ADR-2: freshness liczona, nigdy zapisywana.

## Projekt

```ts
type Freshness = 'fresh' | 'ageing' | 'possibly-stale' | 'stale';
interface FreshnessVerdict { freshness: Freshness; reasons: readonly string[] }   // np. "src/…/PasswordSection.tsx changed after verification (2026-09-20)"
interface FileStateProvider { hashOf(path: string): string | undefined }          // working tree; wstrzykiwany — knowledge/ nie robi I/O
function computeFreshness(fact, now, files: FileStateProvider): FreshnessVerdict;
function affectedBy(index, changedPaths: readonly string[]): Fact[];              // dla --affected-by
```

- `possibly-stale`: hash dowolnej zależności ≠ bieżący (albo plik zniknął). Wiek nadal liczy się osobno; wynik = gorszy z dwóch, powody łączone.
- `--affected-by <git-range>`: lista zmienionych plików z `git diff --name-only <range>` (wywołanie przez `ProcessRunner` z 02, bez shella) ⇒ `affectedBy`.
- Zależności: survey dopisuje pliki testid z korelacji (09); extract — plik źródłowy każdego faktu. Opcjonalnie konfiguracja ręczna (`.agent-kb/dependencies.yaml` glob → route) — tylko jeśli tanie.

## Zadania

1. Implementacja + `FileStateProvider` dla working tree (hash jak w `scan.ts` — wspólna funkcja).
2. `verify` (06): kolumna/sekcja `possibly stale` z powodami; `overall` ⇒ `PARTIAL` przy possibly-stale; `--affected-by`.
3. `resolveLocator`/MCP/`check`: freshness z powodem w odpowiedzi (krótko — budżety tokenów MCP muszą przejść).
4. Testy z tmp repo git: zmiana pliku zależnego ⇒ possibly-stale z powodem; zmiana niezwiązanego pliku ⇒ nic; usunięty plik ⇒ possibly-stale;
   `--affected-by HEAD~1..HEAD`.

## Kryteria akceptacji (docs/09 → Git-aware freshness)

- fakty deklarują zależności ✓; zmiana zależności ⇒ `possibly-stale` ✓; niezwiązane zmiany nie unieważniają wszystkiego ✓;
- celowane odświeżenie może działać na dotkniętych wpisach (wejście dla 18) ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm --filter @understudy/cli test
pnpm verify
```
