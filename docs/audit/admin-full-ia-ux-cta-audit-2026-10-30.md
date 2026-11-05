# DIBAY ADMIN — 전체 메뉴·운영 기능·UI/UX/CTA 감사 및 재설계안

**상태:** 감사·설계 완료 · **Owner 승인 대기** — 코드·메뉴·DB·커밋·배포 변경 없음
**기준:** Production `origin/main` @ `12dc25b60` (2026-10-30 02:09 PHT) 소스 스냅샷 + 운영 관리자 화면 읽기 전용 확인 (samarket.vercel.app, 2026-10-30 02:20 PHT 전후)
**주의:** 작업 체크아웃(`feature/messenger-bundle7-wave-abc`)은 main 보다 438 커밋 뒤라 사용하지 않음. 모든 경로는 main 기준.
**재사용(반복 분석 금지):** `docs/admin/dibay-super-app-admin-integrated-design.md`(v4, 127건·174 대응표·3층 구조), CUT J/G/C/F, `dibay-admin-ia-owner-approved-amendment.md`(M1~M5·J-AMD). 기존 PASS 는 재사용하지 않고 현재 코드·화면으로 다시 판정함.
**판정:** PASS(코드+운영화면 확인) · CODE_PASS(코드만) · FAIL · PARTIAL · NOT_PROVEN

---

## 요약

| 항목 | 값 |
|---|---|
| 상단 워크스페이스 | 12 (CUT J 고정 순서) |
| 메뉴 leaf | 178 + redirect 전용 3 / admin page 316 |
| 메뉴에서 닿지 않는 실동작 화면 | 11 (+ 정상 레거시 redirect 16) |
| 이번 감사 확인 결함 | **43건** — P0 0 · **P1 18** · P2 25 (UX-06 은 승인 정책이라 제외) → 보완 문서에서 UX-09 철회·신규 추가 반영: `admin-full-ia-ux-cta-audit-2026-10-30-supplement.md` |
| Owner 첨부 화면 결함 | 헤더 탭 잘림(UX-01) · 「더보기」 미표시(UX-02) · 사이드바 위계 역전(UX-04) — **원인 코드로 확정, 운영 화면 수치 측정 완료** |
| 「배너 수정·삭제 안 됨」 | 원인 확정 — ① 광고·배너 워크스페이스에 배너 메뉴 없음 ② 프로모션 배너 목록은 읽기 전용 ③ 마이페이지 배너 삭제 기능 미구현 ④ `/admin/banners` 가 엉뚱한 화면으로 redirect |

**결론:** v4 설계의 3층 구조(전체 관제 / 도메인 운영 / 공통 관리)와 대부분의 공통 원장은 이미 코드에 있다 (신고 RPC·포인트 단일 RPC·고객문의 `support_cases`·수수료 트리거). 지금 운영자가 겪는 문제는 **(1) 헤더·사이드바가 12개 워크스페이스를 담지 못하는 셸 결함, (2) 배너가 3개 워크스페이스·4개 구현으로 흩어진 IA 결함, (3) 같은 원장을 도메인 입구마다 다른 권한으로 여는 권한 결함** 세 가지다. 새 시스템이 아니라 셸 수정 + 진입점 정리 + 권한 정합으로 해결한다. DB 변경은 1건(제재 기록 통합 조회)만 선택 사항으로 남는다.

---

## A. 현재 관리자 전체 구조 (Production 메뉴 트리)

> 표기: `라벨 — URL` · `[숨김]` = `sidebarPublic:false` · `[M]` = master 전용

**상단 12 워크스페이스:** 운영 홈 · 회원·권한 · 배달·매장 · 거래 · 커뮤니티 · 채팅 · 결제·정산 · 광고·배너 · 플랫폼 운영 · 고객지원 · 알림 · 시스템

1. **운영 홈** — `/admin`
2. **회원·권한** — 회원관리 `/admin/users` · 전화 인증 `/users/phone-verification` · 탈퇴 요청 `/users/deletion-requests` · 전체 신고 현황 `/reports` · 제재 기록 `/reports/log` · 관리자 작업 기록 `/audit-logs` · 관리자 계정 `/staff` [M]
3. **배달·매장**
   - 배달 대시보드 `/admin/delivery`
   - 매장: 입점 심사 `/stores` · 매장 운영 `/business` · 메뉴·상품 검수 `/store-products` · 매장 문의 `/store-inquiries` · 매장 신고 `/store-reports` · 매장 리뷰 `/store-reviews`
   - 주문: 주문 목록 `/stores/orders` · 주문 액션 `/store-orders` · 취소 요청 · 환불 요청 · 감사 로그 · 주문 채팅 `/order-chats`
   - 배달 현장: 운영 콘솔 `/ops-console` · 운영 통계 `/delivery-operations` · 라이더 · 운영 알림 · 자동 액션
   - 수수료·정산: 수수료 정책 · 정산 `/store-settlements`
   - 혜택·프로모션: 쿠폰 운영 센터 · 상품권 · 기획 프로모션 `/store-discovery`
   - 화면 구성: 배달 화면 구성 `/delivery-screens` · (HOME 구성·업종·BROWSE 정책 [숨김]) · 하단 메뉴
   - 기록: 결제 이벤트 `/store-payment-events`
   - 배달 설정: 거리 정책 · 알림 · 커머스 수치
4. **거래** — 거래 통합 `/admin/trade` · 신고·제재(상품 신고·이용 제한·이의 신청) · 콘텐츠(게시물·거래후기·쇼케이스) · 거래 채팅(거래채팅 → *채팅으로 redirect*·거래흐름·채팅 신고) · 회원 · 홍보(거래 홍보·거래 광고 정책) · 포인트(포인트·충전) · 문의 · 설정(주제·거래 설정·지역) · 기록(감사 로그)
5. **커뮤니티** — 운영 홈 · 신고/관리(일반·모임 신고·이용 제한·이의) · 콘텐츠(게시글·댓글·모임) · 회원 · 홍보 · 포인트(포인트·충전·정책) · 문의 · 콘텐츠 운영(카테고리·피드 섹션·외부 글·공지) · 설정(감사·모임 로그·통계·운영 설정)
6. **채팅** — 대시보드 `/admin/messenger` · 신고 큐 · 통화 기록 · 채팅방(전체·거래·주문·1:1·그룹) · 시스템(메신저 성능·채팅 가이드)
7. **결제·정산** — 재무 관제 `/admin/finance` · 회원 포인트(충전·내역·충전 상품·적립 정책·지급 시험·소멸) · 「재무 관제」(전체 거래·매장별·주문별 정산·COIN 보관함·Cash·수수료/미납·광고 지출·출금·재무 설정)
8. **광고·배너** — 전체 광고 `/admin/advertising` · 상위노출 · 광고 승인 · 노출 관리 · 노출 위치 현황 · 광고 상품/가격 · 광고 이력 · (광고 이력 legacy 13개 [숨김])
9. **플랫폼 운영** — 운영 홈 `/platform-promotion` · 이벤트 · 팝업 · 당겨서 새로고침 광고 `/ptr-reveal-ads` · 프로모션 배너 · 사장님 이벤트 신청 · 앱 화면 구성(OS 시작·인트로·앱 첫 진입·메뉴 관리·마이페이지 배너/섹션/서비스) · 추천(6) · 공통 콘텐츠(공지·FAQ[숨김]·약관·사업자 정보)
10. **고객지원** — 고객지원 관제 `/support` · 이전 문의 기록 · 관리자 알림함 `/inbox` · 액션 큐 `/order-notifications`
11. **알림** — 푸시·알림 발송 `/notifications` · 알림 설정 · 푸시 디바이스
12. **시스템** — 시스템 개요 · 모니터링 · 시스템 상태[M] · 런타임 상태[M] · 릴리즈 게이트[M] · 배포[M] · 설정관리 · 로그인 설정 · 긴급 조치[M] · 데이터 초기화[M] · 운영 가이드 · (국가·언어·앱 메타 [숨김]) · 내부 도구[M] 24개

