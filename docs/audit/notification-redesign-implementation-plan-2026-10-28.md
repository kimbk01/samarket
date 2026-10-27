# DIBAY 알림 재구현 계획서 (2026-10-28 · Owner 승인 전 · 코드 변경 없음)

- **기준:** Production `88ebaf30f` (+ 문서 `a84deaa71`). 운영 DB `ckdosyydvgzqwpbwuhon` SELECT 만 사용.
- **근거:**
  - 재감사 `notification-full-reaudit-2026-10-27.md` §2·§3
  - 실기기 결과 `notification-device-scenarios-2026-10-27.md` 「실행 결과」
  - 이번 전수 조사(판정 코드 위치 · 발송 문구 68곳 · 운영 알림 형태 81가지)
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
| friend_request·accepted·rejected, group_invite(admin_notice) | 325 | messenger_owned | — | **high** (변경) | 아니오 | 설정 키 = `community_chat` 1개로 (P-13, 변경) |
| gift_transfer_offered | 48 | messenger_owned | — | **high** (변경) | 아니오 | 설정 키 = 금융 필수 유지(받은 상품권은 금전) |
| gift_transfer_accepted·rejected·cancelled | 20 | messenger_owned | — | **high** (변경) | 아니오 | 설정 키 = `community_chat` (변경) |
| missed_call 방 있음 | 924 | conversation_b | — | 통화 경로 그대로 | 통화 경로 그대로 | 통화 코드 무변경 |
| missed_call 방 없음 | 33 | member_a | system | 통화 경로 그대로 | 예 | 현재와 같음 |
| trade_status (offer·completed·reserved·status·moderation 등) | 200 | member_a | trade | **high** (변경) | **예** (변경) | 이동 경로가 방이어도 읽음 |
| community_activity / trade_offer | 22 | member_a | **trade** (1행 변경) | high | 예 | 같은 종류는 같은 탭 |
| community_activity (댓글·좋아요·기타) | 170 | member_a | community | **high** (변경) | 예 | — |
| order_status 구매자 주문 5종 + store_order_owner_status | 527 | member_a | delivery | high | 예 | 현재와 같음 |
| order_status 오너 15종 | 787 | owner_c | — (오너 인박스) | high | 아니오(오너 화면) | 현재와 같음 |
| **delivery_ad_\*** (order_status·admin_marketing_banner) | 20 | **owner_c (변경)** | — (오너 인박스) | high | 아니오 | 운영 20건 모두 매장 사장님 수신(19건은 `delivery_ad_operations_cases.owner_user_id` 와 일치, 1건은 Cash 충전 요청). 사장님 광고 운영 알림. 최종 안정화 계약 「오너 운영은 회원 알림종 금지」. 오너 인박스 SQL 에 추가 필요 → **운영 DB 승인 대상** |
| user_point_charge_\* | 10 | member_a | **system (변경, 현재 delivery)** | **high** (변경) | 예 | 포인트는 주문·배달이 아님 |
| admin_notice·notice_published·admin_store_operational_notice | 948 | member_a | notice / system (현재 그대로) | **high** (변경) | 예 | — |
| admin_marketing_banner (광고 캠페인) | 44 | member_a | marketing | normal | 아니오 | 현재와 같음 |
| inquiry_answered·inbox_message_received·support_\* (회원) | 113 | member_a | — (전체 탭) | **high** (변경) | 예 | — |
| support_case_assigned·support_customer_replied | 18 | admin | — | — | — | 관리자 수신. 현재와 같음 |

> 우선순위 기준: 사용자에게 보이는 알림은 모두 high, 광고 캠페인만 normal. 근거: 샤오미 백그라운드 실측 normal 2분 55초 지연, 필수 알림(충전 결과)이 지연되면 안 됨.

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

## 11. 승인 요청 항목
1. 이 계획 전체(1~6, 8~10)
2. 2-2 표의 「변경」 칸:
   - 배달 광고 → 오너
   - 포인트 충전 → 시스템 탭
   - 메신저 소속 설정 키 통일
   - 상태 알림 우선순위 high
   - 상태 알림 푸시 탭 읽음
3. D-3 폐기
4. 6-1 문구 계약
5. 운영 DB 변경 3건(각각 적용 직전에 따로 승인): 오너 인박스 SQL, 백필, 140000 단순화
