# DIBAY 알림 재구현 계획서 (2026-10-28 · 개정 2 · Owner 승인 전 · 코드 변경 없음)

- **기준:** Production `88ebaf30f` (+ 문서 `a84deaa71`). 운영 DB `ckdosyydvgzqwpbwuhon` SELECT 만 사용.
- **근거:**
  - 재감사 `notification-full-reaudit-2026-10-27.md` §2·§3
  - 실기기 결과 `notification-device-scenarios-2026-10-27.md` 「실행 결과」
  - 이번 전수 조사(판정 코드 위치 · 발송 문구 68곳 · 운영 알림 형태 81가지 · 뱃지 표면 · 화면·버튼·이동 경로·설정)
  - 처음 요구사항 원문(2026-10-27 04:00 「알림 시스템 최종 전수 감사 및 결함 수정 설계 승인안」) §2 뱃지·§4 UI/UX/CTA·§5 역할 분리·§8 SSOT
  - Owner 결정: 선물·친구 = 메신저 소속, 알림종·알림센터 제외, 앱 밖 푸시 유지 (2026-10-27 07:48 「권장을 따른다」)
- **개정 2:** Owner 지시(「UI·UX·CTA SSOT 와 도메인별 뱃지 분리까지 정확히」「임의로 하지 말고 의문점은 질문」)에 따라 12·13·14절을 추가했다. 2-2 표의 「변경」 칸은 모두 **질문(Q)** 으로 바꿨다. 답을 받기 전에는 현재 동작을 유지한다.
- **순서:** 승인 → 구현 → 이중 점검(코드 대조 + 독립 검토) → 최종 보고 → 실기 → 실기 결과 보고.
- **완료 기준:** 동작 테스트 PASS + 운영 데이터 대조 PASS + 실기기 PASS. 하나라도 없으면 NOT_PROVEN 으로 적는다.

---

## 0. 지금 상태 (사실)

| 계획 | 실제 | 판정 |
|---|---|---|
| D-1 판정 함수 1개 | 알림 종류(kind) 읽기 함수만 합침. 판정은 아래 10곳 이상에 흩어져 있음 | 미구현 |
| D-2 종류별 게이트 | 주문 외 알림은 대상 확인 없이 통과 | 절반 |
| D-3 메신저 처리 시 알림 정리 | 안 함 | 누락 |
| D-4 상태 알림 읽음 범위 | 이벤트 부분만. 푸시 탭 읽음 누락 | 미완 |
| D-5 다른 기기 동기화 | 코드만 | 실기 0 |
| D-6 오너 소리 | 소리 키 이름만 바뀜. 오너 소리 파일 없음 | 효과 없음 |
| D-7 키·일괄 삭제 | 모임 키·DB 함수 완료. `88ebaf30f` 에서 승인 없이 4곳 확장 | 범위 이탈 |
| D-8 ① 배너 / ② 관리자 소리 | ① 실기 PASS / ② 코드만 | — |
| 푸시 문구 통일 | 미착수 | — |

### 판정이 흩어져 있는 곳 (전수 조사, 파일:줄)

| 결정 | 현재 위치 | 입력의 문제 |
|---|---|---|
| 회원 A 여부 | `member-notification-a-eligibility.ts:58` (+ `badge-event-classifier.ts:180`) | kind 는 공통 함수로 읽음 |
| 메신저 소속 | `notification-event-kind.ts:34` → **호출처는 A 판정 1곳뿐** | 탭·푸시·소리·탭 읽음은 각자 다른 규칙 |
| 알림센터 탭 | `member-notification-domain.ts:105`, `notification-center-tab-match.ts:27` | 탭 숫자와 라벨 경로가 입력 필드를 다르게 구성 |
| 행 라벨·아이콘 | `member-notification-domain.ts:202`, `notification-inbox-visual.ts:88`(별도 우선순위) | 같은 행에서 아이콘 분류와 라벨 분류가 다름 |
| 오너 C | `owner-store-commerce-notification-meta.ts:11` · `phase1-authority-contract.ts:221` · SQL `20270702120000:22` (15종 3벌), 부분 목록 5곳 | 동기화 테스트 없음. 소리 맵에서 4종, 설정 맵에서 1종 누락 |
| 푸시 설정 키 | `notification-preference-policy-registry.ts:224` ← `buildPushPayload` `meta.kind` | `notify-push-dispatcher.ts:106` 이 `legacyMeta.kind` 만 읽음 → 최상위 kind 행은 type 으로 판정 |
| 소리 키 | `notification-sound-event-key-from-row.ts:152` | 같은 함수(`:57`)는 공통 kind 를 써서 설정 키와 입력이 갈림 |
| FCM 종류 | `fcm-data-payload-contract.ts:58` | 상태 알림은 전부 `notification` |
| Android 우선순위 | `fcm-sender-impl.ts:109` | `trade_status`·`order_status` 분기에는 절대 도달하지 않음 → normal (실측 2분 55초 지연) |
| 푸시 탭 읽음 | `push-routing-transport.ts:112,239` | 이동 경로가 `/rooms/` 면 B 로 판정 → 상태 알림이 읽음 처리되지 않음 |
| 인앱 소리 경로 | `notification-sound-gate.ts:257` ← realtime 어댑터 | 어댑터가 공통 kind 를 버림 |

---

## 1. 걷어낼 것 (`88ebaf30f` 중 효과 없음 · 승인 범위 밖) — 커밋 1

