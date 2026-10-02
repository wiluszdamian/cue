# Plan wdrożenia — Improvement Pack (Project Cue) na repo Understudy

Źródło: `.planning/docs/*` (kierunek produktu) + przegląd kodu z 2026-10-01 (commit `a94d4b7`).
Inwentaryzacja i decyzje architektoniczne: [00-inventory-and-decisions.md](00-inventory-and-decisions.md).
**Przeczytaj ją przed pierwszym ticketem** — kilka założeń z `docs/` świadomie odrzuciłem lub odłożyłem.

## Jak odpalać tickety (Sonnet)

Jeden ticket = jedna sesja = jeden commit (lub kilka małych). Kolejność wg tabeli niżej;
ticket wolno zacząć dopiero, gdy wszystkie z kolumny „Zależy od” są `done`.

Prompt startowy dla każdej sesji:

```text
Zrealizuj ticket .planning/tickets/<PLIK>.md.
Najpierw przeczytaj: AGENTS.md, .planning/00-inventory-and-decisions.md, sam ticket
oraz wszystkie pliki z sekcji "Kontekst". Trzymaj się sekcji "Zakres" i "Nie ruszaj".
Kod, komentarze, komunikaty CLI i dokumentacja w repo — po angielsku, w stylu otaczającego kodu.
Na koniec uruchom komendy z sekcji "Weryfikacja", wklej wynik i zaktualizuj status
ticketu w .planning/README.md. Jeśli kryterium akceptacji nie da się spełnić — zatrzymaj się
i opisz dlaczego, zamiast obchodzić wymaganie.
```

Zasady wspólne dla wszystkich ticketów:

- Zmiana zachowania reguł = edycja `rules/constitution.yaml` + `pnpm generate`. Nigdy nie edytuj plików generowanych (`docs/reference/`, `skills/reference/`, `skills/README.md`, `plugins/`, `packages/*/src/generated/`, manifesty marketplace).
- Nowa komenda CLI = wpis w `packages/cli/src/commands.ts` + help w `cli.ts` + `docs/help/commands.md` (pilnuje tego `packages/cli/test/advice.test.ts`).
- Nigdy bare `tsc` — tylko `pnpm tsc` / `pnpm typecheck`.
- Windows jest celem pierwszej klasy (to repo jest rozwijane na Windowsie).
- Na końcu każdego ticketu: `pnpm verify` zielone. Jeśli ticket zmienia constitution/skills/schemy generowane: najpierw `pnpm generate`.
- Nazewnictwo produktu: na razie **`understudy`** (komendy, pakiety). Rebranding na Cue to P2 — w ticketach `cue verify` z docs = `understudy verify`.
- Wpis do `CHANGELOG.md` (sekcja Unreleased) przy każdej zmianie widocznej dla użytkownika.

## Kolejność i status

