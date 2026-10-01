# 25 — Wiedza z istniejących testów i Page Objects (brownfield)

**Prio:** P1 · **Zależy od:** 09, 10, 19 · **Rozmiar:** M

## Cel

W repo brownfield największym źródłem wiedzy są istniejące testy i Page Objects. Ekstrahujemy z nich fakty jako **dowody**
(`existing-test`, `page-object`), nie jako niepodważalną prawdę (docs/04 „Existing tests are evidence, not unquestionable truth”).

## Projekt

- Nowy adapter extract `existing-tests` (wykrywa pliki z discover/19 lub glob `**/*.{spec,test}.ts` + katalogi POM).
- Z każdego literału locatora (`extractLocators`) z kontekstem trasy (reguły z analizatora 10: `goto`, adnotacja `understudy-route`):
  fakt `locator` ze statusem **`inferred`** (test mógł być martwy/nieprzechodzący), evidence `existing-test` / `page-object` (plik:linia, symbol klasy/metody).
- Z metod Page Object (`async changePassword()`) — fakt `action` (`intent` z nazwy metody, `route` z adnotacji, `locator` z użytych locatorów) ze statusem `inferred`.
- Survey/verify, które potwierdzą element w przeglądarce, łączą dowody ⇒ status rośnie do `observed`/`verified` wg reguł z 07; konflikt nazw ⇒ `Conflict`.
- Analizator (10) traktuje `inferred` jako `unverified` — więc locatory z istniejących testów nie „wybielają” same siebie.

## Zadania

1. Adapter + zapis do `.agent-kb/product/` (nowy plik `from-tests.yaml` v2) — odczyt w `loadKnowledge`.
2. Scalanie dowodów przy survey (09) z faktami `inferred` z testów.
3. Testy: fixture repo z POM + specs; fakty mają status `inferred` i poprawne evidence; po survey tego samego elementu ⇒ `verified`/`observed`;
   różna nazwa w teście i w przeglądarce ⇒ konflikt.
4. Po tym tickecie: odblokuj `resolve_action` w MCP (dopisz do 20 jako follow-up lub zrób tu, jeśli mały) i `survey --action` (18).

## Kryteria akceptacji

- Wiedza z testów nigdy nie ma statusu `verified` bez dowodu spoza testów (test).

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm verify
```
