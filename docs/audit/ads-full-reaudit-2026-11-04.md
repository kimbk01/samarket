# 광고 전체 재감사 — 처음 지시부터 S-3 까지 (2026-11-04 PHT)

## 확인 방법

- **코드**: origin/main `10937bf1a` (S-3 `e95062a26` · QA 정리 `c6ea54022` 포함). 읽기 전용. 코드는 바꾸지 않았다.
- **운영 DB**: `ckdosyydvgzqwpbwuhon` 에 SELECT 와 함수 정의 조회만 했다. 테스트 DB 2곳은 쓰지 않았다.
- **감사 나눔**: 5개 영역을 독립 감사자 5명이 나눠 봤다. 영역은 상위노출 · 피드 배너 · 팝업·PTR · 배달·마이 배너·인트로 · 어드민이다.
  - 감사자들은 보고서와 커밋 메시지를 믿지 않고 코드와 DB 를 직접 대조했다.
  - 표의 ✓ = 작업자가 다시 코드·DB 를 열어 직접 확인한 항목이다.
- **운영 반영 상태**: 오늘 광고 마이그레이션 9건(`ads_audit_db_fixes` ~ `feed_ad_pool_capacity_guard`)은 운영 적용 기록과 저장소 파일이 모두 대응한다.
- **판정 수준**: 아래 판정은 모두 **코드·DB 수준**이다. 화면·실기기는 전부 NOT_PROVEN 이다.

---

## 0. 작업자 잘못 (먼저 보고)

| # | 무엇 | 증거 | ✓ |
|---|---|---|---|
| W-1 | **S-0 X-1 「4개 화면 같은 결제 = 같은 요청 키 · 코드 PASS」는 틀린 보고였다.** 응답이 끊기면 창이 상태를 다시 불러오는데, 이때 고른 상품이 바뀐다. 그러면 새 키가 만들어져 **두 번 차감될 수 있다**(→ R-01, R-02) | `MemberPostPromoteSheet.tsx:88,144,222` · `TradeAdQuickSheet.tsx:176,213,261` · `promotion-attempt-key.ts:29-35` | ✓ |
| W-2 | **S-0 「같은 결제를 다시 보내면 『이미 처리된 결제예요』」는 커뮤니티에서는 나올 수 없다.** 커뮤니티 결제 API 가 `idempotent` 를 돌려주지 않는다(→ R-03) | `app/api/me/points/promotion-orders/route.ts:254-266` | — |
| W-3 | **O-6① 「배달 메뉴 사장님 팝업 신청」을 코드 PASS 로 보고했다.** 그런데 그 화면은 DB 함수가 팝업 신청을 빼므로 **항상 0건**이다. 구현할 때 `s.d <> 'popup'` 조건을 봤는데도 그대로 두고 PASS 로 보고했다(→ R-08) | `admin-menu.ts:712` · 운영 `admin_ads_workspace_page` applications 조건 | ✓ |
| W-4 | **S-3 동시 승인 경합.** 경합에서 진 신청이 「검토 중」에 갇히는 것을 구현할 때 알았는데 보고하지 않았다(→ F-03) | `approve-feed-ad-request.ts:245-256` | ✓ |
| W-5 | **실기 프롬프트 v2 오류 2건(정정함)** ① 사장님 팝업 판매를 「DB 값 1개로 켠다」고 썼다. 실제로는 코드 상수 `OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED = false` 가 막고 있어 DB 값만으로는 켜지지 않는다 ② 「지금 광고 중인 거래 상위노출 1건」 — 그 주문은 11-03 22:14:41 PHT 에 이미 종료돼 있었다 | `owner-popup-new-sales-gate.ts:16` · 운영 `point_promotion_orders` | ✓ |
| W-6 | **「QA 이벤트 배너 종료」를 범위 표기 없이 보고했다.** 종료일 없는 15행만 처리했다. `QA` 이름의 끝나지 않은 캠페인이 10행 더 남아 있다. 지금은 기간이 지나 자리를 차지하지 않는다 | 운영 SELECT | — |
| W-7 | **「코드 PASS」 근거 일부가 문자열 검사뿐이다.** 돈 규칙(연장 차감·합계 환급·일시정지 중복), 팝업 S-3 일부, 인트로 시간 제한 연결이 그렇다. 동작 테스트가 아니다 | `reaudit-r2-contract.test.ts:108-141` · `popup-ptr-final-check-p2.test.ts:126-150` · `launch-intro-prepare-deadline-invalid-row.test.ts:60` | — |
| W-8 | **배달 홈 상단 점 수정에서 회귀를 만들었다.** 배너 아래 24px 띠 전체가 눌러도 배너로 가지 않는다. 「보이는 점은 그대로」라는 보고와 달리 점 간격도 바뀌었다(→ D-01) | `StoresHomeHeroBanner.tsx:234` | ✓ |