| # | 대상 | 이유 | 처리 |
|---|---|---|---|
| R1 | `notification-target-read-bridge.ts` 의 `loadTradeTargetIdsWithUnreadChat` 와 테스트 변경 | `trade` 대상 표시는 읽는 곳 0 (숫자 RPC `count_notification_targets*` 호출처 0, `loadDomainBadgeTargetFacts` 호출처 0). 화면 영향 없이 조회 2회만 늘림 | `88ebaf30f` 이전 코드로 복원 |
| R2 | 중복 방지 키 4곳: `admin-store-decision.ts`, `suspend-owner-store-sales-on-member-sanction.ts`, `app/api/admin/stores/[id]/route.ts`, `notify-owner-admin-order-intervention.ts`, `member-admin-notes-service.ts`, `app/api/me/stores/[storeId]/route.ts` + `s07` 테스트 가짜 DB + D-7 테스트 추가분 | 계획 밖. 승인 없이 동작을 바꿈(갱신 시각이 없으면 매장 결정 알림이 조용히 생략됨) | `88ebaf30f` 이전 코드로 복원. 모임 가입 요청 키는 D-7 범위라 유지 |
| R3 | `memberNotificationDomainRowFromInbox` (상세·라벨 입력 덧댐) | D-1 판정 함수로 대체 | 2단계에서 삭제 |
| 유지 | 거래 상태 게이트(`legacyRefId` 를 상품 id 로 보지 않음) | 원인 수정이 맞음. 관리자 거래 확인·제안 알림 경로에도 해당 | 유지. 단 「사용자 화면 경로 없음」을 문서에 명시 |
| 유지 | 문서 정정 | 사실과 일치 | 유지 |

검증: 되돌린 뒤 관련 테스트(`notification-target-read-bridge`, `s07`, `admin-store-decision-rules`, `member-admin-notes-phase3`, `d7-deterministic-dedupe-keys`)가 `88ebaf30f` 이전과 같은 결과인지 대조한다.

---

## 2. D-1 판정 함수 (핵심) — 커밋 2

### 2-1. 새 모듈
`lib/notifications/core/notification-classification.ts`

```ts
type NotificationClassification = {
  kind: string;                       // legacyMeta.kind → 최상위 kind (빈 문자열은 없음으로)
  axis: "member_a" | "conversation_b" | "messenger_owned" | "owner_c" | "admin" | "hidden";
  centerCategory: "notice" | "delivery" | "trade" | "community" | "marketing" | "system" | null;
  rowLabelKey: MessageKey | null;     // 라벨·상세·아이콘이 모두 이 값을 씀
  recipientRole: "member" | "owner" | "admin";
  preferenceKey: NotificationPreferencePolicyKey;  // 푸시 설정 게이트
  soundEventKey: string;
  fcmType: FcmPushType;
  androidPriority: "high" | "normal";
  pushTapMarksRead: boolean;          // 푸시 탭 시 이 이벤트를 읽음 처리할지
  storeId: string | null;
};
export function classifyNotificationEvent(row: { type; category; room_id; display_payload }): NotificationClassification;
```

- **입력은 원본 이벤트 하나.** 클라이언트가 다시 판정하지 않도록, 서버가 목록 DTO 에 `classification` 을 실어 보낸다.
- **종류 목록은 이 모듈 하나에만 둔다.** 오너 15종, 구매자 5종, 메신저 소속 8종, 채팅 type, 회원 A 종류.
- 기존 목록 5곳(`owner-store-commerce-notification-meta.ts`, `phase1-authority-contract.ts:221`, `notification-attention-key.ts:89-99`, 소리 맵, 설정 맵)은 이 목록을 가져다 쓰게 바꾼다.
- **통화(missed_call·incoming_call)는 판정 결과만 읽는다.** 통화 발송·FCM call 분기·CallKit 경로의 코드는 바꾸지 않는다(통화 규정).

### 2-2. 판정 결과 표 (운영 81 형태 기준 · 「변경」은 현재와 달라지는 칸)

| type / kind | 운영 행 | axis | 알림센터 탭 | 우선순위 | 푸시 탭 읽음 | 비고 |
|---|---|---|---|---|---|---|
| chat·group·trade·store_order·mention·pin message | 3,100 | conversation_b | — | high | 아니오(방 읽음) | 현재와 같음 |
| group_message / community_group_invite (방) | 12 | messenger_owned | — | high | 아니오 | 현재와 같음 |
| friend_request·accepted·rejected, group_invite(admin_notice) | 325 | messenger_owned | — | **high** (Q4) | 아니오 | 설정 키 통일 여부 = **Q3** |
| gift_transfer_offered | 48 | messenger_owned | — | **high** (Q4) | 아니오 | 설정 키 = **Q3** |
| gift_transfer_accepted·rejected·cancelled | 20 | messenger_owned | — | **high** (Q4) | 아니오 | 설정 키 = **Q3** |
| missed_call 방 있음 | 924 | conversation_b | — | 통화 경로 그대로 | 통화 경로 그대로 | 통화 코드 무변경 |
| missed_call 방 없음 | 33 | member_a | system | 통화 경로 그대로 | 예 | 현재와 같음 |
| trade_status (offer·completed·reserved·status·moderation 등) | 200 | member_a | trade | **high** (Q4) | **예** (Q5) | 이동 경로가 방이어도 읽음 |
| community_activity / trade_offer | 22 | member_a | **trade** (1행, Q6) | high | 예 | 같은 종류는 같은 탭 |
| community_activity (댓글·좋아요·기타) | 170 | member_a | community | **high** (Q4) | 예 | — |
| order_status 구매자 주문 5종 + store_order_owner_status | 527 | member_a | delivery | high | 예 | 현재와 같음 |
| order_status 오너 15종 | 787 | owner_c | — (오너 인박스) | high | 아니오(오너 화면) | 현재와 같음 |
| **delivery_ad_\*** (order_status·admin_marketing_banner) | 20 | **owner_c (Q1)** | — (오너 인박스) | high | 아니오 | 운영 20건 모두 매장 사장님 수신(19건은 `delivery_ad_operations_cases.owner_user_id` 와 일치, 1건은 Cash 충전 요청). 사장님 광고 운영 알림. 최종 안정화 계약 「오너 운영은 회원 알림종 금지」. 오너 인박스 SQL 에 추가 필요 → **운영 DB 승인 대상** |
| user_point_charge_\* | 10 | member_a | **Q2 (현재 delivery)** | **high** (Q4) | 예 | — |
| admin_notice·notice_published·admin_store_operational_notice | 948 | member_a | notice / system (현재 그대로) | **high** (Q4) | 예 | — |
| admin_marketing_banner (광고 캠페인) | 44 | member_a | marketing | normal | 아니오 | 현재와 같음 |
| inquiry_answered·inbox_message_received·support_\* (회원) | 113 | member_a | — (전체 탭) | **high** (Q4) | 예 | — |
| support_case_assigned·support_customer_replied | 18 | admin | — | — | — | 관리자 수신. 현재와 같음 |

