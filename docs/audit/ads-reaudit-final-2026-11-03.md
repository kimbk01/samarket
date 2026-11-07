# 광고 전체 재감사 — 구현 확인·오류·남은 작업 (2026-11-03 · 승인 요청)

## 확인 방법

- 처음 의뢰(인트로·도메인 배너·당겨서 새로고침·상위노출·어드민·UI/UX/CTA·SSOT)와 그 뒤 계획 문서를 다시 읽었다.
  - 계획 문서: `ads-full-audit-2026-11-03.md`, `ads-stage3-recommendations-2026-11-03.md`, `launch-intro-i4-os-release-impact-2026-11-03.md`, 거래 광고 v3 설계.
- 각 항목이 main `49e881b4a` 코드와 운영 DB(SELECT)에 실제로 들어가 있는지 영역별로 따로 확인했다.
  - 커밋 메시지와 이전 보고는 믿지 않았다.
  - 핵심 주장은 작업자가 코드를 직접 다시 열어 대조했다.
- **판정 기준**
  - 아래 DONE 은 모두 **코드 PASS** 다.
  - Production 화면과 Owner 휴대폰 실기는 전부 **NOT_PROVEN** 이다.
  - 운영에 지금 노출 중인 팝업·PTR·피드 배너·상위노출이 0건이라 운영 화면으로 재현할 수 없다.

---

## 0. 작업자 오류·누락 (먼저 보고)

| # | 무엇 | 증거 |
|---|---|---|
| E-1 | **CI 를 깨뜨렸다.** 1단계 A-1 에서 권한 검사를 바꾸고 그 API 테스트를 돌리지 않았다. 2단계 전체 테스트 실패 목록도 확인하지 않았다. 01bd5eae2 로 정정 | `reject-atomic.route.test.ts` |
| E-2 | **B-5 회귀.** 피드 배너 점의 누르는 영역(24px)이 점 간격(10px)보다 커서 **점을 누르면 옆 점이 선택된다.** 「NOT_PROVEN」으로만 보고했다 | `FeedAdBannerCarousel.tsx:342` `before:-inset-[9px]` + `gap-1` |
| E-3 | **P-5 를 잘못 감사하고 잘못 고쳤다.** `/admin/ad-applications?domain=trade` 는 `/admin/advertising/boosts` 로 이동만 하는 주소다. 「항상 빈 큐」라는 감사 내용이 틀렸고, 4단계에서 고친 두 화면 파일(`AdminAdApplicationsPage`·`AdminCommunityPromotionQueue`)은 어디에서도 쓰이지 않는다 | `app/admin/ad-applications/page.tsx:14-16` |
| E-4 | **팝업 테스트 초안을 지우면서 Storage 이미지 파일 8개를 남겼다.** 보고에 없었다 | `platform-popup-creatives/owner-requests/` 아래 0644·4717·9676·afc9·b173·b1ff·dfcd·ef55 |
| E-5 | **백업 위치를 틀리게 적었다.** 마이그레이션 주석은 백업 JSON 의 키를 가리키지만, 실제 복원문은 별도 SQL 파일에만 있다 | `20271103220000_ads_audit_popup_test_drafts.sql:2` ↔ `ads-popup-test-drafts-restore-2026-11-03.sql` |
| E-6 | **「반영」으로 보고했지만 일부만 된 항목**: I-7, B-4, B-6, A-4, A-5, 업로드·검사 오류 한국어 문구 | 아래 영역별 표 |
| E-7 | **G-6 부작용.** ×로 닫은 팝업을 앱에서만 막았는데, 서버는 여전히 그 팝업을 1위로 돌려준다. 그래서 그 영역의 **다른 팝업까지 그 실행 동안 안 뜬다** | `GlobalPopupHost.tsx:339-345`, `resolve-popup-ad.ts:258-271` |
| E-8 | **G-10 을 팝업 어드민에만 적용했다.** PTR 어드민은 아직 PC 시간 기준으로 저장하면서 화면에는 「Asia/Manila」라고 표시한다 | `AdminPtrRevealDetailWorkspace.tsx:50-55,420` |
| E-9 | **I-6 부작용.** Live 게시본의 종료일이 이미 지났으면 그 날짜가 폼에 채워져 새 게시가 막힌다 | `LaunchIntroAdminPage.tsx:475-487` |
| E-10 | **P-4 를 거래에만 적용했다.** 커뮤니티 상위노출 결제 함수의 중복 검사에는 일시정지 상태가 빠져 있다 | 운영 `purchase_member_community_promotion` `IN ('pending_review','active')` |
| E-11 | **판매자 광고 창이 일시정지 글을 「구매 가능」으로 보여 준다.** 눌러도 DB 가 거절한다 | `promotion-orders/route.ts:91-99` |
| E-12 | **R-7 의 「변경 없음」 근거를 잘못 댔다.** 근거로 든 조항은 팝업 계약 §7 이고 PTR 계약이 아니다 | `dibay-pull-to-refresh-audit-and-design.md` §4.4 |
| E-13 | **새 테스트 없이 「검증 PASS」로 보고했다.** I-3, I-5, I-6, I-7, I-8, B-4, B-5, B-6, R-1, R-2, G-5, G-9, G-12, 팝업 CTA 연타, A-1 상품 PATCH, A-2, P-4 | — |