---

## 1. 결함 목록

심각도: **P0** = 돈·권한, **P1** = 기능이 안 되거나 성과·감사 근거가 무너짐, **P2** = 부분 결함·잠복·문구·병목.

### 1-1. P0 (돈)

| ID | 영역 | 내용 | 증거 | ✓ |
|---|---|---|---|---|
| R-01 | 커뮤니티 상위노출 | 결제 응답이 끊기면 창을 다시 불러오면서 선택 상품을 항상 첫 상품(3일)으로 바꾼다. 그 상태로 다시 누르면 새 요청 키가 만들어진다. 첫 결제가 서버에서 끝났다면 **연장으로 두 번째 차감**이 일어난다. 화면에는 「두 번 결제되지 않아요」라고 나온다 | `MemberPostPromoteSheet.tsx:88`·`:144`·`:222` | ✓ |
| R-02 | 거래 상위노출 | 다시 불러온 잔액으로 원래 상품을 살 수 없으면 선택이 첫 구매 가능 상품으로 바뀐다. 그러면 새 키가 만들어져 다시 차감된다 | `TradeAdQuickSheet.tsx:176`·`:213`·`:261` | — |

### 1-2. P1

| ID | 영역 | 내용 | 증거 | ✓ |
|---|---|---|---|---|
| R-03 | 커뮤니티 상위노출 | 결제 API 가 `idempotent` 를 돌려주지 않는다. 같은 결제를 다시 보내면 「기간을 늘렸습니다」가 한 번 더 뜬다. 차감은 1회이지만 회원은 두 번 결제됐다고 보게 된다 | `route.ts:254-266` · `apply-community-paid-exposure.ts:219-248` | — |
| N-02 | 어드민 | 공통 화면(상위노출 관리·전체 광고)에서 거래 상위노출 **재개가 항상 실패**한다. 확인창은 사유 없음(L1)인데 운영 DB 함수는 사유 2자 이상을 요구한다 | `admin-action-levels.ts:21` `resume: "L1"` · 운영 `admin_trade_promotion_resume` `reason_required` | ✓ |
| N-03 | 어드민 | 「전체 광고」에서 거래 상위노출 **일시정지가 항상 실패**한다. 제재(L2, 사유)로 처리하는 것은 상위노출 관리 화면뿐이다 | `admin-mutation-confirm-copy.ts:45-51` (`exposeStop` L1) · 운영 `admin_trade_promotion_pause` | ✓ |
| R-08 | 어드민 | 배달 메뉴 「사장님 팝업 신청」과 광고 승인 「팝업」 탭이 항상 0건이다. 실제 처리 화면은 `/admin/platform-popup/requests` 다(W-3) | 운영 조회: 광고 승인 + 팝업 = 0 · 팝업 신청 4건 존재 | ✓ |
| N-04 | 어드민 | 공통 화면에서 피드 배너를 일시정지·재개·종료하면 **감사 기록이 없다**. 도메인 화면은 남긴다 | `advertising-workspace/action/route.ts` feed 분기 · 운영 `audit_logs` `feed_ad%` 1건 | — |
| F-01 | 피드 배너 O-4 | **노출·클릭 숫자를 무한히 부풀릴 수 있다.** 중복 방지 키가 앱이 보낸 `feedSessionId`·`slotOrdinal` 로 만들어진다. 요청 제한·로그인 확인이 없다. 설계의 「앱이 보낸 값을 믿지 않음」과 다르다. 클릭도 노출 없이 따로 올릴 수 있다 | `app/api/feed-ads/events/route.ts:33-43` · 운영 `record_feed_ad_event` | ✓ |
| F-05 | 피드 배너 | 이벤트 배포에서 배너를 끄면 `paused` 로만 바뀐다. 그래서 자리를 계속 차지하고, 종료일이 없으면 영구 점유다. QA 15행이 생긴 원인이 이것이고 지금도 그대로다. 트리거가 생긴 뒤로는 이런 행이 회원 승인·연장을 막는다 | `save-event-distribution.ts:189-202` · `feed-ad-pool-capacity.ts:26-30` | ✓ |

