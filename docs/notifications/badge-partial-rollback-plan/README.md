# Badge — Partial Rollback Manifest & Rebuild Baseline

**Plan verdict:** `REVOKED` → see `../badge-dependency-evidence/` (`EVIDENCE INSUFFICIENT`, P0 HOLD)  
**Executed:** **NO** — do not `git revert` from this folder

| Doc | Purpose |
|-----|---------|
| [keep-revert-symbol-map.md](./keep-revert-symbol-map.md) | KEEP / REVERT / DELETE_AFTER_REBUILD / migrations |
| [commit-revert-order.md](./commit-revert-order.md) | P0 order + do-not-revert slices |
| [migration-compatibility.md](./migration-compatibility.md) | KEEP / REVIEW / BLOCKED |
| [post-rollback-baseline.md](./post-rollback-baseline.md) | Target tree after P0 + quarantine |
| [rebuild-slices.md](./rebuild-slices.md) | R0–R10 |
| [risk-and-recovery.md](./risk-and-recovery.md) | Risks |
| [partial-rollback-verdict.md](./partial-rollback-verdict.md) | Plan PASS + approval gate |
| [rollback-manifest.json](./rollback-manifest.json) | Machine-readable manifest |

## One-line plan

Revert **only** Slice 2-6 (`f438f37e2` → `e2cb00ec8`).  
**Do not** revert 2-2…2-5 (pollution returns).  
Rebuild A as `AUnreadEventIds`, unify Bell surfaces, prove App Icon membership, fix Native fresh-snapshot order.