> Q 표시 칸은 14절 질문에 대한 답을 받은 뒤 확정한다. 답을 받기 전에는 현재 동작을 유지한다.

### 2-3. 판정 함수로 바꾸는 호출처 (전부)

| 구역 | 파일 | 바꾸는 내용 |
|---|---|---|
| 회원 A | `member-notification-a-eligibility.ts` | 내부 판정을 `axis === "member_a"` 로 바꿈. 읽음·삭제·만료 같은 상태 조건은 유지 |
| 목록 DTO | `inbox-events-merge.ts` (`mapNotificationEventToInboxRow`, `isOwnerOrderSide`, `resolveBellPresentationType`) | `classification` 필드를 붙이고, `legacyMeta.kind` 만 읽던 곳을 이 값으로 바꿈 |
| 탭·라벨·상세·아이콘 | `member-notification-domain.ts`, `notification-center-tab-match.ts`, `notification-inbox-visual.ts`, `InboxGroupCardList.tsx`, `[notificationId]/page.tsx` | 모두 `classification.centerCategory` / `rowLabelKey` 사용. R3 함수와 화면별 토큰 판정 삭제 |
| 오너 | `owner-store-commerce-notification-meta.ts`, `filter-owner-store-commerce-notifications.ts`, `apply-owner-commerce-notification-invalidate.ts`, 대상 표시 생성·삭제 2곳 | `axis === "owner_c"` / 모듈 목록 사용 |
| 푸시 | `notify-push-dispatcher.ts` (`buildPushPayload`) | `meta.kind`·`receiverRole`·`event_key`·`fcmType` 을 판정 결과로. `legacyMeta` 단독 읽기 제거 |
| 설정 게이트 | `web-push-user-settings-gate.ts`, `effective-notification-preference.ts` | `preferenceKey` 가 메타에 있으면 그 값을 씀(없으면 기존 경로 — 캠페인 발송용) |
| 우선순위 | `fcm-sender-impl.ts` `resolveAndroidPriorityForData` | `data.androidPriority`(판정 결과)를 사용. 통화 분기(`call_push_kind`)는 그대로 맨 앞에 둠. 도달 불가 분기 삭제 |
| 푸시 탭 | `push-routing-transport.ts`, `fcm-data-payload-contract.ts` (envelope) | 서버가 envelope 에 `pipeline` 을 판정 결과로 기록. 네이티브가 FCM 데이터를 인텐트에 그대로 복사하므로(`DibayFirebaseMessagingService.java:358-365`) **설치된 앱 수정 없이** 적용됨. 경로 추측은 envelope 가 없을 때(구 푸시)만 |
| 인앱 소리 | `adapt-notification-event-realtime-row.ts`, `notification-sound-gate.ts:257` | 판정 결과의 `soundEventKey`·`recipientRole` 사용 |
| SQL | 오너 인박스 함수 2개 (`20270702140000`) | 오너 종류 목록에 `delivery_ad_*` 추가, 빈 문자열 kind 를 없음으로 처리 → **새 정방향 마이그레이션 · 운영 DB 승인** |

### 2-4. 데이터 정리 (운영 DB 승인 대상 · 커밋 2 이후 별도)
- 백필: 최상위 kind 888행 → `legacyMeta.kind`. 적용 전후 오너 인박스 13쌍 건수가 같아야 한다.
- SQL 140000 의 `coalesce(... , display_payload->>'kind')` fallback 제거(백필 후).
- 롤백: 백필 전 행 id·원본 `display_payload` 를 백업 테이블에 저장. 되돌리기 SQL 을 동봉한다.

### 2-5. 테스트 (문자열 확인 테스트는 쓰지 않음)
- 운영 81 형태 원본 행을 입력으로 넣어 2-2 표와 모든 칸이 같은지 확인하는 표 테스트.
- 같은 행으로 **숫자 = 목록 = 탭 숫자 = 탭 목록 = 라벨 = 상세 = 푸시 설정 키 = 소리 키 = 우선순위 = 탭 읽음** 이 모두 판정 결과 한 값에서 나오는지 확인.
- SQL 오너 종류 목록 = TS 목록 (마이그레이션 SQL 을 파싱해 비교).
- 기존 101 형태 감사 스크립트 재실행: §7·탭·오너·메신저 소속 불일치 0.
- 전체 CI 동급 검사(알려진 Node26 환경 실패 7파일 외 0).