### 1-3. P2 — 상위노출

| ID | 내용 | 증거 |
|---|---|---|
| R-04 | 같은 키를 다시 보냈는데 가격 비교를 먼저 한다 → 그사이 가격이 바뀌었으면 409 `price_changed` → 키가 버려지고 다음 누름이 새 결제가 된다 | `route.ts:166-173` · 운영 `purchase_member_content_promotion_v2` |
| R-05 | 종료일이 지난 일시정지 주문을 창은 「진행 중 아님」으로 보고 구매 줄을 보여 준다. DB 는 일시정지면 막으므로 누르면 409 | `route.ts:97-100` vs 운영 결제 함수 |
| R-06 | 커뮤니티 주문의 만료 처리가 어디에도 없다. pg_cron 이 없고 Vercel cron 은 거래만 처리한다. 종료일 지난 주문이 `active` 로 남는다(목록·결제는 기간으로 걸러져 돈 피해는 없음) | `vercel.json:77` · `pg_extension` |
| R-07 | 커뮤니티 운영 종료 환급이 승인형(보류) 주문은 0이다(잠복 · 승인형 상품 0개) | 운영 `admin_promotion_end` vs `admin_trade_promotion_end` |
| R-09 | 커뮤니티는 결제 순간 가격을 잠그지 않는다. 거래는 `FOR SHARE` 로 잠근다 | `apply-community-paid-exposure.ts:194-207` |
| R-10 | 커뮤니티는 광고 중인 글을 20개만 받는다. 21번째부터는 「광고」 칩이 없다. 운영자 고정과 같은 글도 「광고」가 없다 | `community-paid-exposure-feed.ts:39` · `CommunityFeed.tsx:2001-2006` |
| R-11 | 첫 화면 서버 시드와 목록 API 의 끼우기 조건이 다르다. 시드에는 지역·가격·판매상태 조건이 없다(이월) | `load-market-bootstrap-payload.ts:155-190` |
| R-12 | 거래 즉시 결제가 심사 중(`pending_review`) 주문을 중복으로 보지 않는다(잠복) | 운영 `purchase_member_content_promotion` |
| R-13 | R2·E-15 마이그레이션은 운영 함수 본문 문자열을 치환하는 방식이다. 저장소만으로 최종 정의를 재현할 수 없다 | `20271103240000`·`20271104000000` |
| R-14 | 판매자 창 끝나는 시각이 기기 시간대·12시간제로 나온다. 시안·규정은 PHT 다 | `TradeAdQuickSheet.tsx:277-283` · `MemberPostPromoteSheet.tsx:371` |

### 1-4. P2 — 피드 배너

