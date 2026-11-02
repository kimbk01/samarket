# 알림 전체 재감사 — 회원 앱 · 플랫폼 어드민 · 매장 어드민(사장님) (2026-11-02 · 보고만, 승인 후 구현)

## 감사 조건
- 감사 시각: 2026-11-02 03:20~04:30 PHT.
- 코드 기준: `origin/main` 944d1b11a. 로컬 07ba342b8와의 차이는 philife 커밋 2개뿐이며 알림 파일은 같다.
- 운영 DB: `ckdosyydvgzqwpbwuhon`에서 읽기 전용 SELECT만 했다.
- 화면·실기기: 직접 보지 않았다. 그래서 화면 판정은 전부 **NOT_PROVEN**이다.
- 이 감사로 바꾼 것: 없다. 코드·DB·배포 모두 변경하지 않았다.
- 표기: **FAIL** = 코드(또는 DB)로 결함을 확인함. **GAP** = Owner 지시 대비 미구현. **NOT_PROVEN** = 확인 못 함.

---

## 0. 작업자(Claude 이전 세션) 잘못 — 먼저

| # | 내용 | 증거 |
|---|---|---|
| W1 | **매장 어드민 종의 안 읽은 숫자가 항상 0이다.** 7ffea1487이 숫자 출처를 「받은 목록」에서 「서버 `unread_total`」로 바꿨다. 그런데 매장 알림 API(snapshot 경로)는 `{ok, notifications}`만 돌려준다. 계약 테스트는 문자열만 비교해서 이를 잡지 못했다. | `components/philife/PhilifeHeaderNotificationInbox.tsx:423, 608` (7ffea1487) · `app/api/me/notifications/route.ts:335` · 운영 DB: 사장님 미읽음 행 존재(store_order_created unread 45) · 화면 NOT_PROVEN |
| W2 | 「항목 판정 코드 제거」 보고는 일부만 맞다. `notification-item-registry.ts`(983줄)가 지금도 모든 알림의 소리 키를 가장 먼저 정한다. 「알림음 설정」 화면에도 item_* 33개가 섞여 보인다. 「원본 그대로」가 아니다. | `notification-sound-event-key-from-row.ts` `resolveNotificationItem` · `notification-sound-registry.ts:713-739` |
| W3 | 반복 「반복 설정」 창(7db335de3)은 기존 반복 경로를 쓴다. 이 경로는 2회차부터 목적지·지정 회원을 잃는다(A2). 이를 확인하지 않고 「구현 완료」라고 보고했다. | `claim-scheduled-campaign.ts:388-389, 463-488` |
| W4 | 구현 기준서(impl-plan:9)는 「이벤트 = `notice_category=event`」인데, 구현은 `platform_event_id`가 있으면 이벤트다. 계획과 다른 구현을 보고하지 않았다. | `campaign-list-service.ts:197-198`. 코드에 `notice_category` 0건 |

---

## 1. 매장 어드민(사장님) 알림

### 1-1. 지금 있는 것 (코드 확인)
- **매장 어드민 종이 있다.**
  - 위치: `BusinessAdminShell.tsx:453-457`, `OwnerMobileAdminHeader.tsx:179` (`surface="owner_commerce_inbox"`).
  - 보이는 범위: 선택한 매장 알림만 나오고, 읽은 알림도 나온다. 밀어서 읽음은 없다.
- **매장 알림함이 있다.**
  - 주소: `/stores/owner/notifications?storeId=`.
  - 탭: 전체·신규 주문·취소/결제·환불 4개.
  - 기능: 선택·삭제·모두 읽음.
- **회원 종에서는 사장님 주문 알림이 빠진다.** `resolve-tier1-bell-surface.ts:86-93`.
- **알림을 거치지 않아도 읽음이 된다.** 주문을 펼치거나 주문 상태를 바꾸면 그 주문의 알림이 읽음 처리된다. `OwnerStoreOrdersView.tsx:472-483`, `apply-store-order-status-transition.ts:698-720`.

