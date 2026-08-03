# Gate 3 Step 4 — Notification Authority A

**HEAD (start):** `f438f37e2`  
**Scope:** Bell digit / unread list / mark-all → one canonical event-id set  
**Out of scope:** Conversation B · Owner C · App Icon formula · Native · UI redesign · Push · migration · deploy · device QA

---

## Verdict

```text
NOTIFICATION AUTHORITY A CODE PASS
```

| Declaration | Status |
|-------------|--------|
| NOTIFICATION AUTHORITY A CODE PASS | **YES** |
| Badge Authority CODE PASS | **NO** (forbidden) |
| RUNTIME / PRODUCT / HARD LOCK | **NO** (forbidden) |
| Step 5 Conversation B entry | **ALLOWED** (A set equality proven in code) |

---

## 1. 수정 파일

| Path | Role |
|------|------|
| `lib/notifications/badge-authority-rebuild/member-notification-a-eligibility.ts` | Shared A eligibility (persistent / read / delete / chat / owner / missed XOR) |
| `lib/notifications/badge-authority-rebuild/member-notification-a-authority.ts` | `resolveMemberNotificationAuthorityFromRows` / `Set` → eventIds, unreadCount, authorityVersion, computedAt |
| `lib/notifications/badge-authority-rebuild/member-notification-a-projection.ts` | Digit = \|canonical eventIds\|; list filter uses canonical unread ids; attentionKeys = ADAPTER |
| `lib/notifications/badge-authority-rebuild/authority-a-set-heads.ts` | Snapshot: digitEventIds ≡ unreadListEventIds ≡ markAllEventIds |
| `lib/notifications/inbox-read-bridge.ts` | Mark-all = canonical A ids only (no legacy dual-write) |
| `lib/notifications/pipeline/build-domain-badge-authority-http.ts` | Digit via `deriveMemberUnreadNotificationCount(rows, uid)` |
| `lib/notifications/__tests__/member-a-mark-all.test.ts` | Canonical-only mark-all |
| `lib/notifications/badge-authority-rebuild/__tests__/authority-a-set-contract.test.ts` | Contract PASS (former HEAD FAIL / it.fails → real PASS) |
| `lib/notifications/badge-authority-rebuild/__tests__/member-notification-a-projection.test.ts` | Room-bound missed / count = eventIds |

Identity (Step 3, unchanged this step): `badge-authority-identity.ts` — member key format remains `user:{memberId}` (Identity CODE PASS).

---

## 2. 제거·비활성화한 A writer

| Writer | Action |
|--------|--------|
| Mark-all → legacy `notifications` dual-write | **DELETE** path (no `from("notifications")` in mark-all) |
| Bell digit ← `attentionKeys.length` | **Removed** as A authority (digit = canonical event id count) |
| Category-blast / non-canonical event mark-all as Bell mark-all | **Replaced** by `markCanonicalMemberANotificationEventsRead` (exact `authority.eventIds`) |

---

## 3. 유지한 legacy / attention adapter와 이유

| Item | Class | Reason |
|------|-------|--------|
| `attentionKeys` on A projection | **ADAPTER** | Explain / migration tooling; **not** Bell digit |
| `digitAttentionKeys` on set snapshot | **ADAPTER** | Prove attention collapse ≠ digit; not authority |
| Legacy `notifications` table (no Step 4 backfill) | **KEEP** (unread elsewhere) | Gate 2: backfill later; this step does not dual-write or run migration |
| Temporary legacy **read** into digit | **Not added** | Would create a second number → FAIL |

---

## 4. Canonical A selector 경로

```text
notification_events (load scoped by user_id)
  → resolveMemberNotificationAuthorityFromRows(rows, memberId)
       → eventIds / unreadCount / authorityVersion / computedAt / memberKey
            ├── Bell digit          = unreadCount (= |eventIds|)
            ├── Bell unread list    = filter … allowUnread = eventIds
            └── mark-all targets    = eventIds (then update those ids only)
```

Module: `lib/notifications/badge-authority-rebuild/member-notification-a-authority.ts`

---

## 5. Digit / List / Mark-all event-id 집합 비교

Contract fixture (same product, two trade_status + admin_notice):

| Surface | Event IDs |
|---------|-----------|
| digitEventIds | `evt-a`, `evt-b`, `evt-c` |
| unreadListEventIds | `evt-a`, `evt-b`, `evt-c` |
| markAllEventIds | `evt-a`, `evt-b`, `evt-c` |

```text
digitEventIds = unreadListEventIds = markAllTargetEventIds  → PASS
digitCount = 3 = |eventIds|  (attention keys may still collapse ≤ 3 — ADAPTER only)
```

`gate2ASetsEqual(snap) === true` on the former failing fixture.

---

## 6. 테스트 목록과 결과

```bash
npx vitest run \
  lib/notifications/badge-authority-rebuild/__tests__/authority-a-set-contract.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/member-notification-a-projection.test.ts \
  lib/notifications/__tests__/member-a-mark-all.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/badge-authority-identity.test.ts
# → 4 files, 30 tests PASS

npx vitest run \
  lib/notifications/__tests__/inbox-bell-p0.test.ts \
  lib/notifications/__tests__/chat-notification-attention-projection.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/member-communication-b-projection.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/slice2-4-b-store-exclusion.test.ts \
  lib/notifications/badge-authority-rebuild/__tests__/slice2-1-classification-identity.test.ts
# → 5 files, 51 tests PASS
```

Contract coverage includes: set equality · dedupe once · read/deleted/push-only/marketing · trade/order peer vs status · owner_intake · orphan vs room-bound missed · other member `user_id` · mark-all ids exclude B/C · authorityVersion/computedAt.

---

## 7. tsc / lint 영향

- 관련 vitest PASS (transform/collect = typecheck of touched modules).
- 전체 `npm run lint` / `npx tsc --noEmit` **미실행** (개발 중 규정; `git add` 직전 게이트).

---

## 8. B / C / App Icon / UI / Push 무변경 증거

| Area | Evidence |
|------|----------|
| Conversation B projection modules | Not modified this step |
| Owner C | Not modified |
| App Icon formula / Native Cap | Not modified (digit unit change only via A count; App Icon official formula not rewritten) |
| Push routing | Not modified |
| DB migration / backfill | Not run / not added |
| Notification Center full UI | List filter only uses canonical unread ids; no UI redesign |
| Diff footprint | `lib/notifications/*` A path + mark-all + digit wire; no `android/` / `ios/` / Cap badge |

---

## 9. 남은 A 관련 위험

1. Load path must remain `user_id = memberId` (row `user_id` filter is defense-in-depth).
2. Attention keys still exist for explain — any future code that uses `attentionKeys.length` as Bell digit is a regression.
3. Read rows still pass list type-filter (UI keep policy deferred); unread set is canonical only.
4. Legacy `notifications` rows not backfilled — product may still show gaps until Gate 2 backfill; must not re-add dual-write.
5. Runtime/device not proven — CODE PASS only.

---

## 10. Step 5 진입 가능 여부

**YES** — Notification Authority A set equality is CODE PASS.  
Next: Conversation B only. Do **not** declare Badge Authority CODE PASS / Runtime / Product / Hard Lock.
