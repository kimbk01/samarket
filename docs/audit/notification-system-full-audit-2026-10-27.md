# DIBAY 알림 시스템 전수 감사 · 수정 설계 승인안 (2026-10-27)

- 성격: 감사 + 설계 → Owner 승인(2026-10-27) 후 묶음 1~7 구현(main `224fefdd0`) → 마이그레이션 2건 운영 DB 적용(Owner 승인).
- 근거: 계약 문서(`docs/dibay-global-notification-ssot-hard-lock.md`, `dibay-notification-read-badge-policy.md`, `dibay-notification-badge-number-policy.md`, `notifications/notification-event-ssot.md`, `notifications/status-event-read-lifecycle.md`, `notifications/bell-digit-and-inbox-product.md`, owner/commerce/preference hard-lock 문서) ↔ 코드 ↔ **운영 DB 읽기 전용 조회**(`ckdosyydvgzqwpbwuhon`, SELECT만, 2026-10-27).
- 실행한 테스트: 알림 관련 vitest 약 30개 파일, 422건 모두 PASS. **이번에 찾은 확정 결함은 기존 테스트가 하나도 잡지 못함.**
- UI 시안: [`notification-inbox-ui-mockup-2026-10-27.html`](./notification-inbox-ui-mockup-2026-10-27.html)
- 통화(부재중·VoIP·CallKit) 경로는 감사만 함. 변경 제안 없음(통화 변경 규정).

## 구현 상태 (Owner 승인 2026-10-27 · 묶음 1~7)

| 묶음 | 항목 | 상태 |
|---|---|---|
| 1 | N-01·N-02·N-03 오너 인박스 | 코드 반영 + **운영 DB 적용 PASS (2026-10-27, Owner 승인)** — 아래 「운영 DB 적용 결과」 |
| 2 | N-04·N-05·N-06 | 코드 반영 (전체 이력 스캔·병렬 소프트 삭제, 포그라운드 복귀 1회 재조회 + 탭 숫자 불일치 시 재조회, 일괄 삭제 실패 토스트) |
| 3 | N-07·N-08·N-09 | 코드 반영, durability 잠금 문서 정정 |
| 4 | N-10 | 두 토글 숨김(저장값·API 유지) |
| 5 | N-12·N-13·N-14 | 코드 반영. N-13 마이그레이션 **운영 DB 적용 PASS (2026-10-27, Owner 승인)** |
| 6 | U-01~U-12 + 오너 선택·삭제 | 코드 반영. 추가 발견 U-13: `notif_center_selected_n`·`notif_center_tab_unread_aria` 가 `{{n}}` 을 써서 `translate()`(단일 중괄호 치환) 결과가 「{3}개 선택」으로 표시되던 결함 → 수정 |
| 7 | 문서 불일치 4건 | 정정 |

### 운영 DB 적용 결과 (`ckdosyydvgzqwpbwuhon`, 2026-10-27)

- 적용 방식: main 커밋본과 md5 동일한 파일 SQL 을 그대로 실행 → `supabase_migrations.schema_migrations` 에 파일 버전으로 기록(기존 운영 기록 방식과 동일).
  - `20270702120000 owner_inbox_read_notification_events` · `20270702130000 admin_rt_business_cash_charge_requests`
- 적용 전 운영 함수 정의 = `20261028120000` 섹션 A 와 동일 확인 → 롤백 = 그 섹션 재적용 (Cash RT 롤백은 파일 헤더 참조).
- 확인:
  - 오너 인박스 함수 2종이 `notification_events` 를 읽음, 오너 종류 15개.
  - 실제 오너·매장 10쌍 전부: 스냅샷 목록 수 = 목록 함수 수 = 직접 조회 수 (불일치 0). 총 367건, 이 중 2026-08-12 이후 183건이 이제 표시됨. 시간초과 자동취소 1건 포함. 오너 최대 미읽음 44건.
  - 가장 알림이 많은 오너 기준 스냅샷 함수 약 8.5ms.
  - `business_cash_charge_requests` 가 `supabase_realtime` 에 포함, 관리자 SELECT 정책(`is_platform_admin(auth.uid())`) 생성, 기존 오너 SELECT 정책 유지.
- 남은 확인(NOT_PROVEN): 오너 앱 화면에서 목록·읽음·삭제, 관리자 화면에서 Cash 충전 실시간 갱신·알림음 — 실기기/브라우저 확인 필요. 데이터에 매장 id 가 UUID 가 아닌 테스트 행(`s22-store-fake`)이 있으나 함수는 문자열 비교라 영향 없음.

