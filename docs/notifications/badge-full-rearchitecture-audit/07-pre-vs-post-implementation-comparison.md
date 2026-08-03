# 07 — Pre vs Post Implementation Comparison

**Baseline:** `1e2a560c1`  
**Current:** `f438f37e2` (= origin/main = Production)  
**Commits in range:** 13 (badge slices + docs + test align)

---

## Is `1e2a560c1` a healthy product baseline?

**NO.** Phase0 maps at that HEAD document:

- `owner_intake` in Bell + App Icon notification axis  
- Owner rooms in Member App Icon ChatAttention  
- Runtime `RUNTIME_PARTIAL_OR_FAIL`  
- Digit vs list already fragile (owner commerce exclude asymmetries)

→ Baseline = **pre-rebuild failed state**, not “last good.”

---

## Commit ladder (implementation)

| SHA | Role |
|-----|------|
| `ca86a20c1` | Slice 2-1 foundation tests/contracts |
| `d6dbb91d4` | Slice 2-2 separate member Bell A |
| `1a814053b` | mark-all all member stores |
| `06bab8001` | Slice 2-3 B_member / App Icon formula |
| `f3dd1bb5d` | room read reconcile |
| `5ee177ca6` | Slice 2-4 B_store room count |
| `c78dd7a1e` / `c673ac444` | owner hub cache invalidate/refresh |
| `aa2d46b09` | Slice 2-5 C_store |
| `3b8f836c5` | docs 2-5 runtime |
| `e2cb00ec8` | Slice 2-6 Native/FCM absolute |
| `f438f37e2` | 2-6 test align |

---

## Error delta (baseline → now)

| Error class | Baseline `1e2a560c1` | Current `f438f37e2` |
|-------------|----------------------|---------------------|
| owner_intake in Bell digit | **Present** | **Filtered** from A (writer remains) |
| Owner rooms in Member App Icon | **Present** | **Excluded** in A-path projection |
| C dual max authority | Present historically | **Forbidden** in Hub C |
| Owner FAB message-sum as room | Present | **Room count** |
| Bell digit vs list same set | Fragile | **Still fractured** (keys vs rows; popup B) |
| Native absolute App Icon | Mixed / Phase B | Absolute wire + always-send 0 |
| Product multi-surface PASS | FAIL | **Still FAIL** (different shape) |

**Interpretation:** Implementation **reduced ownership pollution** and clarified axis formulas, but **replaced / left open** A surface identity and Bell chrome mixing. Not a pure improvement to product PASS; **error class shifted**.

---

## Can small fixes restore single SSOT?

| Path | Feasible? |
|------|-----------|
| One filter tweak on list | **Insufficient** — popup dual, mark-all legacy, key vs event unit, Cap cache |
| Keep all slices, patch readers only | Risky — dual-source still multiplies |
| Git reset to `1e2a560c1` | **Restores older FAIL** |
| Contract keep + A/B/C surface rebuild | Matches evidence |

→ Dual-source / override accumulation supports **implementation rebuild**, not “local filter only.”