---

## 3. D-2 푸시 안전 게이트 마무리 — 커밋 3

`notification-delivery-safety-gate.ts`: 판정 결과(kind)별로 **그 알림의 대상이 있고, 받는 사람이 그 대상의 주인인지** 검사한다(운영 DB 로 확인한 컬럼).

| kind | 대상 | 검사 |
|---|---|---|
| user_point_charge_\* | `point_charge_requests.id = meta.request_id` | `user_id = 받는 사람` |
| store_point_charge_\* | `store_point_charge_requests.id = legacyRefId` | `owner_user_id = 받는 사람` |
| delivery_ad_business_cash_charge_\* | `business_cash_charge_requests.id = meta.request_id` | `owner_user_id = 받는 사람` |
| delivery_ad_(운영) | `delivery_ad_operations_cases.id = meta.case_id` | `owner_user_id = 받는 사람` |
| 주문·주문 메시지 | 현재 그대로 | 현재 그대로 |
| 거래 상태 | `88ebaf30f` 그대로 | 그대로 |

- 대상 행이 없으면 `destination_deleted`, 주인이 다르면 `destination_forbidden`.
- 테스트: kind 별로 있음/없음/주인 다름 3가지씩. 운영 최근 행 전부를 새 게이트에 넣어 허용되는지 대조.

## 4. D-3 — 폐기 제안 (근거)
- 메신저 소속 8종은 D-1 이후 숫자·목록·아이콘 **어디에도** 세지 않는다. 이벤트의 읽음 상태가 화면에 영향을 주지 않는다.
- 친구 요청 표시는 `community_friend_requests` 테이블 기준이다.
- 처리 API 에 읽음 처리를 붙여도 **보이는 변화가 없어** 땜빵이 된다.
- 그래서 D-3 은 구현하지 않고, 재감사 문서에 폐기 사유를 기록한다. **승인 필요.**

## 5. D-4 마무리
- 2-3 「푸시 탭」으로 해결한다(상태 알림은 이동 경로와 무관하게 푸시 탭 시 읽음).
- 상품 상세 열기 시 거래 대상 표시를 지우는 부분은 R1 로 원래 코드로 되돌린다(읽는 곳 없음).

## 6. 푸시 문구 통일 — 커밋 4 (문구 계약 승인 후)

### 6-1. 문구 계약
| 규칙 | 내용 |
|---|---|
| 제목 | 무슨 일인지 한 줄. 상대 이름·상품명·매장명 중 하나를 앞에 둔다 (예: 「김찌찌게 주문이 접수됐어요」, 「w테스트1님이 친구 요청을 보냈어요」) |
| 내용 | 다음 행동 또는 상세 한 줄. 제목을 반복하지 않는다 |
| 금지 | 내부 번호(`SO…` 주문번호, `SC-…` 문의번호, UUID 조각, `@dibay_…`, 영문 컬럼명), 영문 단어(Cash·COD·Order) |
| 말투 | 「~요」체로 통일 |
| 출처 | 모든 문구는 문구 모음(`lib/i18n/catalog/notifications.ts`)을 거치고, 받는 사람의 언어로 쓴다 |
| 알림센터 | 푸시와 같은 문구를 쓴다(다시 번역할 때도 같은 키·같은 값) |

### 6-2. 바꾸는 곳 (조사 결과 68곳 중)
- **하드코딩 13곳 → 문구 모음으로:**
  - 거래 4 (`buyer-confirm:91`, `buyer-issue:84`, `seller-complete:146`, `admin/trade-flow/confirm-buyer:108`)
  - 모임 5 (`kick·join·reject·ban·approve`)
  - 고객센터 3 (`support-case-service.ts:1074,1174,1298` — 「문의 SC-n」 대신 문의 제목)
  - 부재중 1 (`call-missed-notification-authority.ts:156` — **통화 코드라 통화 규정에 따라 별도 문서·승인**)
- 항상 한국어로만 나가던 3곳(`price-offers.server.ts:507,542,572`) → 받는 사람의 언어로. 비어 있던 `offer_notif_received_body` 키 사용.
- 주문번호·Cash·COD 가 들어간 문구 키 → 6-1 규칙대로 키 값만 수정(`notify_commerce_*`, `notify_delivery_ad_cash_*` 등).
- 이름 대체값(닉네임 → `@handle` → 기본값) → 닉네임이 없으면 `@handle` 대신 기본 문구.
- 알림센터 재번역(`resolve-commerce-notification-inbox-text.ts`)의 확인된 오류 4건:
  - 리마인드 제목이 「새 매장 주문」으로 바뀜
  - 취소 요청이 환불 요청으로 표시됨
  - 충전 반려 사유가 빠짐
  - 매장명이 없을 때 「매장」이 들어감
  → 발송 때 쓴 키·변수를 이벤트에 저장하고, 알림센터는 그 키로만 다시 그린다.

### 6-3. 테스트
- 문구 모음의 알림 키 전체에 내부 번호 패턴·금지 영문·「합니다」체가 없는지 확인한다.
- 발송 함수 68곳이 모두 문구 모음 키를 쓰는지 확인한다(하드코딩 0).
- 대표 kind 별 푸시 문구 = 알림센터 문구.

