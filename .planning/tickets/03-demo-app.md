# 03 — Aplikacja demo do E2E i benchmarku

**Prio:** P0.2 · **Zależy od:** 00 · **Rozmiar:** M

## Cel

Mała, deterministyczna aplikacja, na której CI (13) i benchmark (14–16) przechodzą cały przepływ
na prawdziwej przeglądarce. Musi dać się „zepsuć” kontrolowanymi mutacjami.

## Projekt

Lokalizacja: `examples/demo-app/` jako **prywatny** pakiet workspace `@understudy/demo-app`
(dodaj `examples/*` do `pnpm-workspace.yaml`; `private: true`, więc `pnpm release` go pominie — sprawdź `release:dry`).

- Serwer: `node:http`, **zero zależności runtime**. TypeScript budowany jak reszta repo albo czyste `.mjs`
  (wybierz prostsze; jeśli `.mjs` — upewnij się, że lint/format go obejmują lub świadomie wykluczają).
- `PORT` z env (domyślnie 4310), start: `pnpm --filter @understudy/demo-app start`.
- Strony (statyczny HTML z serwera, bez frameworka, poprawna semantyka ARIA):

  | Trasa | Zawartość |
  | --- | --- |
  | `/login` | form: Email, Password, button „Log in”, link „Forgot password?”, komunikat błędu przy złym haśle |
  | `/dashboard` | wymaga sesji; heading „Welcome back, &lt;name&gt;” pojawia się po ~1,5 s (scenariusz `slow-page`) |
  | `/signup` | form z walidacją emaila, komunikaty błędów |
  | `/admin/settings/security` | tylko rola `admin`; form zmiany hasła, button „Change password” |
  | `/items` | prosty CRUD w pamięci (lista, dodaj, usuń) |
  | `/api/*` | `POST /api/login`, `GET /api/me`, `GET/POST/DELETE /api/items` |

- Użytkownicy w pamięci: `user@demo.test` / `user-pass` (rola user), `admin@demo.test` / `admin-pass` (admin).
- Źródła wiedzy dla `extract` (w katalogu aplikacji):
  - `data-testid` w szablonach HTML (np. `login-submit`, `login-email`, `items-add`),
  - `openapi.json` **i** równoważny `openapi.yaml` (ten sam kontrakt — przyda się w tickecie 05),
  - `locales/en.json` z **zagnieżdżonymi** kluczami (przyda się w tickecie 24); etykiety w HTML mają odpowiadać tym tekstom.
- **Mutacje** przez env `DEMO_MUTATIONS=a,b`:

  | id | Efekt |
  | --- | --- |
  | `auth-silent-fail` | login pokazuje sukces, ale nie ustawia sesji (dashboard przekierowuje na login) |
  | `wrong-password-accepted` | złe hasło loguje |
  | `signup-validation-off` | brak walidacji emaila |
  | `button-renamed` | „Change password” → „Update password” (scenariusz stale locator) |
  | `route-moved` | `/admin/settings/security` → `/admin/security` |

- Referencyjne testy: `examples/demo-app/tests/*.spec.ts` (Playwright Test, **przypięta** wersja `@playwright/test`
  w devDependencies) — przechodzą bez mutacji, padają przy odpowiadającej mutacji.
  Pisane zgodnie z constitution (tagi, page objects, brak hard waits, locatory przez getByRole).
- `examples/demo-app/README.md`: uruchamianie, lista mutacji, przeznaczenie.

## Nie ruszaj

Pakietów `packages/*` (poza ewentualnym ignore w configach lint/test).

## Kryteria akceptacji

- `pnpm --filter @understudy/demo-app start` startuje na Windows i Linux.
- `pnpm --filter @understudy/demo-app test:e2e` — zielone bez mutacji.
- `pnpm --filter @understudy/demo-app test:mutations` uruchamia testy osobno dla każdej mutacji i **kończy się sukcesem
  tylko wtedy**, gdy dla każdej mutacji co najmniej jeden test pada (dowód, że zestaw referencyjny cokolwiek łapie).
- Testy referencyjne przechodzą ESLint z pluginem `@understudy/eslint-plugin` (preset `recommended`).
- Testy Playwright **nie** wchodzą do `pnpm test` (wymagają przeglądarki) — odpala je job E2E z ticketu 13.
- `pnpm verify` zielone; `pnpm release:dry` nie próbuje publikować demo.

## Weryfikacja

```bash
pnpm install
pnpm --filter @understudy/demo-app exec playwright install chromium
pnpm --filter @understudy/demo-app test:e2e
pnpm --filter @understudy/demo-app test:mutations
pnpm verify
pnpm release:dry
```