시안과 다른 점: ③ 선택 모드의 실행 버튼은 하단 고정 바가 아니라 탭 아래 고정 줄에 둠(/notifications 는 하단 탭이 보이는 화면이라 하단 고정 바가 겹침). 시안 파일도 같은 배치로 수정함.

---

## A. 계약 대비 구현 전수표

### A-1 알림 발생·전달

| ID | 영역 | 이벤트/기능 | 기존 계약 | 실제 구현 | 판정 | 증거 |
|---|---|---|---|---|---|---|
| E01 | 회원 | chat/group/mention 메시지 | 방 밖 수신만 미읽음·푸시. 같은 방 foreground면 억제 | `notifyMessagePipeline`. 같은 방이면 `unread=false`+억제 사유 기록 | PASS | DB: `unread=false` 604행 전부 `same_room_foreground` |
| E02 | 회원 | trade_message | E01과 같음 | 같음 (구 라우트는 handoff 없이 바로 발송) | PASS | `dispatch-push-for-user.ts:283` |
| E03 | 회원/오너 | store_order_message | 역할별 설정 | `receiverRole`로 판정 | PASS | |
| E04 | 회원 | trade_status (가격 제안 등) | 상세 진입 시 읽음 | `price-offers.server.ts:507/542/572` | PASS | |
| E05 | 회원 | order_status (구매자) | 주문당 미읽음 1건(이전 상태 자동 읽음) | 일반 전이는 PASS. **자동 구매확정만 이전 상태 미정리** | PARTIAL | N-09 |
| E06 | 오너 | 오너 commerce 알림 | 오너 인박스(`get_owner_store_commerce_notifications`) | 행은 `notification_events`에 쌓이나 **오너 인박스 RPC가 구 `notifications` 테이블만 읽음** | **FAIL** | N-01 |
| E07 | 오너 | 접수 시간초과 자동취소 | 오너 종류 | 오너 종류 목록에 없음 → 회원 인박스·회원 알림음 기준 | **FAIL** | N-02 |
| E08 | 회원 | community_activity 댓글·좋아요 | 상세 진입 시 읽음 | `community-social-inapp-notify.ts` | PASS | |
| E09 | 회원 | 모임 가입·승인·강퇴·차단·거절 | 건마다 알림 | dedupe 키가 제목+본문이라 **같은 모임 두 번째부터 조용히 누락**. 차단 억제 미적용 | **FAIL** | N-07 |
| E10 | 회원 | 거래 분쟁 접수 | 거래 도메인 | `push_kind: community`로 커뮤니티 설정·알림음 적용 | **FAIL** | N-08 |
| E11 | 회원 | 공지·마케팅 캠페인 | 캠페인 1인 1회, 마케팅은 두 설정 모두 켜져야 발송 | 회차·회원 unique, 원자적 claim | PASS | `campaign-send-user.ts:125` |
| E12 | 회원 | 문의 답변·지원 케이스 | 회원 인박스 | `notify-store-points.ts:46`, support-case-service | PASS | |
| E13 | 회원 | 포인트 충전 결과 | 회원 인박스 | `notification_type: commerce` → 주문 탭·주문 알림음 | PASS(현행 유지) | 의도된 commerce 분류로 판단 |
| E14 | 오너 | Cash 충전 승인·거절 | CD-2 잠금 | await 발송, `delivery_ad_cash_charge_*:{id}` | PASS | |
| E15 | 공통 | incoming_call → 알림 이벤트 생성 금지 | 금지 | 작성 경로 0건 | PASS | DB: incoming 타입 0행 |
| E16 | 공통 | missed_call | 부재중만 배지 | callee만 생성, `void` 즉시 발송 | NOT_PROVEN | 통화 규정 대상, 별도 승인 |
| E17 | 회원 | 친구 요청 | — | 알림 이벤트·푸시 작성 경로 없음(Realtime 갱신만) | NOT_PROVEN | 묶음6 계약상 푸시 범위 여부 미확인 |
| E18 | 공통 | 중복 생성 방지 | `UNIQUE(user_id, dedupe_key)` | 적용됨 | PASS | DB: 중복 키 0그룹 |
| E19 | 공통 | 푸시·인앱 목적지 일치 | 같은 resolver | `resolveNotificationDestination` 공용 | PASS(코드) | 실기기 탭 이동은 NOT_PROVEN |
| E20 | 공통 | 웹 푸시 재시도 중복 | 기기 단위 1회 | 웹 구독은 `device_id` null이라 unique 미적용 | PARTIAL | N-11, 운영 웹 구독 0건이라 현재 영향 없음 |
| E21 | 공통 | 로그아웃 시 정리 | 기기 해제·배지 0·캐시 비움 | `client-session-wipe.ts:148-192` | PASS | 테스트 PASS |
| E22 | 공통 | 계정 전환 시 웹 푸시 | 이전 계정 미노출 | 계정 전환 경로는 네이티브만 해제 | NOT_PROVEN | 운영 웹 구독 0건 |