### 1-2. 결함 (FAIL)
| # | 결함 | 증거 |
|---|---|---|
| O1 | 사장님 종 숫자 항상 0 (위 W1) | 위 |
| O2 | **【정정 2026-11-02 S1 작업 중 — 이 판정은 틀렸다】** 운영 함수는 하위 함수 `owner_store_ops_notice_notification_kinds()`를 붙여 운영 알림 13종을 포함한다(pg_get_functiondef 재확인). 해당 행에도 store_id가 있어 운영 매장 알림함에 나온다(화면 NOT_PROVEN). 남는 것은 저장소 파일 순서 위험뿐이라 S1에서 운영과 같은 정의를 마지막 순서로 다시 두는 마이그레이션 파일만 추가했다(운영 미적용). ~~관리자 매장 결정·운영 공지가 아무 데도 안 보인다.~~ 회원 종은 TS 목록으로 이 종류를 뺀다(`owner-store-commerce-notification-meta.ts:36-38`). 매장 알림함이 쓰는 운영 DB 함수 `owner_store_commerce_notification_kinds()`에는 이 종류가 없다. 원인은 마이그레이션 `20270702120000`이 `20261028004405`의 추가분을 덮어쓴 것이다. | 운영 DB 함수 정의: `admin_store_decision`·`admin_store_operational_notice` 없음 · 운영 행 `admin_store_decision` 2건(둘 다 미읽음, 마지막 10-28) · 화면 NOT_PROVEN |
| O3 | **품절 목적지가 경로마다 다르다.** 알림함은 주문 상세로, 종·푸시는 상품 목록으로 간다. | `owner-notification-inbox-items.ts:72-86` vs `notify-store-commerce.ts:217` |
| O4 | **관리자 주문 조치가 「특정 주문」이 아니라 주문 목록으로 간다.** `meta.order_id`가 있는데 쓰지 않는다. | `notify-owner-admin-order-intervention.ts:56` |
| O5 | **알림함 탭 분류가 틀렸다.** ① 구매자용 `payment_failed`·`refund_approved`가 탭 조건에 들어 있다. ② 접수 시간 초과 취소가 「취소」 탭에 없다. ③ 결제 완료가 「취소·결제」 탭에 있다(소리 항목은 「신규 주문」). ④ 리마인더·품절은 「전체」에만 나온다. | `owner-notification-inbox-items.ts:29-54` |
| O6 | 사장님용 「플랫폼 문의 답변」이 회원 종에 나온다. 사장님 종류 목록 밖이기 때문이다. | `notify-store-points.ts:28-46`, `owner-store-commerce-notification-meta.ts:11-49` |
| O7 | 회원 앱 안 소리 판정에 `receiverRole`이 없다. 그래서 사장님이 받는 주문 채팅이 구매자용 소리로 판정될 수 있다. | `inbox-events-merge.ts:203-235` · 실제 차이 NOT_PROVEN |

### 1-3. Owner 지시 대비 빠진 것 (GAP)
- 관리자가 사장님 알림(주문 알림 등)의 **발송 결과·목록을 볼 화면이 없다**. 「보낸 알림」은 캠페인 전용이다.
- 사장님 설정은 계정 단위 스위치 2개(푸시·소리)뿐이다. 종류별 설정과 소리 선택이 없다.
- 매장을 여러 개 가진 경우, 선택하지 않은 매장의 알림을 볼 곳이 없다. 신규 주문 제목에 매장명이 없다.
- 새 리뷰·고객 매장 문의·정산/수수료 알림은 **만드는 코드가 없다**. 소리 키만 있다. 이것은 새 기능이라 계약·지시가 없으므로 **Owner 결정 필요**다.
- 「받을 때까지 울리는」 새 주문 알람이 없다. 소리는 1회, 관리자 설정 반복은 최대 5회다. 이것도 **Owner 결정 필요**다.

---

## 2. 플랫폼 어드민 알림 관리

