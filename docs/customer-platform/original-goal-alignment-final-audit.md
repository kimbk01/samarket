# DIBAY Customer Platform — Original Goal Alignment Final Audit

**Date:** 2026-08-06  
**HEAD:** `19f61030f375014a5c405b5d21b5f4149d80a221`  
**Mode:** AUDIT ONLY — no code change · no migration · no deploy · no commit  
**Method:** Re-verify App routes/menus, Admin `admin-menu.ts`, APIs, migrations, Engine/Bell/FCM resolvers against the **original product goal**. Prior Phase/RRR PASS declarations are **reference only**, not evidence.

---

## A. 냉정한 최종 판정

# `FUNCTIONS IMPLEMENTED, IA MISALIGNED`

### 핵심 질문에 대한 직접 답

> 지금 구현된 Customer Platform은 정말로 사용자가 고객센터에서 공지·문의·쪽지·포인트·입출금·이벤트·Push 알림을 관리하고, 관리자가 하나의 명확한 Customer Platform에서 Member와 Store를 구분하여 운영할 수 있는 구조인가?

**아니오.**

> 아니면 개별 기능과 API는 만들어졌지만 사용자 UI와 관리자 IA가 흩어져 있어, 원래 목표보다 좁은 범위만 HARD LOCK한 것인가?

**예.** Member 공지·문의·쪽지·포인트(충전)·Engine 타입·Bell→원본 deep link 등 **기능 층은 상당 부분 PROVEN**이나,  
(1) 사용자 **통합 고객센터 허브(탭/섹션 내 관리)** 는 없고 지원 링크·홈 스탯·혜택이 분산되며,  
(2) Admin에 **Customer Platform 대표 트리 / Action Queue(문의·쪽지 포함) / Monitoring 분리** 가 없고 CP 도메인이 Community·Common·Delivery에 분산되어,  
원래 목표의 **제품 구조 정렬·운영 연결 완성**은 충족하지 않는다.

---

## B. 원래 목표 대비 결과표

| 목표 | 현재 구현 | 증거 (HEAD) | 판정 |
|------|-----------|-------------|------|
| 사용자 고객센터 통합 | 내정보 「지원」섹션에 링크 나열; 「고객센터」항목은 안내 문구 stub; 포인트는 홈 스탯; 혜택 별도 | `mypage-home-menu-config.ts` `MYPAGE_HOME_SUPPORT_ITEMS`; `MyPageItemScreen` `support`; `mypage-home-stat-config.ts` | **IMPLEMENTED_BUT_MISALIGNED** |
| 관리자 Customer Platform 통합 | 최상위 `Customer Platform` 메뉴 **없음**; 기능이 common/community/delivery에 분산 | `components/admin/admin-menu.ts` (7그룹); grep `Customer Platform` in admin = 0 | **ABSENT** (통합 IA) / 기능 **PARTIAL** |
| Member 공지 | `app_notices` + Admin CRUD + CS 목록/상세 + Campaign `notice_published` + Bell→`/mypage/notices/{id}` | migration `20261018120000_app_notices.sql`; `/admin/app/notices`; `/mypage/section/settings/notices`; `/mypage/notices/[noticeId]`; `inbox-events-merge.ts` | **PROVEN** (목록이 CS 허브 탭이 아님 → IA 정렬은 별도 MISALIGNED) |
| Store 공지 | `store_notices` + owner UI (상거래); Member `app_notices`와 분리 | owner notices 경로; store_notices migration | **PROVEN** (상거래 표면) · CP 통합 **ABSENT** |
| Member 문의 | `/mypage/inquiries` + Admin `/admin/member-notes` + `inquiry_answered` | `MemberCsNoteListClient kind=inquiry`; `member-admin-notes-service.ts` | **PROVEN** |
| Store 문의 | buyer/owner/admin `store_inquiries` (상거래 CS) | `/admin/store-inquiries`; `/mypage/store-inquiries` | **PROVEN** (상거래) · CP Support IA **MISALIGNED** |
| Member Inbox | `/mypage/inbox` + Admin 쪽지 발송 + `inbox_message_received` | same notes SSOT `started_by=admin` | **PROVEN** |
| Store Inbox | `platform_admin_inquiries` (owner↔platform); Member Inbox와 분리 | `/admin/platform-inquiries` | **PARTIAL** (존재하나 CP「Store Inbox」IA 아님) |
| Member Point/입금 | ledger-only + charge 신청/승인 + `point_plans` + `applied_rate`/`rate_version` 스냅샷; **출금 ABSENT** | `point_ledger`, charge routes, rates tests | 충전/원장 **PROVEN**; 출금 **ABSENT** → 입출금 목표 **PARTIAL** |
| Store Point/입금 | RPC-only + charge; Member 합산/이체 ABSENT | store-point boundary contract | 충전 **PROVEN**; 출금 **ABSENT** → **PARTIAL** |
| 이벤트 | 참여형 Event 제품 ABSENT (LOCK); benefits ≠ Event | FAQ/Event glob 0; events stub→benefits | **CONTRACT_EXCLUDED** / 참여 Event **ABSENT** |
| 광고/프로모션 | Admin ads 트리 + Campaign `marketing` + member-benefits | `admin-menu` ads; campaign type marketing | **PARTIAL** (발송 가능; Promotion↔Engine 역할 분리·원본 Event는 미완) |
| Push Engine | Campaign / `createAndDispatchNotificationEvent`; Point는 `appendUserNotification` commerce 경로 | campaign-send-user; notify-user-points | CP A 타입 **PROVEN**; Point notify **PARTIAL** (Engine taxonomy 외 commerce) |
| Bell→원본 | `resolveEventInboxLinkUrl` → notices/inquiries/inbox; digit `applyBellBadgeProjection` | `inbox-events-merge.ts`; bell-writer | **PROVEN** (단 Bell UI에 `/notifications/notes` 엔트리 잔존) |
| Action Queue | `admin-bell` = charges/reports/alerts COUNT만; **미답변 문의·쪽지 큐 없음** | `app/api/admin/admin-bell/route.ts` | **PARTIAL** (입금 큐만) / 목표 CS Action Queue **ABSENT** |
| Monitoring | Dashboard Action|Monitoring 분리 UI **없음** | admin-menu dashboard = `/admin` only | **ABSENT** |

