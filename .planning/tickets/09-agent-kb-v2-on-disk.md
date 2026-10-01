# 09 — `.agent-kb` v2 na dysku: evidence, status, migracja

**Prio:** P0.5 · **Zależy od:** 08 · **Rozmiar:** M/L

## Cel

Pliki `.agent-kb` przechowują per fakt status i dowody, żeby „dlaczego Cue w to wierzy?” miało odpowiedź
bez zgadywania. Stare pliki v1 nadal działają, przyszłe wersje dają czytelny błąd.

## Kontekst

- `packages/engine/src/schema/agent-kb.ts` (`AGENT_KB_SCHEMA_VERSION = 1`, `z.literal(1)` w każdym schemacie).
- Zapis: `store.ts` (`writeRouteMap` — redakcja na zserializowanym YAML), `extract/run.ts` (`writeYaml`, `sources.json`).
- Odczyt: `load-knowledge.ts` z ticketu 08.
- ADR-4 (polityka kompatybilności), ADR-2 (status vs freshness).
- Komentarz w `RouteMapSchema`: „Path only — the host belongs to the environment, never to the map” — **utrzymać**.

## Projekt formatu v2 (route map)

```yaml
schemaVersion: 2
route: /admin/settings/security
title: Security settings
environment: staging            # nazwa, nie URL
evidence:
  - id: ev_3f2a…                # deterministyczne
    type: browser
    route: /admin/settings/security
    environment: staging
    observedAt: 2026-10-01T09:12:00Z
    snapshotHash: 9c1e…
    tool: { name: playwright-cli, version: 0.1.3, format: playwright-cli/markdown-yaml@1 }
elements:
  - id: locator:/admin/settings/security#button:change password
    role: button
    name: Change password
    locator: "getByRole('button', { name: 'Change password' })"
    testId: security-change-password
    status: verified
    evidence: [ev_3f2a…, ev_source_…]
    verifiedAt: 2026-10-01T09:12:00Z
    dependencies: { files: [{ path: src/features/settings/PasswordSection.tsx, hash: … }] }
links: [...]
gaps: [...]
exploredAt: …
verifiedAt: …
snapshotHash: …
```

Pliki produktu (`testids.yaml`, `surface.yaml`, `vocabulary.yaml`) — v2 dodaje `commit` per plik (już jest)
i `evidence` typu `source-code`/`openapi`; zachowaj `source: file:line` dla czytelności.

## Zadania

1. Schematy v2 (zod) obok v1; `parseAgentKbFile(kind, data)` rozpoznaje `schemaVersion`:
   1 ⇒ czysta funkcja migracji v1→v2 w pamięci (bez przepisywania pliku); 2 ⇒ wprost; >2 ⇒ `UnsupportedSchemaVersionError`
   („This .agent-kb was written by a newer understudy (schema N). Upgrade @understudy/cli.”).
2. Zapis zawsze v2: `survey` (evidence browser + correlate ⇒ evidence source-code + dependencies z pliku testid),
   `extract` (evidence source-code/openapi, `commit`). Redakcja nadal na całym zserializowanym dokumencie.
3. Flaga `survey --env <name>` (domyślnie `default`); nazwa środowiska trafia do evidence. **Host nigdy nie trafia do pliku** (test).
4. `verify --refresh` (z ticketu 06) aktualizuje `verifiedAt` i dopisuje evidence nowej obserwacji; element, który zniknął przy
   żywym sprawdzeniu, dostaje `status: stale` (nie jest usuwany — to wiedza o zmianie).
5. `loadKnowledge` (08) czyta v2 natywnie (bez straty pól: status, evidence, dependencies).
6. Testy: migracja v1→v2 (fixture v1 ⇒ oczekiwany v2); round-trip v2 (zapis → odczyt → zapis = identyczny tekst);
   wersja 3 ⇒ błąd; redakcja nadal działa (istniejące testy redact); brak hosta w pliku.
7. Ręcznie pisana dokumentacja formatu (`docs/guides/keeping-it-current.md`, `docs/start/teach-it-your-app.md` — sprawdź, gdzie format jest opisany)
   + skills `extract`/`survey`, jeśli opisują pola. Potem `pnpm generate`.
8. `CHANGELOG.md` (zmiana formatu, polityka kompatybilności).

## Nie ruszaj

Modelu z 07 poza ewentualnymi poprawkami błędów (opisz je), MCP, ESLint.

## Kryteria akceptacji (docs/09 → Knowledge Core v1, część dyskowa)

- migracja przetestowana ✓; stare `.agent-kb` obsługiwane wg jawnej polityki ✓; round-trip ✓;
- nieobsługiwana przyszła wersja daje jasny błąd ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm --filter @understudy/cli test
pnpm generate
pnpm verify
```
