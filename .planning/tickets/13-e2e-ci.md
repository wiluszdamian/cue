# 13 — Prawdziwe E2E w CI: extract → survey → locator → check → test → verify

**Prio:** P0.2 · **Zależy od:** 02, 03, 04, 06, 11 · **Rozmiar:** M

## Cel

CI udowadnia na prawdziwej przeglądarce, że cała ścieżka użytkownika działa na Windows i Linux.
Smoke test samej instalacji przestaje być jedynym testem end-to-end.

## Kontekst

- `.github/workflows/ci.yml` — job `smoke` (init/doctor/uninstall, bez przeglądarki).
- Demo app (03), driver bez shella (02), parser wersjonowany (04), `verify` (06), `check` (11).
- ADR-7: przeglądarka tylko w dedykowanym jobie.

## Projekt

Scenariusz jako **skrypt node** `scripts/e2e.mjs` (cross-platform, bez bash), uruchamialny lokalnie i w CI.
Workflow tylko przygotowuje środowisko i woła skrypt.

Kroki skryptu (każdy z asercją, błąd = czytelny komunikat + exit 1):

1. Zbuduj tymczasowy projekt (tmp dir, **ścieżka ze spacją**), `understudy init --yes`.
2. Uruchom demo app w tle (`PORT` losowy wolny), poczekaj na `/login` 200; sprzątanie procesu w `finally` (również na Windows).
3. `understudy extract --source examples/demo-app` ⇒ asercja: `testids.yaml` zawiera `login-submit`, `surface.yaml` zawiera `POST /api/login`.
4. `understudy survey http://127.0.0.1:<port>/login?next=%2Fdashboard&utm=a` (**celowo `&` i `%`**) ⇒ mapa `/login` istnieje,
   element `button "Log in"` ma status `verified` (test-id skorelowany).
5. `understudy survey` dla `/signup` (i `/dashboard`, jeśli logowanie przez CLI jest rozwiązane w 04; inaczej udokumentuj lukę).
6. `understudy locator "Log in" --route /login` ⇒ zawiera `getByRole('button', { name: 'Log in' })`.
7. `understudy check examples/demo-app/tests` (skopiowane do projektu) ⇒ exit 0; `check` na planted-bad pliku
   (`getByRole('button', { name: 'Sign in now' })`) ⇒ exit 1 i podpowiedź `Log in`.
8. Uruchom referencyjne testy Playwright demo ⇒ zielone.
9. `understudy verify --base-url http://127.0.0.1:<port> --ci=strict` ⇒ exit 0, `PASS` (dla tras, które zsurveyowano).
10. Restart demo z `DEMO_MUTATIONS=button-renamed` ⇒ `verify --ci=advisory` exit 1, `drifted`, w wyniku `Change password`
    lub `Log in` (zależnie od tego, co zsurveyowano — dobierz mutację do zmapowanej trasy).
11. `verify` bez `--base-url` ⇒ `NOT_VERIFIED`, brak zdania o zgodności.

Workflow: nowy job `e2e` w `ci.yml`, matrix `ubuntu-latest`, `windows-latest`, Node z `.nvmrc`;
`pnpm install --frozen-lockfile`, `pnpm build`, instalacja Chromium (`playwright install --with-deps chromium` na Linux),
`@playwright/cli` w **przypiętej** wersji (ta sama co w fixtures z 04), potem `node scripts/e2e.mjs`.
Artefakty przy błędzie: `.agent-kb` z tmp projektu + log demo app.

## Zadania

1. `scripts/e2e.mjs` + krótka sekcja w `CONTRIBUTING.md` (jak uruchomić lokalnie).
2. Job `e2e` w `ci.yml`.
3. Uruchom skrypt lokalnie na Windows (to repo jest rozwijane na Windows) i wklej wynik.

## Nie ruszaj

Logiki produktu — jeśli E2E ujawni błąd, napraw go w osobnym, małym commicie z testem jednostkowym i opisz w podsumowaniu.

## Kryteria akceptacji (docs/09 → Browser survey hardening)

- URL z `&` przekazany nienaruszony ✓; ścieżka ze spacją ✓; Windows i Linux ✓;
- co najmniej jeden prawdziwy browser E2E w CI ✓.

## Weryfikacja

```bash
pnpm build
node scripts/e2e.mjs
pnpm verify
```
