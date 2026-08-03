# Legacy / Benchmark Notification Patterns (Phase 0)

**Status:** AUDIT ONLY — no code change  
**Date:** 2026-08-02  
**Rule:** evidence class labeled; no invented PASS

Evidence classes:

- **DEVICE** — installed app observed this session / logged QA  
- **REPO** — DIBAY code or prior repo docs  
- **QA_LOG** — `.qa-logs/**` artifacts  
- **PUBLIC** — official product help / well-known product UX (not device-captured here)  
- **ABSENT** — searched, not found  

---

## 1. DIBAY Legacy product app

| Check | Result | Class |
|-------|--------|-------|
| Standalone legacy badge APK/IPA distinct from `com.dibay.app` | **NOT FOUND** | QA_LOG + DEVICE |
| Devices Xiaomi / Samsung packages | only `com.dibay.app` | QA_LOG `badge-legacy-ux/phase1a-availability-20260802-133641/VERDICT.txt` |
| Workspace / Downloads legacy APK | current DIBAY debug builds only | QA_LOG |
| Git tag as installable legacy app | code-history only, not APK | QA_LOG |
| PHASE 1B legacy evidence collection | **SKIPPED** (prerequisite absent) | QA_LOG |

**Conclusion:** Cannot copy a DIBAY legacy badge UX from an installable legacy binary. Gap analysis must use **user-approved contract** (this instruction) as Priority 1.

---

## 2. Prior DIBAY repo contracts (reverted / still on disk)

| Doc / commit | Class | Relevance |
|--------------|-------|-----------|
| `docs/notifications/2026-08-01-phase2-badge-ssot-authority-audit.md` | REPO | App Icon = all chat rooms + orphan; Bell separate |
| `docs/notifications/2026-08-01-phase3-bell-ssot-authority-audit.md` | REPO | Bell = notification_events |
| `059b7dcbd` `docs/notification-badge-authority.md` (reverted, recoverable via git show) | REPO | Approved draft: member App Icon = A + member B; owner ops excluded |
| HEAD Phase B code | REPO | Reverted back; owner rooms + owner intake can inflate |

---

## 3. External product patterns (not device-captured this Phase 0)

These are **PUBLIC / known product patterns** used as design reference only. They are **not** DEVICE evidence from this audit run. Do not treat as HARD LOCK proof.

### 3.1 KakaoTalk (PUBLIC pattern)

| Topic | Pattern | Use for DIBAY |
|-------|---------|---------------|
| Chat tab | Unread **room** aggregation common; row = messages | Aligns with Bottom Chat = room count; row = messages |
| Channel / ads | Separated from personal chat unread | Aligns with marketing ∉ A/B |
| Calls | Call history ≠ always chat unread | Aligns with missed-call dedupe rules |

**Not verified on device this session.**

### 3.2 Karrot / 당근 (PUBLIC pattern — primary A/B split reference)

| Topic | Pattern | Use for DIBAY |
|-------|---------|---------------|
| Chat vs alerts | Chat messages in chat tab; non-chat in notification area | **Primary justification for Bell=A, chat∉Bell** |
| Trade status / offers | Notification area, not chat unread | Trade status → A; trade messages → B |
| Read / open | Open notification → detail | Deep link + A read |

**Not verified on device this session.** Instruction §13 explicitly prefers 당근 for A/B separation.

### 3.3 Baemin / Yogiyo (PUBLIC pattern — member vs owner)

| Topic | Pattern | Use for DIBAY |
|-------|---------|---------------|
| Customer order status | Customer app alerts | Customer A |
| Owner new orders | Owner/CEO app or owner mode | **C — not member Bell** |
| Accept removes ops badge | Action-complete, not mere open | C decrease rules |
| Multi-store | Store context in owner tools | store_id identity |

**Not verified on device this session.**

---

## 4. Runtime evidence already collected (DIBAY current / pre-revert)

Class: **QA_LOG** (host often `127.0.0.1:3000`, commit notes `a2dafa7b6`, dirty tree).

| Finding | Evidence |
|---------|----------|
| A up / read / delete often pass under A/B formula harness | runtime-ab-3device reports |
| B room up / room read repeatedly FAIL | same |
| Samsung baseline large App Icon (e.g. trade 3 + buyer 17 → appIcon 20 with A=0) | report `beforeB` |
| Owner isolation API checks sometimes pass | `samsung_owner` |
| Overall | `RUNTIME_PARTIAL_OR_FAIL`, HARD LOCK not declared |
| After full revert | HEAD ≠ tested A/B tree — **re-audit required before any PASS** |

---

## 5. Benchmark → DIBAY gap (candidates only)

| Gap | Instruction | CURRENT HEAD | Source priority |
|-----|-------------|--------------|-----------------|
| Bell excludes chat | Required | Digit excludes chat types; list filters vary | Contract > legacy absent |
| Bell excludes owner new order | Required | Owner intake in NotificationAttention | Contract |
| App Icon = A+B without C | Required | Chat includes owner rooms; A includes owner intake | Contract |
| Marketing ephemeral no badge | Required | Digit exclude marketing type; tray may remain | Contract |
| Missed call in B not Bell | Required | Orphan missed in NotificationAttention/Bell | Contract |
| Row messages vs hub rooms | Required | Already mostly correct | REPO |

---

## 6. What Phase 0 does **not** claim

- No Kakao/당근/배민 DEVICE capture this run  
- No DIBAY legacy APK behavior  
- No PRODUCT PASS / HARD LOCK  
- No recommendation to re-apply `059b7dcbd` blindly (runtime B path failed)

---

## 7. Stop

Legacy/benchmark baseline fixed for Phase 0.  
Next: Phase 1 Authority Contract — only after user accepts these four audit docs.