### 3층 요약

| 층 | 판정 |
|----|------|
| 1. 기능 구현 | **PARTIAL→대부분 Member 핵심 PROVEN**; Event/FAQ/출금/CP Dashboard ABSENT |
| 2. 제품 구조 정렬 | **FAIL** — App CS 허브·Admin CP 트리 미구현 |
| 3. 운영 연결 완성 | **PARTIAL** — Member 공지/문의/쪽지/충전 체인은 코드상 연결 가능; Admin이 CP에서 시작·문의 Action Queue로 처리하는 UX **미구현** |

---

## C. 사용자 APP 실제 IA (HEAD)

### 현재 트리 (Route/Component)

```text
/mypage (MyPageHomeDashboard)
├─ Stats: points → /mypage/points   ← 고객센터 밖
├─ Store / Account / Service 섹션…
└─ Support 섹션 (title: mypage_comp_section_support)
   ├─ 「고객센터」 → /mypage/section/settings/support   ← 안내 문구만 (stub)
   ├─ 문의 → /mypage/inquiries → [threadId]
   ├─ 받은 쪽지 → /mypage/inbox → [threadId]
   ├─ 공지 → /mypage/section/settings/notices (+ detail /mypage/notices/[id])
   └─ 약관 → /mypage/section/settings/terms

별도:
/mypage/benefits
/mypage/points (/charge, /ledger, …)
/mypage/notifications  (Bell 도착 목록)
/mypage/store-inquiries  (상거래)
/notifications/notes → redirect /mypage/inquiries  (legacy)
Bell center link: /notifications/notes  (MyNotificationsView)
```

### 목표 구조와 비교

| 목표 | HEAD | 갭 |
|------|------|-----|
| 고객센터 = 대표 통합 진입 + 내부 탭/섹션 | Support **플랫 링크** + 「고객센터」= stub | **P0** 허브/탭 부재 |
| 공지·문의·쪽지·포인트·이벤트·FAQ in CS | 공지/문의/쪽지 링크만; 포인트 스탯; 이벤트/FAQ 없음 | 포인트·이벤트·FAQ **미포함** |
| Bell → CS 원본 | deep link resolver PROVEN | UI에 legacy notes 엔트리 **잔존** |
| Member≠Store 혼합 금지 | 포인트/쪽지 분리 PROVEN | Store 문의는 별도 경로 (의도적 상거래) |

