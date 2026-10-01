# 04 — Wersjonowany parser snapshotów + fixtures

**Prio:** P0.1 · **Zależy od:** 02, 03 · **Rozmiar:** M

## Cel

Odizolować wiedzę od niestabilnego formatu tekstowego `playwright-cli snapshot`.
Nieznany format = jawny błąd, nie pusta albo okrojona mapa.

## Kontekst

- `packages/engine/src/agent-kb/snapshot.ts` — `parseSnapshot()` zakłada format z `@playwright/cli 0.1.x`
  (`### Page`, `- Page URL:`, blok yaml w code fence). Nierozpoznane linie są po cichu pomijane.
- `survey()` (`packages/cli/src/survey.ts`) rzuca błąd tylko gdy `tree.length === 0`.
- Jedyny fixture: `packages/engine/test/snapshots/login.txt` (ręczny).

## Projekt (docs/04 „Snapshot compatibility”)

```text
BrowserDriver → RawSnapshot → VersionedSnapshotParser → NormalizedBrowserObservation → survey → .agent-kb
```

```ts
// packages/engine/src/agent-kb/snapshot/  (katalog zamiast pliku)
export interface RawSnapshot { text: string; cliVersion?: string; capturedAt: string }
export interface NormalizedBrowserObservation {
  url?: string;
  title: string;
  tree: string;                       // jak dziś, do hashowania
  elements: readonly KbElement[];
  links: readonly KbLink[];
  format: string;                     // np. 'playwright-cli/markdown-yaml@1'
  warnings: readonly string[];        // nierozpoznane linie itp. — nic nie ginie po cichu
}
export interface SnapshotFormat {
  id: string;
  detect(raw: RawSnapshot): boolean;
  parse(raw: RawSnapshot): NormalizedBrowserObservation;
}
export function parseRawSnapshot(raw: RawSnapshot): NormalizedBrowserObservation; // throws UnsupportedSnapshotFormatError
```

`parseSnapshot(text)` zostaje jako cienki wrapper (eksport publiczny), żeby nie łamać konsumentów.

## Zadania

1. Obecny parser → `SnapshotFormat` o id `playwright-cli/markdown-yaml@1`.
2. `UnsupportedSnapshotFormatError`: wersja CLI (jeśli znana), czego oczekiwano, obejście (`survey --from <file>`).
3. Driver (z ticketu 02) dołącza `cliVersion` (`playwright-cli --version`, best-effort, raz na proces).
4. **Fixtures z prawdziwego CLI:** uruchom demo (03), zbierz snapshoty `/login`, `/dashboard`, `/signup`,
   `/admin/settings/security` prawdziwym `@playwright/cli` do `packages/engine/test/snapshots/playwright-cli@<wersja>/*.txt`.
   Skrypt odświeżający: `scripts/capture-snapshots.mjs` (dokumentacja w nagłówku skryptu). Logowanie dla tras chronionych —
   przez `playwright-cli` (sprawdź, jakie komendy oferuje) albo tryb demo z sesją w query/env; opisz wybór.
5. Testy: każdy fixture parsuje się bez `warnings`; oczekiwane elementy obecne; tekst bez bloku yaml lub z obcym nagłówkiem
   ⇒ `UnsupportedSnapshotFormatError`; dziwna linia w drzewie ⇒ trafia do `warnings`.
6. `survey` używa `parseRawSnapshot`; `warnings` są wypisywane i dopisywane do `gaps` mapy; nieznany format ⇒ nic nie zapisane.

## Nie ruszaj

Schematu `.agent-kb` (to ticket 09), `locatorFor` (format wyrażeń locatorów bez zmian).

## Kryteria akceptacji

- Fixtures z co najmniej jednej prawdziwej wersji `@playwright/cli`, wersja zapisana w ścieżce.
- Test na brak cichego gubienia linii.
- `survey` na nieznanym formacie: czytelny błąd, brak zapisu.
- `pnpm verify` zielone.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm --filter @understudy/cli test
pnpm verify
```