**메뉴 밖 실동작 화면 (11):** `/admin/banners/[id]`(배너 상세·토글·미리보기) · `/admin/member-benefits`·`[id]`(회원 혜택 — **고객 앱에 반영됨**) · `/admin/home-feed` · `/admin/personalized-feed` · `/admin/exposure-policies` · `/admin/boards` · `/admin/feed-ad-requests/[id]` · `/admin/finance/conversions` · `/admin/users/ops-history`(빈 안내) · `/admin/philife`(별칭) · `/admin/store-insertions`(조건부 redirect). 이 중 4개의 유일한 진입 링크인 `AdminQuickLinks` 는 어디서도 렌더되지 않는다.

---

## B. 기능 구현 현황 (영역별 요약)

전 화면 316개를 행 단위로 나열하는 대신, v4 부록 A(174 대응표)를 기준선으로 두고 **이번에 판정이 바뀌었거나 새로 확인한 것**만 적는다.

| 영역 | UI | API·가드 | 권위 원장 | 감사 | 판정 | 비고 |
|---|---|---|---|---|---|---|
| 셸(헤더·사이드바) | 있음 | – | – | – | **FAIL** | UX-01~05 (운영 화면 측정) |
| 회원 계정 | ✔ | `users` 키 | `profiles` | ✔ | CODE_PASS | 거래 회원 경로로 제재 우회 MB-01 |
| 도메인 회원(거래·커뮤니티) | ✔ 조회 전용 | RPC `admin_trade_members`·`admin_community_members` | `profiles` 뷰 | – | CODE_PASS | 계정 원본과 분리 양호 |
| 신고(중앙) | ✔ | `reports` 키 + 도메인 RPC | `reports` ∪ `community_reports` | RPC 내 | PARTIAL | 4개 원장 누락 RS-02 |
| 신고(거래·커뮤니티) | ✔ | RPC FOR UPDATE | 같은 원장 | ✔ | CODE_PASS | 중앙과 양방향 반영 |
| 신고(채팅) | ✔ | 직접 UPDATE | `reports` 공유 | ✔ | **FAIL** | RS-01 |
| 신고(매장·모임) | ✔ | `business`/moderation | 별도 원장 | ✔ | PARTIAL | 중앙 미표시 |
| 기능 제한·제재 | ✔ | 도메인 RPC | `sanctions`·`user_moderation_events` | ✔ | PARTIAL | 제재 기록 화면에 미포함 |
| 고객문의 | ✔ 3입구 | `isRouteAdmin` 만 | `support_cases` 단일 | ✔ | PARTIAL | 권한 키 없음 RS-04, 메신저 유형 없음 RS-05 |
| 매장 문의 | ✔ 조회 | `isRouteAdmin` | `store_inquiries` | – | CODE_PASS | 사장님 답변 구조 |
| 회원 포인트 충전 | ✔ 3입구 | 중앙 `point` / 거래 전원 | `point_charge_requests` | ✔ | PARTIAL | 이중 적립은 유니크 인덱스로 차단, 권한 우회 FN-01 |
| 포인트 조정·지급·소멸 | ✔ | 단일 RPC·멱등 / super | `point_ledger` | ✔ | CODE_PASS | v4 P-15·16·17 해소 확인 |
| 매장 수수료·정산 | ✔ 조회 | 조정 `requireSuperAdmin` | `store_commission_ledger`(트리거) | ✔ | CODE_PASS | SSOT 일치, 건별 정산 410 |
| 환불 | ✔ | `business` + expected_status | store orders | ✔ | CODE_PASS | |
| 광고(배달) | ✔ | 쓰기 `business` | 배달 배너 캠페인 | route 0 | PARTIAL | 메뉴 전원 노출 vs 쓰기 403 AD-06 |
| 배너 4종 | 흩어짐 | 각각 | 각각 | 대부분 ✔ | **FAIL** | §G |
| 팝업·PTR | ✔ | `requireAdminApiUser` | `platform_popup_*` | ✔ | CODE_PASS | 초안만 hard delete |
| Intro / OS Start / 첫 진입 | ✔ | 전원 | 각 config | ✔ | CODE_PASS | OS Start 는 네이티브 빌드 시점 반영 |
| 푸시 발송 | ✔ | `requireAdminApiUser` | campaigns | send 만 | **FAIL(권한)** | IA-01 |

운영 화면 확인(읽기 전용): `/admin/store-reviews` · `/admin/platform-promotion/banners` · `/admin/my/banners` · `/admin/banners`(→ `/admin/delivery-ads/manage`) — 로드 PASS. 나머지 화면의 운영 렌더는 NOT_PROVEN.

---

## C. 확인된 결함 (43건)

### C-1. 셸 UI/UX (Owner 첨부 화면)

