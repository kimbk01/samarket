# DIBAY 알림 시스템 전수 재감사 — 1단계 보고 (2026-10-28 · 감사만 · 코드/DB 무변경)

- **기준 코드**: `origin/main` **5d69afa51**. 분리 작업 트리에서 읽기만 했고 현재 체크아웃·main 은 변경하지 않았다.
- **운영 DB**: `ckdosyydvgzqwpbwuhon` 에 **SELECT 만** 실행했다. 테스트 DB 는 접근하지 않았다.
- **이전 작업자 판정은 근거로 쓰지 않았다.** 이전 문서는 승인 범위를 확인하는 데만 썼다.
- **판정 표기**
  - PASS / PARTIAL / FAIL / NOT_PROVEN 으로 적는다.
  - 「코드」 = 코드 경로로 확인, 「DB」 = 운영 DB 조회 결과.
  - 실기기·Production 화면 칸은 **전부 NOT_PROVEN** 이다(5단계 실기 대상).
- **시각 표기**: PHT(UTC+8) 와 UTC 원문을 함께 적는다.
- 이 문서는 커밋하지 않는다.

---

## 0. 결론 요약 (원 지시서 §10 질문 1~10)

| # | 질문 | 답 |
|---|---|---|
| 1 | 기존 계약 알림이 모두 정확히 구현되어 있는가 | **아니다.** 아래 결함 B-01~B-20(실제 수정 대상 20건) 참조. 쓰기 경로는 `createNotificationEvent` 하나뿐이고 DB 트리거 writer 는 없어, 같은 이벤트를 두 writer 가 만드는 중복은 없다(코드). 대신 다음이 남아 있다: 분류 오류(오너 운영 알림이 회원 종에 들어감 B-04), 비결정적 중복 키(B-09), 푸시 지연(B-01), 발송 잘림(B-02), 언어 무시(B-10). |
| 2 | 푸시·앱 내부 알림·알림음·뱃지 구분이 정확한가 | **부분적이다.** 문구는 푸시와 인앱이 같은 행에서 나와 일치한다(코드). 다만 다음이 틀리다: ① 알림음·진동·매장 토글을 꺼도 푸시는 울린다(B-11). ② 오너 포인트 3종 소리 키가 누락됐다(B-12). ③ 회원 포인트가 정산음·배달 채널로 매핑된다(B-13). ④ Android 백그라운드에서 앱 아이콘 숫자가 갱신되지 않는다(B-16·네이티브). |
| 3 | 알림종과 전체 알림보기 집계가 일치하는가 | **입력은 같다.** 종·「전체」·분류 탭 모두 같은 A 판정 함수를 쓴다(코드). 그러나 **새 알림 도착(INSERT) 때 종·앱아이콘만 즉시 늘지 않아** 일시적으로 어긋난다(B-05). 분류 탭에 안 잡히는 A(문의·회원노트)가 있어 「전체」가 분류 합보다 클 수 있다(B-06). |
| 4 | 읽음·개별/선택/전체 삭제에 결함·누락이 있는가 | 회원 알림센터는 기능이 갖춰져 있다(코드 PASS). 결함·누락은 아래와 같다. ① 오너 목록에 전체 삭제·읽은 알림 삭제가 없다. ② 오너 개별·전체 읽음 실패가 표시되지 않는다. ③ 오너 전체 읽음이 불러온 행만 처리한다. ④ 종 팝업에는 읽음·삭제 조작이 없다(이전 결정상 유지). ⑤ 상세 화면에 재시도가 없다. 삭제는 업무 데이터를 지우지 않는다(소프트 삭제 · DB 함수 확인). |
| 5 | 일반 앱·오너·Admin 알림이 정확히 분리되는가 | **아니다.** ① 오너 관리자 화면 종이 회원 A 를 보여 준다(B-03, 이전 승인 F3 미구현). ② 오너 운영 알림 4종(관리자 주문 개입·매장 심사·매장 운영 공지·광고)이 회원 종에 들어가고 오너 인박스에는 안 보인다(B-04). ③ 오너 「주문」 숫자 정의가 FAB 와 오너 관리자에서 다르다(B-07, 문서 충돌). 관리자 종은 처리 대기 업무 건수로 회원 알림과 분리되어 있다(코드 PASS). |
| 6 | Admin 과 앱 알림 연동이 정상인가 | **부분적이다.** 관리자 조치로 나가는 알림은 대부분 결정적 키·정상 수신자다. 결함은 다음과 같다. ① 관리자 「구매자 확인 처리」 링크가 비정식 id 를 쓴다(B-08). ② 회원 노트·주문 개입·매장 심사·댓글 조치 키가 비결정적이다(B-09). ③ 오너 플랫폼 문의 답변 알림은 호출하는 곳이 없어 나가지 않는다(B-14). ④ 관리자 업무 알림 푸시(정산 예외 critical 포함)가 그 관리자의 **개인 회원 알림 설정**에 묶여 있다(B-18). ⑤ 거래 광고 신청 처리 후 관리자 종 숫자가 늦게 줄어든다(B-20). 신고·충전 요청 같은 처리 대기는 알림 행이 아니라 Action Queue 숫자로 반영되고, 권한 없는 분류는 종 합계에서 빠지며, Realtime 9분류 구독·관리자 알림음 토글·클릭 이동 경로는 정상이다(코드). 별도로 관리자 처리 API 권한 키 우회 2곳을 발견했다(범위 밖 보고). |
| 7 | UI/UX/CTA 디자인 불일치는 몇 건인가 | **44건**(코드 기준, 역할 간 불일치 28 + 규정 위반·품질 16). 실제 고칠 묶음은 C 절의 U-A~U-H 8묶음이다. |
| 8 | 실제 수정해야 할 결함은 몇 건인가 | **20건**(B-01~B-20). 이 중 네이티브가 필요한 것이 2건(B-16, B-11 의 Android 무음 채널 부분)이다. 그 밖에 Owner 결정이 필요한 것은 D-Q1~D-Q6 에 정리했다. |
| 9 | 정상으로 확인되어 변경할 필요가 없는 부분 | §5 참조. 쓰기 단일화, 인앱=푸시 문구, ko/en 키 짝(336=336), 회원 알림센터 읽음·삭제·확인창·소프트 삭제, 다른 기기 읽음·삭제 동기화, 메신저 소속 제외 일관성, 관리자 종 분리, 로그아웃 토큰 해제, 중복 발송 0건(DB), 이전 커밋 22건. |
| 10 | Owner 승인 후 수정할 정확한 범위 | §D 표의 「승인 요청」 열. 웹·서버 18건, 데이터 정정 1건(Owner 결정), 네이티브 1건(별도 승인), UI 8묶음. 통화 경로는 변경하지 않는다. |

---

## A. 계약 대비 구현 전수표

계약 원본은 다음과 같다.
- `docs/dibay-messenger-final-stabilization-contract.md` §2·§3
- `docs/notifications/dibay-notification-surface-authority-product-lock.md`
- `docs/dibay-notification-badge-number-policy.md`
- `docs/dibay-notification-read-badge-policy.md`
- `notification-preference-policy-registry.ts`

「실기」 열은 전 행 NOT_PROVEN 이다.

### A-1. 이벤트 (발생·수신·인앱·푸시·문구·목적지·중복키·설정)

