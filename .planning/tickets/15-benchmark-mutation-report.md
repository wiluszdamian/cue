# 15 — Benchmark: mutacje, powtórzenia, metadane, raport

**Prio:** P0.7 · **Zależy od:** 14 · **Rozmiar:** M

## Cel

Benchmark sprawdza, czy test **łapie zamierzony błąd**, a nie tylko czy jest zielony; wyniki są powtarzalne,
kompletne i zachowują też niekorzystne przebiegi.

## Kontekst

- Mutacje demo app (03): `auth-silent-fail`, `wrong-password-accepted`, `signup-validation-off`, `button-renamed`, `route-moved`.
- Prompt set v2 z polem `mutation` (14).
- Docs: `.planning/docs/07-benchmark-and-evaluation.md` (metryki, mutation-based validation, format raportu, „do not discard unfavorable results”).

## Zadania

1. **Mutation check:** dla promptu z `mutation`: jeśli test przeszedł na czystej aplikacji ⇒ uruchom ponownie z `DEMO_MUTATIONS=<id>`;
   wynik `detected` (padł), `missed` (przeszedł), `n/a` (nie przeszedł na czystej). Co najmniej 2 prompty z mutacją w v2.
2. **Powtórzenia:** `--runs N` (domyślnie 5 przy `record`), każda próba osobno zapisana; agregaty z rozrzutem (min/median/max), nie tylko średnia.
3. **Repair iterations (opcjonalnie, za flagą `--repair-attempts K`):** przy błędzie kompilacji/uruchomienia odeślij modelowi błąd i policz iteracje do zielonego.
   Jeśli to rozdmucha ticket — zostaw jako jawnie „not measured” w raporcie i dopisz do backlogu.
4. **Metadane runu** (zapisywane w nagraniu i raporcie): model (pełne id z odpowiedzi API), prompt set version, commit repo, wersja understudy,
   wersje Playwright / `@playwright/cli`, Node, OS, liczba prób, czasy, token usage (z odpowiedzi API, jeśli dostępne), pełne odpowiedzi.
5. **Metryki niezmierzalne w trybie completion** (browser exploration count, knowledge reuse) — w raporcie jako `not measured: completion-mode agent has no tools`,
   nigdy jako 0.
6. **Raport** `report.md` + `report.json`: tabela jak w docs/07 per prompt i zbiorczo; sekcja „Failures” z każdą nieudaną próbą (link do pełnej odpowiedzi);
   nagłówek z metadanymi; zdanie, że wyniki z fixtures nie są wynikami (jeśli źródłem są fixtures).
7. **Uwaga metodologiczna do raportu:** warunek `understudy` w trybie completion dostaje cały AGENTS.md + całą KB w promptcie (`buildContext`) —
   to nie jest docelowy przepływ (MCP/`get_context`, docs/06). Zapisz to w raporcie jako ograniczenie.
8. Testy na fixtures: mutation detected/missed/n-a, agregaty z rozrzutem, kompletność metadanych, failures nie znikają z raportu.

## Nie ruszaj

Constitution, CLI produktu.

## Kryteria akceptacji (docs/09 → Benchmark, część harnessu)

- powtórzenia zapisane ✓; testy wykonywane ✓; ≥1 zadanie z mutacją ✓; niekorzystne przebiegi zachowane ✓; raport odtwarzalny z nagrań bez API ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/benchmark test
pnpm --filter @understudy/benchmark test:integration
pnpm verify
```