## 7. 네이티브·데이터 (별도 계획 · 별도 승인)
| 항목 | 필요 | 비고 |
|---|---|---|
| Android 알림 아이콘이 빈 원 | 단색 알림 아이콘 추가, `setSmallIcon(R.mipmap.ic_launcher)` 5곳 교체 (통화 2곳 포함 → 통화 규정 적용) | Android 재빌드 |
| Android 런처 숫자가 백그라운드 푸시로 안 바뀜 | `DibayAppIconDeliveryAdapter.onDomainNotificationPosted` 가 서버 총합을 반영하도록 | 계약 §6 과 맞춤 · 재빌드 |
| 오너 주문 소리 | 소리 파일(Owner 제공) → 운영 DB 자산 등록 → iOS 번들 `.caf` → APNs `sound` 에 이름 지정 | DB·네이티브 승인 |
| 채팅 목록 행 숫자 미갱신(분할 화면) | 메신저 목록 영역 | 메신저 도메인 별도 |

---

## 8. 이중 점검 (구현 후 · 최종 보고 전)
1. **코드 대조:** 2-3 표의 호출처마다 판정 함수 외 판정 코드가 남았는지 확인한다(검색 결과 0 이어야 함). 종류 목록 정의가 모듈 1곳뿐인지 확인한다.
2. **독립 검토:** 이 계획서와 diff 만 주고 다른 검토자가 계획 대비 누락·덧댐·범위 이탈을 찾는다. 지적 사항은 고치거나 근거로 반박한다.
3. **운영 데이터 대조:** 81 형태 판정 결과가 2-2 표와 같은지, 「변경」 칸 외에는 현재와 같은지 확인한다.
4. 그다음 최종 보고(바꾼 파일·검증 결과·남은 위험) → 실기.

## 9. 실기기 행렬 (구현 반영 후 전부 · 생략 없음)
- 기록: 발생 시각(PHT), 운영 DB(이벤트·발송 상태·**우선순위**·수신 시각), 화면 캡처, 숫자 대조.
- A 회원 1~7, B 메신저 1~7, C 오너 1~6, D 관리자 1~2, E 공통.
- 추가 항목:
  - 백그라운드 상태 알림 도착 시간(목표 10초 이내)
  - 상태 알림 푸시 탭 시 읽음
  - 푸시·알림센터 문구 일치
  - 문구 규칙(내부 번호 없음)
- **실기 전 필요한 조건:**
  1. C(오너 주문): 고객 기기에서 한글 입력이 되는 방법. 샤오미에 입력 도구를 설치하거나, Owner 가 고객 쪽을 직접 조작.
  2. D: 관리자 계정이 로그인된 기기.
  3. E: 같은 계정이 로그인된 기기 2대.
  4. 아이폰: 미러링 입력이 안 되므로 직접 조작이 필요.

## 10. 반영 단위 · 롤백
| 커밋 | 내용 | 배포 구분 | 롤백 |
|---|---|---|---|
| 1 | R1·R2 걷어내기 | 웹 | revert |
| 2 | D-1 판정 함수 + 호출처 전환 + D-4 푸시 탭 + 우선순위 | 웹 | revert(데이터 변경 없음) |
| 2-DB | 오너 인박스 SQL(`delivery_ad_*`) · 백필 · 140000 단순화 | DB (각각 승인) | 동봉한 되돌리기 SQL |
| 3 | D-2 게이트 | 웹 | revert |
| 4 | 문구 통일(통화 부재중 제외) | 웹 | revert |
| 별도 | 네이티브 4항목·부재중 문구 | 네이티브·통화 | 별도 계획서 |

## 12. UI · UX · CTA SSOT (처음 요구사항 §3·§4 · 조사 결과 · 코드 재확인)