| ID | 영역 | 이벤트 | 기존 계약 | 실제 구현 (코드·DB) | 판정 | 증거 |
|---|---|---|---|---|---|---|
| E-01 | 메신저 | 1:1 메시지 | B(방·하단 +1), 종 없음, 푸시 high | type chat_message, A 에서 제외, 키 `msg:{room}:{msg}`, 즉시 발송 + 1분 복구 크론. DB 14일: sent·high 40건 | PASS(코드·DB) | `notify-message-pipeline.ts:314`, `member-notification-a-eligibility.ts:63`, `fcm-sender-impl.ts:123` |
| E-02 | 메신저 | 그룹 메시지·멘션 | 같음 | group_message / mention_message. DB: sent·high 9건 | PASS(코드·DB) | 같음 |
| E-03 | 메신저 | 거래 채팅 메시지 | 같음 | trade_message. DB: sent·high 2건, 지연 1초 | PASS(코드·DB) | 레거시 전송 경로는 도메인 쌍이 없으면 알림을 생략(`notify-message-pipeline.ts:99-103`) — 의심 |
| E-04 | 메신저 | 고객↔오너 주문 메시지 | 고객 B / 오너 방(종·아이콘 제외) | receiverRole 로 구분 | PASS(코드) · DB 최근 표본 1건 | `notify-message-pipeline.ts:114-138` |
| E-05 | 메신저 소속 | 친구 요청·수락·선물·그룹 초대 | 종·알림센터 제외, 앱 밖 푸시 유지 (Owner 2026-10-27) | `MESSENGER_OWNED_NOTIFICATION_KINDS` 한 곳으로 숫자·목록·읽음·삭제 모두 제외. 푸시 normal. 친구 거절 writer 없음. 그룹 재초대 시 키 고정이라 알림 없음 | PASS · 재초대 PARTIAL | `core/notification-event-kind.ts:34-43`, `community-messenger-group-inapp-notify.ts:28` |
| E-06 | 통화(관찰만) | 방 있는/없는 부재중 | 방 있음 B / 방 없음 A | 계약대로 분기. 이번 범위에서 변경 없음 | 관찰 | `service.ts:1287` |
| E-07 | 거래 | 가격 제안 받음·수락·거절 | 회원 A, 거래 경로 | 앱에 제안 UI 없음(2026-08-20 제거). writer 는 남음. **받는 사람 언어 무시(ko 고정)**. 수락 알림은 푸시 링크(메신저 방)와 알림함 링크(meta 의 거래방 id 우선)가 다름 | FAIL(B-10·B-15) | `offer-server-i18n.ts:4-6`, `price-offers.server.ts:544-564`, `resolve-notification-inbox-href.ts:167-173` |
| E-08 | 거래 | 거래 완료(관리자 구매자 확인 처리) | 판매자 A, 거래방 | 링크에 `product_chats.id` 를 메신저 방 경로로 넣음. DB: 2026-10-27 22:49:44 UTC(10-28 06:49 PHT) 1건, 해당 product_chat 의 `community_messenger_room_id` 는 존재함 | FAIL(B-08) | `app/api/admin/trade-flow/confirm-buyer/route.ts:117` |
| E-09 | 거래 | 판매완료·구매확정·예약·자동구매확정 | 회원 A | writer 없음(API 410, 자동확정은 알림 없음). 카탈로그 키만 남음 | 정보(현행 제품 상태) | `seller-complete/route.ts:12-16` |
| E-10 | 거래 | 분쟁 접수·숨김/삭제/복원·제재·신고 처리·홍보 | 회원 A | 대부분 결정적 키. 분쟁은 메신저 방이 없으면 미발송. 제재 통보도 「선택」 설정이라 끄면 안 옴 | PARTIAL(D-Q4) | `buyer-issue/route.ts:82-87`, `notify-trade-moderation.ts` |
| E-11 | 매장주문 | 고객 상태(접수·조리·픽업대기·배달·도착·완료·취소·자동완료·자동취소·결제·환불) | 회원 A, high, 주문 상세 | 키 결정적, 이전 상태 알림 자동 읽음. **푸시는 2분 크론에서만 발송**. DB 14일 평균 지연 75초·최대 120초 | FAIL(B-01) | `append-user-notification.ts:181-213`, `vercel.json` `*/2` |
| E-12 | 매장주문 | 오너 새 주문·품절·리마인드 30/60초·고객 취소·자동취소·취소/환불 요청 | 오너 인박스만, 회원 종·아이콘 제외 | 오너 commerce kind 15종이 TS·SQL 에서 일치. **푸시 크론 지연**(새 주문 평균 53초·최대 97초). **30초·60초 리마인드가 주문 약 73초 뒤 동시에 생성**됨(DB: 2026-10-27 23:11:48 UTC 주문 → 23:13:01.73 / 23:13:01.96) | FAIL(B-01) | DB `notification_events`, `cron/store-order-accept-reminders/route.ts:97` |
| E-13 | 포인트 | 회원 충전 승인·보류·반려 | 회원 A, 필수 | 필수 설정은 정상. **type 이 order_status 로 저장**되어 주문·배달 분류·commerce 크론 경로에 섞임. 소리 키는 오너 정산 키(배달 채널) | FAIL(B-13) | `notify-user-points.ts:32-84`, `notification-sound-event-key-from-row.ts:63-65` |
| E-14 | 포인트 | 오너 포인트 차단·차감·문의 답변 | 오너 인박스 | 차단·차감: 지금 쓰는 writer 없음. **문의 답변 writer 는 호출하는 곳 0** | FAIL(B-14) | `notify-store-points.ts:27,46` |
| E-15 | 오너 운영 | 관리자 주문 개입·매장 심사·매장 운영 공지·광고 심사/캐시 | 오너 운영 → 회원 종 제외 (계약 §3) | push_kind notice → `admin_notice` 로 저장. 오너 kind 목록·오너 인박스 RPC 어디에도 없음 → **회원 A(종·앱아이콘)로 집계, 오너 인박스엔 미표시**. DB: 운영 공지 4건·광고 7건 존재 | FAIL(B-04) | `badge-event-classifier.ts:335-375`, `owner-store-commerce-notification-meta.ts:11-28`, `20270702120000…sql:22-38` |
| E-16 | 공지 | 관리자 공지·마케팅 캠페인 | 회원 A, 캠페인 경로 | 결정적 키(재발송은 의도적으로 시각 사용), 푸시 normal | PASS(코드) | `campaign-send-user.ts:133` |
| E-17 | 공지 | 관리자 회원 노트 | 회원 A | 키 `member_admin_note:{thread}:{Date.now()}` **비결정적** | FAIL(B-09) | `member-admin-notes-service.ts:81` |
| E-18 | 고객센터 | 답변·해결·재오픈 | 회원 A | 키 결정적이거나 상태 가드 있음. **해결·재오픈 본문이 승인표 밖으로 변경됨, 재오픈 ko/en 뜻 다름** | PARTIAL(B-17) | `support-case-service.ts:1078,1179,1304`, `catalog/notifications.ts:26-28,385-387` |
| E-19 | 커뮤니티 | 댓글·답글·좋아요 | 회원 A | 키 결정적. **라우트에서 `void` 호출 → 응답 뒤 발송이 잘림**. DB: event 03c0fdcf 의 delivery 가 2026-10-27 21:27:34 UTC(10-28 05:27 PHT)부터 pending. 복구 크론 대상 아님. 상대 이름 대체어 ko 고정 | FAIL(B-02·B-10) | `comments/route.ts:294`, `like/route.ts:112`, `community-social-inapp-notify.ts:61,131` |
| E-20 | 커뮤니티 | 콘텐츠 조치·제재 | 회원 A | 댓글 엔진 조치 키가 `nowIso` 비결정적 | FAIL(B-09) | `app/api/admin/community/engine/comments/[commentId]/route.ts:136` |
| E-21 | 모임 | 가입요청·승인·거절·강퇴·차단 | 회원 A | 차단은 결정적. 승인·거절·강퇴는 바뀐 행 + 전이 시각(272a5d492). `void` 호출. 강퇴·차단 본문이 승인표 밖으로 변경됨 | PARTIAL(B-17) | `meetings/[id]/{approve,reject,kick,ban}/route.ts` |
| E-22 | 관리자 대상 | 신고·충전 요청 등 처리 대기 | 관리자 종 = 처리 대기 건수 | Action Queue 카운트(권한 카테고리 합). 알림 행 없음. 담당 문의 고객 답장·매장 재검증만 `admin_notifications` 행(문구 ko 하드코딩) | PASS(코드) · 문구 PARTIAL | `app/api/admin/admin-bell/route.ts:22-45`, `support-case-service.ts:764` |
| E-23 | 공통 | 언어(ko/en) | 받는 사람 `profiles.preferred_language` | 카탈로그 ko 336 = en 336. 제안 3종·대체 이름 2곳은 ko 고정. en 오역 1건(분쟁 제목 「Your…」가 판매자에게 감) | FAIL(B-10·B-17) | `catalog/notifications.ts:392` |
| E-24 | 공통 | 중복 발송 | 같은 이벤트·같은 기기 1회 | DB 14일: 같은 event×device 로 sent 2회 이상 **0건** | PASS(DB) | `notification_deliveries` |