| ID | 내용 | 증거 |
|---|---|---|
| F-02 | 노출 기록이 `placement` 를 검사하지 않고, 소재를 비우면 키가 하나 더 생긴다 | 운영 `record_feed_ad_event` |
| F-03 | 동시 승인 경합에서 진 신청이 「검토 중」에 갇힌다. 포인트는 이미 돌려줬는데 다시 승인하면 `hold_missing` 500 이 난다(W-4 · 포인트 누수 없음) | `approve-feed-ad-request.ts:245-256` · `feed-ad-request-point-flow.ts:135` |
| F-04 | 회원 연장 재시도 경로(차감됐고 환급 안 된 상태)가 자리 검사를 하지 않는다. 트리거가 막아도 환급하지 않아 **차감된 채 광고가 없다**(조건부) | `renew-feed-ad-campaign.ts:186-203` |
| F-06 | 어드민 캠페인 수정·보상 연장이 트리거에 막히면 원문 `feed_ad_pool_capacity_full` 500 이 나간다 | `update-feed-ad-campaign.ts:104` · `admin-compensate-extend-feed-ad-campaign.ts:65-80` |
| F-07 | 어드민 노출 위치 지도가 아직 **위치 단위**로 센다. 업종·주제를 구분하지 않아 서버·트리거와 숫자가 다르다 | `placement-inventory.ts:205-221` |
| F-08 | 광고주 이름이 비면 「Untitled」가 고객에게 보인다 · 회원 닉네임을 바꿔도 따라가지 않는다 | `app/api/admin/feed-ads/route.ts:111` |
| F-09 | 회원 연장이 캠페인을 무조건 `active` 로 바꾼다. 그래서 어드민이 정지·종료한 회원 광고도 회원이 결제하면 다시 나온다(2026-08 부터 · **Owner 결정 필요**) | `renew-feed-ad-campaign.ts:150-156` |
| F-10 | 이미지가 깨지면 일반 대체 이미지가 「광고」와 함께 나온다. S-3 목록에서 빠졌다 | `FeedAdBannerCarousel.tsx:460-466` |
| F-11 | 캠페인 노출 수 = 소재별 노출 합이다. 소재 3개 캐러셀은 한 번 보면 최대 3으로 센다. 화면 안내가 없다 | `record_feed_ad_event` 키 |
| F-12 | `feed_ad_requests` 에 로그인 사용자가 보류 없이 직접 행을 넣을 수 있다(RLS insert 정책 · 이전부터). 무료 광고는 생기지 않지만 가짜 신청이 쌓일 수 있다 | `pg_policies` |

### 1-5. P2 — 팝업·PTR

| ID | 내용 | 증거 |
|---|---|---|
| P-01 | 팝업 CTA 를 누르면 click 뒤에 dismiss/suppress 도 기록된다. 그래서 「닫힘」 수에 클릭이 섞인다(운영 8/8) | `GlobalPopupHost.tsx:511-514,543` |
| P-02 | `close_only` × 는 효과 없는 CLOSE 행을 계속 INSERT 한다(운영 505행 = 81%). 주석은 「쓰지 않는다」라고 한다 · PTR 과 동작이 다르다 | `GlobalPopupHost.tsx:477-480` |
| P-03 | 숨김 행을 조건·개수 제한 없이 모두 읽는다. 행이 무한히 늘고, 최대 행 수에 걸리면 숨긴 팝업이 다시 뜰 수 있다(병목) | `load-popup-candidates.ts:307-326` |
| P-04 | `/suppress` 는 로그인 없이 아무 기기 키로 INSERT 할 수 있고 요청 제한이 없다 · revision 길이 검사가 없다 | `suppress/route.ts:50-54,86` |
| P-05 | 사장님 팝업 승인이 한 트랜잭션이 아니다. 검증이 실패하면 캠페인만 남고, 그 뒤 반려·환불된 매장 광고가 무료로 승인될 수 있다(잠복 · 판매 꺼짐) | `owner-request-approve.ts:180-199` |
| P-06 | resolve 조회가 차례로 실행된다(병목 · PTR 은 병렬) | `resolve/route.ts:63-73` |
| P-07 | 닫은 목록 200개 중 exclude 는 50개만 보낸다. 51개째부터 E-7 이 다시 생긴다(한 실행에 50개 이상 닫을 때만) | `fetch-platform-popup-resolve-client.ts:19` |
| P-08 | 숨김 revision = 소재 id 하나다. 제목·CTA 만 바꾸면 이미 숨긴 사람에게 다시 나오지 않는다. PTR 은 휴대폰 띠 id 만 본다(계약 해석 · Owner 결정) | `load-popup-candidates.ts:265-270` |
| P-09 | PTR 어드민 순위 안내가 실제 정렬(영역 지정 > 우선순위 > 덜 본 것)과 다르다 | `AdminPtrRevealDetailWorkspace.tsx:354` |
| P-10 | 팝업 보류 등록이 안 된 전체 화면 2곳이 남았다(`TradeChatEntryCreatingOverlay`·`OAuthProviderLoginPanel`) · 겹침 여부는 확인 못 함 | grep |
| P-11 | PTR CTA 콘텐츠 방문 기록 채널이 `"BANNER"` 다 | `DibayPtrRevealAdLayer.tsx:202` |

