# 01 — Drobne niespójności

**Prio:** P0 · **Zależy od:** 00 · **Rozmiar:** S

## Cel

Usunąć trzy rozbieżności między tym, co projekt deklaruje, a tym, co robi.

## Kontekst

- `packages/cli/src/cli.ts:129` — `confirm()` zwraca `true`, gdy `!process.stdin.isTTY`.
  README/`docs/help/commands.md` obiecują: „Shows you the plan first and waits for a yes”.
- `packages/eslint-plugin/src/index.ts:27` — `meta.version: '0.1.0'`, a `package.json` ma `0.8.0`.
- `AGENTS.md` („The README carries the build order”) i `.github/workflows/upstream.yml` odsyłają do
  planu budowy w README, którego tam nie ma.
- CI smoke używa `init --yes` i `uninstall --yes`, więc zmiana `confirm` go nie złamie — sprawdź.

## Zadania

1. `confirm()`: bez TTY i bez `--yes` → **nie stosuj zmian**: wypisz plan, potem komunikat
   `Not a terminal, so nothing was applied. Re-run with --yes to apply this plan.` i zwróć exit code 1.
   Dotyczy każdej komendy używającej `confirm` (init/add/remove/uninstall/sync — sprawdź wszystkie wywołania).
2. Wersja pluginu ESLint czytana z `package.json` (import JSON z `with { type: 'json' }` albo
   wstrzykiwana przez istniejący generator — wybierz to, co pasuje do builda; nie hardkoduj).
   Dodaj test, że `meta.version === package.json.version`.
3. Wskaźnik planu: w `AGENTS.md` (sekcja „Not yet built”) i w komentarzu `upstream.yml` zastąp
   „The README carries the build order” odnośnikiem do `.planning/README.md`.
   **Uwaga:** `.planning/` jest dziś nieśledzone — jeśli użytkownik nie chce go commitować, zostaw tylko
   zmianę w `upstream.yml` i zapytaj.
4. `CHANGELOG.md` → Unreleased: wpis o zmianie zachowania `confirm` (to breaking dla skryptów bez `--yes`).

## Nie ruszaj

Logiki plan/manifest/apply, constitution.

## Kryteria akceptacji

- Test jednostkowy: brak TTY + brak `--yes` ⇒ nic nie zapisane, exit 1, plan wypisany.
- Test: brak TTY + `--yes` ⇒ zapisane jak dotąd.
- Test wersji pluginu.
- `pnpm verify` zielone.

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm --filter @understudy/eslint-plugin test
pnpm verify
```