### A-2. 뱃지 위치

| ID | 위치 | 계약 | 실제 출처 | 판정 | 증거 |
|---|---|---|---|---|---|
| BG-01 | 회원 헤더 종 · 알림센터 머리 숫자 | A | badge-count `total`(최근 미읽음 2000행 → A 판정) | PARTIAL — 새 A 알림 INSERT 때 갱신 안 됨(B-05) | `NotificationsBadgeRealtimeBridge.tsx:41-48` |
| BG-02 | 알림센터 「전체」·분류 탭 | A·분류별 A | `?tab_unread_counts=1`, 같은 판정 | PARTIAL — 분류 없는 A(B-06) | `member-notification-domain.ts:116-123` |
| BG-03 | 하단 채팅 | 1:1+그룹+거래+고객주문 방 수 | projection `gd+group+trade+buyer` | PASS(코드) · 로그아웃 시 모듈값 잔존(B-07b) | `messenger-bottom-chat-unread-projection.ts:11` |
| BG-04 | 하단 거래·커뮤니티·매장 탭 | 0 | 0 고정 | PASS | `use-owner-hub-badge-total.ts:171-175` |
| BG-05 | 메신저 방 행 · 거래/주문 폴더 | 방 메시지 수 / B_trade / B_customer | participants · 도메인 목록 캐시 | PASS(코드) · 폴더는 캐시가 없으면 0(의심) | `MessengerPillarSummaryRow.tsx:211-214` |
| BG-06 | 앱 아이콘 (앱이 앞에 있을 때) | A + B, 오너 제외 | NativeBadgeSync 가 클라 projection 사용 | PASS(코드) | `NativeBadgeSync.tsx:186` |
| BG-07 | 앱 아이콘 (앱 밖 푸시) iOS | A + B | `aps.badge` 절대값 | PASS(코드) | `apns-sender-impl.ts:226-227` |
| BG-08 | 앱 아이콘 (앱 밖 푸시) Android | A + B | FCM `badgeCount` 를 네이티브가 무시(로그만) | **FAIL(B-16, 네이티브)** | `DibayAppIconDeliveryAdapter.java:77-79` |
| BG-09 | 오너 FAB 주문·매장·주문채팅·접힌 숫자 | 매장 범위 처리 대기 + 오너 방 | hub-badge. 접힌 숫자 = 주문채팅 + 주문 + 문의 (F4 반영) | PASS(코드) | `MainBottomNavFabSector.tsx:130` |
| BG-10 | 오너 「주문」 숫자 (FAB vs 오너 관리자 하단·사이드바·긴급) | 문서 충돌 | FAB = 접수대기+환불+**취소요청**, 관리자 = 접수대기+환불 | **FAIL — 같은 매장에서 숫자 다름(D-Q1)** | `store-operation-c-projection.ts:53-59` vs `owner-hub-order-counts-cache.ts:106-111` |
| BG-11 | 오너 관리자 화면 헤더 종 | 오너 주문 알림 (product-lock §6) | **회원 A 숫자·목록**, storeId 무시 | **FAIL(B-03)** | `tier1-header-inbox-sync.ts:22-29`, `PhilifeHeaderNotificationInbox.tsx:298` |
| BG-12 | 오너 알림 목록 「N개 안 읽음」 | 매장 오너 알림 미읽음 | 불러온 행(최대 200)만 셈 | PARTIAL | `OwnerNotificationList.tsx:178` |
| BG-13 | 관리자 종 · 섹션 뱃지 | 처리 대기 업무 | admin-bell 카테고리 | PASS(코드) | `admin-bell/route.ts` |
| BG-14 | 관리자 inbox 링크 | 관리자 알림 미읽음 | `admin_notifications` 미읽음 | PASS(코드) | `app/api/admin/inbox/route.ts:35-44` |

### A-3. 읽음·삭제·동기화·계정

| ID | 기능 | 실제 | 판정 |
|---|---|---|---|
| RD-01 | 회원 개별·선택 읽음 / 탭별 전체 읽음 | 서버 A 판정 대상만, 캐시 무효화 + resync | PASS(코드) |
| RD-02 | 푸시 탭 읽음 Android | 네이티브는 `{path, notificationId}` 만 넘김 → 웹 `requireMemberA` → 서버 판정 후 읽음 | PASS(코드). **오너 주문 링크는 path 판정에서 회원 A 로 떨어져 가드 없이 읽음**(B-15b, 영향 낮음) |
| RD-03 | 푸시 탭 읽음 iOS | userInfo 전체 전달, 정상 분류 | PASS(코드) |
| RD-04 | 개별·선택·읽은 것·전체 삭제 | `soft_dismiss_notification_events`(service_role 전용, 500건 단위). `display_payload.deleted_at` 만 기록, unread 는 유지(DELETE WITHOUT READ). A 판정이 삭제 행을 제외함. 업무 테이블에는 쓰지 않음 | PASS(코드·DB: 마이그레이션 4건 적용, 함수 정의·권한 확인) |
| RD-05 | 다른 기기 읽음·삭제 | Realtime UPDATE → resync | PASS(코드) |
| RD-06 | 다른 기기·새 알림 도착 | INSERT 때 목록만 갱신하고 종 resync 는 하지 않음 | FAIL(B-05) |
| RD-07 | 재시작·재로그인 | 서버 DB 기준, 부팅 때 1회 조회 | PASS(코드) |
| RD-08 | 로그아웃·계정 전환 | 뱃지 스토어·캐시·스토리지 초기화, 토큰 비활성화, 같은 기기 다른 계정 비활성화. DB: 활성 토큰을 여러 계정이 공유하는 경우 0, 기기를 여러 계정이 공유하는 경우 0. **하단 채팅 모듈값만 초기화 누락** | PASS · B-07b |
| RD-09 | 오너 개별·선택 읽음·삭제 | 같은 API + 오너 스냅샷 갱신 | PASS(코드) · 실패 표시 없음(U-D) |

### A-4. 설정 ↔ 실제 동작

