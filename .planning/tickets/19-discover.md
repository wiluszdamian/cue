# 19 — `understudy discover`

**Prio:** P1.3 · **Zależy od:** 05 · **Rozmiar:** M

## Cel

Przy wejściu do istniejącego (brownfield) repo Playwright: tylko-do-odczytu raport, co tu jest i skąd można pozyskać wiedzę,
plus konkretny plan następnych komend. Plan przed jakąkolwiek mutacją (docs/04 „Brownfield discovery”).

## Projekt

Wykrywa (bez zapisu czegokolwiek):
- Playwright: `playwright.config.{ts,js,mjs}`, `testDir`, projekty (statycznie — **nie** wykonuj configu), liczba specs.
- Page Objects: katalogi `pages|page-objects|pom`, klasy z polem `page: Page` (AST, `typescript-estree` — już jest w engine).
- Źródła wiedzy: `detect()` istniejących adapterów extract (test-ids, Next.js, OpenAPI, i18n) uruchomione na repo produktu (`--source`, domyślnie cwd).
- Integracje agentów: reużyj wykrywania z `packages/cli/src/agents.ts` / `targets/`.
- Stan Understudy: czy zainicjalizowane (manifest), czy jest `.agent-kb` i ile faktów (przez `loadKnowledge`).

Wyjście: human (jak przykład w docs/04) + `--json`. Na końcu „Suggested next steps” z gotowymi komendami
(`init`, `extract --source …`, `survey --route …` dla 3 tras z surface bez mapy).

`init`: na początku planu pokazuje skrót z `discover` (bez zmiany semantyki plan → confirm → apply).

## Zadania

1. Logika wykrywania jako czyste funkcje w engine/cli (bez I/O w knowledge/), komenda `discover` (+ COMMANDS, help, docs).
2. Integracja skrótu w `init` (tylko wyświetlanie).
3. Testy na fixture-repozytoriach w tmp: puste repo, repo z playwright + POM + OpenAPI, monorepo z `--source`.
4. Test: `discover` nie tworzy ani nie modyfikuje żadnego pliku (porównanie drzewa przed/po).

## Kryteria akceptacji

- Raport zgodny z rzeczywistością fixture; zero zapisów; sugestie są wykonalnymi komendami (`advice.test.ts`).

## Weryfikacja

```bash
pnpm --filter @understudy/cli test
pnpm verify
```