### 1-6. P2 — 배달·마이 배너·인트로

| ID | 내용 | 증거 |
|---|---|---|
| D-01 | 배달 홈 상단 점 묶음이 배너 아래 전체 폭 24px 를 막는다. 그 띠를 누르면 배너로 가지 않는다 · 점 간격이 바뀌었다(W-8 회귀) | `StoresHomeHeroBanner.tsx:234` |
| D-02 | B-4 첫 방문 빈칸: 서버 HTML 은 늘 140px 상자를 그린다. 콜드 진입 때 깜빡임이 남을 수 있다(추정) | `StoresHomeHeroBanner.tsx:57-60,134-147` |
| D-03 | 배달 SSOT 문서 홈 중간 행에 「예비 3」이 빠졌다 | `dibay-delivery-advertising-ssot.md:44` |
| D-04 | 마이 배너 고객 순서가 `sort_order` 하나뿐이다. 어드민 순서(priority·sort_order·created_at)와 다를 수 있다(운영 0행) | `mypage-summary.server.ts:85-96` |
| D-05 | 시작 전 `active` 마이 배너가 어드민에 「활성」으로 나온다(만료만 처리했다) | `admin-banner-utils.ts:24-31` |
| D-06 | 주석 「활성 1건 표시」가 남았다 | `AdminBannerForm.tsx:15` |
| I-01 | 기기용 인트로 조회(`/api/launch-intro/live`)는 Live 게시본이 손상되면 아직 500 이다. 일시정지 상태도 전달되지 않는다(운영 unpublished 라 지금 피해 없음) | `server.ts:184-199` · `live/route.ts:36` |
| I-02 | 손상 게시본 행이 검사 코드 원문(`scene_empty` 등)을 보여 준다(I-5 재발) | `LaunchIntroAdminPage.tsx` invalid 행 |
| I-03 | 준비 단계 제한 5초는 계약·지시에 없는 값이다. 최악이면 시작 화면 5초 + 인트로 5초가 된다. 영향 분석 문서가 없다(**Owner 판단**) | `prepare-deadline.ts:16` |
| I-04 | 「splash_safety_timeout 금지」 조항과의 관계. 해제는 한 번만 나가지만, 결과적으로 타이머가 시작 화면 해제로 이어진다(**Owner 해석**) | `startup-metrics.ts:13` |
| I-05 | 옛 13차 인트로 문서 본문 첫 줄이 아직 `ACTIVE` 다 | `dibay-intro-13th-final-correction-ssot.md:5` |

### 1-7. P2 — 어드민

| ID | 내용 | 증거 |
|---|---|---|
| N-05 | 같은 피드 조치의 감사 이름이 화면마다 다르다(`feed_ad.approve` vs `feed_ad_request.approve`). before 값도 없다 | `action/route.ts` · `feed-ad-requests/[id]/route.ts:337,465` |
| N-06 | 피드 반려 DB 오류 원문이 화면에 나간다 | `admin-reject-feed-ad-request.ts` |
| N-07 | 한국어 화면에 「community」「trade」「Admin 직접 등록」이 남았다(H-7 일부) | `AdminAdvertisingWorkspace.tsx:833-835,1241` |
| N-08 | 이력 「상세」가 피드 회원 신청·운영자 팝업에서는 그 항목을 열지 못한다(H-5 일부) | `project-history-timeline.ts:479-481,899,1012` |
| N-09 | 커뮤니티 「상위노출 가격」 저장 버튼이 권한과 상관없이 켜져 있다. 서버는 403 을 준다(H-4 유형) | `AdminMemberPromotionProductsPage.tsx:191` |
| N-10 | O-5 「마이 배너 노출 중」을 `status` 로 센다. 고객 화면은 `is_active` 로 고른다(지금은 같음) | `other-surfaces/route.ts` |

---

## 2. 맞게 구현된 것 (감사자 확인 · 요약)