### 2-1. 결함 (FAIL)
| # | 결함 | 증거 |
|---|---|---|
| A1 | **반복·예약 알림의 숫자가 0으로 나오고 다시 보내기가 막힌다.** 「최신 회차」를 고를 때 상태를 보지 않아 미리 만든 queued 회차를 고른다. | `campaign-list-service.ts:202-214` · `campaign-recipients-service.ts:65` · 운영 영향: 지금 진행 중인 실제 반복 0건(QA 1건뿐) |
| A2 | **반복 2회차부터 목적지·지정 회원이 빠진다.** 다음 회차를 만들 때 `target_payload`를 조회하지 않는다. | `claim-scheduled-campaign.ts:388-389` (select에 없음) → `:463-466` null → `:481-488` legacy |
| A3 | 반복 시간대 기본값이 `Asia/Seoul`이다(규정: PHT). | `claim-scheduled-campaign.ts:434` |
| A4 | 「받은 사람」 창을 다른 알림으로 바꿔 열면 앞 알림 데이터가 남는다. 오류 때 「새로고침」을 눌러도 다시 읽지 않는다. | `AdminSentNotificationPanels.tsx:209-212, 344` |
| A5 | 업데이트 내역 「받은 사람」이 불러오기 실패를 「없음」으로 보여 준다. version_code가 없으면 전 버전 회원이 나온다. | `Panels:980-983, 1058` · `app-release-notice-list.ts:116-118` |
| A6 | 회차·실패 상세 조회에 `.range`가 없어 PostgREST 1,000행 상한에서 잘린다. 열람 limit 20,000은 의미가 없다. | `campaign-list-service.ts:266-273, 337-345` · `campaign-recipients-service.ts:129-141` · 실제로 넘는지 NOT_PROVEN |
| A7 | 다시 보내기가 「만들기 → 보내기」 2단계다. 보내기가 실패하면 초안이 남는다. 멱등 키가 누를 때마다 새로 생긴다. 서버는 원본 상태를 확인하지 않는다. | `Panels:425, 493-515` · `resend/route.ts:49-57` |
| A8 | 권한 없는 관리자도 창 안의 다시 보내기·반복 버튼이 켜져 있다(누르면 서버 403). | `AdminNotificationCampaignsPage.tsx:617` vs `Panels:276-297` |
| A9 | 알림음 창의 업로드·불러오기에 catch가 없다. | `Panels:754-762, 791-806` |
| A10 | 새 API 3개(recipients·resend·app-release-notices)가 route-auth 테스트에서 빠져 있다. | `__tests__/route-auth.test.ts:33-76` |

### 2-2. 시안 v3 미구현 (FAIL — 승인 시안과 다름)
- 이미 확인된 4곳:
  - 결과·받는 사람 거르기.
  - 「결과」 열.
  - 같은 화면 안의 「알림 보내기」 창(분류 선택·알림음 줄·받는 인원).
  - 「작성 중」 탭 이름.
- 추가로 찾은 것:
  - 상태 탭 숫자.
  - 결과 배지 5종.
  - 반복 줄 숫자 「—」.
  - 새 줄 강조·탭 이동.
  - 「받은 사람」 머리의 결과 배지와 알림음 줄.
  - 반복 창의 「다음 발송」 안내.
  - 「다시 보냄(원본…)」 표시. 계획서는 `resend_of` 저장인데, 구현은 감사 로그에만 남긴다.

### 2-3. 연결 GAP
- 고객센터 글(공지·시스템·업데이트 소식)을 저장해도 알림이 가지 않는다. 상세 화면의 링크로 따로 보내야 한다. 문구 「[알림 발송]」은 메뉴 이름과 다르다.
- 「공지사항 알림음 변경」은 `admin_notice_received`를 쓰는 다른 알림 소리까지 같이 바꾼다.

---

## 3. 회원 앱

| # | 판정 | 내용 | 증거 |
|---|---|---|---|
| M1 | FAIL | 모임 알림 5종이 「거래」 탭으로 분류된다(`status`를 거래 규칙이 먼저 잡음). | `member-notification-domain.ts:212-214` · 운영 행 0건(지금 영향 없음) |
| M2 | FAIL | 알림을 읽어도 고객센터 글이 읽음이 되지 않는다. 글 → 알림 방향만 동기화된다. | `api/me/notifications/read`·`lib/notifications`에서 `customer_center_content_views` 0건 · 설계 §3 위반 |
| M3 | FAIL | 신고 상세의 뒤로가기가 항상 신고 목록으로 간다(설계 §5: 들어온 곳으로). | `MyReportDetailClient.tsx:160` |
| M4 | GAP | 신고 내역 목록에 읽음/안 읽음 구분이 없다(Owner 지시). | `MyReportsListClient.tsx` |
| M5 | FAIL (설치본) | Android ≤31에서 푸시 전용 공지·시스템을 누르면 목록으로 간다. c43ba2500이 들어간 빌드가 없다. | `build.gradle` versionCode 31 |
| M6 | FAIL | Play 키가 없으면 Android 「업데이트 안내」 본문이 빈 글자다. | `app-release-report.ts:164` |
| M7 | GAP | 모임 거절·강퇴·차단과 거래·커뮤니티 제재가 일반 홈(`/philife`·`/market`)으로 간다. 리뷰 답글은 주문 id가 없으면 `/orders` 목록으로 간다. | `reject:132`, `kick:114`, `ban:115`, `notify-trade-moderation.ts:96-98`, `reply/route.ts:138` |
| M8 | GAP | 데스크톱 종 패널은 미읽음 80건까지만 보인다(더 불러오기 없음, 설계 R7). | `route.ts:411` |
| M9 | GAP | 같은 글의 댓글과 시스템(게시물 조치) 알림이 묶음 키 `post:{id}`로 한 줄에 합쳐질 수 있다. | `group-inbox-by-thread.ts:128-133` · 운영 사례 NOT_PROVEN |
| M10 | GAP | 상세 화면이 3종(고객센터 글·신고·알림 대체 상세)으로 서로 다르다. 이미지 출처도 다르다(글 대표 이미지 vs 캠페인 이미지). | 각 파일 |
| M11 | 설계 충돌 | 친구·그룹 초대·상품권 선물은 종에서 빠진다. 설계 §2-2는 커뮤니티 탭에 넣었다. | `member-notification-a-eligibility.ts:85` |
| — | 코드 PASS | 저장 시 목적지 확정. 11-01 이후 운영 행 83건 모두 `routeUrl`이 있고 목록으로 가는 것은 0건이다(운영 DB). 종 숫자 = 전체 탭 = 앱 아이콘 A 권위. 고객센터·신고 최신순. 앱 안과 푸시 소리 키는 같은 함수를 쓴다. | — |