검증 과정에서 나온 주장 중 **사실이 아닌 것**:
- 「A-2 는 커뮤니티 관리자에게 거래 권한이 따로 필요하다」 → `requireTradeAdmin` 은 모든 활성 관리자를 통과시킨다(`trade-admin-guards.ts:4`, Owner O-2). 그래서 실제로 따로 막히는 관리자는 없다.

---

## 1. 영역별 구현 확인

### 인트로

| 항목 | 판정 | 증거 (main) | 어드민 → 기기 연결 · 화면 |
|---|---|---|---|
| I-1·I-2 문서 정본 | DONE | 옛 문서 2개 `:3` 에 「대체됨」 | — |
| I-3 재게시·재개 5초 | DONE | `server.ts:391-405`, 어드민 `:765-775`, 버튼 비활성 `:1002` | 버튼이 회색이 되지만 **이유 문구가 없다** |
| I-4 시작 화면 해제 | DONE | `LaunchIntroRoot.tsx:181-192,228` | 테스트 `launch-intro-i4-exit-before-release.test.ts` |
| I-5 게시 전 검사·한국어 | PARTIAL | `:676-685`, 변환표 `:76-105` | `layout_logo_requires_logo`·`decoration_*`·`background_invalid` 등은 아직 코드 원문으로 나온다 |
| I-6 폼 = Live 값 | DONE (E-9 부작용) | `:475-487` | 첫 조회 때만 채운다 |
| I-7 게시본 20건 제한 | PARTIAL | `admin-snapshot.ts:22-29` | Live 게시본만 따로 붙였다. 20건 제한 자체는 그대로 |
| I-8 버려진 업로드 | DONE (저장 시 빠진 것만) | `server.ts:193-214` | 비공개 버킷에 이미 남은 미참조 파일 2개는 그대로 |
| I-9 CTA 글자 대비 | DONE | `LaunchIntroSceneView.tsx:31-42,361` | 테스트 있음 |
| 업로드 오류 한국어 | PARTIAL | `:90-99,663` | `empty`·`extension_mismatch`·`storage_*` 등은 아직 원문 |
| 운영 규칙(자체 화면만) | DONE | `admin-launch-intro.ts:12` | — |

- 어드민 → API(`settings` 권한) → `server.ts` → DB 함수·테이블 → 기기: 연결과 필드(`frequency·target·startAt·endAt`)가 모두 일치한다.
- 운영 상태: Live 없음(unpublished), 게시본 12건 중 11건이 5초 초과.

### 전역 팝업

| 항목 | 판정 | 증거 |
|---|---|---|
| G-1·G-2 정본 | DONE (문서) | lock 문서 2개에 대체 표시 |
| G-3 「전체」 = 4곳 | DONE | `surfaces.ts:22-24`, `types.ts` |
| G-4 순위 | DONE | `popup-rotation.ts:26-34` |
| G-5 효과 없는 칸 | DONE | 숨김 + 빈도 안내 |
| G-6 재노출 | DONE + **E-7** | `popup-app-session.ts:38-78` |
| G-7 대상 존재 확인 | DONE | `popup-event-destination-availability.ts:125-205` |
| G-8 확인창 열림 보류 | PARTIAL | `DibayOverlayRoot` 만 등록된다. 이 컴포넌트를 쓰지 않는 `fixed inset-0` 화면 36개는 보류 대상에서 빠진다(겹침 여부 NOT_PROVEN) |
| G-9 「오늘」 시간대 | DONE | `suppress/route.ts:60-68` |
| G-10 입력 시간대 | PARTIAL (**E-8**) | 팝업만 적용 |
| G-11 모서리 | 의도적으로 토큰만 정리 | 16px 그대로 |
| G-12 「광고」 표기 | DONE (코드) | `PopupCreativeMedia.tsx` 배지. 실제 모양은 NOT_PROVEN |
| G-13 기간 지난 일시정지 | DONE | `promotion-operation-status.ts` |
| CTA 순서·연타 | DONE + 결함 | 이동에 실패하면 팝업이 남은 채 CTA 를 다시 누를 수 없다(`:459-462,501`) |
| (범위 밖) CAMPAIGN 숨김 | 기존 결함 | `campaignRevision` 을 보내지 않아, 소재를 바꿔도 계속 숨겨진다 |