| ID | 등급 | 내용 | 근거 | 원인 |
|---|---|---|---|---|
| **UX-01** | **P1** | 상단 워크스페이스 탭이 잘려 **접근 불가**. 운영 측정: 1600px → 12개 중 3개(고객지원·알림·시스템) 가려짐 · 1280px → **8개 가려짐**(탭 영역 187px) · 1024px → 탭 영역 **0px** · 1920px 에서만 전부 보임 | `components/admin/shell/AdminPlatformShell.tsx:225-256`, `AdminWorkspaceNav.tsx:31-60` | 브랜드·탭·도구가 한 줄. 오른쪽 도구 묶음이 `shrink-0` 으로 **951px** 고정(검색·시계·사이드바 토글·언어·테스트 전환·홈페이지·알림함·벨·계정) → 탭이 남는 폭만 받음. 탭 줄은 스크롤바 숨김 가로 스크롤이라 가려진 탭이 보이지 않음 |
| **UX-02** | **P1** | 「더보기」 버튼이 1280px 이상에서 숨겨짐 → 1280~1919px 에서 가려진 탭으로 갈 방법 없음 (Owner 화면 1600px 이 정확히 이 구간) | `AdminWorkspaceNav.tsx:63` `xl:hidden` | 넘침 여부를 실제 폭이 아니라 화면 폭 구간으로 가정 |
| UX-03 | P1 | 1024px 에서 헤더 오른쪽 끝(계정 이름)이 잘리고 검색창이 브랜드와 겹침 | 운영 스크린샷 1024×768 | 도구 묶음 951px + 브랜드 > 1024px, 상위 `overflow-hidden` 으로 잘림 |
| **UX-04** | P1 | 사이드바 위계 역전: 섹션 제목(「매장」「주문」) **11px** 이 하위 메뉴 **13px** 보다 작고, ▲▼ 표시가 제목보다 큼. 하위 메뉴 들여쓰기 없음 → 그룹과 항목 구분 불가 | `app/samarket-components.css:1284-1291`, `AdminSidebarGroup.tsx:40-58` (`depth={0}`) | 「크기를 줄여 위계 구분」 주석과 반대로 동작 |
| UX-05 | P2 | 섹션이 접히면 펼침 상태가 기억되지 않고, 다른 화면 이동 시 활성 섹션 외 모두 닫힘 → 메뉴를 매번 다시 펼쳐야 함 | `AdminSidebarGroup.tsx:29-33` | 로컬 state 만 사용 |
| UX-06 | P2 | 가로 1024px 미만이면 전체 차단 화면 (첨부 2). 노트북 반분할 창(약 720px)에서도 차단 | `AdminLandscapeGuard.tsx:19` | CUT G 승인 정책 — **결함 아님, 의도된 동작**. 기준 폭 변경은 Owner 결정 사항(J-3) |
| UX-07 | P2 | 매장 리뷰 화면: 검색·필터·정렬 없음, 카드 1건이 약 230px 높이(한 화면 4건), 「숨김」이 버튼이 아닌 텍스트 링크, 「기술 정보」 펼침이 운영자 화면에 노출 | 운영 화면 `/admin/store-reviews` | 목록 표준(표·필터·밀도) 미적용 |
| UX-08 | P2 | 배달 광고 관리: 「종료」 지면인 광고 3건이 「승인 대기·검토 필요」로 처리 대기 목록에 남음 (상태 표시 모순) | 운영 화면 `/admin/delivery-ads/manage` | 종료 광고가 처리 필요 큐에서 제외되지 않음 (원인 코드 미추적 — NOT_PROVEN) |
| ~~UX-09~~ | **철회** | (정정 2026-10-30 보완) 화면의 「중지」는 버튼이 아니라 **상태 배지**였다. 운영 DB 7건 모두 `disabled` 이고 배지(`promotion-operation-status.ts:29`)가 맞게 표시되며, 중지 버튼은 `canDirectPause` 일 때만 나온다(`AdminPromotionBannerListClient.tsx:243`). 코드 결함 아님. 남는 것은 운영 목록에 `QA-*` 테스트 데이터 7건이 보이는 데이터 정리 문제뿐 | 운영 화면 + 운영 DB | — |

### C-2. 광고·배너·팝업

| ID | 등급 | 내용 | 근거 |
|---|---|---|---|
| **AD-01** | P1 | 마이페이지 배너 **삭제 기능 미구현** (UI·API·DB 함수 모두 없음). 숨김은 수정 화면의 상태 선택으로만 가능 | `app/api/admin/banners/[id]/route.ts` GET·PATCH 만 · `lib/admin-banners/admin-banners-db.ts` · `AdminMyBannersPage.tsx:113-124` |
| **AD-02** | P1 | 「광고·배너」 워크스페이스에 **배너 메뉴가 0개**. 배너는 「플랫폼 운영」(프로모션 배너)과 「앱 화면 구성」(마이페이지 배너)에 흩어짐 | `admin-menu.ts:1229-1360` vs `:1399`·`:1440` |
| **AD-03** | P1 | `/admin/banners` 가 숨김 배달 광고 관리로 redirect. 배너 상세 `/admin/banners/[id]` 의 「목록으로」도 같은 엉뚱한 화면으로 이동 | `app/admin/banners/page.tsx:9`, `AdminBannerDetailPage.tsx:83` |
| **AD-04** | P1 | 프로모션 배너 목록은 **설계상 읽기 전용** — 수정·삭제 버튼 없음, 「노출 설정」 링크로 이벤트 편집 화면에 가야 수정 가능. 삭제 API 없음 | `AdminPromotionBannerListClient.tsx:206,301-345`, `api/admin/platform-promotion/banners/route.ts:18` |
| **AD-05** | P1 | 마이페이지 배너의 **노출 기간이 고객 화면에 적용되지 않음** — 고객 리더가 `is_active` 만 확인, `start_at`·`end_at`·`status` 무시 | `lib/my/load-mypage-cms-pack.ts:45-58`, `lib/mypage/mypage-summary.server.ts:82-87` |
| AD-06 | P1 | 배달 광고 쓰기는 `business` 권한 필요, 메뉴는 전원 노출 → 권한 없는 운영자는 목록은 보이지만 수정·중지 시 403 | `delivery-ads/[campaignId]/route.ts:66`, `actions/route.ts:25` |
| AD-07 | P2 | 배너 폼이 UTC 값을 그대로 datetime-local 에 표시 → PHT 기준 8시간 어긋남 | `AdminBannerForm.tsx:151-172` |
| AD-08 | P2 | 마이페이지 배너 이미지는 URL 직접 입력만 가능(업로드 없음), 미리보기는 메뉴 밖 상세 화면에만 있음 | `AdminBannerForm.tsx:96-101` |
| AD-09 | P2 | 프로모션 배너 「중지」가 이벤트의 팝업·푸시·알림 배포 설정 전체를 다시 저장 → 팝업 캠페인이 함께 재기록되는 부작용 | `AdminPromotionBannerListClient.tsx:89-107`, `save-event-distribution.ts:113-151` |
| AD-10 | P2 | 직접 등록한 피드 배너의 소재·기간 수정 API 없음 (종료 후 재등록만 가능) | `app/api/admin/feed-ads/route.ts` GET·POST 만 |
| AD-11 | P2 | 미사용 고아 컴포넌트 잔존 (410 API 호출 코드 포함): `AdminStoreBannerAd*`, `AdminBannerListPage`·`Table`, `AdminFeedAdsListPage` | `components/admin/stores/*`, `components/admin/banners/*` |
| AD-12 | P2 | route 단계 감사 기록 없음: 배달 광고 PATCH·actions, 알림 캠페인 생성·수정·취소 (lib 내부 감사는 NOT_PROVEN) | 각 route |

