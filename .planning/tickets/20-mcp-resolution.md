# 20 — MCP: rozszerzone narzędzia rozwiązywania wiedzy

**Prio:** P1.4 · **Zależy od:** 09 · **Rozmiar:** M

## Cel

Agent pyta o pojedyncze fakty (trasa, API, dowody, świeżość) bez czytania całej KB. Te same funkcje co CLI — zero zduplikowanej logiki.

## Kontekst

- `packages/mcp/src/tools.ts` (wzorzec: czyste funkcje, `TOKEN_BUDGET`, test budżetu na **każdym osiągalnym wyjściu**), `server.ts`.
- AGENTS.md sekcja „The MCP server” — lista „later tools” do zaktualizowania.
- docs/06 — operacje; ADR-5 (jedna logika).

## Zakres v1 tego ticketu

| Narzędzie | Wejście | Wyjście |
| --- | --- | --- |
| `resolve_route` | `path` lub fraza | trasa, tytuł, status, freshness z powodem, liczba elementów, źródła |
| `resolve_api` | `method?`, `path` lub fraza | endpointy + źródło (file:line) |
| `get_evidence` | `factId` | lista dowodów skrótowo (typ, plik:linia / trasa+środowisko, data) |
| `get_freshness` | `factId` lub `route` | `FreshnessVerdict` z powodami (17, jeśli zrobione; inaczej wiek) |
| `find_knowledge` | `query`, `kind?` | max 5 trafień: id, kind, jedna linia opisu |

`resolve_action`, `resolve_role`, `resolve_state`, `resolve_component` — **nie dodawać**, dopóki acquisition nie produkuje takich faktów
(ticket 25 i dalej). Narzędzie, które zawsze odpowiada „unknown”, kosztuje kontekst i niczego nie daje.

Każda odpowiedź „nie wiem” ma kształt z docs/06: `status: unknown` + `suggested action` (celowany survey / extract), nigdy wymyślona wartość.

## Zadania

1. Narzędzia jako funkcje nad `KnowledgeIndex` (wspólny loader z cache po mtime `.agent-kb`), rejestracja w `server.ts`.
2. Budżety w `TOKEN_BUDGET`, test na wszystkich wyjściach (fixture KB z dużą liczbą faktów, żeby ograniczenia list były sprawdzone).
3. AGENTS.md (sekcja MCP), `packages/mcp/README.md`, ewentualnie generatory opisów narzędzi; `pnpm generate`.
4. Testy: każdy tool — trafienie, brak (unknown + sugestia), wejście niepoprawne.

## Kryteria akceptacji (docs/09 → MCP)

- nieznane fakty zwracają `unknown` ✓; dowody i świeżość odpytywalne ✓; ta sama logika co CLI (test: wynik `resolve_route` == wynik funkcji engine) ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/mcp test
pnpm generate
pnpm verify
```