- 어드민 저장값(빈도·영역·시간대·기간·CTA)이 런타임이 읽는 값과 일치한다.

### 당겨서 새로고침(PTR) 띠

| 항목 | 판정 | 증거 |
|---|---|---|
| R-1 연타 | DONE | `DibayPtrRevealAdLayer.tsx:176` |
| R-2 이동·기록 순서 | DONE | `:183-216` (외부 주소는 인앱 브라우저) |
| R-4 오염 기록 | DONE (DB) | surface 없는 행 0 |
| R-5 숨김 기록 경합 | DONE, 약점 있음 | 기록이 실패(500)해도 보류를 풀어 같은 광고가 다시 나올 수 있다 |
| R-6 기기 변형 | DONE | `ptr-reveal-client.ts:32-35,89,136,168-170` |
| R-7 띠 전체 탭 | 미결정 (**E-12**) | PTR 계약 §4.4 는 「명확한 CTA」만 요구한다 |
| PTR 어드민 시간대 | 결함 (**E-8**) | — |

### 배너

| 지면 | 앱 화면 | 어드민 | 등록 수용량 / 화면 표시 | 운영 노출 가능 |
|---|---|---|---|---|
| 거래 피드 | `HomeProductList.tsx:1264`, v5 2칸 줄 | `/admin/feed-ads` | 3 / 1 장씩 회전 | 0 (모두 기간 만료) |
| 커뮤니티 피드 | `CommunityFeed.tsx:2078` | 같음 | 3 / 회전 | 0 |
| 배달 홈 상단 | `StoresHomeHeroBanner.tsx` | `/admin/delivery-ads/first-party/new` | 5 / 회전 | 3 (샘플 매장) |
| 배달 홈 중간 | `StoresHomeBeforeRestBanner.tsx:78` | 같음 | 3 / 1 | 1 |
| 업종 상단 | `StoresBrowseTopBanner.tsx:68` | 같음 + 업종 정책 | 3 / **1 고정** | 8 |
| 검색 상단 | `DeliverySearchResults.tsx:113` | 판매 중지 | 1 / 1 | 0 |
| 마이 CMS | `MypageHomeCmsBanner.tsx` | `/admin/my/banners` | — | 0 |

| 항목 | 판정 | 비고 |
|---|---|---|
| B-1 3:1 | DONE (문서) | 코드 1200×400 과 일치 |
| B-2 배달 SSOT | DONE (문서) | — |
| B-3 표시 1 고정 | DONE + 남은 문제 | ① 서버가 1건만 내려준다. 그래서 그 이미지가 깨지면 예비 배너로 넘어가지 못하고 빈칸이 된다(`StoresBrowseTopBanner.tsx:97-101`). ② 어드민 「배너 용량」 통계·주석이 낡았다 |
| B-4 빈 상자 | PARTIAL | 앱 실행 후 **첫 방문은 그대로** 140px 이 깜빡인다 |
| B-5 점 | **회귀 (E-2)** | — |
| B-6 레거시 위치 | PARTIAL | 어드민 필터(`AdminBannerFilterBar.tsx:26-30`)와 타입에 남아 있다 |
| B-7 기간 지난 표시 | 피드만 확인 | — |

### 상위노출 (거래·커뮤니티)