### C-3. 신고·고객센터·회원·재무

| ID | 등급 | 내용 | 근거 |
|---|---|---|---|
| **RS-01** | P1 | 채팅 신고 화면이 거래 신고(`reports`)를 공식 처리 RPC 를 거치지 않고 직접 UPDATE → 상태값 불일치(`resolved` vs `sanctioned`), `report_actions`·처리자 미기록, 같은 대상 신고 일괄 종료 누락, 제재 기록에 안 남음 | `app/api/admin/chat/report-queue/action/route.ts:28-31,85-101` vs RPC `admin_decide_trade_report` |
| **RS-02** | P1 | 「전체 신고 현황」이 원장 6종 중 2종만 표시(매장·모임·메신저·채팅 신고 누락). 「제재 기록」이 `report_actions` 만 표시(기능 제한 `sanctions`·계정 정지 `user_moderation_events` 누락) — v4 U-4 미해소 | `admin-reports-unified-page.server.ts:59`, `reports/sanction-ledger/route.ts:68` |
| RS-03 | P2 | 전체 신고 화면 안내 문구 「표시만, 처리는 도메인에서」와 달리 실제로는 중앙에서 처리 가능. 거래 「필터 해제」 링크가 redirect 를 거치며 조건 소실 | `AdminReportListPage.tsx:137,191,215`, `app/admin/reports/page.tsx:12` |
| RS-04 | P2 | 고객문의 조회·담당 지정·종료와 매장 신고 조회에 권한 키 없음 (`isRouteAdmin` 만). 권한 키 목록에 support 키 자체가 없음 | `api/admin/support/cases/route.ts:20`, `[caseId]/route.ts:30,61`, `store-reports/route.ts:17` |
| RS-05 | P2 | 고객문의 참조 유형에 메신저(채팅방·통화) 없음 → 채팅 문의는 도메인 분류 불가 | `lib/support/support-community-filter.ts:10-13,51` |
| **MB-01** | P1 | 계정 정지·차단을 **거래 회원 화면 경로로는 `users` 권한 없이** 실행 가능 (같은 handler, 중앙은 `users` 키·거래는 전원) | `api/admin/trade/members/[id]/moderation/route.ts:13,23` |
| MB-02 | P2 | 회원 탈퇴·영구 삭제의 감사 기록을 기다리지 않음(`void`) → 기록 실패해도 삭제는 완료 | `api/admin/users/[id]/delete/route.ts:51,167` |
| **FN-01** | P1 | 포인트 충전 승인·반려와 포인트 수동 조정을 **거래 경로로는 `point` 권한 없이** 실행 가능. 커뮤니티 경로는 `point` 키 → 같은 업무가 도메인마다 권한이 다름 (이중 적립은 유니크 인덱스로 차단됨) | `api/admin/trade/point-charges/[id]/route.ts:24`, `trade/points/adjust/route.ts` |
| FN-02 | P2 | 회원 포인트 충전 3개 화면이 도메인 필터 없이 같은 목록·같은 처리 버튼 → 담당 중복 | 중앙·거래·커뮤니티 충전 화면 |
| FN-03 | P2 | 회원 혜택 정책(`/admin/member-benefits`)이 메뉴 밖에 있고 쓰기는 관리자 전원, 고객 앱 반영됨 | `api/admin/member-benefits/route.ts:37` |

### C-4. 메뉴·권한 정합

| ID | 등급 | 내용 | 근거 |
|---|---|---|---|
| **IA-01** | P1 | **활성 관리자 누구나 전체 회원에게 푸시 발송 가능** (발송 API 가드 = `requireAdminApiUser`) | `api/admin/notification-campaigns/[campaignId]/send/route.ts:44` (직접 확인) |
| **IA-02** | P1 | 메뉴 밖 실제 쓰기 화면 6개가 관리자 전원에게 열려 있음 (회원 혜택·홈 피드·개인화 피드·노출 점수 정책·배너 상세·게시판) | 각 `app/admin/*/page.tsx` + API |
| **IA-03** | P1 | 거래 › 「거래채팅」 leaf 가 redirect 전용 → 누르면 채팅 워크스페이스로 넘어가 사이드바가 바뀜. 메뉴 파일 머리말 불변식(「redirect 전용은 leaf 금지」) 위반 | `admin-menu.ts:765` vs `:14`, `app/admin/chats/trade/page.tsx` (직접 확인) |
| **IA-04** | P1 | 거래·광고 업무에 도메인 운영자 권한 범위가 없음(전원 허용). `products`·`ads` 권한 키가 사실상 쓰이지 않음 → 「도메인 독립 운영」의 권한 분리가 성립하지 않음 | `admin-route-access.ts:104,203` |
| IA-05 | P2 | 「재무 관제」 라벨이 허브와 하위 섹션에 중복, 「광고 이력」도 중복 | `admin-menu.ts:1143,1162` |
| IA-06 | P2 | master 전용 메뉴 4개(시스템 상태·런타임·릴리즈 게이트·긴급 조치)가 URL 로는 전원 조회 가능, 운영 메모는 내부도구 목록 누락 | `admin-route-access.ts:123,163-166` |
| IA-07 | P2 | `/admin/stores` 등 `business` 쓰기 화면에서 권한 없는 운영자에게도 버튼 표시 → 누르면 403 | `admin-route-access.ts:149` |
| IA-08 | P2 | 주문 채팅이 두 구현·두 데이터 소스 (`/admin/order-chats` vs `/admin/chats?type=store_order`) | |
| IA-09 | P2 | 「주문 액션」(배달)과 「액션 큐」(고객지원, 실제는 관리자 알림)의 이름 혼동 | |
| IA-10 | P2 | 숨김 legacy leaf 6개가 redirect 전용 (보이지 않지만 불변식 위반) | |
| IA-11 | P2 | 렌더되지 않는 `AdminQuickLinks` 가 메뉴 밖 화면 4개의 유일한 진입점 | `components/admin/dashboard/AdminQuickLinks.tsx` |
| IA-12 | P2 | 채팅 도메인에 설정·문의·알림·제재 화면 없음 | |
| IA-13 | P2 | mock 잔존: 주문 입금 처리 stub writer(`provider:"admin_console_stub"`), 헤더의 테스트 전환 버튼(env 게이트) | `api/admin/store-orders/[orderId]/mark-paid/route.ts:41`, `AdminPlatformShell.tsx:245` |

---

## D. 공통·도메인 교집합 분석

원칙(Owner 지시 §3): **진입점은 여러 개 허용, 원장은 하나, 권한·조회 범위는 진입점별로 구분.** 아래 「목표」 열이 그 기준으로 정리한 것이다.