### A-2 배지·읽음·삭제

| ID | 표면 | 계약 | 실제 | 판정 | 증거 |
|---|---|---|---|---|---|
| B01 | 헤더 알림종(모든 화면) | 회원 알림 A 미읽음 | `badge-count` → `bellTotal`(A) | PASS | `tier1-header-inbox-sync.ts:11-30` |
| B02 | /notifications 제목 숫자·「전체」 탭 | 종 숫자와 같음 | 같은 `loadMemberNotificationAUnreadCount` | PASS | `route.ts:384,450` |
| B03 | 앱 아이콘 | A + 미읽음 방 수(B) | `appIconTotal` → NativeBadgeSync | PASS(코드) | 실기기 NOT_PROVEN |
| B04 | 하단탭 채팅 | 미읽음 방 수 | 메신저 projection | PASS | `messenger-chat-tab-badge.ts:19` |
| B05 | 오너 종 | 처리 대기 건수(미읽음 아님) | `OwnerBellOperationSummary` | PASS | |
| B06 | 관리자 종·사이드바 | Action Queue 한 응답, 실패 = 「!」 | 일치, 권한별 forbidden | PASS | `admin-bell/route.ts:28` |
| B07 | 관리자 처리 후 감소 | RT_REQUIRED | 배달 경고·Cash 충전만 최대 75초 지연 | PARTIAL | N-12, N-13 |
| B08 | 개별 읽음 / 선택 읽음 | 스레드 단위 읽음 | `ids` | PASS | |
| B09 | 모두 읽음 | A 범위 = 종 범위 | 같은 id 집합 → 종 0 | PASS | |
| B10 | 개별·선택 삭제 | 소프트 삭제, 업무 데이터 불변 | `display_payload.deleted_at`만 기록 | PASS | `inbox-read-bridge.ts:300-336` |
| B11 | 읽은 알림 삭제 / 전체 삭제 | 해당 범위 전부 | **최신 원본 500행만 대상** | **FAIL** | N-04 |
| B12 | 다른 기기 읽음·삭제 반영 | 종·아이콘 동기화 | Realtime은 INSERT만 구독, 화면 복귀 때 다시 받지 않음 | **FAIL** | N-05 |
| B13 | 재시작·재로그인 | 서버 값 기준 | 부팅 때 badge-count | PASS | |
| B14 | 카테고리 일괄 읽음(탭 진입) | 금지 | 호출하는 화면 없음 | PASS | |
| B15 | 오너 인박스 읽음 | 읽음 반영 | 구 테이블 id라 no-op. 스냅샷도 매장 단위로 무효화 안 됨 | **FAIL** | N-01, N-03 |

### A-3 설정

| ID | 설정 | 계약 | 실제 | 판정 |
|---|---|---|---|---|
| P01 | 유형별 푸시(거래·커뮤니티·주문·채팅·마케팅) | 발송 경로에 적용, 실패 시 fail-closed | 적용됨. 인앱 행은 막지 않음(계약 6) | PASS |
| P02 | 오너 알림 설정 | 오너 종류는 오너 설정 | `meta.kind` override로 적용 | PASS (N-02 종류 제외) |
| P03 | 「매장·상점 알림」(`store_enabled`) | 끄면 반영 | 저장만 되고 발송·알림음 판정에서 읽지 않음 | **FAIL** (N-10) |
| P04 | 진동(`vibration_enabled`) | 끄면 반영 | 계산은 하나 쓰는 곳 0건 | **FAIL** (N-10) |
| P05 | 알림음 on/off·무음 | GATE 2 | 회원·오너·관리자 각각 적용 | PASS |

---

## B. 결함 목록 (확정만)

