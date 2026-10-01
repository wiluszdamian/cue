# 18 — Celowany survey

**Prio:** P1.2 · **Zależy od:** 06, 17 · **Rozmiar:** M

## Cel

Odświeżać tylko to, co trzeba: jedną trasę, wszystkie stare albo te dotknięte zmianą w kodzie — zamiast crawla całej aplikacji.

## Projekt

```text
understudy survey <url>                                  # jak dziś
understudy survey --route /admin/settings/security       # wymaga base URL
understudy survey --stale                                # status stale lub freshness stale/possibly-stale
understudy survey --affected-by HEAD~5..HEAD             # z ticketu 17
  [--base-url <url> | env UNDERSTUDY_BASE_URL] [--env <name>] [--dry-run]
```

- Base URL: flaga > env `UNDERSTUDY_BASE_URL` > błąd z instrukcją. **Nie zapisuj URL w `.agent-kb`.**
- Przed wykonaniem zawsze wypisz plan (lista tras i powód każdej); `--dry-run` kończy na planie.
- `--action <id>`: dopiero gdy istnieją fakty `action` (ticket 25+). Do tego czasu komenda mówi „not implemented yet” zgodnie z konwencją `NOT_IMPLEMENTED_MARKER`.
- Trasa z parametrami (`/items/[id]`) bez konkretnego URL ⇒ pomijana z jawnym powodem w planie.
- Wynik: per trasa `updated` / `unchanged` / `failed` + podsumowanie; częściowy błąd nie przerywa reszty, exit 1 jeśli cokolwiek `failed`.

## Zadania

1. Implementacja w CLI (orkiestracja; logika wyboru tras jako czysta funkcja nad `KnowledgeIndex` w engine).
2. Help + `docs/help/commands.md` + skill `survey` (ręczny `SKILL.md`) + `pnpm generate`.
3. Doctor/verify/check/MCP — tam, gdzie dziś sugerują `understudy survey <url>`, sugeruj formę celowaną (`--route …`) — jeden helper do budowania sugestii.
4. Testy z `FileDriver`/fake runner: wybór tras dla każdej flagi, dry-run, brak base URL, trasa dynamiczna, częściowy błąd.

## Kryteria akceptacji

- Każdy tryb ma test; plan jest wypisywany przed mutacją; URL nie trafia na dysk.

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm generate
pnpm verify
```