| 항목 | 판정 | 증거·문제 |
|---|---|---|
| P-1 위쪽 2~4번째 | DONE | `select-trade-promoted-listings.ts:63-80` |
| P-2 결제 글이 빠지던 문제 | DONE | `feed-promotion-projection.ts:209-222`. 옛 주석 `:165` 이 남아 있다 |
| P-3 필터 | PARTIAL | ① 옵션 필터는 홍보 글에 걸리지 않는다. ② `/api/trade/feed` 는 카테고리에서도 home 기준값·hood 없음으로 고른다(`resolve-trade-feed-open-payload.ts:120-136`) |
| P-4 일시정지 중복 결제 | 거래 DONE / 커뮤니티 NOT (**E-10**) | — |
| P-5 | 감사 오류 (**E-3**) | — |
| P-6 「광고」 | 문서 DONE | 어드민 문구는 아직 「거래 홍보·홍보 승인」(`TradePromotionsPage.tsx:156-157`) |
| P-7 기간 지난 일시정지 | 거래 NOT | 만료 cron 은 active 만 처리한다 |
| 추가 발견 ① | 결함 | 끼운 홍보 글에 목록 안내 줄 키(`list_section`)가 없어, 안내 줄이 중복되고 격자가 어긋날 수 있다(실제 화면 NOT_PROVEN) |
| 추가 발견 ② | **Owner 결정** | 예약중인 홍보 글은 1페이지 위쪽에 끼워지지만 「광고」 칩이 없다(`PostCard.tsx:241-248`). v5 승인 디자인은 「판매완료·예약중 칩 제외」인데, 광고 표기 규정(Apple 2.5.18 · 공정위)과 충돌한다 |

### 어드민 공통·DB

| 항목 | 판정 | 비고 |
|---|---|---|
| A-1 | DONE | 상품 PATCH 라우트 테스트 없음. `/admin/feed-ad-products` 는 화면 권한(ANY)과 서버 권한(ads)이 다르다 |
| A-2 | DONE | — |
| A-3 | DONE | 한국어 화면에 테이블 이름 「member_promotion_products (DB)」가 그대로 보인다 |
| A-4 · A-5 | PARTIAL | 「Community」가 남은 곳: `project-family-rows.ts:293`, `AdminAdvertisingWorkspace.tsx:219,224`, `AdminAdsPlacementManagementView.tsx:111,499`. 지면 이름표가 남은 곳: `placement-inventory.ts`, `canonical-location-period.ts`, `shell-row.ts`. DB 오타 「플라이프」 3행(비활성) |
| A-7 | 코드 DONE | `platform_ad_products` 테이블(사용 0)은 남아 있다 |
| A-8 | 안내만 추가 | — |
| A-9 | 목록 DONE | 화면 NOT_PROVEN |
| A-10 | 변경 없음 | `post-ad-application-adapter.ts` 가 두 타입을 이어 주는 것을 확인했다 |
| 범위 밖 권한 빈틈 | 보고만 | `requireAdminApiUser` 하나로만 지키는 쓰기 API 5개: `advertising/direct-popup` · `advertising/reorder-hero-banners` · `platform-event-owner-requests/[id]/actions` · `platform-events/[id]/distribution/push/send` · `store-banner-ads` |

| DB 변경 | 결과 (운영 SELECT) |
|---|---|
| P-4 거래 결제 함수 | `IN ('active','paused')`, SECURITY DEFINER 유지 |
| 검색 상단 패키지 3 | 모두 꺼짐. 다른 배달 패키지 9개는 그대로 |
| POPUP_7D | 꺼짐 |
| PTR 오염 1건 | 0 |
| 팝업 테스트 초안 9건 | 삭제. 남은 신청: 승인·결제 3, 반려·환불 1. 끊긴 참조 0. 복원 SQL 9행×28열 확인. **Storage 파일 8개 남음 (E-4)** |

---

## 2. 상위노출 새 규칙 (Owner 11-03 지시) — 설계

시안: `docs/audit/trade-boost-new-rules-mockup-2026-11-03.html`

| 규칙 | 지금 | 바꿀 것 | 바뀌는 곳 |
|---|---|---|---|
| ① 여러 명이면 최근 결제 순 | 거래는 시간 단위 해시. 커뮤니티는 이미 `start_at DESC` | 거래도 결제 시각 최근 순 3개 | `listActiveTradePromotionTargetIds`, `selectPromotedListingIds`, 테스트 2개, 계약 §7b |
| ② 기간 중 결제하면 연장 | DB 가 거절하고 광고 창도 숨긴다 | 같은 주문의 `end_at` 에 기간을 더하고, 포인트를 차감하고, 원장을 그 주문에 연결 | DB 함수 `purchase_member_content_promotion`(거래)·`purchase_member_community_promotion`(커뮤니티), API, 광고 창 「연장하기」, 문구 |
| 환급 (②와 함께 필수) | 첫 결제 1건 기준 | 그 주문의 결제 **합계** 기준 | `admin_trade_promotion_end` · 커뮤니티 종료 환급 함수 |
| 일시정지 글 | 구매 가능처럼 보이고 DB 가 거절 | 상태를 보여 주고 버튼을 막음 | `activeForTarget` · 광고 창 |
| ③ 기간 끝나면 다시 결제 | 이미 그렇다 | 그대로 | — |

