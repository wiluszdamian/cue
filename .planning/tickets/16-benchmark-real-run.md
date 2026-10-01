# 16 — Pierwszy prawdziwy benchmark

**Prio:** P0.7 · **Zależy od:** 13, 15 · **Rozmiar:** S (dla agenta) · **Wymaga właściciela repo**

## Cel

Pierwsze prawdziwe liczby: ten sam model, te same zadania, z Understudy i bez, z powtórzeniami — opublikowane uczciwie,
także jeśli są niekorzystne.

## Dlaczego osobny ticket

`understudy-benchmark record` to jedyne płatne wywołanie sieciowe w repo (AGENTS.md). Agent **nie uruchamia** go bez wyraźnej zgody
i bez kluczy dostarczonych przez użytkownika. Agent przygotowuje runbook i analizuje wyniki; nagrywanie odpala człowiek.

## Zadania (agent)

1. `benchmarks/RUNBOOK.md`: dokładne komendy (przygotowanie demo + KB, `record --runs 5`, scoring, raport), szacowany koszt
   (liczba wywołań × średnia długość), wymagane zmienne środowiskowe, gdzie trafiają wyniki (`benchmarks/results/<data>-<model>/`).
2. Poproś użytkownika o uruchomienie `record` (w terminalu, prefiks `!`) — **zatrzymaj się i czekaj**.
3. Po nagraniu: scoring + raport, commit wyników (nagrania + raport) w `benchmarks/results/...`.
4. Zaktualizuj `docs/guides/does-it-work.md` i notę na landing page / README: co zmierzono, na jakiej aplikacji, z jakim modelem,
   ograniczenia (demo app ≠ reprezentatywna aplikacja klienta, tryb completion). Bez zaokrąglania w górę.
5. Zaktualizuj sekcję „Not yet built” w `AGENTS.md`.

## Kryteria akceptacji (docs/09 → Benchmark)

- prawdziwe odpowiedzi modelu ✓; ten sam model/zadania z i bez ✓; powtórzenia ✓; testy wykonane ✓; ≥1 mutacja ✓;
  niekorzystne przebiegi zachowane ✓; raport odtwarzalny z nagrań ✓.

## Ograniczenie, które należy nazwać w raporcie

docs/07 mówi o „representative application”. Demo app jest mała i napisana przez autorów narzędzia. Następny krok (backlog P2):
powtórzyć na prawdziwym repo brownfield (np. pilot w zespole).