우선순위: **P0** 기능 상실 · **P1** 잘못된 동작 · **P2** 지연·표시

| ID | 화면/기능 | 실제 결함 | 확인된 원인 | 영향 범위 (운영 DB) | 최소 수정안 | 순위 |
|---|---|---|---|---|---|---|
| N-01 | 오너 알림 인박스 | 2026-08-12 이후 오너 commerce 알림이 오너 인박스에 안 나오고, 읽음 버튼은 아무것도 바꾸지 않음 | 운영 함수 `get_owner_dashboard_notifications_snapshot`·`get_owner_store_commerce_notifications`가 `public.notifications`만 읽음. 이 테이블의 마지막 insert는 **2026-08-12 02:21 UTC**. 앱은 2026-06-21부터 `notification_events`에만 씀. 회원 인박스도 오너 종류를 제외함(`excludeOwnerStoreCommerce`) → **어떤 목록에서도 볼 수 없음** | 08-12 이후 오너 commerce 이벤트 **146건**, 현재 미읽음 **56건**. 푸시·알림음·처리 대기 요약은 정상 | 두 함수의 원본을 `notification_events`(오너 종류, `display_payload.store_id`, 소프트 삭제 제외)로 교체. 읽음은 기존 events 경로 그대로 동작 | **P0** |
| N-02 | 오너 종류 분류 | 「접수 시간초과 자동취소」가 회원 알림으로 섞이고 회원 알림음 기준 적용 | `store_order_accept_timeout_cancelled`가 TS 목록(`owner-store-commerce-notification-meta.ts:11-27`)·SQL 목록에 없음. `store_point_charge_on_hold`는 SQL 목록에 없음 | 운영 1건(10-21) | 두 종류를 TS·SQL 오너 목록에 추가 | P1 |
| N-03 | 오너 읽음 후 목록 | 읽음 직후 다시 「안 읽음」으로 보임 | `inbox-read-bridge.ts:388` 무효화가 storeId 없이 호출 → 매장별 목록 스냅샷은 그대로 | N-01 수정 후 드러남 | 읽은 행의 store_id로 매장 스냅샷도 무효화 | P1 |
| N-04 | 읽은 알림 삭제·전체 삭제 | 오래된 알림이 남음. 전체 삭제 후에도 목록·종 숫자가 남을 수 있음 | `inbox-read-bridge.ts:410-416`이 사용자 원본(채팅·이미 삭제된 행 포함) 최신 500행만 조회 후 A로 거름. 건마다 select+update 순차 실행 | 원본 500행 초과 사용자 **4명**(최대 1,797행) | 서버에서 A 조건으로 한 번에 소프트 삭제 update(범위 = 목록·종과 같은 A 기준) | P1 |
| N-05 | 다른 기기 읽음·삭제 | B 기기의 종·앱 아이콘이 이전 숫자로 남음. /notifications에서는 목록(폴링)과 제목 숫자가 어긋남 | `useSupabaseNotificationsRealtime.ts:138-144` INSERT만 구독. 배지 store 폴링은 dirty일 때만 동작. 화면 복귀 시 다시 받지 않음 | 다기기 사용자 전원 (실기기 재현 NOT_PROVEN) | 화면 복귀(visibility)·앱 resume 때 `badge-count?fresh=1` 1회, 목록 폴링 때 배지도 함께 갱신 (클라이언트만 변경) | P1 |
| N-06 | 일괄 삭제 실패 | 실패해도 아무 표시 없이 메뉴만 닫힘 | `app/(main)/notifications/page.tsx:111-113` | 전체 | 공통 실패 토스트 | P2 |
| N-07 | 모임 알림 | 같은 모임에서 가입 메시지 없는 두 번째 신청부터 방장 알림·푸시 누락. 차단한 사용자의 알림도 옴 | join/approve/kick/ban/reject 라우트가 `ref_id`·`dedupe_key`·`sender_id` 없이 호출 → `legacy:{uid}:status:{link}:{title}:{body}` 키 충돌(23505를 성공으로 처리, `append-user-notification.ts:84,204`) | 운영 모임 알림 0건 (현재 미사용) | 각 라우트에 요청·회원 id 기반 `dedupe_key`와 `sender_id` 전달 | P1 |
| N-08 | 거래 분쟁 알림 | 커뮤니티 알림을 끄면 거래 분쟁 알림이 막히고, 커뮤니티 알림음 사용 | `buyer-issue/route.ts:86,94` `notification_type: report`, `push_kind: community` | 운영 0건 | `push_kind: trade`로 정정(분류 SSOT 따름) | P1 |
| N-09 | 자동 구매확정 | 「배달완료」·「자동확정」이 둘 다 미읽음 → 주문당 1건 계약 위반 | `notifyBuyerStoreOrderAutoCompleted`(`notify-store-commerce.ts:950-990`)에 `markPriorBuyerOrderStatusNotificationsRead` 없음 | 미읽음 상태 알림 2건 이상인 주문 **5건** | 자동확정 insert 전에 같은 함수 호출. 연결 자체는 커밋 5cae6ca9d로 운영 중이므로 유지하고, durability 문서의 「DO NOT wire」 문구를 현행으로 정정 | P2 |
| N-10 | 알림 설정 | 「매장·상점 알림」·「진동」을 꺼도 동작이 바뀌지 않음 | `effective-notification-preference.ts:119-146`에 store 도메인 없음. `vibrate` 계산값을 쓰는 곳 0건 | 설정 화면 사용자 전원 | 연결하려면 새 정책 정의가 필요하므로 **두 토글을 화면에서 숨김**(저장값은 유지). 기능 추가 아님 | P2 |
| N-11 | 웹 푸시 재시도 | FCM 일부 실패 시 웹 구독으로 같은 알림이 다시 감 | 기기 단위 unique가 `device_id IS NOT NULL`에만 적용 | 운영 `web_push_subscriptions` 0건 → 현재 영향 0 | **이번 범위 제외**(보고만). 웹 푸시를 켤 때 함께 처리 | — |
| N-12 | 관리자 배달 경고 처리 | 종·사이드바 숫자가 최대 75초 늦게 줄어듦 | `AdminDeliveryAlertsPage.tsx:353-371` 성공 후 `emitAdminQueueChanged` 없음 | 관리자 | 성공 후 `emitAdminQueueChanged` 호출 1줄 | P2 |
| N-13 | 관리자 Cash 충전 대기 | 레지스트리상 RT_REQUIRED인데 다른 관리자·탭은 폴링만, 신규 요청 알림음 없음 | provider에 `business_cash_charge_requests` 구독 없음 | 관리자 | 기존 provider 패턴으로 INSERT/UPDATE 구독 추가(Realtime publication 포함 여부 확인 필요 → DB 변경 가능성) | P2 |
| N-14 | 관리자→매장 운영 공지 | 두 번 누르면 두 번 발송, business 권한 확인 없음 | `stores/[id]/notify/route.ts:73` dedupe 키에 `Date.now()` | 관리자 발송 | 요청 단위 키(클라이언트 nonce) + 기존 business 권한 검사 함수 사용 | P2 |

