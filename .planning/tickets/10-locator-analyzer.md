# 10 — Wspólny analizator locatorów vs Knowledge Core

**Prio:** P0.6 · **Zależy od:** 08 · **Rozmiar:** M/L

## Cel

Jedna czysta funkcja, która dla pliku testu mówi: które locatory odpowiadają znanej wiedzy, które są wymyślone,
które oparte na wiedzy starej/niezweryfikowanej — i co zrobić zamiast. Konsumenci: `check` (11), ESLint (12),
benchmark (14), doctor (22). **Nikt poza nim nie implementuje dopasowania** (ADR-5).

## Kontekst

- `packages/engine/src/agent-kb/extract-locators.ts` — AST → `LocatorUse` (method, value, name, line). Fundament; rozszerz o kolumnę i zakres.
- `KnowledgeIndex` z ticketu 08.
- Benchmark `packages/benchmark/src/scoring.ts` ma dziś własne globalne „grounding” — zostanie przepięty w 14, nie tutaj.
- Docs: `.planning/docs/05` sekcja „KB-aware locator enforcement”.
- AGENTS.md: „Do not invent a weak detector to make a manual rule look enforced” — dlatego analizator ma jawną klasę `undecidable`
  i raportuje tylko to, co umie rozstrzygnąć.

## Projekt

```ts
// packages/engine/src/verification/locator-analyzer.ts
export type LocatorVerdict =
  | 'known'          // dokładnie jeden pasujący fakt observed/verified, świeży
  | 'ambiguous'      // pasuje >1 element na tej trasie (Playwright strict mode by się wywrócił)
  | 'unknown'        // nic nie pasuje — prawdopodobnie wymyślony
  | 'wrong-route'    // znany, ale tylko na innej trasie niż kontekst testu
  | 'stale'          // pasuje fakt ze status stale lub freshness stale
  | 'unverified'     // pasuje tylko fakt inferred
  | 'undecidable';   // zmienne, template z wyrażeniami, locator(css), metoda nieobsługiwana

export interface LocatorFinding {
  line: number; column: number; endLine: number; endColumn: number;
  expression: string;           // zrekonstruowane wywołanie
  method: string;
  verdict: LocatorVerdict;
  routeContext?: string;        // skąd wiemy, na jakiej trasie jesteśmy
  match?: { factId: string; route: string; expression: string; status: FactStatus; verifiedAt?: string };
  nearest: readonly { factId: string; route: string; expression: string; score: number }[];   // max 3
  suggestion: string;           // jedno zdanie dla modelu: użyj X / uruchom `understudy survey --route Y`
}

export function analyzeLocators(input: {
  filePath: string; source: string; index: KnowledgeIndex; now?: Date;
}): LocatorFinding[];
```

Semantyka dopasowania (zgodna z Playwright):
- `getByRole(role, { name })`: rola równa; nazwa dopasowana **jak Playwright domyślnie**: case-insensitive, podciąg, zwinięte białe znaki;
  `exact: true` ⇒ pełna równość. Bez `name` ⇒ dopasowanie po roli, >1 ⇒ `ambiguous`.
- `getByTestId(id)`: równość z `test-id` lub `locator.testId`.
- `getByLabel(text)`: elementy ról formularzowych (textbox, combobox, checkbox, radio, spinbutton, searchbox, slider, switch) po nazwie.
- `getByText`, `getByPlaceholder`, `getByTitle`, `getByAltText`, `locator(...)`, `frameLocator` ⇒ **`undecidable`** w v1
  (KB nie przechowuje tych atrybutów — udawanie byłoby słabym detektorem).
- Argumenty niebędące literałami ⇒ `undecidable`.

Kontekst trasy (w tej kolejności):
1. najbliższe wcześniejsze `page.goto('<literal>')` w tym samym callbacku `test(...)` / funkcji (URL → pathname, jak `routeFromUrl`);
2. adnotacja w komentarzu na początku pliku: `// understudy-route: /login` (dla Page Objects) — udokumentuj w skillu `stage-map`/`locator-policy`
   (edytuj ręczne `skills/*/SKILL.md`, potem `pnpm generate`);
3. brak ⇒ dopasowanie do wszystkich tras; `wrong-route` niemożliwe.

`nearest`: najpierw ta sama trasa, potem pozostałe; podobieństwo na słowach nazwy (jak `score` w `resolve-locator.ts` — wydziel wspólną funkcję, nie kopiuj).

## Zadania

1. Rozszerz `extractLocators` o kolumny/zakres i o `exact` (bez zmiany istniejących pól — benchmark z nich korzysta).
2. Implementacja analizatora + eksport z engine.
3. **Tabela testów FP/FN** (`packages/engine/test/verification/locator-analyzer.test.ts`), minimum:
   - known exact, known case-insensitive substring, `exact: true` niepasujące, ambiguous bez name,
   - unknown (wymyślona nazwa), unknown testid, wrong-route (goto `/login`, element tylko na `/signup`),
   - stale (status stale), stale (wiek > 30 dni), unverified (inferred),
   - undecidable: zmienna, template z `${}`, `getByText`, `locator('css=…')`,
   - łańcuch `page.getByRole('form').getByRole('button', { name: 'Save' })`,
   - Page Object z adnotacją `understudy-route`, Page Object bez adnotacji,
   - pusta KB ⇒ każdy rozstrzygalny locator `unknown`, a `suggestion` mówi o `extract`/`survey`.
4. Mikrobenchmark w teście: 200 locatorów × KB 2 000 faktów < 200 ms (ESLint woła to per plik).

## Nie ruszaj

CLI, ESLint, constitution, benchmark (konsumenci przyjdą w 11/12/14).

## Kryteria akceptacji (docs/09 → KB-aware locator checking, część analizy)

- znany locator dopasowany niezawodnie ✓; nieznany zgłoszony ✓; kontekst trasy respektowany ✓;
- najbliższy znany wpis podpowiadany ✓; testy FP i FN ✓.

## Weryfikacja

```bash
pnpm --filter @understudy/engine test
pnpm verify
```