---

## 4. 운영 DB 데이터 (정리 대상 · 승인 필요)
- 가짜 통화 시도 ID 1행. 같은 표에 실제 시도 3건도 있다.
- QA 반복 캠페인 `[QA-D4X-…]`: `active`, 종료일 08-19 지남, 발송 0건.
- `notification_item_settings`: 빈 표.
- 메인관리자 계정의 시험 주소(`/x`, `/business/...`) 미읽음 알림 28건.
- `notification_deliveries` 1일 넘게 `pending`인 행 2건.

---

## 5. 설계안 (단계별 · 각 단계 승인 후에만 진행)

### S1 — 결함 수정 (웹·서버 · main 1회 · 앱 재시작만)
| 항목 | 설계 | 바뀌는 파일 | 영향·같이 처리 |
|---|---|---|---|
| O1 | snapshot 응답에 `unread_total`을 싣는다. 같은 RPC 결과에서 그 매장 미읽음을 센다. 계약 테스트는 실제 응답 모양을 확인하도록 고친다. | `app/api/me/notifications/route.ts`, 오너 snapshot loader, 테스트 | 매장 어드민 종 숫자. 회원 종은 영향 없음. |
| O2 | **DB**: `owner_store_commerce_notification_kinds()`에 운영 알림 3종을 추가한다. TS 목록과 1:1 대조하는 테스트를 넣는다. | 새 마이그레이션 1개 | 운영 DB 적용은 별도 승인. 적용 전에는 O2가 그대로 남는다. |
| O3·O4 | 목적지 단일화: 알림함도 저장된 `link_url`만 따른다(order_id 덮어쓰기 제거). 관리자 주문 조치는 저장할 때 주문 상세로 정한다. 품절은 「상품 목록」으로 한다(알림 내용 = 품절 상품). | `owner-notification-inbox-items.ts`, `notify-owner-admin-order-intervention.ts` | 옛 행은 그대로(저장값 기준). |
| O5 | 탭 분류를 소리 항목표(registry)의 사장님 그룹에서 만든다: 신규 주문(접수·결제 완료·리마인더) / 취소(구매자 취소·시간 초과) / 환불 / 매장 운영(품절·관리자·광고·문의 답변). 구매자 종류는 뺀다. | `owner-notification-inbox-items.ts` | 탭 4개 → 5개(「매장 운영」 추가). |
| O6 | 사장님용 플랫폼 문의 답변을 사장님 종류 목록에 넣는다. → 회원 종에서 빠지고 매장 종에 나온다. | `owner-store-commerce-notification-meta.ts` + O2 DB 함수 | O2와 같은 마이그레이션. |
| A1 | 최신 회차 = 시작했거나 끝난 회차(`started_at` 있음)만. 없으면 「—」. | `campaign-list-service.ts`, `campaign-recipients-service.ts` | — |
| A2 | 다음 회차 조회에 `target_payload`를 추가한다. | `claim-scheduled-campaign.ts` | 반복 발송(cron). 기존 회차는 영향 없음. |
| A3 | 기본 시간대를 `Asia/Manila`로(규정 9번). | 같은 파일 | 값이 없는 행에만 적용. |
| A4·A5·A9 | 알림이 바뀌면 data를 비운다. 다시 읽기 키를 분리한다. 오류를 빈 목록과 구분한다. version_code가 없으면 거부한다. catch를 추가한다. | `AdminSentNotificationPanels.tsx`, `app-release-notice-list.ts` | — |
| A6 | 회차·실패 상세·열람을 1,000행 단위로 끝까지 읽는다(`.range` 반복). | 서비스 2개 | — |
| A7 | 다시 보내기를 서버 1회 호출로: 만들기와 보내기를 한 API에서 처리한다. 멱등 키는 창 열 때 1번 만든다. 원본은 완료 상태만 허용한다. | `resend/route.ts`, Panels | 기존 `/send`는 그대로. |
| A8·A10 | 창 버튼도 `sendAction.allowed`를 따르게 한다. route-auth 테스트에 3개 경로를 추가한다. | Panels, 테스트 | — |
| M1 | 분류에서 `meta.kind`가 `community_meeting_*`이면 커뮤니티를 먼저 고른다. | `member-notification-domain.ts` | — |
| M2 | 알림 읽음 함수가 고객센터 연결 알림이면 `customer_center_content_views`에도 쓴다. 기존 view API와 같은 함수를 쓴다. | `inbox-read-bridge.ts`, `customer-center-read-state.ts` | 고객센터 배지가 함께 줄어든다. |
| M3 | 신고 상세를 `preferHistoryBack`으로. 기록이 없으면 신고 목록. | `MyReportDetailClient.tsx` | — |
| M6 | 버전 이름이 없을 때 i18n 문구 「새 버전이 있습니다」. | `app-release-report.ts`, i18n | — |
| W2 정리 | 항목표는 **소리 키 SSOT로 유지**한다(운영에서 쓰는 중, 33키가 알림음 설정과 1:1). 쓰지 않는 필드(`pushLock`·`inboxLock`·`group`·`samples`)를 지운다. | `notification-item-registry.ts` | 동작 변화 없음(테스트로 확인). |