### 의심 (확정 아님 — 이번 수정 대상 아님)
- S-1 `void appendUserNotification` / `void notify…`(모임 라우트, 포인트 충전 승인 `admin-point-charge-item.ts:208,256,259`, 구 채팅 라우트): 서버리스에서 응답 후 작업이 잘리면 누락 가능. 운영 누락 사례 미확인.
- S-2 거래 상태 알림 하나를 열면 같은 상품의 거래 채팅 이벤트까지 읽음(`inbox-read-bridge.ts:130-147`). status-event-read-lifecycle 「상태 알림 읽음으로 채팅 미읽음을 지우지 않는다」와 충돌 가능.
- S-3 앱→관리자 처리 대기 레지스트리에 없는 항목: 상품권 현금화·전환 요청, 플랫폼 이벤트 사장님 요청, 계정 삭제 요청. 제외 근거 문서 없음.
- S-4 캠페인 생성·발송 API는 활성 관리자면 권한 키 없이 전체 푸시 가능(phase-b 문서에 권한 요구 없음 → 계약 위반 아님, 보안 강화 과제).

### 문서 불일치 (코드 결함 아님)
- `dibay-notification-badge-number-policy.md` §3 「Tier1 종 = 표면별 `notification_targets`」 ↔ 실제 모든 표면 A `bellTotal`.
- `dibay-notification-read-badge-policy.md` §3 하단탭 Trade/Orders/Community 카테고리 합산 ↔ 실제 항상 0(폐기된 내용).
- `dibay-global-notification-ssot-hard-lock.md` 「Owner Point Inbox PASS(2026-08-12)」 ↔ N-01. 08-12가 구 테이블 마지막 insert 시각과 같은 날.
- `notification-event-ssot.md`의 `notifyMissedCallPipeline`·「양 당사자」 ↔ 실제 callee만 (통화 규정 대상, 문서만 정정).