**도메인 × 고객센터 표**

| 도메인 | 고객센터 대표 진입 | 탭/섹션 | 목록 | 상세 | 상태/이력 | Bell 연결 | 판정 |
|--------|-------------------|---------|------|------|-----------|-----------|------|
| 공지 | Support 링크 (허브 탭 아님) | 없음 | NoticesContent | `/mypage/notices/[id]` | board is_active/window | `/mypage/notices/{id}` | **IMPLEMENTED_BUT_MISALIGNED** |
| 문의 | Support 링크 | 없음 | inquiries | thread | note thread | `/mypage/inquiries/{id}` | **IMPLEMENTED_BUT_MISALIGNED** |
| 받은 쪽지 | Support 링크 | 없음 | inbox | thread | note thread | `/mypage/inbox/{id}` | **IMPLEMENTED_BUT_MISALIGNED** |
| 포인트·입금 | **CS 밖** 홈 스탯 | 없음 | points | ledger/charge | ledger | `/mypage/points` (commerce notify) | **IMPLEMENTED_BUT_MISALIGNED** |
| 이벤트·혜택 | CS 밖 benefits; Event ABSENT | 없음 | benefits list | — | — | — | **ABSENT** / benefits **PARTIAL** |
| FAQ | 없음 | — | — | — | — | — | **ABSENT** |

---

## D. ADMIN 실제 IA (HEAD)

### 현재 메뉴 트리 (`admin-menu.ts` 요약)

```text
Admin
├─ dashboard → /admin
├─ common
│  ├─ users, posts, regions, menus…
│  ├─ ads (applications, post-ads, paid, member-benefits, policies, feed…)
│  └─ points (charge, plans, ledger, policy, execute, expire)   ← Member Points
├─ community
│  ├─ boards, philife…, posts, comments…
│  ├─ community-notices → /admin/app/notices                   ← CP Notice
│  └─ dibay-notification-campaigns → /admin/notifications     ← Engine
├─ trade …
├─ delivery
│  ├─ stores, orders, ops…
│  ├─ store-inquiries-admin → /admin/store-inquiries
│  ├─ platform-inquiries-admin → /admin/platform-inquiries
│  ├─ member-notes-admin → /admin/member-notes                ← Member Inquiry/Inbox
│  └─ store-points-admin (charges, ledger, policies)          ← Store Points
├─ messenger …
└─ settings …
```

**`Customer Platform` 키/라벨: 코드상 없음.**

### 목표 항목 매핑

| # | 목표 | HEAD 위치 | 판정 |
|---|------|-----------|------|
| 1 | CP 대표 메뉴 | 없음 | **ABSENT** |
| 2 | 공지 | community → app/notices | **PARTIAL** (기능 O, CP 트리 X) |
| 3 | FAQ | 없음 | **ABSENT** |
| 4 | Member 문의 | delivery → member-notes | **PARTIAL** |
| 5 | Store 문의 | delivery → store-inquiries | **PARTIAL** |
| 6 | Member Inbox | 동일 member-notes | **PARTIAL** |
| 7 | Store Inbox | platform-inquiries | **PARTIAL** |
| 8 | Member Point·입금 | common → points | **PARTIAL** |
| 9 | Store Point·입금 | delivery → store-points | **PARTIAL** |
| 10 | Rates & Policies | point-plans / point-policies / store-point-policies | **PARTIAL** (분산) |
| 11 | Event/Promotion | ads + meeting-events; 참여 Event ABSENT | **PARTIAL** / Event **ABSENT** |
| 12 | Notification Engine | community → notifications | **PARTIAL** |
| 13 | Push 실패·재시도 | campaigns UI/status 필드 (전용 Monitoring 화면 불명) | **NOT_PROVEN** (전용 큐 UI) |
| 14 | Analytics | 추천/배달 stats 등 CP 전용 없음 | **ABSENT** (CP Analytics) |
| 15 | Settings | admin settings 그룹 (CP Settings 아님) | **PARTIAL** |
| 16 | 중복·고아 | CP 도메인 중복 ops 화면은 대체로 1경로; **메뉴 IA 분산**이 문제 | **IMPLEMENTED_BUT_MISALIGNED** |

