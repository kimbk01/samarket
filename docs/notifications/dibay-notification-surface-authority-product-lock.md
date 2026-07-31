# DIBAY 알림·뱃지 표면 Authority — PRODUCT LOCK

**저장일:** 2026-08-01  
**상태:** PRODUCT LOCK (표면 정의). Runtime PASS / Legacy 삭제와 별개.  
**관련:** `docs/community-messenger/2026-07-31-badge-authority-map-lock.md` · `docs/notifications/notification-event-ssot.md`

**원칙:** 모든 표면이 **같은 숫자**를 보여야 하는 것이 아니다.  
같은 **Authority(사실·identity)** 를 기준으로 증가·감소·이동이 **일관**되어야 한다.

```text
App Icon → Bell → FCM → Bottom → 각 허브 → 각 리스트 → 각 채팅방
        = 하나의 Authority 기준 연동
```

---

## 1. App Icon

- 전체 앱의 **미읽음 상태**를 대표한다.
- 집합: 일반 1:1 + 그룹 + 거래 + 고객 주문 + 오너 주문 + 부재중 통화(정책 적용).
- 읽으면 **즉시 감소**.
- FCM / Native Badge 와 **동일 Authority** (`appIconTotal`).
- Bell event 개수와 **강제 동일 금지**.

---

## 2. FCM / 기기 알림

- 일반 · 그룹 · 거래 · 고객 주문 · 오너 주문 — **도메인별** 알림.
- 탭 시 **정확한 도메인·방**으로 이동.
- 읽거나 처리하면 **OS 알림과 Badge가 함께** 정리.
- **중복 알림 · 중복 Badge 금지**.
- Push `badge_count` = App Icon Authority.

---

## 3. Bottom Chat Badge

- **일반 1:1 + 그룹만**.
- 거래 · 주문 **절대 포함 금지**.
- 읽으면 Bottom Chat 기여분만 감소. Trade/Order/Bell(status) 불변.

---

## 4. 거래 허브 / 거래 리스트

- **거래 채팅만** 표시.
- **거래 미읽음만** 집계.
- 읽으면 **거래 허브 + 해당 리스트만** 감소.
- Bottom Chat · Order · Bell status-only 불변.

---

## 5. 주문 허브 / 주문 리스트 (고객)

- **고객 주문만** 표시.
- **고객 주문 미읽음만** 집계.
- 읽으면 **고객 주문 영역만** 감소.
- Owner · Bottom · Trade 불변.

---

## 6. 오너 Bottom 주문 / FAB / 매장 Admin

- **오너 주문만** 표시.
- **매장별 Scope** 유지.
- Bottom Chat 과 **완전 분리**.
- 읽으면 **해당 매장 + 오너 주문 영역만** 감소.
- Customer · Trade · Bottom Chat 불변.

---

## 7. 상단 Bell (알림 Inbox)

- 단순 숫자만이 아니다. **레거시 메신저형 Notification Inbox**.
- Authority: approved unread `notification_events` (lifecycle/supersede 적용 후).
- 종류가 명확히 구분되어야 한다:

| 종류 |
|------|
| 일반 메시지 |
| 그룹 메시지 |
| 거래 메시지 |
| 주문 메시지 (고객) |
| 주문 메시지 (오너) |
| 거래 상태 변경 |
| 주문 상태 변경 |
| 부재중 통화 |
| 시스템 중요 알림 |

- 각 항목: **아이콘 · 제목 · 내용 · 시간 · 읽음 여부** 구분.
- 탭 시 **정확한 화면** 이동 (고객↔오너 경로 혼동 금지).
- 읽거나 처리되면 Bell에서 **제거 또는 읽음 처리**.
- 「모두 읽음」은 **Bell event만**. 방 unread / App Icon room 강제 0 금지.

---

## 8. 단위 요약 (숫자 강제 통일 금지)

| 표면 | 단위 | 포함 |
|------|------|------|
| App Icon / FCM badge | unread room(+정책 부재중) | GD+Group+Trade+Customer SO+Owner SO+missed |
| Bottom Chat | unread room | GD+Group만 |
| Trade Hub/List | trade unread | 거래만 |
| Customer Order Hub/List | customer order unread | 고객 주문만 |
| Owner FAB/Admin | owner order unread (store scope) | 오너 주문만 |
| Bell | notification_events | Inbox 이벤트 |
| 리스트 Row | 해당 방 unread message | 그 방만 |

---

## 9. DO NOT

- Bell 숫자 = App Icon 숫자로 맞추기
- Bottom에 Trade/Order 넣기
- 고객 알림 ↔ 오너 Admin 경로 교차
- 한 방 읽었다고 전 도메인 OS 알림/Badge clear
- 이 LOCK 없이 표면별 임시 숫자 패치

---

## 10. 완료 조건 (Product PASS 시)

위 1–7이 Runtime에서 증가·감소·이동이 Authority와 일치할 때만:

```text
DIBAY NOTIFICATION PRODUCT PASS — LOCK
```