- 검증: `typecheck:build` + 관련 vitest + eslint를 1회 한다.
- 반영 후 Production 화면을 관리자 1440px와 사장님 계정으로 확인한다. 확인 못 하면 NOT_PROVEN으로 적는다.

### S2 — 시안 v3 나머지 (웹 · 어드민 · main 1회)
- §2-2 전부를 구현한다.
- 「알림 보내기」는 목록 화면의 창으로 연다(시안 v3). 기존 만들기 페이지는 「고쳐 쓰기(초안)」 전용으로 남긴다.
- 분류 선택값을 저장한다: `type` + `target_payload.notice_category`.
- 다시 보낸 알림은 `target_payload.resend_of`에 원본 id를 저장하고, 목록에 「다시 보냄」으로 표시한다.
- 고객센터 글 상세의 「[알림 발송]」 → 「알림 보내기」로 이름을 통일한다.
- **Owner 결정 필요 (충돌)**: 이벤트 분류 기준. 승인 계획(impl-plan)은 「선택값 `notice_category=event`」, 구현은 「이벤트 연결 여부」다. S2를 계획대로 하면 과거 발송은 지금처럼 이벤트 연결 여부로 분류하고, 새 발송부터 선택값을 쓴다.

### S3 — D8 사장님 매장 종 (웹 · 설계 승인 후)
- **종**: 회원 종과 같은 규칙. 미읽음만 보여 주고, 밀어서 읽음, 분야 탭은 S1-O5와 같은 5개. 숫자는 서버 `unread_total`(S1-O1)을 쓴다.
- **여러 매장**: 종 머리에 「다른 매장 안 읽음 n」을 표시하고, 누르면 그 매장으로 전환한다. 신규 주문 제목 앞에 매장명을 붙인다(새 알림부터).
- **알림함**: 지금 화면을 유지하고 탭만 S1-O5로 맞춘다. 상세는 저장 목적지로 간다.
- **설정**: 지금 계정 단위 2개를 유지한다. 종류별 켜기/끄기와 소리 선택은 **Owner 결정 필요**(계약 없음).
- **어드민 연결**: 「푸시·알림 발송」에 「매장 알림」 결과 탭(읽기 전용)을 둔다. `notification_events` + `notification_deliveries`로 종류별 발송·실패·읽음을 보여 준다. 알림음은 「알림음 설정」의 사장님 구역을 그대로 쓴다.
- **새 알림 종류(리뷰·고객 문의·정산)·계속 울리는 새 주문 알람**: **Owner 결정 필요**. 결정 전에는 넣지 않는다.

### S4 — 운영 DB 정리 (각 행 Owner 승인)
- §4의 5건을 처리한다. 각 건마다 백업 → 변경 → 열 단위 대조를 보고한다.
- O2 마이그레이션 운영 적용도 여기서 함께 승인받는다.