### Action Queue / Monitoring

| 항목 | 증거 | 판정 |
|------|------|------|
| Action Queue (입금) | `GET /api/admin/admin-bell` → store_charges, user_charges, reports, alerts | **PROVEN** (입금·신고·알림) |
| Action Queue (미답변 문의/쪽지) | admin-bell에 notes/inquiry COUNT **없음** | **ABSENT** |
| Action vs Monitoring 분리 | Dashboard CP 셸 없음 | **ABSENT** |

**AR-3는 ACCEPTED_RISK일 뿐 목표 충족 증거가 아님** — 본 감사에서 Admin CP 통합은 **ABSENT/MISALIGNED**.

---

## E. 연결 체인 (코드 기준)

### Member 공지 — **PROVEN** (기능 체인)

```text
Admin /admin/app/notices (+ API admin/app-notices)
→ app_notices
→ (선택) Campaign notice/system → notice_published → FCM
→ Bell display_route /mypage/notices/{appNoticeId}
→ CS 공지 상세
→ board/read (Bell read ≠ 원본 삭제)
```

History/statistics: Admin list 존재; CP Dashboard Monitoring **ABSENT**.

### Member 문의 — **PROVEN** (기능) / Action Queue **ABSENT**

```text
Member /mypage/inquiries → API me/admin-notes
→ member_admin_note_* (started_by=member)
→ Admin /admin/member-notes 답변
→ createAndDispatchNotificationEvent inquiry_answered
→ Bell/Push → /mypage/inquiries/{id}
```

Admin이 **CP Action Queue에서 시작**하는 경로 **없음** (메뉴 delivery 하위 직접 진입).

### Member 쪽지 — **PROVEN** (기능)

```text
Admin member-notes (started_by=admin)
→ Engine inbox_message_received
→ Bell/Push → /mypage/inbox/{id}
```

### Member Point/입금 — **PROVEN** (충전) / 출금 **ABSENT** / notify **PARTIAL**

```text
Member /mypage/points/charge → point_charge_requests (+ applied_rate/rate_version)
→ Admin /admin/point-charges → approve RPC → point_ledger → project profiles.points
→ appendUserNotification (commerce) → link /mypage/points
```

출금(cash-out) 테이블/API: HEAD 검색 **ABSENT**.

### Store 버전

| 체인 | 판정 |
|------|------|
| Store 공지 (`store_notices`) | **PROVEN** (owner/commerce) |
| Store 문의 (`store_inquiries`) | **PROVEN** (commerce) |
| Store 관리자 쪽지 (`platform_admin_inquiries`) | **PARTIAL** |
| Store Point·입금 | **PROVEN** (charge/RPC); 출금 **ABSENT** |
| Store 대상 Push/Bell | commerce notify / owner routes **PARTIAL** |
| CP 단일 트리에서의 Store 운영 | **ABSENT** |

### Event/Advertising

```text
참여 Event: ABSENT (CONTRACT)
Campaign marketing → Engine → FCM; Bell 제외 계약
Ads admin + member-benefits: PARTIAL (Promotion 원본≠Event)
```

### Member↔Store 이체

`store-point-boundary-contract.test.ts` 등: transfer **ABSENT** → **PROVEN** (금지 준수).

---

## F. 미완료·오정렬 목록

### P0 — 원래 목적을 막는 구조

1. **사용자 통합 고객센터 허브 부재** — 플랫 Support 링크 + stub 「고객센터」; 포인트·이벤트 미포함  
2. **Admin Customer Platform 대표 IA 부재** — 운영 시작점이 7그룹 분산  
3. **CS Action Queue 부재** — 미답변 문의/쪽지가 admin-bell에 없음  

### P1 — 운영·권위 갭

4. Member Point 알림이 Engine A taxonomy가 아닌 **commerce `appendUserNotification`**  
5. Bell UI **legacy `/notifications/notes` 엔트리** (redirect는 되나 UX 잔존)  
6. **출금** 기능 ABSENT — 「입출금」목표를 충전만으로 포장하면 안 됨  
7. Store 지원 표면이 CP Support가 아닌 **delivery/commerce**에 고정  
8. Push 실패 전용 Monitoring/재시도 **운영 UI NOT_PROVEN**  
9. FAQ **ABSENT**  

