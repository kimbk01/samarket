# Slice 2-5 — C_store Audit Start Baseline

**Status:** AUDIT ONLY — **no product code · no runtime · no deploy · no APK**  
**Date:** 2026-08-03  
**Verdict allowed this step:** `SLICE 2-5 C_STORE AUDIT PASS` only  
**Not allowed:** CODE PASS · RUNTIME PASS · PRODUCT PASS · HARD LOCK · Slice 2-6

---

## 1. Git / Production

| Item | Value |
|------|--------|
| HEAD | `c673ac444c274440a2c48ee70a4dc9a70a54348b` |
| origin/main | same (`c673ac444`) |
| Production SHA (GitHub env=Production) | `c673ac444c274440a2c48ee70a4dc9a70a54348b` |
| Production created_at | `2026-08-02T20:07:27Z` |
| Working tree | dirty only with untracked QA/cursor artifacts (`.qa-logs/**`, `.cursor/rules/*`); **no intentional C_store product diff** |
| Prior slice tip | `c673ac444` — Slice 2-4 cross-isolate Hub cache fix |

## 2. Locked axes (DO NOT TOUCH)

| Axis | Status | This Slice |
|------|--------|------------|
| A_member | LOCK (2-2 RUNTIME PASS) | **forbidden to modify** |
| B_member | LOCK (2-3 RUNTIME PASS) | **forbidden to modify** |
| B_store | LOCK (2-4 RUNTIME PASS) | **forbidden to modify** |
| C_store | **audit only** | document SSOT + gaps |
| Native / FCM | Slice 2-6 | not started |

## 3. Why C_store is different

| Axis | Decrease unit |
|------|----------------|
| A_member | **Read** (inbox mark-read) |
| B_member / B_store | **Read** (room tip / unread room → 0) |
| **C_store** | **Action Complete** (ops status leaves Action Required) |

Opening a screen, refreshing, or marking a Bell row read **must not** be the sole clear condition for Hub C state counts.

## 4. Deliverables (this folder)

| File | Purpose |
|------|---------|
| `event-ssot.md` | Event × Identity × Surface × Clear × Authority (LOCK draft) |
| `authority-map.md` | Dual authority conflict + target single C formula |
| `surface-map.md` | Surface reach of each C candidate |
| `identity-audit.md` | `user:{ownerId}` vs `store:{storeId}` |
| `keep-route-delete.md` | Writer/reader classification |
| `runtime-gap.md` | Gaps for next Authority Contract / CODE |
| `slice2-5-audit-verdict.md` | Final audit verdict |