### S5 — 네이티브 (Android)
- c43ba2500(N1)을 포함한 설치용 빌드를 만든다. `native:prepare`, versionCode 32.
- 실기(별도 승인): 푸시 전용 공지·시스템을 백그라운드·종료 상태에서 탭.
- 통화 코드는 바꾸지 않는다.

### 순서
S1 → S4(O2 DB 적용 포함) → S2 → S3 설계 확정 → S5.

---

## 6. S4 실행 계획 — 운영 DB (2026-11-02 · 계획만, 승인 후 실행)

운영 DB `ckdosyydvgzqwpbwuhon`. 2026-11-02 04:0x PHT에 읽기 전용으로 다시 확인한 값이다.

### 공통 절차 (모든 항목)
1. 실행 직전에 대상 행을 `row_to_json`으로 백업한다(파일: `docs/audit/s4-backup-2026-11-02.json`, 커밋 안 함).
2. 변경 SQL은 백업 때 읽은 값을 조건에 넣는다(`status`·`updated_at`·`unread`).
   - 영향 행 수가 계획과 다르면 **즉시 중단**한다. 롤백한 뒤 다시 읽고, 덮어쓰지 않는다.
3. 변경 후 같은 행을 다시 읽어 열 단위로 대조한다(바뀐 열 = 계획한 열만).
4. 항목마다 실행 시각(PHT)·행 수·대조 결과를 보고한다.

### 항목
| # | 대상 (현재 값) | 변경 | 영향 | 롤백 |
|---|---|---|---|---|
| D1 | 마이그레이션 `20271102100000` (S1 커밋 73d252343에 포함, 운영 미적용) | `apply_migration`으로 적용. ① `owner_store_commerce_notification_kinds()`: 운영과 같은 정의(변화 없음) ② `get_owner_dashboard_notifications_snapshot`: 운영 정의 + `unread_counts.owner_store` 추가 | 매장 종 숫자가 「최신 200건 안」 → 「그 매장 전체」 기준이 된다. 기존 키·목록은 같다. 스냅샷 캐시는 5초 안에 새 값이 된다. | 적용 직전 `pg_get_functiondef` 2개를 백업하고, 그 정의를 다시 적용한다. |
| D2 | `community_messenger_call_attempt_cancellations` 가짜 시도 ID `00000000-0000-4000-8000-000000000001` 1행 (11-01 15:31 UTC, 작업자 시험 호출) | 이 1행만 DELETE (`client_attempt_id`·`initiator_user_id`·`created_at` 일치 조건) | 통화 세션과 연결 없음(조회 확인). 실제 시도 3행은 그대로 둔다. 통화 코드는 바꾸지 않는다. | 백업 행을 INSERT한다. |
| D3 | QA 반복 캠페인 `88db384a…` `[QA-D4X-…]`: `active`, 종료일 08-19 지남, 회차 1개(sent)·발송 0건 | 「반복 중지」와 같은 결과: `status active→ended`, `updated_at`. 조건: `status='active' AND updated_at='2026-08-12 10:56:55.67+00'`. 감사 로그(`admin_notification_campaign_audit_logs`)에 stop_recurring 1행. | 화면의 「발송 중·예약」에서 빠진다. 취소할 queued 회차는 없다(조회 확인). | 백업 값으로 되돌린다(status·updated_at). 감사 로그 행은 삭제한다. |
| D4 | 시험 캠페인 6건 `실기7`~`실기12` (non-QA, 회원 지정 1명, sent): 「보낸 알림」 목록과 분류 숫자에 섞여 있음 | 「삭제(보관)」와 같은 결과: `archived_at=now()`, `archived_by=NULL`(작업자, 감사 로그에 기록). 조건: `archived_at IS NULL`. 감사 로그 archive 6행. `실기6`(draft, QA)도 같이 보관한다(7건). | 관리자 목록에서 「삭제한 알림」 탭으로 옮겨진다. 회원 쪽 알림·발송 기록·열람 기록은 그대로다(회원 화면은 캠페인 보관을 보지 않음 — 코드 확인). | `archived_at=NULL`로 되돌린다. 감사 로그 행은 삭제한다. |
| D5 | `notification_item_settings` (0행, 정책 0, 참조 함수 0) | 저장소에 `DROP TABLE` 마이그레이션 파일을 추가하고(웹 커밋 1개) 운영에 적용한다. | 이 표를 읽는 코드는 0건(7db335de3에서 제거, grep 확인). | `20271102020000` 생성 마이그레이션을 다시 적용한다(빈 표). |
| D6 | 메인관리자 계정의 시험 주소(`/x`, `/business/...`) 미읽음 알림 28건 (07-07 시험 데이터) | 읽음 처리만(`unread=false, read_at=now()`) — 삭제하지 않는다. 조건: id 28개 + `unread=true AND read_at IS NULL`. | 그 계정의 종 숫자에서 빠진다. 다른 회원은 영향 없음(조회 확인: 28건 모두 메인관리자). | id 28개를 `unread=true, read_at=NULL`로 되돌린다. |
| D7 | O6 사장님용 「플랫폼 문의 답변」을 회원 종 → 매장 종으로 | **코드 + DB 묶음**. 작성 코드(`notify-store-points.ts`)가 저장할 때 `kind=store_platform_inquiry_replied`·`store_id`를 남기게 한다 + TS 사장님 종류 목록 + DB `owner_store_ops_notice_notification_kinds()`에 같은 종류를 추가한다. 순서: **DB 먼저**(이 종류의 행이 0건이라 무해) → 웹 main 반영. | 새 답변부터 매장 종·매장 알림함(「매장 운영」 탭)에 나온다. 옛 1건(미읽음)은 종류가 없어 회원 종에 그대로 남는다(데이터 변경 없음). | DB 함수 이전 정의를 다시 적용하고, 웹 커밋은 되돌린다. |

