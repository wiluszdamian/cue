# 22 — `doctor`: diagnostyka wiedzy

**Prio:** P1.5 · **Zależy od:** 09, 10, 17 · **Rozmiar:** M

## Cel

`doctor` staje się główną diagnostyką nie tylko instalacji, ale i jakości wiedzy — każda diagnoza z komendą naprawy.

## Kontekst

- `packages/cli/src/doctor.ts` — `CheckResult` (`ok|warn|error|unchecked`), `checkKnowledgeBase` (dziś podstawowa), zasada „każdy problem ma komendę naprawy” (`commands.ts`, `advice.test.ts`).
- docs/05 sekcja „`cue doctor`”.

## Nowe kontrole (każda osobny `CheckResult`)

| Kontrola | Źródło | Naprawa |
| --- | --- | --- |
| Pliki KB niepoprawne / nieobsługiwana wersja schematu | `loadKnowledge` issues | konkretny plik + `understudy survey --route …` / upgrade |
| Dane v1 bez dowodów per fakt | wersja pliku | `understudy survey --stale` lub `--route` (migracja przez odświeżenie) |
| Stare i possibly-stale fakty (z powodami, max 5 + licznik) | 17 | `understudy survey --stale` |
| Konflikty | `index.conflicts()` | opis + jak rozstrzygnąć |
| Nieznane locatory w testach (podsumowanie analizatora po test files, max 5 + licznik) | 10 | `understudy check` |
| Test-id w KB nieobecne już w źródle | `sources.json` hash vs working tree | `understudy extract --source …` |
| Zduplikowane logiczne elementy (ten sam element pod dwoma ID) | indeks | — |
| Trasy z surface bez mapy (pokrycie wiedzy) | indeks | `understudy survey --route …` |

Diagnozy krótkie i wykonalne (przykład w docs/05). Brak `.agent-kb` ⇒ jedno `warn` z `extract`/`survey`, nie lawina błędów.

## Zadania

1. Kontrole jako czyste funkcje nad indeksem + cienka warstwa I/O.
2. `doctor --ci`: które kontrole są błędem w CI — udokumentuj w `docs/help/commands.md` (tabela).
3. Testy: każda kontrola pozytywnie i negatywnie; czas `doctor` na KB 2 000 faktów < 2 s.

## Kryteria akceptacji

- Każda nowa diagnoza ma komendę naprawy, którą `advice.test.ts` uznaje za istniejącą.
- `pnpm verify` zielone.

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm verify
```