| ID | 토글 | 실제 | 판정 |
|---|---|---|---|
| ST-01 | 유형별 수신·푸시 전체·방해금지 | 발송 직전 `shouldSendWebPushForUser` → resolver → registry. 거부하면 skipped `user_settings_gate`(DB 14일 4건) | PASS(코드·DB) |
| ST-02 | 필수 알림(포인트·결제·환불) | 전체 OFF·방해금지에도 발송, 설정 읽기 실패 시 필수만 발송 | PASS(코드) |
| ST-03 | 알림음 `sound_enabled` | 앱 안 소리만 끔. 푸시 payload 에 무음 표시가 없어 Android 기본 채널·iOS `sound:"default"` 로 울림 | **FAIL(B-11)** |
| ST-04 | 진동 `vibration_enabled` | 읽는 곳 0. 마이 설정에서는 숨김, `MessengerSettingsSheet.tsx:168`·`MemberNotificationSettings.tsx:180` 에서는 보임 | **FAIL(B-11)** |
| ST-05 | 매장·상점 알림 `store_enabled` | 푸시 게이트에 없고, 앱 안 소리 게이트 검사도 실행되지 않는 분기 — 어디에도 효과 없음 | **FAIL(B-11)** |
| ST-06 | 메신저 채팅 알림 OFF → 앱 안 배너 | 97dd02239 반영 | PASS(코드) |
| ST-07 | 관리자 운영 알림음 토글 | 0772feca5 반영, 문구 ko/en 하드코딩 | PASS · 문구 경미 |
| ST-08 | 제재·운영 조치 통보 | 「선택」 설정이라 끌 수 있음 | Owner 결정(D-Q4) |

---

## B. 결함 목록 (실제 수정 대상 20건)

추측성 원인은 「확정」으로 적지 않았다. 「확정」은 코드 경로나 DB 로 증명된 것만 적었다.

