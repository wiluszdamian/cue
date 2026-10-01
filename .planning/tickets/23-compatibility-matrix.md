# 23 — Macierz kompatybilności i pinowanie wersji

**Prio:** P1.6 · **Zależy od:** 04 · **Rozmiar:** M

## Cel

Wiadomo, z jakimi wersjami narzędzi zewnętrznych projekt jest sprawdzony, a zmiana łamiąca kontrakt daje automatyczny, użyteczny sygnał.
Żadnych niekontrolowanych `@latest` w generowanej konfiguracji krytycznej.

## Kontekst

- `.github/workflows/upstream.yml` — TODO o `compatibility.yaml`, który nie istnieje.
- `packages/cli/src/targets/agent-targets.ts:13-14` — `@understudy/mcp@latest`, `@playwright/mcp@latest` w konfiguracji MCP pisanej do repo użytkownika.
- Fixtures snapshotów per wersja CLI (04).
- AGENTS.md: integrator cudzych narzędzi — ich niestabilność to główne ryzyko.

## Projekt

`compatibility.yaml` w root repo (źródło prawdy, czytane przez generatory i doctor):

```yaml
node: '^22.13 || >=24'
tools:
  '@playwright/cli': { range: '>=0.1.3 <0.2.0', snapshotFormats: ['playwright-cli/markdown-yaml@1'] }
  '@playwright/mcp': { range: '…' }
  '@playwright/test': { range: '…' }
  typescript-eslint: { range: '…' }
```

## Zadania

1. `compatibility.yaml` + schemat zod + loader w engine.
2. Generowana konfiguracja MCP: `@understudy/mcp@<bieżąca wersja wydania>` i `@playwright/mcp@<range z pliku>` zamiast `@latest`
   (przez generator → `pnpm generate`; testy CLI scaffold zaktualizować).
3. `doctor`: kontrola zainstalowanych wersji (`@playwright/cli`, `@playwright/test`) vs zakresy — `warn` z komendą instalacji wersji wspieranej.
4. `upstream.yml`: porównanie najnowszych wersji z npm z zakresami; poza zakresem ⇒ job failuje z czytelnym opisem (lub otwiera issue przez `gh`, jeśli workflow ma uprawnienia — wybierz i opisz).
   Usuń TODO.
5. CI: job (może być częścią `e2e` z 13) uruchamiający testy parsera snapshotów na fixtures dla każdej wspieranej wersji CLI.
6. `docs/help/troubleshooting.md` — sekcja o wersjach.

## Kryteria akceptacji

- Brak `@latest` w generowanej konfiguracji (test).
- Wersja spoza zakresu daje sygnał w upstream workflow (test skryptu porównującego na danych fikcyjnych).
- `pnpm generate` + `pnpm verify` zielone.

## Weryfikacja

```bash
pnpm generate
pnpm verify
```