| 기능 | 유형 | 권위 원장 (현재) | 중앙 진입 | 도메인 진입 | 현재 문제 | 목표 |
|---|---|---|---|---|---|---|
| 신고 처리 | C | `reports`·`community_reports`(+ 4종 별도) | 회원·권한 › 전체 신고 현황 | 각 도메인 신고 | 채팅 경로 우회(RS-01), 중앙 누락(RS-02) | 모든 쓰기는 도메인 RPC 1개로. 중앙은 6종 원장 통합 **조회** + 도메인 RPC 호출 |
| 제재 | C | `sanctions`·`user_moderation_events`·`report_actions` | 회원 상세(MCC)·제재 기록 | 거래·커뮤니티 이용 제한 | 기록 화면 3원장 중 1개만, 거래 경로 권한 우회(MB-01) | 계정 전체 정지 = `users` 키 단일. 도메인 기능 제한 = 도메인 키. 제재 기록 = 3원장 통합 조회 |
| 고객문의 | C | `support_cases` 단일 | 고객지원 관제 | 거래·커뮤니티 문의(group 필터) | 권한 키 없음, 메신저 유형 없음 | 원장 유지. `support` 권한 키 추가(코드만), 메신저 group 추가 |
| 매장 문의 | B | `store_inquiries` | – | 배달 › 매장 문의 | – | 유지 (사장님 답변 구조, 고객문의와 다른 개념) |
| 회원 계정 | A | `profiles` | 회원·권한 | 도메인 회원(조회 전용) | 양호 | 유지. 도메인 회원 화면의 계정 제재 버튼은 중앙 MCC 로 이동 링크로 |
| 회원 포인트 | C | `point_charge_requests`·`point_ledger` | 결제·정산 › 회원 포인트 | 거래·커뮤니티 포인트 | 거래 경로 권한 우회(FN-01), 필터 없음(FN-02) | 쓰기 API 하나(`point` 키). 도메인 화면 = 같은 API + 도메인 출처 필터 |
| 매장 수수료·정산 | A(+B 조회) | `store_commission_ledger`(DB 트리거) | 결제·정산 › 재무 관제 | 배달 › 수수료·정산 | 양호 | 유지 (SSOT 문서 준수) |
| 광고 | C | 도메인별 캠페인 테이블 + `/admin/advertising` 통합 뷰 | 광고·배너 | 거래 홍보·커뮤니티 홍보 / 배달은 없음 | 배달 워크스페이스에 광고 진입 없음, 권한 범위 없음(IA-04) | 광고·배너 = 전체. 도메인 = `/admin/advertising?domain=X` 진입점(필터 지원 여부 **NOT_PROVEN**, 구현 단계에서 확인) |
| 배너 | C | 4개 원장(아래 §G) | 없음 | 흩어짐 | AD-02 | 광고·배너 › 「배너」 그룹에 4종 진입점 모음, 원장은 그대로 |
| 팝업·PTR·이벤트 | A | `platform_popup_*`·`platform_events` | 플랫폼 운영 | – | 양호 | 유지 |
| 푸시 | A | notification campaigns | 알림 | – | 전원 발송(IA-01) | 발송은 권한 키 필요 |
| 알림 설정 | A/B | `admin_settings` 등 | 알림 › 알림 설정 | 배달만 별도 | 도메인 3개 없음 | 이번 범위에서 신규 화면 없음 (보고만) |
| 통계 | B | 도메인별 | 운영 홈 | 도메인 대시보드 | 지표 정의 SSOT 없음(v4 S3) | v4 R6 그대로 |

**도메인 독립 운영 현황 (✔ / 부분 / ✖)**

| 기능 | 커뮤니티 | 거래 | 배달 | 채팅 |
|---|---|---|---|---|
| 대시보드 | ✔ | ✔ | ✔ | ✔ |
| 설정 | ✔ | ✔ | ✔ | ✖ |
| 콘텐츠 | ✔ | ✔ | ✔ | ✔ |
| 신고·제재 | ✔ | ✔ | 부분 | 부분 |
| 문의 | ✔ | ✔ | ✔ | ✖ |
| 광고·홍보 | ✔ | ✔ | 부분 | 해당 없음 |
| 통계 | ✔ | 부분 | ✔ | 부분 |
| 돈 | ✔ | ✔ | ✔ | 해당 없음 |
| **운영자 권한 범위** | 부분 | **✖** | 부분 | ✔ |

도메인 비활성화 영향: 공통 원장(신고·문의·포인트)은 도메인 필터 기반이라 한 도메인을 꺼도 다른 도메인 데이터에는 영향이 없다. 단, 권한이 도메인별로 나뉘지 않아(IA-04) **운영 인력을 도메인별로 분리하는 것은 현재 불가능**하다. 실제 도메인 분리는 이번 범위가 아니다.

---

## E. 목표 관리자 메뉴 구조

**제약:** CUT J 12 워크스페이스 순서 유지 · J-AMD-2(전체 재배열) 거절 · B-X1(광고+프로모션 단일 부모) 거절 · URL 변경 0 · 삭제 0. 따라서 상단 1차는 **그대로 12개**를 두고, 셸이 12개를 모두 보여 주도록 고치고(§H), 2·3차를 정리한다. Owner 제안 후보 10개 구조로 줄이는 안은 J-AMD-2·B-X1 재승인이 필요하므로 J-1 로 따로 묻는다.

계층 규칙: **1차 = 상단 워크스페이스(운영 영역) · 2차 = 사이드바 섹션(기능 분류) · 3차 = 사이드바 항목(화면) · 본문 탭 = 같은 화면의 조회/설정/이력 · Breadcrumb = 1차 › 2차 › 3차.** 상단과 사이드바에 같은 분류를 반복하지 않는다 (사이드바 머리글은 워크스페이스 이름 1회만).

변경점만 표시 (`+` 추가 진입점 = 기존 화면 링크, `→` 이동, `✎` 개명, 나머지 현행 유지):

