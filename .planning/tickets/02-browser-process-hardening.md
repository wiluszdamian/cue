# 02 — Bezpieczne uruchamianie playwright-cli (bez shella)

**Prio:** P0.1 · **Zależy od:** 00 · **Rozmiar:** M

## Cel

Żaden URL ani ścieżka nie może być interpretowany przez powłokę. URL z `&`, `%`, `^`, `"` i spacjami
dociera do `playwright-cli` jako **dokładnie jeden argument**, na Windows i Linux.

## Kontekst

- `packages/cli/src/survey.ts` — `PlaywrightCliDriver.run()` robi
  `spawnSync(\`${binary} ${args.join(' ')}\`, { shell: true })`. Komentarz: Node od v20 nie spawnuje `.cmd` bez shella.
- `SnapshotDriver` interfejs jest dobry — zostaje.
- `verify-map.ts` też używa drivera.
- ADR-1: kod procesu trafia do `packages/cli/src/browser/`.

## Projekt

```ts
// packages/cli/src/browser/process.ts
export interface RunResult { ok: boolean; status: number | null; stdout: string; stderr: string; error?: string }
export interface ProcessRunner { run(executable: string, args: readonly string[], options?: { timeoutMs?: number; cwd?: string }): RunResult }
export const nodeRunner: ProcessRunner; // spawnSync z shell: false, zawsze

// packages/cli/src/browser/resolve.ts
export interface ResolvedCommand { executable: string; prefixArgs: readonly string[]; via: 'explicit' | 'local-package' | 'path' }
export function resolvePlaywrightCli(projectRoot: string, explicit?: string): ResolvedCommand | undefined;
```

Kolejność rozwiązywania:
1. `explicit` (nowa flaga `--playwright-cli <path>`; jeśli wskazuje `.js/.mjs/.cjs` → `process.execPath` + ścieżka jako prefixArg).
2. **Lokalny pakiet:** `node_modules/@playwright/cli/package.json` w `projectRoot` (i w górę drzewa) → pole `bin` →
   `{ executable: process.execPath, prefixArgs: [absolutna ścieżka do JS] }`. Bez shella, bez shimów — preferowana droga.
3. **PATH:** znajdź `playwright-cli` w PATH. Na POSIX — spawn bezpośrednio. Na Windows, jeśli to `.cmd`/`.bat`:
   spróbuj odczytać z shima ścieżkę do skryptu JS (shimy npm/pnpm mają stały format `"%~dp0\..\...js"`) i użyj drogi 2;
   jeśli się nie da — **odmów** z czytelnym komunikatem (zainstaluj lokalnie `@playwright/cli` albo podaj `--playwright-cli`).
   Nie przywracaj `shell: true` i nie dodawaj `cross-spawn` bez uzgodnienia.

## Zadania

1. Wydziel `ProcessRunner` i `resolvePlaywrightCli` jak wyżej; `PlaywrightCliDriver` przyjmuje `ResolvedCommand` + `ProcessRunner`.
2. Flaga `--playwright-cli <path>` dla `survey` i `verify-map` (help + `docs/help/commands.md`).
3. Komunikat błędu „nie znaleziono” podaje konkretne komendy naprawy (styl jak w `SurveyError`).
4. Testy z prawdziwym procesem: fixture `packages/cli/test/fixtures/fake cli/echo-args.mjs` (katalog **ze spacją**)
   wypisujący `JSON.stringify(process.argv.slice(2))`; plus wygenerowany w tmp shim `.cmd` (tylko Windows) i skrypt z shebangiem (POSIX).
5. `CHANGELOG.md`.

## Nie ruszaj

`parseSnapshot`, schemat `.agent-kb`, logiki `survey()` poza konstrukcją drivera.

## Kryteria akceptacji

- W całym `packages/` brak `shell: true` (test grep w vitest albo reguła w teście CLI).
- Testy przekazują i odczytują nienaruszone: `http://x.test/a?b=1&c=2`, `http://x.test/a?q=%20%26%22`,
  `http://x.test/a?x=^&y=|`, oraz ścieżkę wykonywalną ze spacją.
- Testy przechodzą na Windows lokalnie (to repo jest rozwijane na Windows) i w CI matrix (ubuntu/windows/macos).
- Ręczny smoke (jeśli `@playwright/cli` jest dostępne): `node packages/cli/dist/cli.js survey "https://example.com/?a=1&b=2"` działa.

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm verify
```