### 12-1. 지금 상태 (파일:줄)
| 영역 | 현재 | 판정 |
|---|---|---|
| 행 컴포넌트 | 회원 알림센터·종 미리보기 = `InboxGroupCardList`. **오너 목록(`OwnerNotificationList.tsx`)·관리자 목록(`AdminNotificationList.tsx`)은 각자 다른 `<li>`** — 아이콘 없음, 시간 형식 다름(오너 `toLocaleString("ko-KR")` 고정 :477), 미읽음 표시 다름(관리자 `amber` 하드코딩 :201) | 처음 요구 §4 「일반·오너·관리자 공통 UI 는 같은 디자인 규칙」 위반 |
| 한 행 안의 분류 | 아이콘 = `notification-inbox-visual.ts:88`, 라벨 = `member-notification-domain.ts:202`, 상세 라벨 = `:105` → **같은 행에 서로 다른 분류기 3개** (예: 친구 요청 행이 거래 아이콘 + 커뮤니티 라벨) | 결함 |
| 제목·내용 | 목록 = `resolveNotificationInboxTitle/Body` 로 다시 그림. **상세(`[notificationId]/page.tsx:291,293`)·오너·관리자 = 원본 그대로.** 재번역 오류 4건(리마인드 제목, 취소→환불, 반려 사유 누락, 「매장」 대체) | 결함 |
| 시간 | 형식 5가지(목록·상세·오너·관리자·메신저) | 불일치 |
| 모두 읽음 | 회원 = 서버 분류 범위 · 오너 = **불러온 행만** 클라이언트에서(:202-225) · 관리자 = `mark_all_read` → 서버가 **회원 A 만** 읽음(route.ts:574) | 결함(관리자·오너) |
| 문구 | 「모두 읽음」·「이 매장 알림 모두 읽음」·「전체 읽음」, 「읽음 처리」·「읽음」 | 불일치 |
| 삭제 | 알림센터·오너 = 확인창. **상세 화면 = 확인창·실패 표시 없음**(:467-523). 종 미리보기 = 삭제 코드는 있으나 연결 안 됨(`onDelete` 미전달, 죽은 코드) | 결함 + 죽은 코드 |
| 실패 토스트 | 같은 마크업 3벌, 위치 76px/24px | 불일치 |
| 이동(목적지) | 계산하는 곳 약 10곳. **푸시 탭과 행 탭이 같은 함수를 쓰지 않음.** 같은 오너 주문 이벤트가 행 탭(`buildOwnerStoreOrderNotificationHref`)과 푸시 탭(`resolveOwnerOperationCanonicalRoute`)에서 **다른 탭으로 열림** · 메신저 배너·관리자 배너는 해석기를 거치지 않음 · 대체 경로 3가지(`/notifications?fallback…`·`/notifications`·`/`) | 결함 |
| 설정 | 같은 설정이 3화면에 다르게 노출(`store_enabled`·`vibration_enabled` 는 마이 설정에서만 숨김) · 토글 컴포넌트 4종 · 저장 실패 처리 3가지(메신저 시트는 실패를 표시하지 않고 변경 이벤트도 보내지 않음) · 설정 링크 경로 4가지 · 「조용한 시간」 두 기능이 한 화면에 | 불일치 |
| 토큰·반경 | `text-white` 9곳(`text-sam-on-primary` 아님), `rounded-xl`·`rounded-md`·`rounded`·`rounded-full` 칩 등 반경 규칙 위반, 미읽음 숫자 알약 5벌·크기 3가지 | 규정 위반 |
| 미장착 | `DibayBottomNotificationBanner`(관리자 공지·광고 배너) 어디에도 장착 안 됨, 문구 하드코딩 | 보고(Q10) |
| 첫 감사 U-01~U-12 | 묶음 6 으로 코드 반영. 실기 확인은 ⋯ 메뉴 일부뿐 | NOT_PROVEN |

### 12-2. 구현 (커밋 5 · 웹)
1. **행 하나:** `InboxGroupCardList` 행을 회원·오너·관리자가 같이 쓴다(역할별 차이는 처음 요구 §4 대로 내용·권한만: 오너 = 매장 선택·「주문 보기」, 관리자 = 「바로 처리」). 아이콘·라벨·시간·미읽음 표시는 판정 결과(2절)와 공통 시간 함수 1개.
2. **제목·내용:** 6-2 의 「발송 키 저장 → 같은 키로 다시 그림」을 목록·상세·오너·관리자 모두에 적용.
3. **모두 읽음:** 서버 범위 1개 API(역할·분류·매장 범위 인자). 오너 = 매장 범위 서버 처리, 관리자 = 관리자 범위(**Q8**). 문구 1세트.
4. **삭제:** 상세 화면 삭제도 같은 확인창·실패 토스트. 종 미리보기의 연결 안 된 삭제 코드는 제거(미리보기는 첫 감사에서 「현행 유지」 결정).
5. **이동:** `resolveNotificationDestination` 하나로 행 탭·푸시 탭·배너가 같은 목적지. 오너 주문은 한 규칙(**Q7**). 대체 경로 1개.
6. **설정:** 세 화면이 같은 토글 컴포넌트·같은 저장/실패 처리를 쓴다. 어느 화면에 어떤 설정을 둘지 = **Q9**. 설정 링크 경로 1개.
7. **토큰·반경:** `text-white` → `text-sam-on-primary`, 반경 규칙, 미읽음 알약 컴포넌트 1개.
8. **시안:** 구현 전에 첫 감사 시안(`notification-inbox-ui-mockup-2026-10-27.html`)을 회원·오너·관리자 3역할로 갱신해 승인받는다.

### 12-3. 검증
- 회원·오너·관리자 행 스냅샷이 같은 컴포넌트에서 나오는지 확인하는 테스트.
- 목적지 표 테스트: 같은 이벤트의 행 탭 경로 = 푸시 탭 경로 = 배너 경로.
- 토큰 래칫(IA-19 포함)에 알림 화면 파일을 추가한다.
- 실기: 3역할 화면 캡처를 시안과 대조한다.

---

## 13. 도메인별 뱃지 분리 (처음 요구사항 §2·§5 · 최종 안정화 계약 §2)

### 13-1. 계약 공식
```
Row(room) = 그 방의 미읽음 메시지 수
B_general / B_group / B_trade / B_customer = 미읽음 방 수
하단 채팅 = B_general + B_group + B_trade + B_customer
거래 허브 = B_trade · 고객 주문 허브 = B_customer
알림종 = 회원 알림 A · 회원 앱 아이콘 = A + B (오너 제외)
오너 FAB/허브 = 매장 범위 오너 방 수 + 오너 운영 처리 대기
관리자 = 처리 대기(업무) · 관리자 알림(미읽음) — 서로 더하지 않음
```