- **영향**: 결제·환급(돈), 목록 순서(1페이지), 판매자 광고 창, 어드민 주문 화면(합계 표시).
- **바꾸지 않는 것**: 가격표, 만료 cron, 판매완료 처리, 검색(배지만).
- **검증**: DB 함수 단위 테스트(연장·중복 결제 같은 요청 반복·잔액 부족·일시정지), 환급 계산 테스트, 목록 순서 테스트, 전체 테스트 실패 목록 대조. 운영에서는 테스트 계정·테스트 글 1건으로 결제→연장→운영 종료 환급을 확인한다(포인트 소액).
- **롤백**: DB 함수는 적용 전 정의를 백업한다. 코드는 커밋 1개.

---

## 3. 남은 작업 — 수정 순서 (승인 후 단계마다 main 1회 반영)

1. **R1 회귀·운영 결함**
   - E-2 배너 점 누르기
   - E-7 팝업 1위 차단 → 다른 팝업도 안 뜨는 문제: 차단 목록을 서버에 넘겨 다음 순위를 받는다
   - 팝업 CTA 이동 실패 시 잠김
   - E-11 일시정지 글 광고 창
   - E-10 커뮤니티 일시정지 중복 결제(DB)
   - 홍보 글 안내 줄 중복
   - R-5 숨김 기록 실패 시 보류 유지
   - E-8 PTR 어드민 시간대
   - E-9 Live 종료일 지난 값
2. **R2 상위노출 새 규칙** (2절 전체, DB 함수 3~4개 포함)
3. **R3 계획 누락 마무리**
   - I-3 이유 문구, I-5·업로드 오류 문구 전부, I-7 20건 제한
   - B-3 예비 배너(이미지 오류 시 다음 배너), B-4 첫 방문, B-6 필터·타입
   - A-3 테이블 이름 문구, A-4·A-5 남은 문구·이름표
   - P-3 `/api/trade/feed` 기준값·옵션 필터
   - P-6 어드민 「홍보」 문구, P-7 거래 기간 지난 일시정지
   - G-8 확인창 등록 범위
   - 옛 주석 정리, 새 테스트(E-13)
4. **R4 정리 (DB·Storage)**
   - 팝업 테스트 이미지 8개
   - 인트로 미참조 파일 2개
   - `ad_products` 오타 3행
   - `platform_ad_products` 미사용 테이블 처리
   - E-5 백업 주석 정정

**Owner 결정이 필요한 것** (R2·R3 전에)

| # | 질문 | 권장 |
|---|---|---|
| D-1 | 연장하면 목록 자리가 다시 맨 위로 가는가 | 자리 유지 (처음 결제 시각 기준) |
| D-2 | 상위노출이 4명 이상일 때 4번째부터 | 위쪽에 끼우지 않고 일반 글 자리에 「광고」 칩으로 표시(기간은 그대로 소진) |
| D-3 | 예약중인 홍보 글의 「광고」 칩 | 홍보 중이면 예약중이어도 「광고」 표시 (규정 우선) |
| D-4 | 커뮤니티 상위노출에도 같은 규칙(최신순·연장) | 같은 규칙 적용 |
| D-5 | 범위 밖 권한 빈틈 5개 API | 별도 단계로 수정 |

---

## R1 결과 (2026-11-03 · main `79b8eb3fb` · 웹 + DB)