1. 운영 홈 — 변경 없음
2. 회원·권한 — 2차 섹션 도입: **회원**(회원관리·전화 인증·탈퇴 요청) / **신고·제재**(전체 신고 현황·제재 기록) / **관리자**(관리자 계정[M]·관리자 작업 기록) · `+` 회원 혜택 `/admin/member-benefits` (메뉴 밖 → 노출, 권한 키 부여 후)
3. 배달·매장 — `+` 혜택·프로모션 섹션에 「배달 광고」 → `/admin/advertising?domain=delivery`
4. 거래 — `✎` 「거래채팅」 leaf 를 `/admin/chats?type=trade` 를 거래 워크스페이스 안에서 여는 방식으로 교정 (IA-03, 구현은 matchPath 정리)
5. 커뮤니티 — 변경 없음 (`/admin/boards` 는 레거시 판정 후 J-6)
6. 채팅 — `+` 「채팅 문의」 → `/admin/support?group=messenger` (RS-05 이후)
7. 결제·정산 — `✎` 하위 섹션 「재무 관제」→ **「매장 재무」** (라벨 중복 해소, IA-05)
8. 광고·배너 — 2차 섹션 도입:
   - **광고 운영**: 전체 광고 · 광고 승인 · 노출 관리 · 상위노출 · 노출 위치 현황 · 광고 상품/가격 · 광고 이력
   - **배너** (`+` 진입점 모음, 원장 이동 없음): 프로모션 배너 `/admin/platform-promotion/banners` · 마이페이지 배너 `/admin/my/banners` · 배달 홈 배너 `/admin/advertising/placements` · 피드 배너 `/admin/advertising/operations`
9. 플랫폼 운영 — 2차 섹션 정리: **프로모션**(이벤트·팝업·당겨서 새로고침 광고·프로모션 배너·사장님 이벤트 신청) / **앱 화면 구성**(현행) / **추천**(현행) / **공통 콘텐츠**(현행)
10. 고객지원 — `✎` 「액션 큐」 → **「관리자 처리 알림」** (IA-09)
11. 알림 — 변경 없음 (발송 권한만 §I)
12. 시스템 — `+` 홈 피드 정책·개인화 피드·노출 점수 정책 (메뉴 밖 → 「설정관리」 하위, master 전용) 또는 비활성 (J-6)

---

## F. 기존 메뉴 → 목표 메뉴 대응표

v4 부록 A(174행)는 유효하며 **아래 행만 바뀐다.** 나머지 leaf 는 모두 「유지」(URL·위치·라벨 동일). 기능 누락 0.

| 기존 위치 | 기존 URL | 처리 | 목표 위치 |
|---|---|---|---|
| (메뉴 없음) | `/admin/my/banners` 외 배너 3종 | **중복 진입 추가** | 광고·배너 › 배너 (원래 위치도 유지) |
| 플랫폼 운영 › 프로모션 배너 | `/admin/platform-promotion/banners` | 유지 + 중복 진입 | 플랫폼 운영 › 프로모션 + 광고·배너 › 배너 |
| (메뉴 없음) | `/admin/banners` | redirect 대상 교정 | → `/admin/my/banners` |
| (메뉴 없음) | `/admin/banners/[id]` | 정리 | → `/admin/my/banners/[id]/edit` redirect (미리보기·토글은 수정 화면으로 이관) |
| (메뉴 없음, QuickLinks 만) | `/admin/member-benefits` | 노출 | 회원·권한 › 회원 |
| (메뉴 없음) | `/admin/home-feed`·`personalized-feed`·`exposure-policies` | Owner 결정 | 시스템(master) 또는 비활성 |
| (메뉴 없음) | `/admin/boards` | Owner 결정 | 커뮤니티 › 콘텐츠 운영 또는 비활성 |
| 거래 › 거래 채팅 › 거래채팅 | `/admin/chats/trade` | 수정 | 같은 위치, 거래 워크스페이스 유지 |
| 회원·권한 (평면 7개) | – | 섹션화 | 회원 / 신고·제재 / 관리자 |
| 결제·정산 › 「재무 관제」 섹션 | – | 개명 | 「매장 재무」 |
| 고객지원 › 액션 큐 | `/admin/order-notifications` | 개명 | 「관리자 처리 알림」 |
| 배달·매장 › 혜택·프로모션 | – | 진입 추가 | + 배달 광고 |
| 채팅 | – | 진입 추가 | + 채팅 문의 (RS-05 후) |

---

## G. 광고·배너·인트로·팝업 상세 구조

| 항목 | 현재 관리 위치 | 관리 URL | 고객 노출 위치 | 원장 | 등록 | 수정 | 숨김/중지 | 삭제(현행 정책) | 미리보기 | 기간·순서 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OS Start | 플랫폼 운영 › 앱 화면 구성 | `/platform-promotion/os-start` | 네이티브 시작 화면 (**빌드 시점** 반영, 런타임 리더 없음) | `os_launch_config` | – (단일 설정) | ✔ | – | 로고 제거만 | NOT_PROVEN | – | CODE_PASS · 네이티브 반영 경로 NOT_PROVEN |
| Intro | 〃 | `/platform-promotion/intro` | `LaunchIntroRoot` ← `/api/launch-intro/live` | `launch_intro_*` | ✔ 초안 | ✔ | ✔ state RPC | 초안만 실제 삭제, 게시 이력 보존 | 게시 전 초안 | 게시 단위 | CODE_PASS |
| 앱 첫 진입 | 〃 | `/settings/startup-config` | `InitialSurfaceBootstrap` | `admin_settings` | – | ✔ | – | 없음 | – | – | CODE_PASS |
| 마이페이지 배너 | 〃 | `/my/banners` | 내정보 홈 프로필 아래 1건 | `my_page_banners` | ✔ | ✔ | 상태 선택으로만 | **없음 (AD-01)** | 메뉴 밖 화면에만 | 입력은 되나 **고객에게 미적용 (AD-05)** | **FAIL** |
| 프로모션 배너 | 플랫폼 운영 | `/platform-promotion/banners` | 거래·커뮤니티 홈 HERO·INLINE | 이벤트 배포 + 피드 캠페인 | 이벤트 편집에서 | 이벤트 편집에서 | ✔ (부작용 AD-09) | 없음 (이벤트 archive) | – | 이벤트 기간 | **PARTIAL** (목록 읽기 전용 AD-04) |
| 피드 배너 | 광고·배너 › 노출 관리 | `/advertising/operations` | `FeedAdBannerCarousel` | `feed_ad_*` | ✔ `/feed-ads/new` | **없음 (AD-10)** | ✔ 중지·재개·종료 | 없음 | NOT_PROVEN | ✔ | PARTIAL |
| 배달 홈 배너 | 광고·배너 › 노출 위치·노출 관리 | `/advertising/placements`, `/delivery-ads/[id]` | 배달 홈 HERO·중간 배너 | 배달 배너 캠페인 | ✔ | ✔ (`business`) | ✔ | 초안만 실제 삭제 | 소재 화면 | ✔ 순서 변경 | CODE_PASS · 권한 표시 결함 AD-06 |
| 매장 배너(구) | 없음 | `/store-banner-ads` → redirect | – | `store_banner_ad_campaigns` | 410 | 410 | – | – | – | – | 폐기 완료 (정상) |
| 팝업 | 플랫폼 운영 › 팝업 | `/platform-popup` | `GlobalPopupHost` | `platform_popup_*` | ✔ | ✔ | ✔ 승인·중지·종료·복사 | 초안만 실제 삭제 | NOT_PROVEN | ✔ | CODE_PASS |
| 땡김광고 (당겨서 새로고침) | 플랫폼 운영 | `/ptr-reveal-ads` | `DibayPtrRevealAdLayer` ← `/api/platform-popup/ptr-reveal` (당겨서 새로고침 시 드러나는 광고) | 팝업 테이블 (`presentationType=ptr_reveal`) | ✔ | ✔ | ✔ | 초안만 | NOT_PROVEN | ✔ | CODE_PASS |
| 이벤트 | 플랫폼 운영 | `/platform-events` | 이벤트 상세·HERO | `platform_events` | ✔ | ✔ | publish/unpublish | 없음 (archive) | – | ✔ | CODE_PASS |
| 상위노출 | 광고·배너 | `/advertising/boosts` | 거래·커뮤니티 목록 | 홍보 주문 | 신청 기반 | 상태 전환 | ✔ | – | – | – | CODE_PASS · 노출 리더 NOT_PROVEN |
| 푸시 홍보 | 알림 | `/notifications` | 푸시·알림함 | campaigns | ✔ | ✔ | 취소 | 없음 | 테스트 발송 | 예약 | CODE_PASS · 권한 FAIL(IA-01) |