### 13-2. 표면별 현재 (운영 실측: 삼성 `q테스트1` 01:5x PHT · 코드 재확인)
| 표면 | 기준값 출처 | 실측 / 판정 |
|---|---|---|
| 회원 종(모든 헤더)·알림센터 숫자 | `memberUnreadNotificationCount` (A) | 51 = 목록 51 · **PASS** |
| 알림센터 분류 탭 숫자 | 별도 요청·상한 있는 스캔·다른 분류기 | 합이 「전체」와 다를 수 있음 · 2절로 해결 |
| 하단 채팅 | 클라이언트 `gd+group+trade+buyer` | 37 = 3+1+0+33 · **PASS(공식)**. 서버와 다른 계산(아래 B-2) |
| 앱 아이콘(웹→네이티브) | 클라이언트가 다시 계산 | 88 = 51+37 · **PASS(공식)** |
| 메신저 홈 「거래 채팅」·「주문채팅」 폴더 숫자·목록 머리 「읽지 않음 N」 | **목록 API(`/api/messenger/domain-read/*`)에서 따로 계산** | B-1 |
| 오너 FAB 접힌 숫자 | `Math.max(주문, 매장, 채팅)` (`MainBottomNavFabSector.tsx:128`) | **계약(합) 위반** |
| 오너 관리자 화면 종 | **회원 A 숫자·목록** (`storeId` 를 받기만 하고 사용 안 함, `PhilifeHeaderNotificationInbox.tsx:251`) | **역할 혼합 위반** |
| 회원 종 미리보기 시트 | 오너 운영 요약(`OwnerBellOperationSummary`)이 들어 있음 | **역할 혼합(Q11)** |
| 오너 주문 뱃지 | FAB = 접수 대기+환불+**취소 요청** / 관리자 하단·사이드바 = 접수 대기+환불 (`owner-hub-order-counts-cache.ts:106`) · 쓰는 곳 3곳 | **정의 2가지** |
| 오너 대시보드 주문채팅 숫자 | 런타임이 있으면 **0 고정** (`BusinessAdminDashboard.tsx:59`) | 결함 |
| 오너 알림 목록 미읽음 | 불러온 행만 클라이언트에서 셈 | 결함 |
| 관리자 종 / 관리자 알림 링크 | 처리 대기 / 관리자 알림 미읽음, 따로 표시 | **PASS** |
| Android 런처 | 앱이 실행 중일 때만 갱신(푸시 숫자 무시) | 계약 §6 과 다름(네이티브, 7절) |
| iOS 아이콘 | 웹 동기화 + APNs `badge` | 통화 푸시가 `badge=0` 을 실을 위험(B-4, 통화 규정) |
| 공용 저장소 | `owner-hub-badge-store` 하나에 회원 값(하단 채팅·거래 허브·고객 주문)과 오너 값이 같이 있음, `storesTabAttention` 이 쓰는 곳에 따라 뜻이 다름, `total` 은 이중 합산(표시처 0) | 구조 혼합 |

### 13-3. 구현 (커밋 6 · 웹)
- **B-1 거래·고객 주문 허브 숫자 출처 1개:** 폴더 숫자·목록 머리는 뱃지 API(`domainUnreadRooms.trade`·`storeOrderBuyerDeliveryUnread`)를 쓴다. 목록 API 의 숫자는 행 표시용으로만 쓴다. 먼저 두 출처가 운영에서 다른 경우가 있는지 대조한다(숨김·보관·나간 방).
- **B-2 서버·클라이언트 계산 1개:** 하단 채팅·앱 아이콘은 서버 `projection` 값(격리 방 제외 규칙 포함)을 그대로 쓰고, 클라이언트 재계산을 지운다. 푸시 badge 와 화면 숫자가 같아진다.
- **B-3 역할 분리:**
  - 오너 관리자 종 = 매장 범위 오너 알림 숫자·목록(**Q12**)
  - 오너 FAB 접힌 숫자 = 계약 합계(**Q13**)
  - 오너 주문 뱃지 정의 1개(취소 요청 포함 여부 **Q14**)
  - 대시보드 0 고정 제거
  - 오너 목록 미읽음 = 서버 숫자
  - 회원 종 시트의 오너 운영 요약 처리 = **Q11**
- **B-4 저장소 분리:** 회원 숫자 저장소와 오너 숫자 저장소를 나누고, 뜻이 둘인 필드와 표시처 없는 `total` 을 지운다.
- **B-5 응답 정리:** 뱃지 API 의 옛 필드(`total`·`categoryCounts`·평면 별칭·`domainAppIcon`·`unreadApprovedNotificationEvents`)는 읽는 곳을 옮긴 뒤 제거한다(**Q15**). 표시처 없는 죽은 코드 5개는 제거한다(`DomainShellCanaryHomeGate`, `PhilifeHeaderMessengerButton`, `CommunityMessengerBellPinnedAlerts`, `StoreOwnerOpsSection`, 미사용 `useOwnerHubBadgeTotal`).
- **B-6 통화 푸시 badge=0 (iOS):** 통화 코드라 **증거 확인 → 별도 계획서 → 승인** 순서(통화 규정). 이번 커밋에서 다루지 않는다.

### 13-4. 검증
- 표면별 숫자 표 테스트: 같은 사실 입력으로 13-1 공식 결과와 모든 표면 값이 같은지 확인한다.
- 운영 실측: 회원 2명·오너 2명으로 표면별 숫자 = 공식 = 서버 값을 대조한다.
- 실기: 표면마다 증가·감소를 확인한다(방 읽음, 알림 읽음, 오너 주문 처리).

---

## 14. Owner 확인 질문 (답을 받기 전에는 현재 동작 유지)