| 항목 | 수정 | 증거 | 테스트 |
|---|---|---|---|
| E-2 배너 점 | 버튼 자체 24px, 겹침 없음 | `FeedAdBannerCarousel.tsx` 점 버튼 | `components/ads/__tests__/feed-ad-dot-hit-area.test.ts` |
| E-7 팝업 1위 차단 | 닫은·이동한 id 를 `exclude` 로 보내 서버가 다음 순위 선택 | `resolve/route.ts`, `fetch-platform-popup-resolve-client.ts`, `GlobalPopupHost.tsx` | `popup-resolve-exclude-e7.test.ts` |
| 팝업 CTA 이동 실패 잠김 | 실패 시 잠금 해제 | `GlobalPopupHost.tsx` handleCta | 같은 파일 |
| R-5 숨김 기록 실패 | 실패한 캠페인은 이번 실행 동안 보류 | `ptr-reveal-client.ts` | `ptr-reveal-client.test.ts` |
| E-8 PTR 어드민 시간대 | 캠페인 시간대 벽시계로 입력·저장 | `ptr-reveal-admin-patch.ts`, `AdminPtrRevealDetailWorkspace.tsx` | `ptr-reveal-admin-ops.test.ts` |
| E-11 일시정지 광고 창 | 「운영자가 잠시 멈춤」 표시, 구매 줄 숨김 | `promotion-orders/route.ts`, `TradeAdQuickSheet.tsx` | `reaudit-r1-contract.test.ts` |
| 홍보 글 안내 줄 | 끼운 글에 첫 칸 일반 글의 구간 키 부여 | `feed-promotion-projection.ts` | `promotion-feed-contract.test.ts` |
| E-9 인트로 지난 종료일 | 끝난 기간은 폼에 채우지 않음 | `LaunchIntroAdminPage.tsx` | `reaudit-r1-contract.test.ts` |
| E-10 커뮤니티 중복 결제 | 중복 확인에 paused 포함(운영 적용) | migration `20271103230000` · 운영 `20261103091612` | 마이그레이션 계약 테스트 |

- **정정(재감사 보고서)**: 「홍보 글 안내 줄 **중복**」은 실제로는 「구간이 홍보 글 바로 뒤에서 바뀌면 안내 줄이 **빠지는**」 문제였다. 근거: 앞 글의 키가 `undefined` 면 줄을 그리지 않는다(`shouldShowTradeListSectionDivider`).
- **E-10 적용 후 운영 확인(SELECT)**
  - 새 조건 2개 반영.
  - SECURITY DEFINER 유지, 권한 postgres·service_role.
  - 「커뮤니티 게시물 상위 노출」 문구 유지.
  - 적용 시점 커뮤니티 일시정지 주문 0건.
- **검증**: typecheck 2종 PASS, eslint 오류 0, vitest 전체 실패 7 파일·32건(작업 전과 동일), verify 4종 PASS.
- **NOT_PROVEN**: Production 화면·Owner 휴대폰 실기(운영 노출 중인 광고 0건). 팝업 다음 순위 표시, 점 누르기, 일시정지 표시를 실제 화면으로 보지 못했다.

---

## R2 결과 (2026-11-03 17:50 PHT · main 5fa7fa92e · 운영 DB 마이그레이션 20261103094000)

| 항목 | 판정 | 증거 |
|---|---|---|
| DB 연장(거래) | 코드·DB PASS | 롤백 시험: 같은 글 재결제 → `extended:true`, 끝나는 날 11-10→11-17, 주문 14일·1000P·원장 2행, 가격 버전 유지(rev 1) · 같은 요청 재전송 → 추가 차감 없음(49000 유지) |
| DB 연장(커뮤니티) | 코드·DB PASS | 롤백 시험: 3일→6일·20000P·원장 2행 · 잔액 부족 → insufficient_balance |
| 일시정지 글 재결제 막음 | 코드·DB PASS | 롤백 시험: 일시정지 뒤 → already_active_promotion |
| 운영 종료 환급 = 결제 합계 | 코드·DB PASS | 롤백 시험: 거래 paid 1000 · 커뮤니티 paid 20000 |
| 시험 데이터 남지 않음 | PASS | 적용 전 조회: 함수에 R2 표시 0 · 시험 원장·글 0건 |
| 백업 | PASS | `docs/audit/promotion-extend-backup-2026-11-03.sql` 5개 함수 md5 일치 |
| 권한 유지 | PASS | 5개 함수 SECURITY DEFINER · 실행 권한 postgres·service_role 만 |
| 목록 최근 결제 순 3개 | 코드 PASS | `listActiveTradePromotionTargetIds` start_at 내림차순 · `selectPromotedListingIds` 회전 제거 · 테스트 |
| 4번째부터 일반 자리 「광고」(D-2) | 코드 PASS | `applyTradeHomePromotionProjection` → `overlayTradePromotionBadges` · 테스트(1페이지·뒤 페이지) |
| 예약중 「광고」(D-3) | 코드 PASS | `PostCard.tsx` topLeftChip |
| 판매자 광고 창·커뮤니티 홍보 창 연장 | 코드 PASS | TradeAdQuickSheet · MemberPostPromoteSheet · API `extended` |
| 원장 「광고 연장」 라벨·어드민 결제 합계 | 코드 PASS | point-label-i18n · community-promotion-orders route |
| Production(웹) 화면 | NOT_PROVEN | 배포 결과·폰 화면 미확인 |
| 실제 결제로 연장(운영) | NOT_PROVEN | 롤백 시험만 함 |