- **상위노출**
  - R2 연장 DB(원장 키 고유 색인으로 두 번째 차감 차단) · D-1 자리 유지 · E-15 · E-10 · S-3 중복 검사
  - 환급 = 결제 합계, 주문당 1회 · O-10 운영 문구
  - P-1·P-2 · D-2(거래) · P-3 · D-3 · O-1·O-2·O-3 · H-1 · E-11 · S-2 문구
  - 고객 화면 「홍보」 0건
- **피드 배너**
  - O-4 표·함수 권한·RLS · 트리거(풀 키·점유 규칙 = TS, 잠금 후 세기)
  - 수용량 검사 경로: 승인·등록·이벤트 배포·일반 연장
  - 50%/1초 관찰·자동 넘김·클릭 keepalive · 공통 화면 숫자
  - H-2 단일 반려 · E-2 점 · F-2 안내 · 보류 포인트 상태 정합 · 홈 자리 0/3
- **팝업·PTR**
  - × 새로고침 유지 · CAMPAIGN revision · 다음 순위 · PTR exclude
  - P-a · P-b · E-7 · CTA 연타 · R-1·R-2·R-5·R-6 · E-8 · G-4 · G-8 · CTA 주소 검증
  - 사장님 팝업 반려 환불(운영 원장 대조) · 로그아웃 시 닫은 기록 삭제
  - revision null 35행은 전부 끝난 캠페인이라 영향 0
- **배달·마이·인트로**
  - 네이티브 파일 변경 0
  - 업종 상단·홈 중간 예비 · 어드민 칩
  - 마이 배너 목록·`<picture>`·삭제 정책 · I-4 · I-3 · I-6/E-9 · I-a · 어드민 손상 게시본
- **어드민**
  - O-6② 운영 함수(9인자·권한·도메인 규칙·건수 대조 272 = 74 + 72 + 81 + 45)
  - H-1·H-2·H-3·H-4·D-5 · 빈 화면 6곳
  - 삭제 컴포넌트 참조 0 · CUT J

## 3. 다른 세션 작업과 겹치는 것 (보고만)

- 11-03 22:14 PHT 에 다른 세션이 운영에 적용한 「거래 상위노출 ↔ 글 상태 연동」(`trade_promotion_listing_sync`)이 거래 주문 `63ba8c2b` 를 종료했다(환급 0).
  - 이 작업의 설계(판매완료·삭제 = 회원 귀책 환급 0)는 이번 감사 범위 밖이다.
  - 실기 프롬프트에서는 이 주문을 시험 대상에서 뺐다.

## 4. 판정

- **실기로 넘어가기 전에 고칠 것을 권장한다: P0 2건 + P1 7건.**
  - P0: R-01 · R-02
  - P1: R-03 · N-02 · N-03 · R-08 · N-04 · F-01 · F-05
  - 이유: 지금 실기를 하면 시나리오 A-11(응답 끊긴 뒤 다시 누르기)에서 테스트 계정이 실제로 두 번 차감될 수 있다. 또 공통 화면의 거래 재개·일시정지, 사장님 팝업 신청 메뉴, 피드 숫자 시나리오는 결과가 FAIL 로 정해져 있다.
- **P2 는 실기와 같이 기록하고 다음 단계에 묶는다.**
- **Owner 결정이 필요한 4건**(그 전까지 바꾸지 않음):
  - F-09: 회원 연장이 어드민 정지·종료를 다시 켜도 되는가
  - P-08: 숨김 revision 범위(소재만 / 문구 포함)
  - I-03: 인트로 준비 제한 시간 값
  - I-04: 안전 타이머 금지 조항 해석

---

## 5. P0·P1 수정 결과 (2026-11-04 PHT · Owner 「P0·P1 수정」 + 결정 1~4 · main `8671c2f75` · 웹만 · 운영 DB 변경 없음)