### 하지 않는 것 (근거)
- **1일 넘게 `pending`인 `notification_deliveries` 2행**: 1건은 `missed_call`(통화 규정 대상), 1건은 `community_activity`다. 재시도 작업이 이 상태를 보는지 확인하지 않았으므로 바꾸지 않는다. 기록으로만 남는다.
- **08월 즉시 발송 13회차**(발송 기록 있음 + `queued`, 캠페인은 draft): 상태를 바꾸면 그 초안이 다시 보낼 수 있는/없는 상태로 달라질 수 있다. S1에서 숫자는 이미 바르게 나온다. 바꾸지 않는다.
- **회원 쪽 시험 알림·통화 기록**(실기7~12 수신 행, 시험 통화): 실기 증거라 지우지 않는다(11-01 Owner 「삭제 안 함」 기록).
- **반복 시간대 DB 열 기본값**(`Asia/Seoul`): 화면과 다시 보내기가 항상 값을 넣어 실제 영향이 없고, 범위 밖이다. 보고만 한다.

### 실행 순서
D1 → D2 → D3 → D4 → D6 → (D5·D7 웹 커밋 1회: DROP 마이그레이션 파일 + O6 코드) → D5 적용 → D7 DB → main 반영.

D7은 DB를 먼저 적용하고 코드를 나중에 올린다. D5는 코드에 참조가 없으므로 순서가 무관하다.

### 검증
- 각 항목 직후 운영 DB 대조(위 공통 절차 3).
- D1 후 매장 알림 스냅샷 RPC를 시험 계정 매장으로 1회 읽기 호출해 `owner_store` 값과 실제 미읽음 수를 비교한다.
- D7은 vitest(종류 목록 TS↔SQL 대조) + typecheck + eslint를 한 뒤 main에 반영한다. 화면은 NOT_PROVEN — 새 문의 답변이 생겨야 확인할 수 있다.

### 6-1. S4 실행 결과 (2026-11-02 04:03~04:12 PHT · Owner 「D1~D7 승인」)
백업: `docs/audit/s4-backup-2026-11-02.json` (04:03 PHT — 함수 정의 3개 · 대상 행 전부).

| # | 실행 (PHT) | 행 수 | 대조 결과 |
|---|---|---|---|
| D1 | 04:04 apply_migration `owner_inbox_kinds_sync_and_store_unread` | 함수 2 | kinds 정의 = 운영과 같음. 매장 3곳에서 RPC `owner_store` = 실제 미읽음 수(73·59·56) · 목록 길이·목록 미읽음도 같음 |
| D2 | 04:05 DELETE | 1 | 가짜 ID 0행 남음 · 실제 시도 3행 그대로 |
| D3 | 04:05 status active→ended | 1 + 감사 1 | 바뀐 열 = status·updated_at 만 · 회차(sent) 그대로 |
| D4 | 04:06 보관 | 7 + 감사 7 | 바뀐 열 = archived_at·updated_at(앱의 보관 동작과 같음 — 계획표에 updated_at 을 안 적었음) · 상태·발송 시각·발송 기록 26행 그대로 |
| D6 | 04:06 읽음 | 28 | 미읽음 0 남음 · 다른 회원 행 0 변경 |
| D7 | 04:10 apply_migration `owner_platform_inquiry_reply_kind` → 웹 d47a381a5 | 함수 1 | 운영 알림 종류 13→14, 오너 종류 전체 29 |
| D5 | 04:10 apply_migration `drop_notification_item_settings` | 표 1 (0행) | 표 없음 확인 |

