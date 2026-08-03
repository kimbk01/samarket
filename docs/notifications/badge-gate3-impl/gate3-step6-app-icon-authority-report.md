# Gate 3 Step 6 — App Icon Authority Projection

**Verdict:**

```text
APP ICON AUTHORITY PROJECTION CODE PASS
```

| Declaration | Status |
|-------------|--------|
| APP ICON AUTHORITY PROJECTION CODE PASS | **YES** |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Step 7 Owner C entry | **ALLOWED** (App Icon CODE only) |

---

## 1. HEAD App Icon 실패 증거

`docs/notifications/badge-gate3-impl/gate3-step6-head-app-icon-fail-proof.md`

F1 total-only · F2 attention/legacy · F3 Cap resume no version · F4 7 writers · F5 orphan double-add · F6 store mix risk.

---

## 2. 수정 파일

| Path | Role |
|------|------|
| `member-app-icon-authority.ts` | `resolveMemberAppIconAuthority` + version compare + publish gate |
| `member-app-icon-authority-commit.ts` | Single client publisher / logout clear / cache reconcile |
| `build-notification-badge-projection.ts` | App Icon = A + B_rooms (no orphan re-add) |
| `member-communication-b-projection.ts` | `buildMemberAppIconWebProjection` = A + rooms |
| `build-domain-badge-authority-http.ts` | Emit full `memberAppIconAuthority` snapshot |
| `apply-badge-count-authority-response.ts` | Stale App Icon version reject before projection commit |
| `native-fcm-member-app-icon-authority.ts` | Prefer snapshot.appIconTotal echo |
| tests + writer/fail/report docs | Contract + classification |

Native Android/iOS **source unchanged** (echo-only; Cap resume classified DELETE-as-authority).

---

## 3. Canonical App Icon resolver 경로

```text
resolveMemberNotificationAuthorityFromRows  → A
resolveMemberConversationAuthority          → B
        ↓
resolveMemberAppIconAuthority({ A, B, revision })
        ↓
publishMemberAppIconAuthority / commitMemberAppIconAuthority
        ↓
Native/FCM absolute echo (appIconTotal only)
```

---

## 4. A/B 구성요소 JSON 예시

```json
{
  "memberKey": "user:11111111-1111-1111-1111-111111111111",
  "memberNotificationUnread": 2,
  "generalUnreadRooms": 1,
  "groupUnreadRooms": 1,
  "tradeUnreadRooms": 1,
  "orderUnreadRooms": 1,
  "memberConversationUnreadRooms": 4,
  "appIconTotal": 6,
  "notificationAuthorityVersion": "…",
  "conversationAuthorityVersion": "…",
  "authorityVersion": "ai1|100|user:…|a2|g1|gr1|t1|o1|e:…|r:…",
  "computedAt": "2026-08-03T00:00:00.000Z"
}
```

---

## 5. appIconTotal 공식 증거

```text
memberConversationUnreadRooms = G + Group + Trade + Order
appIconTotal = memberNotificationUnread + memberConversationUnreadRooms
```

Tests: `appIconTotal equals A+B` · builder ignores attention/legacy/UI · owner C reject.

---

## 6. authorityVersion 생성·비교 규칙

```text
authorityVersion = ai1|{serverRevision}|{contentKey}
contentKey = memberKey + A/B counts + sorted eventIds + sorted room identity keys
```

| Compare | Rule |
|---------|------|
| higher `revision` | newer |
| same revision | contentKey equality → idempotent; else lexicographic |
| `computedAt` | debug only — **not** ordering authority |

Documented in module header.

---

## 7. cold / warm / resume 경로

| Path | Flow |
|------|------|
| Cold / Warm | badge-count HTTP → `resolveMemberAppIconAuthority` → commit |
| Resume | Cap cache may paint as ADAPTER; canonical HTTP must win via version gate |
| Forbidden | Warm UI sum · Resume Cap as authority |

---

## 8. Writer 7개 분류

See `gate3-step6-app-icon-writer-classification.md`.

---

## 9. Canonical publisher 수

```text
1 — publishMemberAppIconAuthority / commitMemberAppIconAuthority
```

---

## 10. Native / Cap 변경

| Layer | Change |
|-------|--------|
| TS Native/FCM resolver | Prefer `memberAppIconAuthority.appIconTotal` |
| Android/iOS Java/Swift | **No code change** — absolute echo only; Cap resume **not** authority |

---

## 11. Stale overwrite 차단

- `publish` / `commit`: older rev → `STALE_VERSION`
- HTTP apply: stale App Icon snapshot → reject before projection commit
- `reconcileCachedAppIconWithCanonical`: cache cannot overwrite newer

---

## 12. Missed-call XOR

- Orphan ∈ A only; App Icon does not add `orphanMissedCallCount` again
- Room-bound ∈ B rooms
- `assertAppIconMissedCallXor`: A event ids ∩ B identity keys = ∅

---

## 13. Owner C 비포함

- Owner rooms omitted from Conversation B inputs
- `publish…({ ownerStoreOrderUnreadRooms > 0 })` → `OWNER_C_FORBIDDEN`
- Store action-required same reject

---

## 14. A/B 비회귀

| Suite | Result |
|-------|--------|
| A set contract | PASS |
| B conversation authority | PASS |
| App Icon embeds A/B checks | PASS |

---

## 15. 테스트 결과

| Run | Result |
|-----|--------|
| Step 6 + A/B + identity + native-fcm + inbox | **89 PASS** |
| Adjacent app-icon / surface tests | **21 PASS** |

---

## 16. tsc / lint

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |

---

## 17. 남은 위험

1. Cap `applyFromCapBadgeCache` still paints prefs without version (DELETE-as-authority; needs Native follow-up if OEM resumes before Web).
2. HTTP room identity fallbacks still `*:room:{uuid}` until loaders always pass Gate 2 keys.
3. Runtime/device not proven.
4. Owner C surfaces not built (Step 7).

---

## 18. Step 7 진입 가능 여부

**YES** — App Icon Authority Projection is CODE PASS.  
Next: Owner C only. Do **not** declare Badge Authority / Runtime / Product / Hard Lock.