계약 충돌 보고: 계약 §2·§7b 의 「연장 없음」「시간 단위 회전」은 Owner 2026-11-03 지시와 달라 지시대로 고쳤다(문서 갱신 포함).

---

## R3 결과 (2026-11-03 PHT · main 6e70d51c3 · 웹만)

**작업자 오류 먼저**
- E-14: 감사 P-7(「기간 지난 일시정지 = 만료 표시」)이 틀렸다. 운영 `admin_trade_promotion_resume`·`admin_promotion_resume` 은 재개 때 `end_at += 멈춘 시간` 이라 일시정지 중에는 기간이 흐르지 않는다. 그래서 만료 표시 대신 어드민에 「재개하면 멈춘 시간만큼 종료일이 뒤로 갑니다」 안내만 넣었다.
- E-15 (DB 결함, **미적용 · 승인 필요**): 거래·커뮤니티 결제 함수의 중복 검사가 일시정지 주문에도 `end_at >= now()` 를 건다(P-4·R2 때 내가 넣음). 일시정지가 원래 종료일을 넘기면 새 주문이 만들어지고, 재개하면 광고 중 주문이 2개가 된다. 지금 운영 일시정지 주문 0건이라 피해 없음. 고칠 것: `order_status = 'paused' OR end_at >= now()`.
- 작업 중 타입 오류 1건(같은 이름 변수)을 만들었다가 검증에서 잡아 고쳤다.

| 항목 | 판정 | 증거 |
|---|---|---|
| I-3 이유 문구 | 코드 PASS | `LaunchIntroAdminPage` `data-launch-intro-too-long-reason` (재게시·재개) |
| I-5 오류 문구 전부 | 코드 PASS | 서버·업로드 코드 66개 + `storage_<상태>` → 한국어 |
| I-7 게시본 더 보기 | 코드 PASS | `publicationsTotal` · `publicationsLimit` 20~200 · 세 API 같은 건수 |
| B-3 예비 배너 | 코드 PASS | `STAGE2_BROWSE_BANNER_FALLBACK_POOL`(=SSOT max 3) · 노출 기록은 보인 배너만(`useDeliveryAdImpressionObserver`) |
| B-4 첫 방문 빈칸 | 코드 PASS | 배너 수 기기 저장(localStorage, 실패 시 지금처럼) |
| B-6 레거시 위치 | 코드 PASS | `BannerPlacement = "mypage_top"` · 위치 필터 제거 (운영 행 0) |
| A-3 테이블 이름 | 코드 PASS | 한국어 가격 원본 안내 3종 |
| A-4·A-5 | 코드 PASS | 「커뮤니티」 · 지면 이름 `human-placement-label` 하나 (카드 제목·신청 위치·종류) |
| P-6 「홍보」 문구 | 코드 PASS | 거래 어드민 화면·대시보드·감사·지표 |
| P-3 품목 옵션 | 코드 PASS | `postMatchesCompositionFilterClauses` · `home-posts`·`/api/trade/feed` 둘 다 |
| G-8 팝업 겹침 | 코드 PASS | 자체 창 26곳 `useRegisterOpenOverlay` (통화 화면 5곳 제외) |
| Production 화면·폰 | NOT_PROVEN | — |

검증: typecheck:build·typecheck:test PASS, eslint 오류 0, verify 6종 PASS. 전체 테스트 실패 9개 파일 = 기존 7개(Node26 localStorage) + 관리자 래칫 2개 — 래칫 2개는 다른 세션이 main 에 올린 통화 내역 화면 파일(`components/currency/*`·`PointPeriodSummary`·`AdminUserPointsSection`) 때문이며 이번 변경 파일과 무관(보고만).

---

## E-15 결과 (2026-11-03 18:15 PHT · main 68853db96 · 운영 DB 20261103101527)

