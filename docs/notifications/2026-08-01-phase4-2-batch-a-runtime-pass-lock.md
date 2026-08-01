# PHASE 4-2 BATCH A RUNTIME PASS — LOCK

**Declared:** 2026-08-01  
**Commit:** `838d7a130` — Legacy Cleanup Batch A only (heal / shadow bridge / compat helper)  
**Scope:** Runtime regression after Production deploy. No feature changes in this lock.

## Gates

| Gate | Result |
|------|--------|
| Production deploy (team confirm) + `origin/main` = `838d7a130` | PASS |
| Web authority baseline 불변 | PASS |
| Xiaomi badge native identity | PASS (retry; first warm Cap race then OK) |
| Samsung badge native identity | PASS |
| Bell digit · Inbox identity (28/28) | PASS |
| RoomUnread / Badge / Bell HARD LOCK 회귀 0 | PASS (digits unchanged; no Authority edits in commit) |

## Baseline 불변 (viewer asas55 / `35dd245c-…`)

| Surface | Expected (Batch A pre) | Runtime (post-deploy) |
|---------|------------------------|------------------------|
| App Icon | 32 | 32 |
| Bottom Chat | 4 | 4 |
| Trade rooms | 1 | 1 |
| Store order (customer+owner rooms) | 27 (25+2) | 27 (25+2) |
| GD / Group | 4 / 0 | 4 / 0 |
| Bell digit · Explain · Events · Inbox | 2 | 2 |

## Evidence

| Artifact | Notes |
|----------|--------|
| `.qa-logs/badge-ssot-phase4/batch-a-web-authority-runtime-prod.json` | appIcon=32 · bell=2 |
| `.qa-logs/badge-ssot-phase4/batch-a-runtime-device-retry.log` | Xiaomi+Samsung PASS |
| `.qa-logs/badge-ssot-phase4/batch-a-runtime-bell.log` | 28/28 PASS |
| `.qa-logs/badge-ssot-phase4/batch-a-runtime-baseline-expected.json` | expected matrix |

## Still forbidden

- Commit B (explainMatrix / bellExplainMatrix / ACK / orphan IDs) — separate review
- Batch B entry
- Product PASS / full Phase 4 CLOSE

## Status

**PHASE 4-2 BATCH A RUNTIME PASS — LOCK**
