# Backlog P2 (bez ticketów — rozpisać po zakończeniu P1)

| Temat | Źródło | Warunek startu |
| --- | --- | --- |
| Uproszczenie katalogu skills (usunąć/scalić te bez wartości specyficznej dla Understudy) | docs/08 P2.1 | Wyniki benchmarku (16) — mierzyć, które skills są używane |
| Lepsze budżetowanie kontekstu (warunek benchmarku przez `get_context` zamiast zrzutu KB) | docs/08 P2.2, ticket 15 pkt 7 | 21 zrobione |
| Agent benchmarkowy z narzędziami (mierzy browser exploration count, knowledge reuse, repair iterations) | docs/07 | 15 zrobione |
| Benchmark na prawdziwym repo brownfield (pilot) | docs/07 „representative application” | 16 zrobione |
| Wizualny eksplorator wiedzy (trasy, stale, konflikty, provenance, pokrycie) | docs/08 P2.3 | CLI/MCP stabilne |
| Wydzielenie pakietów `knowledge-core`, `browser`, `verification` | docs/02, ADR-1 | Kontrakty z 07–10 bez zmian przez ≥1 wydanie |
| Rebranding Understudy → Cue: pakiety, bin, `.understudy/` → nowa nazwa **z migracją manifestu i znaczników regionów**, pluginy, docs | docs/08 P2.4, `.codex/project-summary/04-nazwa.md` | Kontrakty stabilne; sprawdzona dostępność nazwy na npm |
| Encje role/state/component z ekstrakcji (fixtures auth, storageState, enumy ról) | docs/03 | 25 zrobione |
| `resolve_role`, `resolve_state`, `resolve_component` w MCP | docs/06 | encje istnieją |
| Kolejne reguły Cue-aware: `role-incompatible-action`, `state-incompatible-action`, `environment-mismatch` | docs/05 | encje role/state istnieją |
| Locale w `term` (i18n) | ticket 24 | — |
| Usunięcie aliasu `verify-map` | ADR-6 | wydanie minor po 06 |

Świadomie odłożone (docs/08 „Explicitly defer”): autonomiczny crawl całej aplikacji, baza grafowa, cloud control plane,
dziesiątki generycznych reguł Playwright, forki logiki per agent.