---

## C. UI/UX/CTA 통일 시안

시안: [`notification-inbox-ui-mockup-2026-10-27.html`](./notification-inbox-ui-mockup-2026-10-27.html) — ① 일반 목록(미읽음·읽음 혼합) ② ⋯ 메뉴 ③ 다중 선택 ④ 삭제 확인 ⑤ 실패 피드백 ⑥ 알림 없음.

**재사용 규칙(바꾸지 않음):** `MySubpageHeader`, 상태 탭 pill(`dibay-secondary-tab`, 활성 = 진녹 #243832 배경·흰 글자, 대비 충분), 날짜 구획(오늘·어제·이전), `DibayConfirmDialog`, `NotificationInboxEmptyState`, `--sam-*` 토큰, 4px 반경, `sam-header-action` 눌림.

**UI 불일치 (확정 9건)**

| ID | 위치 | 현재 | 시안 |
|---|---|---|---|
| U-01 | 목록 행 | 선택과 미읽음이 같은 `bg-sam-primary-soft` → 선택 상태 불명확 (`InboxGroupCardList.tsx` li, `inbox-row-read-state.ts`) | 미읽음 = 좌측 3px 바 + 연녹 배경 + 굵은 제목 + 점 / 선택 = 체크 + 2px 녹색 테두리·흰 배경 |
| U-02 | 선택 모드 | 헤더(취소·선택 삭제)와 고정 툴바(취소·전체 선택·선택 읽음·선택 삭제)에 CTA 중복, 확인창도 page·view에 2개 | 헤더 = 취소 / N개 선택 / 전체 선택, 하단 고정 바 = 읽음 처리·삭제. 확인창 1개 |
| U-03 | 모두 읽음 | 12px 회색 텍스트, 눌림 없음 (`MyNotificationsView.tsx:761`) | 「읽지 않은 알림 N개」 + 녹색 외곽선 버튼, 눌림 연녹, 0건 비활성 |
| U-04 | ⋯ 메뉴 | hover만(터치 눌림 없음), 「전체 삭제」 일반색 (`page.tsx:201-229`) | 눌림 배경, 전체 삭제 위험색 |
| U-05 | 범위 표시 | 모두 읽음 = 현재 탭, 읽은/전체 삭제 = 모든 분류인데 표시 없음 | 삭제 메뉴에 「모든 분류」 부제, 모두 읽음 바에 탭 이름 |
| U-06 | 분류 칩·아이콘 | `notification-inbox-visual.ts`에 hex 하드코딩(토큰 규정 위반), 거래·채팅·커뮤니티·마케팅이 거의 같은 녹색 | sam 토큰으로 이전 + 분류별 구분색 |
| U-07 | 행 삭제 버튼 | 32px, `hover:text-red-600` 하드코딩, 터치 눌림 없음 | 44px 터치 영역, 토큰 색, 눌림 배경 |
| U-08 | 버튼 반경 | 더 보기·제안 수락/거절·빈 화면 CTA·종 시트 「전체 보기」가 `rounded-full` | `rounded-ui-rect`(탭 pill·뱃지·원형만 full) |
| U-09 | 삭제 확인 문구 | 「삭제할까요?」만 | 개수 + 「알림 기록만 지워지고 주문·거래·채팅은 남아요」 |

오너·관리자 UI (확정 3건): U-10 오너 목록 탭 칩·모두 읽음·읽음 버튼 눌림 없음(`OwnerNotificationList.tsx:246,260,326`) · U-11 오너 처리 대기 compact 행 `rounded-2xl`(`OwnerBellOperationSummary.tsx:62`) · U-12 관리자 경고 배지 `bg-sam-warning-soft text-sam-warning` 대비 약 3.9:1(12px 기준 4.5:1 미달, `AdminInboxPageClient.tsx:30`, `AdminActionQueueCardGrid.tsx:79`).

**「녹색 배경에 글씨가 안 보임」**: 알림 화면 코드에서는 해당 조합을 찾지 못함(활성 탭·미읽음 행 모두 대비 충분). 실제 화면 캡처로만 확인 가능 → **NOT_PROVEN**. 위치를 알려 주시면 같은 규칙으로 수정 범위에 넣음.

**요구사항 대비 누락 (Owner 요청 조작 중 미구현)**
- 오너 인박스: 개별·선택·전체 삭제, 선택 모드 없음(API `delete_ids`는 이미 지원). → 회원 센터와 같은 행·선택·확인 컴포넌트를 재사용해 추가.
- 관리자 Action Queue: 삭제 대상 아님(업무 대기 건). 관리자 `/admin/inbox`는 읽음만 → **현행 유지**.
- 알림종 미리보기 시트: 「모두 읽음」 없음 → 미리보기 용도라 **현행 유지**(센터로 이동).

**역할별 유지 차이:** 오너 = 매장 선택 + 처리 대기 요약 숫자, 관리자 = Action Queue 숫자. 미읽음 숫자와 섞지 않음.

---

## D. 수정 범위·위험

| 묶음 | 결함 | 변경 파일·계약 | 분류 | 위험·대응 |
|---|---|---|---|---|
| 1. 오너 인박스 정상화 | N-01, N-02, N-03 | 새 마이그레이션: `get_owner_dashboard_notifications_snapshot`·`get_owner_store_commerce_notifications` 원본 교체 + 오너 종류 목록. `owner-store-commerce-notification-meta.ts`, `inbox-read-bridge.ts`(매장 스냅샷 무효화) | **DB + 웹** | **운영 DB 적용은 별도 Owner 승인.** 회원 인박스 제외 조건과 같은 종류 목록을 써야 회원·오너가 섞이지 않음. 롤백 = 이전 함수 정의 재적용. 2개 매장 fixture 없음 → 다매장 UI는 NOT_PROVEN 유지 |
| 2. 회원 삭제·동기화 | N-04, N-05, N-06 | `inbox-read-bridge.ts`(일괄 소프트 삭제), `notification-badge-count-store.ts` 또는 resync 진입점(화면 복귀·resume), `notifications/page.tsx` | 웹 | 배지 엔진 LOCK(2026-07-08) 대상. A 판정 함수는 바꾸지 않고 호출 시점만 추가. 화면 복귀 시 1회 요청이라 폴링 증가 없음 |
| 3. 이벤트 정정 | N-07, N-08, N-09 | 모임 라우트 5개, `buyer-issue/route.ts`, `notify-store-commerce.ts` + durability 문서 정정 | 웹 | 각 1~3줄. 기존 dedupe unique에 기대므로 재발송 중복 없음 |
| 4. 설정 | N-10 | `NotificationsSettingsContent.tsx`(두 토글 숨김) | 웹 | 저장값·API 유지 → 되돌리기 쉬움 |
| 5. 관리자 | N-12, N-13, N-14 | `AdminDeliveryAlertsPage.tsx`, `AdminStorePointPendingProvider.tsx`, `stores/[id]/notify/route.ts` | 웹 (N-13은 Realtime publication 미포함 시 DB) | 관리자 화면만 |
| 6. UI 통일 | U-01~U-12 | `InboxGroupCardList.tsx`, `inbox-row-read-state.ts`, `notification-inbox-visual.ts`, `MyNotificationsView.tsx`, `notifications/page.tsx`, `NotificationInboxEmptyState.tsx`, `OwnerNotificationList.tsx`, `OwnerBellOperationSummary.tsx`, 관리자 배지 2곳 + 오너 삭제·선택 추가 | 웹 | 표시만 변경. 배지 숫자·읽음 판정 미변경. 회원·오너 공용 컴포넌트라 종 미리보기 시트에도 반영됨(의도) |
| 7. 문서 정정 | 문서 불일치 4건 | docs만 | 문서 | 빌드 생략 |

- **Android/iOS 네이티브 변경 필요: 없음.** 전부 웹·DB. 앱 재빌드 불필요(배포 후 앱 재시작).
- 통화 경로 변경 없음. 부재중 관련 항목은 문서 정정만.
- 반영 순서: 묶음마다 단독 커밋·단독 main 반영. 묶음 1은 마이그레이션 파일 커밋 → Owner 승인 → 운영 적용 → 확인.

---

## E. 검증 계획

| 항목 | 코드 PASS 기준 | 운영·실기기 PASS 기준 |
|---|---|---|
| N-01~03 | 새 vitest: 오너 종류 목록 TS = SQL 동일성, 매장 스냅샷 무효화 | 운영 DB: 함수 결과에 08-12 이후 오너 이벤트 포함(읽기 조회). 실기기: 주문 접수 → 오너 인박스 표시 → 읽음 → 재조회 후에도 읽음 |
| N-04 | 500행 초과 사용자 시나리오 테스트 | 운영: 대상 4명 중 협조 계정에서 전체 삭제 후 A 미삭제 0건(읽기 조회) |
| N-05 | resume·visibility 시 fresh 1회 호출 테스트 | 실기기 2대: A 기기 읽음 → B 기기 앱 복귀 시 종·아이콘 감소 |
| N-06~10, N-12~14 | 각 단위 테스트 + 해당 파일 eslint | 웹에서 동작 확인 (실패 토스트, 토글 숨김, 관리자 숫자 즉시 감소) |
| UI | typecheck + 관련 vitest | Web·Android·iOS·태블릿 각 1회 캡처로 시안 6상태 대조 |
| 공통 | `npm run typecheck:build` 1회 | Production SHA 기록, 계정 전환·재시작 후 종 숫자 유지 |

실기기 항목은 자동화 테스트 통과만으로 PASS 처리하지 않음.

---

## 10개 질문 답변

1. **기존 계약 알림이 모두 정확히 구현되어 있는가?** 아니오. 오너 인박스(N-01)는 08-12 이후 사실상 동작하지 않음. 그 밖에 모임(N-07)·거래 분쟁(N-08)·자동확정(N-09)·오너 종류 누락(N-02)이 계약과 다름. 나머지 이벤트는 코드상 PASS.
2. **푸시·인앱·알림음·배지 구분이 정확한가?** 대체로 정확함(설정 게이트는 푸시에만, 인앱 행은 유지, 같은 방은 억제, incoming call 배지 없음). 예외는 N-02·N-08(잘못된 설정·알림음 적용)과 N-10(효과 없는 토글).
3. **알림종과 전체 알림보기 집계가 일치하는가?** 같은 화면·같은 시점에서는 일치(같은 A 함수). 다른 기기에서 읽은 뒤에는 어긋남(N-05). 전체 삭제 후에도 어긋날 수 있음(N-04).
4. **읽음·삭제에 결함·누락이 있는가?** 개별·선택 읽음, 개별·선택 삭제, 모두 읽음은 PASS. 읽은/전체 삭제 500행 제한(N-04), 실패 무표시(N-06), 오너 읽음 no-op(N-01·N-03), 오너 삭제·선택 미구현(요구사항 누락).
5. **일반·오너·관리자 분리가 정확한가?** 관리자는 PASS(회원 배지 호출 차단, Action Queue 단일 출처). 오너↔회원은 N-02 한 종류가 섞임.
6. **Admin↔앱 연동이 정상인가?** 캠페인·Cash 충전·신고 처리는 PASS. 관리자 숫자 지연 2건(N-12·N-13), 매장 공지 중복 발송(N-14). 레지스트리 누락 의심 3종(S-3)은 확정 아님.
7. **UI/UX/CTA 불일치 건수:** 12건(회원 센터 9 + 오너 2 + 관리자 1). 「녹색 배경 글씨」는 코드상 미발견 → 화면 캡처 필요.
8. **실제 수정할 결함:** 기능 결함 13건(N-01~N-10, N-12~N-14) + UI 12건 + 요구사항 누락 1건(오너 삭제·선택). N-11은 웹 푸시 미사용이라 이번 범위에서 제외.
9. **변경 불필요(정상) 부분:** 회원 배지 A 산식·종=센터=전체 탭 숫자, 앱 아이콘 A+B, 소프트 삭제(업무 데이터 불변), dedupe unique, 로그아웃 정리, 같은 방 억제, incoming call 비생성, 설정 fail-closed, 캠페인 중복 방지, 관리자 Action Queue·권한·실패 표시, Cash 충전 알림, 탭 진입 일괄 읽음 금지, 알림종 미리보기 시트 구성.
10. **승인 후 수정 범위:** D표 묶음 1~7. 운영 DB 적용(묶음 1, 필요 시 N-13)은 별도 승인. 네이티브·통화 변경 없음.

### NOT_PROVEN (이번 감사에서 측정하지 않음)
실기기 앱 아이콘·런처 숫자, 실기기 푸시 탭 목적지, 다른 기기 동기화 재현(N-05), 2개 매장 오너 UI, 「녹색 배경 글씨」 화면 위치, 서버리스 `void` 누락(S-1), 친구 요청 푸시 정책(E17), 부재중 경로(통화 규정 대상).