| ID | 화면/기능 | 실제 결함 | 확인된 원인 | 영향 범위 | 최소 수정안 | 우선 |
|---|---|---|---|---|---|---|
| **B-01** | 매장주문·포인트 푸시 | 고객 주문 상태·오너 새 주문·리마인드·자동취소·포인트 푸시가 생성 후 평균 53~87초, 최대 120초 늦게 나감(DB 14일). 30초·60초 리마인드가 주문 약 73초 뒤 동시에 생성됨 | 확정: `append-user-notification.ts:181-213` 이 commerce 를 `deferPush` 로 저장만 하고, 발송은 `vercel.json` 의 2분 크론 `/api/cron/commerce-notification-push-handoff` 뿐이다. 리마인드가 몰리는 것도 리마인드 크론 주기 탓으로 보이지만 **주기 코드는 아직 확인 못 함(NOT_PROVEN)** | 오너 주문 접수(10분 자동취소)·고객 상태 안내 | 채팅과 같은 기존 패턴으로 바꾼다: 저장 직후 `after()` 로 1회 즉시 발송하고, 크론은 실패분 복구만 한다(`chat-notification-push-handoff.ts:36,62-80`). 리마인드는 크론 주기를 확인한 뒤 별도로 판정한다 | P0 |
| **B-02** | 커뮤니티 댓글·좋아요(모임 가입·승인·거절, 리뷰 답글 포함) 푸시 | 발송 기록이 pending 에서 멈추고 푸시가 안 나갈 수 있음. DB 실제 1건(03c0fdcf, 2026-10-27 21:27:34 UTC / 10-28 05:27 PHT) | 확정: 라우트가 `void notify…()` 로 실행하고 바로 응답한다(`comments/route.ts:294`, `like/route.ts:112`). `community_activity` 는 복구 크론 대상이 아니다(`chat-notification-push-handoff.ts:24-32`) | 커뮤니티·모임·회원 포인트 충전 결과(`admin-point-charge-item.ts:208,256,259` 도 `void`) | 해당 라우트·함수의 `void` 를 `after()` 로 바꾼다 | P1 |
| **B-03** | 오너 관리자 화면 헤더 종 | 오너 알림이 아니라 회원 A 숫자·목록을 보여 줌 | 확정: `surface="owner_commerce_inbox"`·`storeId` 를 받기만 하고 쓰지 않는다(`tier1-header-inbox-sync.ts:22-29`, `PhilifeHeaderNotificationInbox.tsx:298`). 이전 승인 F3 를 구현하지 않음 | 오너 | 이전 승인 F3 그대로: owner_commerce_inbox 일 때 기존 오너 API 를 쓴다. 숫자 = `?unread_count_only=1&owner_store_commerce_unread_only=1&owner_store_id=`, 목록 = `fetchMeOwnerStoreNotificationsDeduped(storeId)`. 「전체 보기」는 오너 알림함으로 보낸다 | P1 |
| **B-04** | 오너 운영 알림 4종 | 관리자 주문 개입·매장 심사·매장 운영 공지·광고 알림이 회원 종·앱 아이콘에 잡히고 오너 인박스에는 안 보임 | 확정(코드): kind 가 오너 kind 목록(`owner-store-commerce-notification-meta.ts:11-28`)과 오너 인박스 RPC(`20270702120000…sql:22-38`)에 없어 분류기 끝 분기에서 A 가 된다. DB 에 행 실재 | 오너, 회원 숫자 오염 | 기존 오너 kind 목록(TS)과 오너 인박스 RPC 의 kind 목록에 4종을 추가한다. **운영 DB 함수 변경이라 별도 승인 필요** | P1 |
| **B-05** | 회원 종·앱 아이콘 | 새 A 알림이 와도 종·앱 아이콘이 즉시 늘지 않음(목록·탭은 늘어남) | 확정: `NotificationsBadgeRealtimeBridge.tsx:41-48` 이 INSERT 때 목록 이벤트만 보내고 `requestNotificationBadgeCountResync` 를 부르지 않는다(UPDATE 때만 부름 :28-34) | 회원 전체 | INSERT 분기에서도 기존 resync 함수를 같은 1.2초 묶음으로 부른다 | P1 |
| **B-06** | 알림센터 분류 탭 | 문의·지원·회원노트 A 가 「전체」에는 세지만 어느 분류 탭에도 안 잡힘 | 확정: 분류기가 null 을 돌려준다(`member-notification-domain.ts:116-123`). 의도 여부를 확인할 문서 없음 | 회원 | Owner 결정(D-Q2): 「시스템」 탭에 넣을지 | P2 |
| **B-07** | 오너 「주문」 숫자 / 하단 채팅 | ① FAB 와 오너 관리자 숫자 정의가 다름 ② 로그아웃·계정 전환 때 하단 채팅 숫자가 남을 수 있음 | ① 확정, 계약 문서끼리 충돌(D-Q1) ② 확정: `messenger-bottom-chat-unread-projection.ts:11` 모듈 변수가 auth epoch 초기화 대상에 없음 | 오너 / 회원 | ① D-Q1 답을 받아 한 곳만 맞춘다 ② 기존 epoch 초기화 함수에서 `applyMessengerBottomChatUnread(0)` 호출 | P1 / P2 |
| **B-08** | 관리자 「구매자 확인 처리」 알림 | 링크가 `product_chats.id` 를 메신저 방 경로에 넣음. canonical resolver 가 연결해 줄 수 있어 404 여부는 NOT_PROVEN. 이벤트에 메신저 room 이 없어 방을 읽어도 알림이 정리되지 않을 수 있음 | 확정: `confirm-buyer/route.ts:117` `tradeChatNotificationHref(roomId,"product_chat")`. product_chat 에 `community_messenger_room_id` 가 있음(DB) | 판매자 | 76739dc38 과 같은 방식: `community_messenger_room_id` 가 있으면 그것을 쓰고, 없을 때만 현행 | P2 |
| **B-09** | 중복 방지 키 (3곳) | 재시도하면 같은 알림이 중복 생성됨 | 확정: `Date.now()`·`nowIso` 키 — `notify-owner-admin-order-intervention.ts:57`, `admin-store-decision.ts:77`, `app/api/admin/community/engine/comments/[commentId]/route.ts:136`. (회원 노트 `member-admin-notes-service.ts:81` 도 시각 키지만 작성 API 가 410 으로 막혀 있어 현재 발생 경로 없음 — `member-notes/[threadId]/route.ts:38-49`) | 오너·회원 | 기존 요청 id·메시지 id·감사 id 로 바꾼다. **1d1f1be1c 가 「승인 범위 밖」으로 되돌린 항목이라 이번에 Owner 승인 필요** | P2 |
| **B-10** | 받는 사람 언어 | en 사용자에게 한국어 문구가 감 | 확정: 가격 제안 3종 `offerServerT` 가 ko 고정(`offer-server-i18n.ts:4-6`, 본문 하드코딩 `price-offers.server.ts:511`). 대체 이름 `notifySafeT("ko",…)`(`community-social-inapp-notify.ts:61,131`, `notify-gift-transfer.ts:28`) | en 회원 | 기존 `loadNotificationUserLanguage` + `notifySafeT(lang)` 로 바꾼다. 제안 UI 가 없으므로 제안 3종 처리 여부는 D-Q5 | P2 |
| **B-11** | 알림 설정 토글 | 알림음 끔·진동·매장 알림을 꺼도 푸시는 울리거나 옴 | 확정: 게이트는 `.sendPush` 만 쓴다(`web-push-user-settings-gate.ts:157,173`). payload 에 무음 표시 없음. Android 채널 `DEFAULT_ALL`, iOS `sound:"default"` 고정. `store_enabled` 는 푸시 게이트에 없고, 앱 안 소리 게이트의 검사(`notification-sound-gate.ts:64,144`)도 **실행되지 않는 분기**라 어디에도 효과 없음(역할 판정이 member/owner 만 반환 `web-push-user-settings-gate.ts:94-137`). 노출: `NotificationsSettingsContent.tsx:270`, `MemberNotificationSettings.tsx:170`, `MessengerSettingsSheet.tsx:143`. 진동은 읽는 곳 0 · 노출 `MemberNotificationSettings.tsx:185`, `MessengerSettingsSheet.tsx:168`. (`docs/dibay-notification-preference-fail-closed-hard-lock.md` 의 store_enabled 기록「인앱 알림음 판정은 읽음」은 사실과 다름) | 회원·오너 | Owner 결정(D-Q3): (가) 토글 문구를 「앱 안 소리」로 정확히 바꾸고 진동 토글을 3화면 모두 숨김(웹만) / (나) 실제로 무음 푸시 구현(서버 + **Android 무음 채널 네이티브**) | P1 |
| **B-12** | 오너 포인트 소리 | 오너 포인트 3종 소리가 푸시는 고객 주문 상태음, 인앱은 새 주문음으로 갈림 | 확정: 승인 F9 의 4종 중 3종이 `notification-sound-event-key-from-row.ts:58-66` 에 없음. 테스트가 잘못된 키를 고정(`f9-owner-kind-sound-and-preference.test.ts:31-40`). 현재 writer 가 없어 실제 발생은 0 | 오너 | 승인 F9 대로 3종 추가 + 테스트 정정. writer 가 없으므로 Owner 가 「보류」로 정할 수도 있음 | P3 |
| **B-13** | 회원 포인트 충전 결과 | type 이 order_status 로 저장되어 「주문·배달」 분류·commerce 크론 경로에 섞임. 소리 키는 오너 정산 키·「배달 알림」 채널 | 확정: `notify-user-points.ts:34,61,84` 가 commerce + push_kind 없음. 소리 `notification-sound-event-key-from-row.ts:63-65` | 회원 | push_kind/분류를 포인트(시스템·필수)로 지정한다. 소리 키는 기존 회원용 키가 있으면 그것을, 없으면 Owner 결정 | P2 |
| **B-14** | 오너 플랫폼 문의 답변 | 알림이 나가지 않음 | 확정: `notifyStoreOwnerPlatformInquiryReplied`(`notify-store-points.ts:27`)를 호출하는 곳이 저장소 전체에 0 | 오너 | 관리자 답변 저장 지점에서 기존 함수 호출. 해당 관리자 API 위치는 2단계 착수 전에 확정한다 | P2 |
| **B-15** | 알림 목적지 | ① 가격 제안 수락: 푸시와 알림함 목적지가 다름 ② Android 오너 주문 푸시 탭이 회원 A 경로로 분류됨 | ① 확정: `resolve-notification-inbox-href.ts:167-173` 이 meta 의 거래방 id 를 link 보다 먼저 쓴다 ② 확정: path 만으로 판정할 때 쿼리의 storeId 를 보지 않음(`push-routing-transport.ts:179-233`) | 구매자 / 오너 | ① routeUrl 이 메신저 방이면 그것을 우선 ② path 판정에서 `/stores/owner/` 를 오너(C)로 판정(웹만, 네이티브 무변경) | P3 |
| **B-16** | Android 앱 아이콘 (백그라운드·종료) | 앱 밖 푸시 수신 시 숫자가 바뀌지 않음 | 확정(코드): `DibayAppIconDeliveryAdapter.onDomainNotificationPosted` 가 로그만 남김(:77-79). 요약 알림 `setNumber` 는 웹 동기화 때만 | 회원 | **네이티브 변경**: 수신 시 payload `badgeCount` 로 요약 알림 숫자 갱신. 재빌드·versionCode 증가. 별도 승인 | P2 |
| **B-17** | 문구 (e053417ca) | 승인표 밖 변경 + 오역 | 확정: 줄 단위 표는 부록 1. en 오역 `notifications.ts:392`(판매자에게 「Your trade inquiry」). 재오픈 본문 ko 「답변을 기다리고 있어요」 vs en 「We're working on a reply」 | 회원·오너 | 오역 1건과 뜻 불일치 1건은 수정한다. 승인표 밖 줄은 「원복 / 유지」를 Owner 가 줄마다 결정(D-Q6) | P2 |
| **B-18** | 관리자 업무 알림 푸시 | 정산 예외(critical)·정산 수수료 검토·매장 핵심정보 변경·담당 문의 고객 답장 푸시가 관리자 개인의 회원 「주문」/「공지」 토글·방해금지·전체 OFF 에 따라 막힘. 관리자용 설정 화면 없음 | 확정: `admin-notification-service.ts:123-155` 가 `dispatchPushForUser` 를 그대로 타고, 역할 판정 기본값이 member(`web-push-user-settings-gate.ts:137`), 정산 3종은 registry 에 없어 safe_fallback(member/order)(`notification-preference-policy-registry.ts:174,265`). 인박스 행은 정상 생성 | 관리자 | 관리자 수신 알림은 회원 설정 게이트를 거치지 않게 기존 수신 역할 판정에 admin 분기를 둔다(관리자 운영 알림음 설정 `admin_notification_preferences` 와 같은 축). 필수 여부는 D-Q7 | P1 |
| **B-19** | 사장님 「알림음」 토글 | 끄거나 켜도 앱을 다시 띄우기 전까지 앱 안 주문·주문채팅 소리에 반영 안 됨 | 확정: 저장 후 이벤트는 발행(`OwnerNotificationSettings.tsx:131-133`)하지만 `NotificationSurfaceContext.tsx:152-161` 이 회원 설정만 다시 읽고, 사장님 설정은 userId 변경 때만 읽음(`:163-175`). `invalidateOwnerNotificationSettingsFlight` 호출 0 | 오너 | 같은 이벤트 처리에서 사장님 설정도 무효화·재조회 | P2 |
| **B-20** | 관리자 종(거래 광고 신청) | 처리 후 종·사이드바 숫자가 다음 폴링까지 남음 | 확정: `TradePromotionsPage.tsx:104-120` 이 성공 후 `emitAdminQueueChanged` 를 부르지 않음(커뮤니티 큐 `AdminCommunityPromotionQueue.tsx:102` 는 부름) | 관리자 | 성공 후 기존 emit 1줄 | P3 |

