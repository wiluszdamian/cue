# 24 — i18n przez prawdziwy parser (zagnieżdżone klucze)

**Prio:** P1 · **Zależy od:** 05 · **Rozmiar:** S

## Cel

Etykiety z katalogów tłumaczeń czytane parserem, z pełnymi kluczami kropkowymi — także zagnieżdżone JSON/YAML.

## Kontekst

- `packages/engine/src/agent-kb/extract/adapters.ts` → `i18nAdapter`: regex po liniach `key: "label"`.
  Zagnieżdżony JSON (`{"auth": {"login": {"submit": "Log in"}}}`) daje klucz `submit` zamiast `auth.login.submit`, minified — nic.
- Wzorzec parsowania z numerami linii: ticket 05 (`yaml` + `LineCounter`).
- Demo app (03) ma `locales/en.json` z zagnieżdżeniem.

## Zadania

1. Parsowanie JSON/YAML, spłaszczenie do `a.b.c`, numer linii każdej wartości; tablice — indeks w kluczu (`a.items.0`) albo pominięcie (wybierz, udokumentuj).
2. Wartości niebędące stringami pomijane; placeholdery ICU/`{{name}}` zachowane w `label` bez zmian.
3. Locale z nazwy pliku/katalogu (`en.json`, `locales/en/*.json`) — jeśli schemat `Term` nie ma pola locale, nie dodawaj go tu (odnotuj w backlogu); w v2 (09) może trafić do evidence.
4. Zepsuty plik ⇒ gap, reszta trwa.
5. Testy: płaski JSON, zagnieżdżony JSON, minified JSON, YAML, zepsuty plik, równoważność JSON/YAML.

## Kryteria akceptacji

- Pełne klucze kropkowe z poprawnymi liniami; równoważne JSON/YAML dają ten sam wynik.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm verify
```