### P2 — UX·정리

10. 참여 Event **ABSENT** (계약상 허용 가능하나 목표 표에는 미충족)  
11. obsolete design-doc dual-read 문구 등 문서 잔여  
12. `member-notices-ssot` 미사용 헬퍼 잔존  

---

## G. 기존 HARD LOCK 재판정

# `CP HARD LOCK SCOPE TOO NARROW`

| 층 | 설명 |
|----|------|
| Authority/SSOT 계약 (Notice board, Engine types, Member≠Store, Bell≠원본 등) | HEAD에서 상당 부분 **재확인 PROVEN** — 거버넌스 HARD LOCK의 **협의** 범위 |
| 원래 제품 목표 (통합 CS + 통합 Admin CP + Action Queue) | **미충족** — HARD LOCK이 이 목표를 보증하지 않음 |
| AR-1..3 | 위험 수용일 뿐 구현 완료 아님; 특히 **AR-3 = Admin IA 미정렬의 공식화** |

부제: 거버넌스 문서상 HARD LOCK은 **「원래 목표 달성」이 아니라 「좁은 권위 계약 동결」** 로 재해석되어야 한다.  
`CP HARD LOCK INVALID AGAINST ORIGINAL GOAL` 까지는 — 권위 계약 자체는 유효하므로 — 채택하지 않음. **범위가 원래 목표보다 좁다.**

---

## H. 구현 계획 여부 (승인·착수 없음)

감사만. 불일치 확인됨 → 참고용 범위만:

| 구분 | 범위 |
|------|------|
| 유지 | `app_notices`, Inquiry/Inbox notes SSOT, Engine A types, Bell deep-link resolver, Member/Store ledger·charge 분리, Member↔Store transfer 금지 |
| 정렬 필요 | App CS 허브(탭)에 공지·문의·쪽지·포인트 편입; Admin CP 트리 MERGE; admin-bell에 문의/쪽지 Action; Bell notes 엔트리→CS; Point notify Engine 정렬 |
| 신규 필요 여부 | FAQ·참여 Event·출금·CP Monitoring — 제품 LOCK 후에만 |
| 리버트 | 불필요 (권위 역행 없음); HARD LOCK **범위 문구**만 정정 권고 |
| 권장 Slice 수 (승인 시) | **3** — (1) App CS Hub IA (2) Admin CP menu + Action Queue (3) Engine/Bell UX residual + Point notify |
| Slice 1 정확 범위 (승인 시) | `/mypage` 고객센터 허브: 공지·문의·쪽지·포인트 섹션/탭 + stub 제거; 포인트 스탯은 허브와 이중 진입 허용 여부만 제품 결정 |

**이번 턴: 구현·승인 요청 없음.**

---

## 3. 레거시 앱 비교

카카오·당근·배민·요기요·텔레그램 실측 스크린/기기 증거: 본 감사에서 **수집하지 않음** → 전 항목 **`NOT_PROVEN`**.  
일반론으로 대체하지 않음.

---

## 권위 계약 재확인 (요약)

| 계약 | HEAD | 판정 |
|------|------|------|
| Notice 원본 `app_notices` | migration + board API | **PROVEN** |
| Inquiry/Inbox = notes 도메인 | started_by 분기 | **PROVEN** |
| Point = ledger (+ cache project) | ledger-only contract | **PROVEN** |
| Bell ≠ 원본 목록 | arrival + deep link | **PROVEN** |
| Bell 삭제→원본 삭제 | 설계상 event read; 원본 board/notes 유지 | **PROVEN** (코드 경로) |
| Member≠Store 합산/이체 | boundary tests | **PROVEN** |
| Event 원본 분리 | Event ABSENT | **CONTRACT_EXCLUDED** |
| 광고 Engine 경유 | Campaign marketing | **PROVEN** (발송); Bell 제외 계약 |

금지 구조(Bell을 원본으로 CS 재목록화): Settings push merge 제거 상태로 **해당 금지 구조는 제거됨** (**PROVEN**).

---

## 산출물

본 문서만. 코드/migration/배포/커밋 **없음**.