**보고만 (이번 범위 밖 · 수정하지 않음)**
- 상품 상세가 픽업을 배달로 판정함(매장 도메인).
- X 주문 취소 화면 위에 고객센터 시트가 겹침.
- CI 썸네일 계약 스크립트 실패(거래 커밋 c3ccec49a).
- 거래 판매자 완료 화면 경로 없음.
- 통화 푸시와 iOS 배지(통화 규정).
- **관리자 권한 키 우회(보안)**: 회원 포인트 충전 승인 처리 함수가 `api/admin/trade/point-charges/[id]/route.ts:23`(`requireTradeAdmin`, 권한 키 없음)로도 열려 있음. 거래 신고 처리 `reports/[reportId]/action/route.ts:20` 도 registry 의 `reports` 권한과 다름. 종에서는 「권한 없음」인 운영자가 처리 가능. 알림 범위 밖 — 별도 지시 필요.
- 효과 없는 관리자 API `PATCH /api/admin/notification-settings`(호출 화면 없음). 주문 알림 설정 저장 실패 안내 없음(`MemberNotificationSettings.tsx:104-122`). 방해금지 두 줄 중복 표시.
- iOS 알림 맞춤음 없음: 번들에 사운드가 없고 `sound:"default"` 고정 — 설계 한계, 네이티브.
- 공지·커뮤니티 푸시 normal 우선순위(정책상 의도. 결함 아님, 실기에서 지연 측정).

**이전 작업자 남김 목록(§4-5) 재판정**

| 항목 | 판정 |
|---|---|
| 가격 제안 수락 14건 링크 깨짐 | **정정.** 14건 모두 `chat_rooms` id 다(DB). canonical resolver 가 연결할 가능성이 있어 404 는 NOT_PROVEN. 데이터 정정 여부는 Owner 결정(D-Q5) |
| 구매자 확인 처리 링크 | B-08 |
| 댓글 푸시 pending | B-02 (DB 실재) |
| 크론 1~2분 지연 | B-01 (DB 실측) |
| F3·F5/Q1 | B-03 · D-Q1 |
| Android 아이콘 | B-16 |
| 상품 상세·고객센터 시트·CI | 범위 밖 보고 |

---

## C. UI/UX/CTA 통일 시안

### C-1. 기존 정상 디자인에서 재사용할 규칙 (회원 알림센터 = 기준)
- 목록: `InboxGroupCardList` + `NotificationInboxByDateSections`(날짜 구역, 한 카드 안의 구분선 목록, 원형 유형 아이콘 + `rounded-ui-rect` 분류 칩, 제목·본문 `line-clamp-1`).
- 미읽음: 연녹 배경 + 좌측 3px 브랜드 바 + 점 + 굵은 제목(`inbox-row-read-state.ts:18-31`). 읽음: 흰 배경 + 보통 굵기.
- 탭: 공용 `NotificationInboxTabBar`, URL `?tab=` 유지.
- 선택: SVG 체크박스 `rounded-ui-rect`, 선택 행은 흰 배경 + `ring-2`. 툴바 「읽음」(외곽선) · 「N개 삭제」(위험색 `bg-sam-danger text-sam-on-primary`).
- 삭제 확인: `NotificationDeleteConfirmDialog`(destructive, 「업무 기록은 유지」 문구).
- 녹색·빨강 배경 위 글자는 `text-sam-on-primary`. 눌림은 `active:bg-sam-pressed-surface`, 비활성은 `disabled:opacity-40`.
- 시간: `formatNotificationInboxTime`.

### C-2. 실제 불일치 44건 → 수정 묶음 8개
번호는 UI 감사 원본 번호다.

| 묶음 | 대상 | 내용 | 원본 번호 |
|---|---|---|---|
| U-A | 오너 알림 목록 | 회원 공용 컴포넌트로 통일: 목록·탭·날짜 구역·아이콘·미읽음만 굵게·말줄임·SVG 체크·`ring-2`·행 전체 탭 이동. 탭을 URL 로 유지 | 1-12, 15, 31 |
| U-B | 오너 알림 목록 | 누락 조작 추가: 전체 삭제·읽은 알림 삭제(회원과 같은 ⋯ 시트·확인창). 전체 읽음을 서버 일괄 처리(오너 범위 · 기존 함수 사용). 「더 보기」 | 13, 18, 표8 |
| U-C | 실패·로딩 표시 | 오너 로드 실패 재시도, 오너 개별·전체 읽음 실패 토스트, 회원 선택 읽음 실패 토스트, 상세 로드 실패 재시도, 종 팝업 목록 실패 표시, 로딩 스켈레톤(규정 Skeleton) | 16, 34, 37, 38, 42 |
| U-D | 상세 화면 | 분류 칩을 목록과 같게(`rounded-ui-rect`+`chipClassName`), 시간을 `formatNotificationInboxTime` 으로, 「확인」을 `router.back()`/replace 로(히스토리 누적 제거), 메신저 소속 행 차단 | 20, 21, 36 |
| U-E | 종 팝업 | 떠 있는 패널이므로 overlay radius + `--sam-shadow-elevated`, `bg-sam-muted/*` → 표면 토큰, 버튼 44px, 오너 화면의 「전체 보기」는 오너 알림함으로 (B-03 과 같이) | 24, 29, 30 |
| U-F | 관리자 | 건수 배지 `text-white` → `text-sam-on-primary`. 종 목적지와 「처리 대기」 화면을 하나로 (D-Q 아님: 같은 업무 큐) | 22, 25 |
| U-G | 공통 정리 | 토스트 위치 통일(하단 내비 위 76px), 컨테이너 폭 통일(40rem), 오너 설정 링크 중복 제거, 「전체 알림」 링크를 `/notifications` 로(2단 리다이렉트 제거), 「어제/Yesterday」를 i18n 키로, 빈 목록에서 「선택」 비활성, 회원 목록 뒤로가기 시 스크롤 복원 | 17, 19, 32, 35, 40, 41 |
| U-H | 죽은 코드 | `AdminNotificationList.tsx`(import 0) · 종 팝업 삭제 코드(실행 경로 없음) 제거 여부 — 동작 변경 없음, Owner 선택 | 39 |

**유지(변경하지 않음)**
- 알림종 미리보기에는 「모두 읽음」·삭제를 넣지 않는다(이전 결정).
- 관리자는 알림 단위 읽음·삭제를 넣지 않는다(업무 큐 HARD LOCK).
- pull-to-refresh 는 계약에 없어 추가하지 않는다(43).
- 회원 개별 읽음은 「행 탭 = 읽음」을 유지한다. 명시 버튼은 Owner 요청 범위인지 D-Q6 에서 확인한다.

### C-3. 시안 상태 (구현 기준)
기존 시안 파일 `docs/audit/notification-inbox-ui-mockup-2026-10-27.html` 의 6상태를 그대로 쓴다: 일반 목록 · 미읽음/읽음 혼합 · 다중 선택 · 읽음/삭제 CTA · 삭제 확인 · 빈 상태.
그 위에 다음을 반영한다.
- 오너 목록도 같은 6상태다(헤더 아래 매장명 1줄만 추가).
- 실패 상태에 「다시 시도」 버튼을 둔다.
- 로딩은 행 모양 스켈레톤 3줄로 한다.

역할별 차이는 내용과 권한만 둔다.
- 회원: 분류 탭 7개.
- 오너: 탭 4개(전체·신규주문·취소/결제·환불), 「주문 보기」 = 행 탭.
- 관리자: 업무 카드(삭제 없음).

---

## D. 수정 범위 및 위험