웹 반영: main `d47a381a5`(04:12 PHT). Production 화면 NOT_PROVEN. D7 화면은 새 문의 답변이 생겨야 확인할 수 있다(NOT_PROVEN).

---

## 7. S2·S3·S5 결과 (2026-11-02 · Owner 「S2·S3·S5 전부」 · 「보낼 때 고른 분류」 · 새 사장님 알림 없음 · 사장님 설정 2개 유지)

| 커밋 | 내용 |
|---|---|
| 6cf8c7a21 | S2 시안 v3 나머지 · S3 사장님 매장 종 · 반복 계산 결함 2건 |
| 61b540d6c | Android versionCode 32 (N1 c43ba2500 포함) |
| b96314162 | 보낸 알림 목록 1366·1440 가로 넘침 (Production 실측 1332 > 1118) |
| 9bde72ff2 | 매장 알림 결과 30초·60초 리마인더 같은 이름 |

### 검증
| 항목 | 판정 | 증거 |
|---|---|---|
| 로컬 typecheck build·test · npm run build · vitest 575파일 4,742건 · eslint | PASS (코드) | 6cf8c7a21 트리 |
| Android 1.2.5 (32) 빌드·설치 | PASS | native:prepare READY 59084df6c · adb versionCode=32 (Samsung SM-M156S · Xiaomi 24076RP19G) · user_devices 1.2.5 (32) 05:31 PHT · 앱 「버전 정보」 1.2.5 (32) |
| 시험 설치가 업데이트 내역을 덮어쓰지 않음 | PASS | app_releases android 1.2.5 (24) 그대로 |
| N1 푸시 전용 공지 탭 → 지정 글 (Samsung 백그라운드) | PASS | 실기13 5d59f734 · 05:36 PHT 공지 상세 화면 |
| N1 (Xiaomi 앱 프로세스 종료 · am kill) | PASS | 실기13 다시 보내기 43440c34 · 05:38 PHT 공지 상세 화면 |
| 분류 저장(notice_category) · 다시 보낸 원본(resend_of) | PASS (운영 DB) | 5d59f734 notice_category=notice · 43440c34 resend_of=5d59f734 |
| 알림 보내기 화면 분류·인원·알림음 · 글 고르기 = 분류 게시판만 | PASS (Production 1440) | 05:32~05:34 화면 |
| 목록 상태 탭 숫자 · 결과·받는 사람 거르기 · 결과 열 · 작성 중 · 다시 보내기 창 · 안내 | PASS (Production 1440) | 05:36~05:37 화면 |
| 매장 종 숫자 3 = DB owner_store 3 · 분야 탭 5개(취소 1·매장 운영 2) · 안 읽은 것만 | PASS (Samsung q테스트1 맛업는식당) | 05:44 PHT 화면 · RPC |
| 어드민 「매장 알림」 숫자 = 운영 DB | PASS (Production 1440) | 신규 주문 8·2·8 · 리마인더 6 / 5 · 품절 2 |
| 목록 가로 넘침 수정(b96314162) · 리마인더 이름(9bde72ff2) | NOT_PROVEN | 반영 직후 미확인(반복 확인 금지) |
| 반복 설정 변경(/recurrence) · 반복 창 다음 발송 · 다른 매장 안 읽음(매장 2개 계정) · 신규 주문 제목 매장명 | NOT_PROVEN | 실제 반복·두 매장 계정·새 주문 없음 |

### 시험 방법 잘못 (작업자)
- Xiaomi 첫 시험을 `am force-stop` 으로 만들었다 — Android 는 강제 중지된 앱에 FCM 을 전달하지 않아 첫 발송(실기13)은 Xiaomi 에 오지 않았다. `am kill`(프로세스 종료, stopped=false)로 다시 시험했다.

### 새로 찾은 결함 (보고만 · 설계 승인 필요)
- **푸시 전용 알림은 열람을 기록하지 못한다**: 발송 기록(notification_campaign_deliveries)에 알림 id 가 없고, 열람 기록은 알림 id 로만 한다(markCampaignDeliveryOpened). 실기13 두 기기 탭 후에도 opened_at = null. 관리자 「열람」이 푸시 전용은 항상 0.

### 시험 데이터 (남김)
- 캠페인 실기13 2건(시험 계정 2명 · 푸시 전용).
