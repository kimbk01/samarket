# Gate 1 — Projection Map

**Mode:** AUDIT ONLY · HEAD `f438f37e2`  
**올바른 입력:** 명령서 §2–§3

---

## 표면 표

| Surface | 현재 입력 (코드) | 올바른 입력 (명령서) | 현재 문제 |
|---------|------------------|----------------------|-----------|
| **App Icon** | `memberAppIconWebTotal` ≈ A(`memberUnreadNotificationCount`=**attention keys**) + B(member unread **rooms** + unresolved missed) → `domain-badge-surface-store.appIconTotal` → Native absolute · FCM `badge_count` echo | A(**unread notification event 수**) + B(**unread room 수**) · 구성원 ID 증명 · Owner/C 제외 · badge_count는 결과물만 | A 단위가 **event가 아니라 key** · 구성원 집합 미노출 · Cap resume stale · Owner room 제외는 A-path에서 시도 |
| **Bell Badge** | `badge-count.total` ← `deriveMemberUnreadNotificationCount` = **`attentionKeys.length`** · UI `resolveTier1HeaderBellBadgeTotal`는 list sync **무시** | A = unread member notification **event** count · 목록과 동일 집합 | **단위 틀림** · 목록과 집합 불일치 PROVEN |
| **Bell 목록** | `GET /api/me/notifications` + exclude chat/owner commerce + `filterMemberNotificationAInboxRows` · **read+unread** rows · pushKind 탭 | 동일 A unread 집합 · 읽은 항목은 목록에 남을 수 있으나 **unread 집합=digit** | unread 집합 ≠ digit · empty+digit>0 가능 |
| **Bell Popup** | messenger `important_room` + invites + missed (**room/local**) · `/api/me/notifications` 아님 | Notification Center = A only · 채팅 필터/중요대화 없음 | **채팅 혼합 PROVEN** · baseline 이전 기능 |
| **Bottom Chat** | `projection.bottomChat` = GD+Group unread **rooms** | 동일 | 공식 정합 · 제품 FAIL의 주원인 아님 |
| **Trade Hub** | Trade unread **rooms** | 동일 | 정합 방향 |
| **Customer Order Hub** | Customer SO unread **rooms** | 동일 | 정합 방향 |
| **Chat Row** | `participant.unread_count` (messages) | roomUnread messages | 정합 방향 |
| **Owner Chat FAB** | active store unread owner-chat **rooms** | store-scoped owner chat rooms | 정합 방향 · cache HIT 위험 REVIEW |
| **Owner Ops FAB** | C = pending+refund+cancel (+inquiry) via RPC | store operational | 정합 방향 · owner_intake 이벤트와 **이중 표현** |
| **FCM badge_count** | Domain MemberAppIconTotal absolute (Slice 2-6 always-send) | A+B 결과 echo only | 권위 아님 · Bell FAIL 원인 아님 |

---

## 현재 실제 공식 (코드)

```text
A_digit     = |distinct attention keys among unread A-eligible events|
A_list      = |A-eligible notification_events rows after filters| (includes read)
Popup_mix   = important unread rooms ∪ invites ∪ missed   // NOT A
B_rooms     = |GD∪Group∪Trade∪Customer unread rooms| + unresolved missed
AppIcon     = A_digit + B_rooms   // when A path provided
Bottom      = |GD∪Group unread rooms|
TradeHub    = |Trade unread rooms|
OrderHub    = |Customer SO unread rooms|
OwnerChat   = |active store owner SO unread rooms|
OwnerOps    = pending + refund_requested + cancel_requested (+ inquiry)
```

명령서 App Icon:

```text
Member App Icon = |unread A events| + |unread member conversation rooms|
```

**차이:** A가 event count가 아니라 attention-key count.

---

## 관측 FAIL과의 연결 (추측 금지)

| 관측 | 코드로 설명 가능? |
|------|-------------------|
| Bell 3 / 목록 빈 화면 | **가능** — 집합·단위·필터 분리 PROVEN · **해당 계정 ID dump는 미실시 → 메커니즘 단정 금지** |
| Bell 3 / App Icon 23 | **가능** — B≈20이면 공식 정합 · **멤버십 dump 미실시** |
| Popup 중요대화 | **확정** — A 아님 |
| iOS Cap ≠ server | **가능** — Cap resume re-echo PROVEN · 해당 세션 재실측 없음 |

---

## Projection 파일 인덱스

| 역할 | 경로 |
|------|------|
| HTTP Domain | `build-domain-badge-authority-http.ts` |
| Builder | `build-notification-badge-projection.ts` |
| A digit | `member-notification-a-projection.ts` |
| B rooms | `member-communication-b-projection.ts` |
| B_store | `store-communication-b-projection.ts` |
| C | `store-operation-c-projection.ts` |
| Surface | `domain-badge-surface-store.ts` |
| Native | `NativeBadgeSync.tsx`, `sync-native-badge-count.ts` |