| ID | 바꿀 곳 | 정상 기능 영향 | 네이티브 | 승인 요청 |
|---|---|---|---|---|
| B-01 | `append-user-notification.ts` commerce 분기, 크론은 그대로(복구용) | 즉시 발송 + 크론이 겹치면 중복 위험. 기존 handoff claim 토큰으로 막는 채팅 패턴과 같게 구현하고 테스트로 증명 | 없음 | 요청 |
| B-02 | 라우트 6곳 `void` → `after()` | 없음 | 없음 | 요청 |
| B-03 | `PhilifeHeaderNotificationInbox.tsx`, `tier1-header-inbox-sync.ts` | 회원 표면은 변경 없음(owner_commerce_inbox 분기만) | 없음 | 요청 |
| B-04 | TS kind 목록 + **운영 DB 함수(오너 인박스 RPC) 마이그레이션** | 회원 종 숫자가 그만큼 줄어든다(정상화) | 없음 | 요청 + **DB 적용 별도 승인** |
| B-05 | `NotificationsBadgeRealtimeBridge.tsx` | resync 호출이 늘어남(1.2초 묶음) | 없음 | 요청 |
| B-06 | 분류기 1줄 | 탭 숫자 변동 | 없음 | D-Q2 답 후 |
| B-07 | ① D-Q1 답 1곳 ② epoch 초기화 1줄 | ① 오너 숫자 변동 | 없음 | ② 요청, ① D-Q1 후 |
| B-08 | `confirm-buyer/route.ts` | 없음 | 없음 | 요청 |
| B-09 | 4곳 키 | 같은 요청 재시도 시 1회만 생성 | 없음 | 요청(1d1f1be1c 되돌림 재결정) |
| B-10 | 제안 3종·대체 이름 2곳 | ko 사용자 영향 없음 | 없음 | 요청(제안 3종은 D-Q5) |
| B-11 | (가) 설정 화면 3곳 문구·노출 / (나) 서버 payload + Android 채널 | (나)는 통화 채널과 분리 필요 | (나)는 **필요** | D-Q3 답 후 |
| B-12 | 소리 키 맵 + 테스트 | 실발생 0 | 없음 | 요청 또는 보류 |
| B-13 | `notify-user-points.ts`, 소리 키 맵 | 포인트 알림이 「주문·배달」 탭에서 빠짐 | 없음 | 요청 |
| B-14 | 관리자 답변 저장 지점 1곳 | 오너에게 새 알림이 생김 | 없음 | 요청 |
| B-15 | resolver 우선순위, transport path 판정 | 없음 | 없음 | 요청 |
| B-16 | Android `DibayAppIconDeliveryAdapter` | 런처별 차이 | **필요** | 별도 승인 |
| B-17 | `catalog/notifications.ts` 2줄 + D-Q6 결정 줄 | 문구만 | 없음 | 요청 |
| B-18 | `web-push-user-settings-gate.ts` 수신 역할 판정, `admin-notification-service.ts` | 관리자 개인 회원 설정이 더 이상 업무 푸시를 막지 않음 | 없음 | D-Q7 답 후 |
| B-19 | `NotificationSurfaceContext.tsx` | 없음 | 없음 | 요청 |
| B-20 | `TradePromotionsPage.tsx` | 없음 | 없음 | 요청 |
| U-A~U-G | 알림 화면 컴포넌트 | 동작 유지, 표시 통일. 오너 IA-19 래칫 필수 | 없음 | 요청 |
| 데이터 | 기존 제안 수락 14건·구매자 확인 1건 링크 | 운영 데이터 변경 | 없음 | D-Q5 |

**커밋 분리 원칙**
- 서버 발송(B-01·B-02) / 분류·숫자(B-03~B-07) / 목적지·키·언어(B-08~B-10, B-13~B-15) / 설정(B-11) / 문구(B-17) / UI(U-*) / DB(B-04) / 네이티브(B-16) 로 나눠 각각 단독 커밋한다.
- 통화 파일은 손대지 않는다. `fcm-sender-impl.ts` 도 이번에는 변경하지 않는다.

### Owner 결정 필요

| ID | 질문 | 근거 |
|---|---|---|
| D-Q1 | 오너 「주문」 숫자에 **취소 요청**을 포함하나요? (FAB 는 포함, 오너 관리자는 제외) | `badge-authority-rebuild-slice2-5/surface-map.md:14` vs `badge-gate1-audit/badge-projection-map.md:21,38` |
| D-Q2 | 문의·고객센터·회원노트 알림을 알림센터 「시스템」 탭에 포함하나요? | `member-notification-domain.ts:116-123` |
| D-Q3 | 알림음·진동·매장 토글: (가) 「앱 안 소리」로 문구 정정 + 진동 숨김(웹만) 또는 (나) 무음 푸시 실제 구현(네이티브 포함)? | B-11 |
| D-Q4 | 거래·커뮤니티 제재·운영 조치 통보를 필수 알림으로 바꾸나요? (지금은 끌 수 있음) | registry 덮어쓰기 없음 |
| D-Q5 | 앱에 UI 가 없는 가격 제안 알림 writer 3종을 고치나요? 이미 나간 제안 수락 14건·구매자 확인 1건 링크 데이터를 정정하나요? | E-07, B-08 |
| D-Q7 | 관리자 업무 알림(정산 예외 등) 푸시를 방해금지 시간에도 보내나요(필수)? 아니면 관리자용 켜기/끄기만 두나요? | B-18 |
| D-Q6 | e053417ca 의 승인표 밖 문구 줄(부록 1)을 줄마다 원복/유지 중 무엇으로 하나요? 회원 알림센터에 명시적 「읽음」 버튼이 필요하나요? | 부록 1 |

---

## E. 검증 계획

1. **코드/계약**
   - 결함마다 동작 테스트(vitest)를 추가한다.
   - 최종 트리에서 `typecheck:build` + 관련 vitest + 변경 파일 eslint + `verify:*` 를 1회 돌린다.
   - diff 를 이 문서 §D 와 줄 단위로 대조하고, 독립 검토를 1회 받는다.
2. **운영 DB 대조**(SELECT)
   - B-01: commerce 이벤트 생성 → 첫 delivery 지연이 수 초 이내.
   - B-02: 댓글 delivery 가 pending 에 남지 않음.
   - B-04: 운영 공지·광고 행이 오너 인박스 RPC 결과에 포함.
   - B-09: 같은 요청 재시도 시 행 1개.
   - B-13: 포인트 type.
3. **실기 (5단계)**
   - 인수인계 §6 행렬 전부(E1~E18 × 확인 칸 전부)를 실기한다.
   - 각 칸은 증거 3종(화면 캡처 · DB/로그 원문 · PHT 초 단위)이 있어야 하고, 없으면 NOT_PROVEN 이다.
   - 시나리오마다 Production SHA 와 `user_devices.app_version` 을 기록한다. 현재 S·X 1.2.4 (13), I 1.2 (15). 3계정 모두 `ko` (DB 2026-10-28 확인).
   - 위 결함별 확인 칸을 행렬에 추가한다.
     - B-01: 오너 새 주문·고객 상태 푸시 도착 시간(백그라운드/화면 꺼짐/종료).
     - B-03: 오너 관리자 종 = 오너 목록.
     - B-05: 새 알림 도착 즉시 종 증가.
     - B-07②: 계정 전환 직후 하단 채팅.
     - B-11: 토글 OFF 시 푸시 소리.
     - B-16: 네이티브 빌드 후 백그라운드 런처 숫자.
     - E17: 영어 수신자 — 앱 설정에서 en 으로 바꾼 뒤 재측정하고 원복.
4. 자동화 테스트 통과만으로 실기 칸을 PASS 처리하지 않는다.

---

## 5. 정상 확인 — 변경하지 않음