| Q | 질문 | 근거 | 현재 |
|---|---|---|---|
| Q1 | 배달 광고 결과·광고 Cash 충전 결과 알림(사장님 수신 20건)을 회원 알림종에서 빼고 **오너 인박스**로 옮길까요? | 최종 안정화 계약 「오너 운영은 회원 알림종 금지」 · 수신자 20/20 사장님 | 회원 알림종 「광고/이벤트」 탭 |
| Q2 | 회원 포인트 충전 결과는 알림센터 어느 탭에 둘까요? (주문·배달 / 시스템) | 현재 type 이 `order_status` 라 「주문·배달」로 분류됨 | 주문·배달 |
| Q3 | 메신저 소속 알림(친구·그룹 초대·선물)의 푸시 설정 키를 「채팅 알림」 하나로 합칠까요? 받은 상품권 알림은 금융 필수로 유지할까요? | 재감사 P-13 (지금은 커뮤니티 활동·금융 필수·커뮤니티 채팅 3갈래) | 3갈래 |
| Q4 | 상태 알림(거래 상태·공지·커뮤니티·포인트·고객센터·메신저 소속)을 Android **high** 우선순위로 보낼까요? 광고 캠페인만 normal 유지 | 샤오미 백그라운드 normal 2분 55초 지연 실측 | normal |
| Q5 | 상태 알림은 푸시를 탭하면 그 알림을 읽음 처리할까요? (이동 경로가 채팅방이어도) | 실기: 거래 완료 푸시 탭 후 미읽음 유지 | 읽음 처리 안 함 |
| Q6 | `community_activity` 유형으로 저장된 거래 제안 1행도 「거래」 탭으로 맞출까요? | 같은 종류 21행은 거래 탭 | 커뮤니티 |
| Q7 | 오너 주문 알림을 눌렀을 때 열리는 탭은 무엇을 기준으로 할까요? (알림 종류 / 주문 현재 상태) | 행 탭과 푸시 탭이 다른 탭을 엶 | 경로마다 다름 |
| Q8 | 관리자 「전체 읽음」은 관리자 알림 전체를 읽음 처리하는 것이 맞나요? | 지금 서버는 회원 A 만 읽음 처리 | 회원 A |
| Q9 | 알림 설정은 마이 설정 한 화면에만 두고, 주문 알림 설정·메신저 설정 시트에서는 그 화면으로 연결할까요? 아니면 세 화면 모두 같은 항목을 둘까요? 「진동」은 효과가 없는데 남은 두 화면에서도 숨길까요? | 세 화면 노출 불일치 · 진동 사용처 0 · `store_enabled` 는 인앱 소리에 사용 | 세 화면 제각각 |
| Q10 | 미장착 상태인 하단 관리자 공지·광고 배너(`DibayBottomNotificationBanner`)는 장착할까요, 삭제할까요? | 06-22 부터 미장착 | 미장착 |
| Q11 | 회원 알림종 미리보기 시트 안의 「매장 운영 요약」(사장님만 보임)을 그대로 둘까요, 오너 화면으로만 옮길까요? | 계약 「오너 사실은 회원 종에 들어가지 않음」(숫자는 안 섞이지만 시트 안에 표시) | 회원 시트에 표시 |
| Q12 | 오너 관리자 화면의 종은 **선택한 매장의 오너 알림**(주문·포인트 등) 숫자·목록을 보여 주는 것이 맞나요? | 지금은 회원 알림 숫자·목록을 보여 줌 | 회원 A |
| Q13 | 오너 FAB 접힌 숫자는 계약대로 「오너 방 수 + 운영 처리 대기」 합계로 할까요? | 지금은 세 값 중 최댓값 | 최댓값 |
| Q14 | 오너 「주문」 뱃지에 「취소 요청」을 포함할까요? | FAB 는 포함, 관리자 하단·사이드바는 미포함 | 두 정의 |
| Q15 | 뱃지 API 의 옛 필드(읽는 곳 없음 또는 대체 경로뿐)를 정리해도 될까요? (구 앱 바이너리가 읽는지 확인 후) | 표시처 없음 | 반환 중 |
| Q16 | D-3(메신저 처리 시 알림 읽음)은 화면 변화가 없어 폐기해도 될까요? | 4절 근거 | 미구현 |
| Q17 | 6-1 문구 계약(제목 = 무슨 일, 내용 = 다음 행동, 내부 번호·영문 금지, 「~요」체)대로 진행할까요? 고칠 규칙이 있으면 알려 주세요 | 처음 요구 「배민·요기요·당근 형태」 | 미통일 |
| Q18 | 새 판정 모듈을 만드는 것은 처음 요구의 「새 SSOT 금지」에 걸리지 않나요? (기존 판정 코드 여러 곳을 **한 곳으로 모으는 것**이고, 저장 구조는 바꾸지 않음) | 처음 요구 §8 · 재설계 D-1 은 승인됨 | — |

---

## 15. 반영 단위 (개정)
| 커밋 | 내용 | 조건 |
|---|---|---|
| 1 | 걷어내기(R1·R2) | 계획 승인 |
| 2 | 판정 함수 + 호출처 전환(2절) | 계획 승인 + Q1~Q6·Q18 답 |
| 3 | D-2 게이트 | 계획 승인 |
| 4 | 문구 통일(6절) | Q17 답 |
| 5 | UI·UX·CTA SSOT(12절) | Q7~Q10 답 + 시안 승인 |
| 6 | 뱃지 분리(13절) | Q11~Q15 답 |
| DB | 오너 인박스 SQL·백필·140000 | 각각 적용 직전 승인 |
| 별도 | 네이티브(7절)·통화(부재중 문구·통화 푸시 badge) | 별도 계획서 · 통화 규정 |

각 커밋 후 같은 트리에서 CI 동급 검사를 1회 돌린다. 전부 반영한 뒤 8절 이중 점검 → 최종 보고 → 9절 실기 순서로 진행한다.
