# 06 — `understudy verify`: rozdzielona semantyka weryfikacji

**Prio:** P0.3 · **Zależy od:** 00 · **Rozmiar:** M

## Cel

Raport nigdy nie twierdzi, że mapa zgadza się z aplikacją, jeśli aplikacji nie sprawdzono.
Wymiary weryfikacji są rozdzielone, a semantyka CI jawna i przetestowana.

## Kontekst

- `packages/cli/src/verify-map.ts`: bez `--base-url` każda trasa ma `kind: 'skipped'`, a jeśli nic nie jest stare,
  `formatVerifyReport` drukuje **„The map matches the application.”**. `verifyExitCode` ignoruje stale i skipped.
- Pusta mapa ⇒ exit 0. Zepsute pliki YAML są po cichu pomijane w `readAllRouteMaps` (`store.ts`).
- Docs: `.planning/docs/05-verification-and-governance.md` („Replace ambiguous verify-map”, „CI modes”).
- ADR-6: nowa komenda `verify`; `verify-map` = alias z ostrzeżeniem o deprecjacji.

## Projekt

```ts
type LiveOutcome = 'unchanged' | 'drifted' | 'unreachable' | 'not-checked';

interface RouteVerification {
  route: string;
  freshness: Freshness;          // z wieku; od ticketu 17 także z git
  live: LiveOutcome;
  missing: readonly string[];
  detail?: string;
}

type Overall = 'PASS' | 'PARTIAL' | 'FAIL' | 'NOT_VERIFIED' | 'EMPTY';

interface VerifyReport {
  routes: readonly RouteVerification[];
  invalidFiles: readonly { path: string; reason: string }[];
  counts: { total: number; liveChecked: number; liveSkipped: number; drifted: number;
            unreachable: number; fresh: number; ageing: number; stale: number; invalid: number };
  overall: Overall;
}
```

Reguły `overall` (w tej kolejności):
1. `EMPTY` — brak tras i brak błędnych plików.
2. `FAIL` — jakikolwiek `drifted` / `unreachable` / plik invalid.
3. `NOT_VERIFIED` — żadna trasa nie sprawdzona na żywo.
4. `PARTIAL` — część tras niesprawdzona albo są wpisy `stale`.
5. `PASS` — wszystkie trasy sprawdzone na żywo, `unchanged`, żadna `stale`.

Zdanie o zgodności z aplikacją wolno wydrukować **wyłącznie** przy `PASS`.

CI:
- `--ci=advisory` (domyślne): exit 1 tylko przy `FAIL`.
- `--ci=strict`: exit 1 przy `FAIL`, `NOT_VERIFIED`, `PARTIAL`, `EMPTY`.
- `--json`: wypisuje `VerifyReport`.

## Zadania

1. Logika w `packages/cli/src/verify.ts`; wyliczenie `overall` jako czysta, eksportowana funkcja (rozszerzy ją ticket 17).
2. W `store.ts` dodaj wariant odczytu zwracający także błędy parsowania (np. `readAllRouteMapsWithErrors`);
   dotychczasowej `readAllRouteMaps` nie zmieniaj.
3. Komenda `verify` (+ `COMMANDS`, help w `cli.ts`, `docs/help/commands.md`). `verify-map` woła to samo i wypisuje ostrzeżenie na stderr.
4. Format wyjścia jak w docs/05 (Knowledge / Status / Live verification / Result).
5. Testy: każdy `overall`; oba tryby CI (tabela exit codes); pusta mapa; zepsuty YAML; `--refresh` aktualizuje `verifiedAt`
   tylko po `unchanged` z żywego sprawdzenia; dokładny tekst — brak „matches” poza `PASS`.
6. Zaktualizuj odwołania do `verify-map` w ręcznie pisanych docs (`docs/guides`, `docs/help`, `skills/*/SKILL.md`)
   i ewentualnie w generatorach; potem `pnpm generate`.
7. `CHANGELOG.md`.

## Nie ruszaj

Formatu `.agent-kb`, survey, drivera.

## Kryteria akceptacji (docs/09 → Verification)

- freshness i live to osobne pola ✓; skipped widoczne ✓; partial widoczne ✓;
- brak żywego sprawdzenia ⇒ brak zdania o zgodności (test na tekst) ✓;
- exit codes udokumentowane i przetestowane dla obu trybów ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm generate
pnpm verify
```