**배너 CRUD 추적 결론 (Owner 보고 「목록·수정·삭제 안 됨」):**
- **목록을 못 찾음** ← 광고·배너에 배너 메뉴 없음(AD-02), `/admin/banners` 가 엉뚱한 화면으로 감(AD-03)
- **수정 안 됨** ← 프로모션 배너 목록에 수정 버튼이 없음(AD-04), 피드 배너는 수정 API 자체가 없음(AD-10). 마이페이지 배너 수정은 코드상 연결됨(CODE_PASS)
- **삭제 안 됨** ← 마이페이지 배너 삭제 미구현(AD-01). 다른 배너도 실제 삭제는 「초안만」이고 나머지는 중지·보관 정책
- 실제 403·500 응답과 운영자 권한 보유 여부는 운영 로그·DB를 보지 않아 **NOT_PROVEN**. 운영 `my_page_banners` 는 0건 표시됨(화면 확인)
- 삭제 정책은 새로 정하지 않는다 — 현행 「초안만 실제 삭제, 게시 이력은 중지·보관」을 마이페이지 배너에도 같게 적용하는 안을 J-4 로 묻는다

---

## H. UI/UX/CTA 수정 설계

### H-1. 글로벌 헤더 (UX-01·02·03)
- **2단 헤더로 분리:** 1단 = 브랜드 · 빠른 조회 · 알림함 · 벨 · 계정 메뉴. 2단 = 워크스페이스 탭 전용 한 줄(전체 폭). 12개 탭 실측 폭은 806px 이므로 1024px 에서도 모두 보인다.
- **도구 정리:** 시계·언어 전환·사이드바 접기·「홈페이지」 이동을 계정 메뉴 안으로 이동 → 1단 오른쪽 도구 폭 951px → 약 450px. 테스트 전환은 운영 빌드에서 렌더 안 함(IA-13).
- **넘침 판정을 실측으로:** 「더보기」는 `xl:hidden` 이 아니라 탭 줄 실제 넘침(ResizeObserver)일 때 표시. 가려진 탭만 목록에 표시.
- 활성 탭: 현행 배경+밑줄 유지. 헤더 높이 2단 합계 약 96px, 본문 시작 위치는 기존 `--admin-shell-header-height` 동기화 그대로 사용.

### H-2. 좌측 사이드바 (UX-04·05)
- **위계 교정:** 사이드바 머리글(워크스페이스 이름) 15px bold → 섹션 제목 13px bold·밝기 70% → 항목 13px regular 에 12px 들여쓰기 + 왼쪽 가이드선. ▲▼ 는 12px 셰브론으로 축소.
- 섹션 간 구분선 1px, 섹션 사이 간격 8px. 활성 항목은 현행 금색 지시자 유지.
- 섹션 펼침 상태를 워크스페이스별로 기억 (`admin-ui-prefs` 의 기존 저장 방식 재사용).

### H-3. 본문 공통 표준 (UX-07·08·09, 전 화면 순차 적용)
- 기존 SSOT 재사용: v4 §2.8 UI/UX/CTA SSOT, `components/admin/ui`, `lib/admin/status-labels`. **새 규칙 만들지 않음.** 충돌 없음 확인.
- 목록 화면: 상단 「제목 · 설명 1줄 · 주요 CTA(등록)」 → 필터 줄(검색·상태·기간·도메인) → **표**(카드는 이미지 중심 항목만) → 페이지네이션. 행 높이 44~56px.
- 상태 배지: 진행·예정·중지·종료·초안 5종을 `status-labels` 에서만 가져옴. 기간 만료 항목은 「종료」 배지 + 처리 대기 목록에서 제외.
- CTA 등급: 주요(채움) 1개 / 보조(외곽선) / 위험(빨강 외곽선 + 확인창). 텍스트 링크는 이동에만 쓰고 동작(숨김·중지)은 버튼으로.
- 「기술 정보」 펼침은 master 에게만.
- 빈 목록·로딩·실패 3종은 기존 상태 컴포넌트 사용.
- 다크 모드 없음. 밝은 테마 토큰(`--admin-console-*`, `--sam-*`)만 사용.

### H-4. CTA 실동작 감사 결과
- 읽기 전용으로 직접 확인한 CTA: 메뉴 이동 · 워크스페이스 이동 · 목록 로드(4개 화면). 모두 동작함.
- 데이터를 바꾸는 CTA(저장·삭제·중지·승인·발송)는 실행하지 않았다. 코드 연결만 판정했다(§B·§C).
- 운영 검증 시나리오: 실기 검증은 QA 표식 데이터(`QA-*` 이벤트, 테스트 매장 「나의 오른손딸방」)로만 하고, 실제 매장·회원 데이터는 쓰지 않는다.

| 결함 유형 | 해당 ID |
|---|---|
| 기능 미구현 | AD-01, AD-10, RS-05, IA-12 |
| 권한 오류 | IA-01, IA-02, IA-04, MB-01, FN-01, RS-04, AD-06, IA-06, IA-07 |
| 잘못된 라우트 | AD-03, IA-03, IA-10 |
| 저장 불일치·부작용 | RS-01, AD-05, AD-09 |
| 표시·IA | UX-*, AD-02, AD-04, RS-02, RS-03, IA-05, IA-08, IA-09 |

---

## I. 수정 실행 계획

모든 단계는 **웹 전용**이다 (`android/**`·`ios/**`·Capacitor 무변경 → 앱 재빌드·버전 증가 없음, 반영 후 앱 재시작). 각 단계는 단독 커밋 1회, main 1회 반영(개발 프로세스 1~4). 통화·메신저 통화 코드는 건드리지 않는다.

