# 00 — Baseline: zielone `pnpm verify`

**Prio:** P0 · **Zależy od:** — · **Rozmiar:** S

## Cel

Mieć powtarzalny, zielony punkt startowy przed jakąkolwiek zmianą.

## Stan obecny

`pnpm verify` przerywa się na starcie: pnpm wykrywa niezgodny katalog `node_modules`
i bez TTY odmawia jego usunięcia (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
W repo jest też nieśledzony `packages/engine/src/schema/knowledge.ts`, niepodpięty nigdzie.

## Zadania

1. Przeinstaluj zależności: `pnpm install --frozen-lockfile` (jeśli potrzebne potwierdzenie purge —
   uruchom z `CI=true` albo poproś użytkownika, by zrobił to w terminalu: `! pnpm install`).
   **Nie zmieniaj `pnpm-lock.yaml`.** Jeśli `--frozen-lockfile` nie przechodzi — zatrzymaj się i zgłoś.
2. `pnpm build`, potem `pnpm verify`. Zapisz wynik (liczba testów per pakiet).
3. Jeśli `knowledge.ts` psuje format/lint/typecheck — **nie poprawiaj go merytorycznie**
   (zostanie wchłonięty w tickecie 07); wystarczy `pnpm prettier --write` na tym pliku.
4. Jeśli coś jest czerwone z powodów niezwiązanych z `knowledge.ts` — opisz przyczynę i napraw
   tylko jeśli to trywialne (np. formatowanie); w przeciwnym razie zatrzymaj się.

## Nie ruszaj

Kodu produkcyjnego, constitution, lockfile.

## Kryteria akceptacji

- `pnpm verify` kończy się kodem 0.
- W `.planning/README.md` przy tickecie 00: status `done` + jedna linia z liczbą testów.

## Weryfikacja

```bash
pnpm install --frozen-lockfile
pnpm verify
```