| ID | 원인 | 수정 (파일) | 검증 | 판정 |
|---|---|---|---|---|
| R-01 (P0) | 다시 불러올 때 선택이 첫 상품으로 바뀜 → 새 키 | 결과를 모르는 동안 같은 글은 상품과 상관없이 같은 키 + 그 상품을 화면이 다시 고름 (`lib/points/promotion-attempt-key.ts`, `MemberPostPromoteSheet.tsx`) | 결제 창을 실제로 그리는 시험: 7일 → 응답 끊김 → 다시 누름 = 같은 키·같은 상품·「이미 처리된 결제예요」. **고치기 전 코드로 돌리면 실패**(결함 재현) | 코드 PASS |
| R-02 (P0) | 잔액이 줄면 살 수 있는 첫 상품으로 바뀜 → 새 키 | 같은 키 저장소 + 결과를 모르는 상품 줄을 그대로 선택 (`TradeAdQuickSheet.tsx`) | 키 저장소 동작 시험 | 코드 PASS · 화면 시험 NOT_PROVEN |
| R-04 (P0 재판정) | 가격 비교가 키 확인보다 먼저 → 409 → 키 버림 → 새 결제 | 같은 키 재전송은 가격 비교 전에 처음 결과를 돌려줌(주문 키·연장 원장 키, 본인만) (`lib/promotion/promotion-purchase-replay.ts`, 결제 라우트) | 라우트 시험 3건(가격 바뀐 재전송 = 결제 함수 호출 0 · 연장 재전송 · 남의 키는 재전송 아님) | 코드 PASS |
| 금전 (DB) | — | — | **운영 DB 롤백 시험**(저장 0): 커뮤니티 — 같은 키 2번 = 차감 1 · 같은 키로 상품을 바꿔도 추가 차감 0 · 결제 1,000 + 연장 1,000 = 2,000 · 주문 1 · 연장 원장 1. 거래(v2) — 500 + 500 = 1,000 · 같은 키 재전송 0. 키 저장 위치 = 재전송 확인이 읽는 곳 | DB PASS |
| R-03 | 커뮤니티 결제 응답이 `idempotent` 를 버림 | 전달 (`apply-community-paid-exposure.ts`, 결제 라우트) | 라우트 시험 | 코드 PASS |
| N-02·N-03 | 공통 화면 거래 재개·정지가 사유 없는 확인창(L1) | 사유 필수(L2) (`admin-mutation-confirm-copy.ts`) · 서버는 이미 사유를 DB 로 넘김 | 함수 시험 · 운영 함수 `reason_required` 확인 | 코드 PASS |
| R-08 | 메뉴가 팝업 신청을 빼는 화면을 가리킴 | 메뉴 = 「전체 광고」 팝업 종류 `/admin/advertising?family=popup&domain=delivery` (신청 목록 정본과 같은 화면) · 광고 승인의 빈 「팝업」 탭 제거 | 운영 함수 조회: 이 경로 7건(사장님 신청 4건 포함 · 이전 0) · 메뉴 계약 시험(별칭 = 정본 메뉴 경로) | 코드·DB PASS |
| N-04 | 허브 피드 정지·재개·종료에 감사 없음 | 도메인 화면과 같은 감사 3종 (`advertising-workspace/action/route.ts`) | 라우트 시험 4건(성공 = 감사 1행 · 실패 = 감사 없음) | 코드 PASS |
| F-01 | 키 재료가 앱이 보낸 세션·자리 | 보는 사람 = 회원 id / 접속 IP 해시(원문 저장 안 함) · 자리 0 · 클릭 전 노출 기록 (`app/api/feed-ads/events/route.ts`, `lib/ads/feed-ad-viewer-key.ts`) · DB 함수 변경 없음 | 라우트 시험 3건 | 코드 PASS |
| F-05 | 이벤트 배너 끄기 = paused(자리 점유) | 끄기 = ended · 다시 켜면 같은 캠페인 active(트리거가 자리 검사) (`save-event-distribution.ts`) | 기존 흉내 DB 시험 갱신(끔 → ended → 켬 → 같은 id) | 코드 PASS |
| Owner 1 | 회원 연장이 무조건 active | 캠페인 paused(관리자 정지)·ended(관리자 종료)면 409 · 마이 화면 연장 버튼 숨김 · 기간이 끝난 active 는 연장 (`feed-ad-member-presentation.ts`, `renew-feed-ad-campaign.ts`, 회원 목록 API, 마이 화면). 회원에게는 피드 광고 정지 기능이 없어 paused = 관리자 정지(코드 확인) | 흉내 DB 시험 3건(차감 0 · 캠페인 그대로 · 기간 끝난 광고는 연장) | 코드 PASS |
| Owner 2 | PTR 숨김 버전 = 휴대폰 띠만 | 띠 3종 id 를 이은 값 (`ptr-reveal-payload.ts`, `load-popup-candidates.ts`, `ptr-reveal-client.ts`). 팝업은 소재(이미지) 행 = 교체 시 새 행·다시 검토 → 승인 버전이라 그대로 · 제목·본문·CTA 는 캠페인 칸이라 바꿔도 풀리지 않음(코드 확인) | 함수 시험 | 코드 PASS |
| Owner 4 | S-3 준비 5초 제한 = 시작 화면 해제를 넘기는 안전 타이머 | 제거 (S-3 이전 코드로 되돌림 · `prepare-deadline.ts` 삭제) | 인트로 시험 41건 | 코드 PASS |
| Owner 3 | — | **적정값을 제시할 측정 근거가 없다**: 준비 단계 시간을 남기는 기록이 코드·운영 DB 어디에도 없다(조회 확인). 준비 단계는 네트워크를 쓰지 않는다 — ① 네이티브 플러그인 2회(푸시 경로·시작 주소) ② 기기 종류(대상 지정 시) ③ 캐시 저장소 읽기 ④ 이미지 디코드. 끝나지 않을 수 있는 것은 ①②의 네이티브 응답뿐(③④는 성공·실패로 끝남). 실패 복구: 백그라운드·오류는 I-4 경로가 해제 권한을 넘김 · 자산 없음·디코드 실패는 즉시 커뮤니티로 | 실기 프롬프트 v3 H-4 에서 기기별 `preparing → showing` 시간을 5회씩 잰다 → 그 값으로 ①② 네이티브 호출에만 둘 개별 시간 제한(앱 진입을 막지 않는 것)을 제안한다 | NOT_PROVEN (측정 대기) |
| F-04 (금전 재판정 P1) | 차감 후 재시도에서 자리 없음 → 환급 없음 | 실제 빠진 금액(원장)을 1회 환급 (`renew-feed-ad-campaign.ts`) | 흉내 DB 시험(환급 15,000 · 같은 환급 id) | 코드 PASS |
| D-01 (내 회귀) | 점 묶음 줄 전체가 누름을 받음 | 줄은 누름 없음, 점만 받음 (`StoresHomeHeroBanner.tsx`) | 계약 시험 | 코드 PASS · 실기 NOT_PROVEN |