- `notification_events` 쓰기 경로가 `createNotificationEvent` 하나뿐이다. DB 트리거 writer 가 없다.
- 푸시와 인앱 문구가 같은 행에서 나온다(commerce 알림함 재번역만 예외 — 의심, 실기에서 대조).
- 카탈로그 ko/en 키 짝이 맞다(336/336).
- 회원 알림센터: 개별·선택·탭별 전체 읽음, 개별·선택·읽은 것·전체 삭제, 삭제 확인창, 일괄 실패 토스트가 있다.
- 소프트 삭제는 업무 데이터를 보존하고 service_role 에서만 실행된다(DB).
- 다른 기기 읽음·삭제 Realtime 동기화, 재시작·재로그인 유지.
- 메신저 소속(친구·선물·그룹초대) 제외가 숫자·목록·읽음·삭제에 일관되게 적용된다.
- 하단 채팅·폴더·방 행·FAB 각 숫자·접힌 숫자(합), 관리자 종 = 처리 대기 업무, 관리자 inbox.
- 필수 알림 예외, 설정 읽기 실패 시 필수만 발송.
- 로그아웃·계정 전환 시 토큰 해제. DB 에서 활성 토큰·기기를 여러 계정이 공유하는 경우 0.
- 중복 발송 0건(DB 14일).
- 이전 마이그레이션 4건이 운영에 적용되어 있다(schema_migrations 확인).

---

## 6. 이전 작업자 커밋 23건 판정

| 커밋 | 판정 | 근거 |
|---|---|---|
| 26df1c207 | 유지 | 오너 kind TS·SQL 15종 일치 `owner-store-commerce-notification-meta.ts:15` |
| 312fc3cd0 | 유지(남은 부분) | 전수 스캔 `inbox-read-bridge.ts:400-421`, 실패 토스트 `notifications/page.tsx:254`. N-05 는 c315721b2 가 대체 |
| ab183b750 | 유지(남은 부분) | `buyer-issue/route.ts:99`, `notify-store-commerce.ts:975` |
| e71e0b022 | 유지(진동 숨김만 남음) | `NotificationsSettingsContent.tsx:495`. 다른 2화면은 아직 노출 → B-11 |
| d5e78730c | 유지 | U-01~U-12 반영 |
| 224fefdd0 | 유지(남은 부분) | `inbox-read-bridge.ts:452-461` |
| 5e21f74b4 | 유지 | 토큰 정정 |
| cdfb7ae65 | 유지 | `DibayActionSheet.tsx:43-45` |
| 3e597af8f | 유지 | SQL 140000 적용(DB) |
| b9ba580e4 | 유지 | `notification-delivery-safety-gate.ts:151-167`. 설계의 「대상 존재 검사」는 미구현(느슨하지만 회귀 아님) |
| 4c25414f6 | 유지 | `member-notification-a-eligibility.ts:82` 단일 판정 |
| c315721b2 | 유지 | Realtime UPDATE. 읽은 행의 다른 UPDATE 도 재조회(경미) `useSupabaseNotificationsRealtime.ts:42` |
| 6fff980c7 | 유지 | `notify-push-dispatcher.ts:55-68`. 오너 포인트 3종 미포함 → B-12 |
| 272a5d492 | 유지 | `approve/route.ts:124-136` |
| 97dd02239 | 유지 | `cm-participant-unread-full-effects.ts:252-257` |
| 0772feca5 | 유지 | 문구 하드코딩 경미 |
| 5cc9cafea | 유지 | RPC 운영 적용·권한 service_role(DB) |
| 88ebaf30f | 유지(남은 부분) | `notification-delivery-safety-gate.ts:131-142`. 문서 `notification-full-reaudit-2026-10-27.md:187,190` 이 되돌린 수정을 「완료」로 적음 → 문서 정정(커밋하지 않는 감사 문서) |
| 1d1f1be1c | 유지 | 88ebaf30f 이전과 바이트 동일. 되돌린 키 3곳은 B-09 로 재결정 |
| **e053417ca** | **수정** | F3 미구현(B-03), F9 미완(B-12), en 오역·뜻 불일치(B-17), 승인표 밖 문구(D-Q6). 통화 공용 파일 `fcm-sender-impl.ts:126` 을 알림 커밋에 섞음(통화 분기 뒤라 동작 영향 없음 — 절차 위반으로 기록) |
| 570312026 | 유지 | 체인 연결 확인: `DibayFirebaseMessagingService.java:150,377` → `MainActivity.java:3048-3070` → `PushRouteListener.tsx:507` → `read/route.ts:45-57` |
| 76739dc38 | 유지 | `price-offers.server.ts:540-551`. 알림함 resolver 우선순위 → B-15 |
| e4cb4543f | 유지 | `commerce-notification-reconcile.ts:63-72`. 조회 오류 시 0(경미) |

---

## 7. 이번 보고의 한계 (NOT_PROVEN)

- 관리자 알림음이 권한 없는 분류의 Realtime 행에도 울리는지(RLS 정의 확인 필요 — 의심).
- 실기기·Production 화면 동작 전부.
- 리마인드 크론 주기(B-01 의 리마인드 동시 생성 원인).
- 404 실제 발생 여부(B-08, D-Q5 14건).
- iOS 해제 실패 시 이전 계정 알림 노출(조건부 의심, 네이티브).

---

## 부록 1. e053417ca 문구 중 승인표(이전 설계 §4) 밖 변경

| 키 | 변경 전 | 변경 후 | 제안 |
|---|---|---|---|
| notify_support_case_resolved_body | 상담이 종료되었습니다. | 더 궁금한 점은 다시 문의해 주세요. | Owner 결정 |
| notify_support_case_reopened_body | 상담이 다시 열렸습니다. | 답변을 기다리고 있어요. (en: We're working on a reply.) | 원복 권장(ko/en 뜻 다름) |
| notify_trade_buyer_confirmed_body | 거래가 완료되었어요. | 구매자가 거래완료를 확인했어요. | Owner 결정(writer 없음) |
| notify_trade_seller_completed_body | 물품을 받으셨다면 채팅에서 거래완료 확인을 눌러 주세요. | 물품을 받으셨다면 거래완료를 눌러 주세요. | 원복 권장(writer 없음) |
| notify_trade_product_fallback | (없음) | 물품 / Item | Owner 결정 |
| notify_trade_dispute_received_title (en) | — | Your trade inquiry was received | **수정**(받는 사람은 판매자) |
| notify_meeting_kicked_body | 운영자에 의해 모임에서 강제 퇴장되었습니다. | 운영자가 모임에서 내보냈어요. | Owner 결정 |
| notify_meeting_banned_body | 운영자에 의해 이 모임의 접근이 차단되었습니다. | 운영자가 이 모임의 접근을 차단했어요. | Owner 결정 |
| notify_commerce_new_order_body_named | 「{store}」 {orderNo} · {amount} · 품목 {n}종 — 접수·채팅에서 확인해 주세요. | {orderNo} · {amount} · {n}개 품목 (매장명 빠짐) | 매장명 복원 권장(다매장 오너) |
| notify_commerce_owner_accept_reminder_body(_named) | 「{store}」 {orderNo} · {amount} · 품목 {n}종 — 접수 대기 {s}초 경과 | {orderNo} · {s}초째 대기 중 | 원복 권장 |
| notify_commerce_payment_done_body | 「{store}」 {orderNo} — 매장이 확인·접수하면 채팅과 알림으로 단계가 안내돼요. | 매장이 접수하면 알려 드릴게요. | Owner 결정 |
| notify_user_point_charge_rejected_body | 충전 신청이 반려되었습니다. 내 포인트 화면에서 확인해 주세요. | 내 포인트에서 확인해 주세요. | Owner 결정 |
| notify_friend_request_received_body · notify_gift_transfer_offered_body · notify_community_comment_body | {name}님이 … 보냈습니다. 등 | 친구 탭에서 / 메신저에서 / 게시글에서 확인해 주세요. | Owner 결정 |

승인표와 일치해 유지하는 줄은 다음과 같다: 고객센터 3제목, 거래 완료 2제목, 모임 어미, 새 주문 제목, 리마인드 제목, 고객 상태 16키, 포인트 제목·사유, 친구·선물·댓글 제목, 「회원」 대체 이름.