| 항목 | 판정 | 증거 |
|---|---|---|
| 거래: 일시정지 후 종료일 지난 글 재결제 | DB PASS | 롤백 시험 → `already_active_promotion`, 그 글 주문 1건 |
| 커뮤니티: 같은 경우 | DB PASS | 롤백 시험 → `already_active_promotion`, 주문 1건 |
| 광고 중 연장(R2) 유지 | DB PASS | 롤백 시험 `extended: true` |
| 만료 처리 전 active(종료일 지남) 글 새 결제 | DB PASS | 롤백 시험 새 주문 (기존 동작) |
| 시험 데이터 남지 않음 | PASS | 적용 전 함수 md5 그대로 · 시험 행 0 |
| 운영 적용 | PASS | 두 함수 E-15 표시 있음 · R2 로직 유지 · SECURITY DEFINER · 실행 권한 postgres·service_role 만 · 임시 함수 삭제 |
| 백업 | PASS | `docs/audit/promotion-paused-dup-backup-2026-11-03.sql` md5 일치 |
| 운영 실제 결제 | NOT_PROVEN | 롤백 시험만 함 · 운영 일시정지 주문 0건 |

---

## R4 결과 (2026-11-03 18:30 PHT · main 600fad9c3 · 운영 DB 20261103102622 · Storage)

**작업자 오류 먼저**
- E-16: 재감사 A-7 의 「`platform_ad_products` 사용 0」은 **코드 참조** 기준이었다. 실제 표에는 활성 상품 2행이 있었고 `store_ad_applications`(0건)가 외래키로 참조한다. 그래서 표를 지우지 않고 끄고 「미사용」 표시만 했다.
- Storage 이미지 백업을 git 에 올리려다 자동 검사(데이터 반출)에 막혔다. 우회하지 않고 백업은 작업 Mac 로컬에만 둔다.

| 항목 | 판정 | 증거 (운영 조회) |
|---|---|---|
| 팝업 테스트 초안 이미지 8개 삭제 | PASS | Storage API 200 deleted=8 · 남은 owner-requests 파일 4개 = 남은 신청 4건 참조 · 고아 0 · 파일 빠진 신청 0 |
| 인트로 미참조 초안 2개 삭제 | PASS | deleted=2 · `launch-intro-drafts` 0개 (초안·게시본 참조 0 확인 후) |
| Storage 백업 | PASS (로컬만) | `/Users/bkkim/projects/samarket/docs/audit/r4-storage-backup-2026-11-03/` 10개, 크기 = Storage 기록, manifest sha256 · git 미포함 |
| `ad_products` 오타 | PASS | 「필라이프 상단고정 3일·7일·중간삽입 5일」, 「플라이프」 0 |
| `platform_ad_products`·`store_ad_applications` | PASS | 상품 2행 꺼짐 · 두 표 「미사용」 표시 · 표·외래키 유지 |
| E-5 주석 | PASS | 20271103220000 주석 → 복원 SQL 파일 + 이미지 백업 위치 |
| DB 백업 | PASS | `docs/audit/r4-db-backup-2026-11-03.json` |

---

## D-5 결과 (2026-11-03 PHT · main 커밋 아래 · 웹만)

**작업자 오류 먼저**
- E-17: 재감사 「권한 빈틈 쓰기 API 5개」 중 2개는 틀렸다.
  - `platform-events/[id]/distribution/push/send` 는 실제 발송이 아니라 검사·감사 기록 후 `notification-campaigns/[id]/send`(manage 키)로 넘긴다. 기존 승인 설계(테스트 「이벤트 Push 실제 발송은 이 변경 대상이 아니다」)대로 바꾸지 않았다. 처음에 바꿨다가 이 충돌을 확인하고 되돌렸다.
  - `store-banner-ads` 쓰기(POST·PATCH)는 이미 410 으로 막혀 있다. 조회(GET)만 활성 관리자 전원.

| API | 바꾼 권한 | 근거 (같은 영역) | 판정 |
|---|---|---|---|
| `advertising/direct-popup` POST | ads | 플랫폼 팝업 캠페인 쓰기 = ads | 코드 PASS |
| `advertising/reorder-hero-banners` POST | business | 배달 광고 쓰기 = business (A-07) | 코드 PASS |
| `platform-event-owner-requests/[id]/actions` POST | business | 사장님 팝업 신청 심사 = business | 코드 PASS |
| 화면 버튼 | 같은 키 | 접근표 action + `useAdminRouteAction` (권한 없으면 버튼 비활성·사유) | 코드 PASS |

검증: 라우트 테스트(권한 없음 403·DB 미생성 · 권한 있음 통과), 접근표 계약 테스트, typecheck 2종·eslint·verify PASS, 전체 테스트 실패 = 기존 7개 파일 32건만. 관리자 계정별 실제 화면 = NOT_PROVEN.