- **검증**: typecheck 2종 PASS · eslint 오류 0 · verify 8종 PASS · 전체 vitest 실패 = 기존 7개 파일 32건(이번 변경과 무관). main rebase 뒤 겹친 2파일 관련 시험 재실행 PASS. `app/api/my/__tests__/r5-trade-list-routes.test.ts` 2건 실패는 main(`8360a176f` 다른 세션 거래 작업)에서도 같아 이번 변경과 무관(보고만).
- **운영 DB**: 변경 없음(롤백 시험만 · 시험 행 남음 0 · 대상 회원 잔액 그대로).
- **Production · 실기**: NOT_PROVEN — 실기 프롬프트 v3 `cursor-prompt-ads-full-device-verify-v3-2026-11-04.md` (Android USB 실기기 · iOS 시뮬레이터 · 기기 한계 별도 보고).
- **P2 재판정**: 금전이 걸린 F-04·R-04 는 P1·P0 로 올려 이번에 고쳤다. 남은 금전 관련 P2 는 모두 잠복(지금 운영에서 일어나지 않음)이다 — R-07(승인형 상품 0개) · R-09(커뮤니티 결제 순간 가격 잠금 없음 · 화면에 보인 가격으로 결제되므로 손실 아님) · R-12(승인형 상품 0개) · P-05(사장님 판매 꺼짐) · F-03(포인트는 이미 돌려받음 · 신청이 「검토 중」에 남는 상태 문제). 나머지 P2 는 §1-3 ~ 1-7 그대로 후속 처리. 만료 처리 결함 R-06 · UI 회귀 D-01(고침)도 목록에 남긴다.