| 단계 | 내용 | 수정 파일 (주요) | API | DB | 검증 |
|---|---|---|---|---|---|
| **1. 셸** | H-1·H-2 (UX-01~05, IA-13 테스트 전환 운영 숨김) | `components/admin/shell/AdminPlatformShell.tsx`, `AdminWorkspaceNav.tsx`, `AdminHeaderAccountMenu.tsx`, `components/admin/sidebar/AdminSidebarGroup.tsx`, `app/samarket-components.css` | 없음 | 없음 | 1024·1280·1440·1600·1920 에서 12탭 전부 도달 실측, CUT G 탐침 재실행 |
| **2. 권한 정합** | IA-01, IA-02, MB-01, FN-01, RS-04, IA-06, IA-07, AD-06 표시 | `app/api/admin/notification-campaigns/[id]/send`, `trade/members/[id]/moderation`, `trade/point-charges/[id]`, `trade/points/adjust`, `support/cases/**`, `member-benefits` 등, `lib/admin/access/admin-route-access.ts`, `lib/types/admin-staff.ts`(support 키 — 코드 상수) | 가드만 변경, 응답 계약 동일 | 없음 (권한 키는 jsonb, 스키마 무변경) | 권한별 403/200 표 테스트(vitest) · **O-2 결정 충돌 → J-2 승인 필요** |
| **3. 배너 CRUD** | AD-01(삭제 = 현행 정책 동일 적용), AD-03, AD-04(목록에 「수정」 직행 버튼·상태 배지), AD-05(고객 리더에 기간·상태 조건), AD-07, AD-08(기존 업로드 컴포넌트 재사용), AD-09(배너 채널만 저장), UX-09 | `app/api/admin/banners/[id]/route.ts`, `lib/admin-banners/admin-banners-db.ts`, `components/admin/banners/*`, `components/admin/my/AdminMyBannersPage.tsx`, `lib/my/load-mypage-cms-pack.ts`, `lib/mypage/mypage-summary.server.ts`, `AdminPromotionBannerListClient.tsx`, `app/admin/banners/page.tsx` | DELETE 추가 | 없음 (기존 컬럼 사용; 상태값 허용 범위는 구현 전 마이그레이션 파일로 확인) | 등록→수정→숨김→삭제→재조회, 고객 마이페이지 기간 반영 (운영은 QA 배너로만) |
| **4. 메뉴 재구성** | §E·§F (섹션화·배너 진입점·개명·IA-03·IA-05·IA-09·IA-10·IA-11 정리) | `components/admin/admin-menu.ts`, `lib/i18n/catalog/admin*.ts`, CUT J 상수·게이트 테스트 | 없음 | 없음 | `verify:routes`, 메뉴 key·matchPaths 계약 테스트, 모든 leaf 렌더 |
| **5. 신고 통합** | RS-01(채팅 경로를 공식 RPC 호출로), RS-02(전체 신고 6원장 조회·제재 기록 3원장 조회), RS-03, RS-05 | `app/api/admin/chat/report-queue/action/route.ts`, `lib/admin-reports/admin-reports-unified-page.server.ts`, `reports/sanction-ledger/route.ts`, `lib/support/support-community-filter.ts` | 응답 필드 추가 | **선택:** 통합 조회를 RPC 로 할 경우 `admin_reports_unified_page` 함수 교체 = 운영 DB 적용 승인 필요 (J-5). TS 조회로 하면 DB 무변경 | 같은 신고를 3화면에서 처리·재조회 일치 |
| **6. 목록 표준** | H-3 을 화면 묶음 단위 적용 (매장 리뷰·배달 광고 관리부터), UX-08 | 해당 화면 컴포넌트 | 필요 시 필터 파라미터 | 없음 | 화면별 전후 스크린샷 |
| **7. 최종 검증** | 전 워크스페이스 메뉴 왕복, 권한 표, CTA 왕복 | – | – | – | 로컬 PASS + main SHA + Production 확인(읽기 전용) |

**회귀 위험과 롤백:** 1·3·4·6 = UI·라우트 한정, 롤백은 커밋 되돌리기. 2 = 권한을 좁히므로 기존에 되던 운영자가 403 을 받을 수 있음 → 반영 전 운영 `admin_memberships` 권한 키 보유 현황을 읽기 전용으로 확인하고 Owner 에게 영향 운영자 목록 보고. 5 = 채팅 신고 결과 상태값이 `resolved`→`sanctioned` 로 바뀜 → 기존 처리 건은 그대로 두고 신규 건부터 적용.

---

## J. Owner 승인 요청 (결정이 필요한 것만)

| # | 결정 | 권장 | 근거 |
|---|---|---|---|
| **J-1** | 상단 1차 메뉴 | **12개 유지 + 2단 헤더** (CUT J 그대로). 10개로 줄이는 통합안은 J-AMD-2·B-X1 재승인이 필요해 채택하지 않음 | §E |
| **J-2** | 거래·광고 「전원 허용」(O-2) 범위 축소 | 계정 정지·포인트 승인·전체 푸시 발송은 각각 `users`·`point`·알림 권한 키 필수로 (거래 일반 업무는 O-2 유지) | MB-01, FN-01, IA-01 |
| **J-3** | 관리자 최소 화면 폭 1024px (CUT G) | 유지 | UX-06 |
| **J-4** | 마이페이지 배너 삭제 정책 | 다른 배너와 같게: 초안은 실제 삭제, 게시 이력이 있으면 「보관」(숨김) | AD-01 |
| **J-5** | 신고·제재 통합 조회 방식 | TS 조회(DB 무변경)로 먼저 구현. RPC 교체는 성능 문제가 생길 때만 | RS-02 |
| **J-6** | 메뉴 밖 화면 처리 | 회원 혜택 = 메뉴 노출. 홈 피드·개인화 피드·노출 점수 정책·게시판(boards) = 고객 앱 소비처가 확인되지 않음 → 메뉴 비노출 유지 + 쓰기 master 전용 | IA-02 |
| **J-7** | 실행 순서 | §I 1→2→3→4→5→6, 단계별 단독 반영 | |

**NOT_PROVEN (PASS 로 표기하지 않음):** 데이터 변경 CTA 의 운영 실동작 · 운영자별 권한 보유 현황 · OS Start 네이티브 반영 경로 · 상위노출 고객 노출 리더 · 배달 광고 writer 내부 감사 · 홈 피드·개인화 피드 고객 소비처 · Business Cash·Coin RPC 행 잠금 · 광고 지출 누락(v4 P-18) · 확인한 4개 외 화면의 운영 렌더 · UX-08 원인 코드 · `/admin/advertising?domain=` 필터 지원 여부.