| #  | Ticket | Prio | Zależy od | Status |
| -- | ------ | ---- | --------- | ------ |
| 00 | [Baseline: zielone `pnpm verify`](tickets/00-baseline.md) | P0 | — | done (453 testów: engine 247, cli 97, mcp 52, benchmark 33, eslint-plugin 24) |
| 01 | [Drobne niespójności (confirm bez TTY, wersja pluginu, odnośnik do planu)](tickets/01-hygiene.md) | P0 | 00 | done |
| 02 | [Bezpieczne uruchamianie playwright-cli (bez shella)](tickets/02-browser-process-hardening.md) | P0.1 | 00 | done |
| 03 | [Aplikacja demo do E2E i benchmarku](tickets/03-demo-app.md) | P0.2 | 00 | done |
| 04 | [Wersjonowany parser snapshotów + fixtures](tickets/04-snapshot-parser-versioning.md) | P0.1 | 02, 03 | done |
| 05 | [OpenAPI przez prawdziwy parser](tickets/05-openapi-real-parser.md) | P0.4 | 00 | done |
| 06 | [`understudy verify` — rozdzielona semantyka weryfikacji](tickets/06-verify-semantics.md) | P0.3 | 00 | done |
| 07 | [Knowledge Core v1 — model domenowy](tickets/07-knowledge-core-model.md) | P0.5 | 00 | done |
| 08 | [Knowledge Core — wczytywanie istniejącego `.agent-kb` + zapytania](tickets/08-knowledge-core-legacy-adapter.md) | P0.5 | 07 | done |
| 09 | [`.agent-kb` v2 na dysku: evidence, status, migracja](tickets/09-agent-kb-v2-on-disk.md) | P0.5 | 08 | done |
| 10 | [Wspólny analizator locatorów vs KB](tickets/10-locator-analyzer.md) | P0.6 | 08 | done |
| 11 | [`understudy check <files>`](tickets/11-check-command.md) | P0.6 | 10 | done |
| 12 | [Reguła ESLint oparta o KB (`selectors-from-agent-kb` egzekwowana)](tickets/12-eslint-kb-rule.md) | P0.6 | 10 | done |
| 13 | [Prawdziwe E2E w CI: extract → survey → locator → check → test → verify](tickets/13-e2e-ci.md) | P0.2 | 02, 03, 04, 06, 11 | done |
| 14 | [Benchmark: kompilacja i uruchamianie wygenerowanych testów](tickets/14-benchmark-execution.md) | P0.7 | 03, 10 | done |
| 15 | [Benchmark: mutacje, metadane, raport](tickets/15-benchmark-mutation-report.md) | P0.7 | 14 | done |
| 16 | [Pierwszy prawdziwy benchmark (ręcznie, płatne API)](tickets/16-benchmark-real-run.md) | P0.7 | 13, 15 | runbook gotowy (`benchmarks/RUNBOOK.md`) — **czeka na Ciebie: płatne nagranie** |
| 17 | [Świeżość oparta o git (possibly-stale)](tickets/17-git-aware-freshness.md) | P1.1 | 09 | done |
| 18 | [Celowany survey (`--route`, `--stale`, `--affected-by`)](tickets/18-targeted-survey.md) | P1.2 | 06, 17 | done |
| 19 | [`understudy discover`](tickets/19-discover.md) | P1.3 | 05 | todo |
| 20 | [MCP: rozszerzone resolve_* / get_evidence / get_freshness](tickets/20-mcp-resolution.md) | P1.4 | 09 | todo |
| 21 | [MCP: `get_context`](tickets/21-mcp-get-context.md) | P1.4 | 20 | todo |
| 22 | [`doctor` — diagnostyka wiedzy](tickets/22-doctor-knowledge.md) | P1.5 | 09, 10, 17 | todo |
| 23 | [Macierz kompatybilności i pinowanie wersji](tickets/23-compatibility-matrix.md) | P1.6 | 04 | todo |
| 24 | [i18n przez prawdziwy parser (zagnieżdżone klucze)](tickets/24-i18n-real-parser.md) | P1 | 05 | todo |
| 25 | [Wiedza z istniejących testów i Page Objects](tickets/25-extract-existing-tests.md) | P1 | 09, 10, 19 | todo |

P2 (bez ticketów, do rozpisania po P1): [backlog-p2.md](backlog-p2.md).

## Graf zależności

```text
00 ─┬─ 01
    ├─ 02 ──┐
    ├─ 03 ──┼─ 04 ─────────────┬─ 13 ── 16
    │       │                  │   ▲
    ├─ 05 ──┼─ 19, 24          │   │
    ├─ 06 ──┼──────────────────┘   │
    └─ 07 ── 08 ─┬─ 09 ─┬─ 17 ─┬─ 18
                 │      ├─ 20 ── 21
                 │      └───────┴─ 22
                 └─ 10 ─┬─ 11 ──── 13
                        ├─ 12
                        └─ 14 ── 15 ── 16
04 ── 23
09 + 10 + 19 ── 25
```

Równoległe ścieżki po 00 (jeśli chcesz odpalać kilka sesji naraz, w osobnych worktree):
A = 02 → 04, B = 03, C = 05, D = 06, E = 07 → 08 → 10.
