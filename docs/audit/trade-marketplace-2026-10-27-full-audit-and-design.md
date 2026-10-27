# DIBAY 거래 서비스 전수 감사 및 개선 설계안 (2026-10-27)

- **기준 코드:** `origin/main` `ae0d0e9e6` (읽기 전용 스냅샷으로 감사. 작업 브랜치 아님)
- **운영 DB:** `ckdosyydvgzqwpbwuhon` 에서 카탈로그·집계 SELECT 만 실행 (회원 PII 미조회). 테스트 DB 미접근
- **외부 비교:** FB Marketplace·당근 공식 도움말과 공개 화면 (2026-10-27 조회)
- **변경(감사 시점):** 코드 0 · DB 0 · 배포 0
- **최종 상태 (2026-10-27 갱신):** 이 보고서의 결함은 `trade-marketplace-2026-10-27-fix-execution-table.md` §7 기준으로 처리됨 — 구현·Production 반영·실측·NOT_PROVEN 은 그 절이 SSOT. 아래 본문의 권장안 중 TM-10(옵션 교체)·TM-35(↺ 통일)·TM-24(무관 tail 유지) 서술은 §7 의 최종 판정으로 대체됨
- **판정:** PASS / PARTIAL / FAIL / NOT_PROVEN / NOT_APPLICABLE
  - PASS 는 실제 호출 경로까지 확인한 것만 준다
  - 실기기·운영 응답을 측정하지 않은 것은 모두 NOT_PROVEN
  - 인용 경로는 `origin/main` 기준 상대 경로

---

## 0. 요약

| 항목 | 값 |
|---|---|
| 기존 계획 요구사항 | **120** |
| 구현 확인 (PASS) | **73** |
| 부분 구현 (PARTIAL) | **23** |
| FAIL | **8** (미구현 2: LS-7, U6-2 / 문서와 코드가 어긋남 6) |
| NOT_PROVEN | **16** |
| 결함 | **P0 2 · P1 9 · P2 21 · P3 20 = 52** |
| 중복·충돌 구현 | **13 묶음** (§5.3) |
| 문서 간 충돌 | **15** (§1.3) |

결함은 영역마다 근거를 표에 남긴다. P0 2건과 P1 일부는 운영 DB 로 영향 행을 확인했다.

**가장 시급한 2건 (P0)**
1. **TM-01:** 판매자 「판매내역」에서 구매자 X 의 대화에 다른 구매자 Y 의 이름·ID 가 붙는다. 그 값으로 신고·차단까지 실행된다. 운영 DB 에서 **해당 행 8건**을 확인했다.
2. **TM-02:** 예약·판매완료 구매자 user_id 가 공개 목록 API(비로그인 응답이 공개 캐시 30초)에 그대로 실린다. 운영 DB 의 anon REST 권한으로도 `sold_buyer_id` 를 직접 읽을 수 있다. 해당 행은 **64건**이다. 이는 `reserved_buyer_id` 를 마스킹한 기존 정책과도 모순된다.

---

## 1. 기존 기획 대비 구현 매트릭스

문서 약어:

| 약어 | 문서 |
|---|---|
| A–I | `dibay-marketplace-cut-a~i-hard-lock` |
| U3–U6 | `dibay-marketplace-ui-3~6` |
| GL | `trade-guest-location-hard-lock` |
| LS | `list-ssot-target` + `cut-ssot-implementation-plan` |
| BR | `.cursor/rules` browse-single-contract |
| TL | `trade-lightweight-design` |
| TF | `trade-market-feed-contract` |
| HP | 상세·채팅 hot-path 규칙 |
| CH | `trade-chat-buyer-seller-process` + `trade-chat-room-identity` |
| ML | `community-messenger-trade-*` |
| CC | `trade-category-composition-ssot-redesign` |
| SL | `trade-community-structural-authority-lock` |

### 1.1 매트릭스 (120건)

| ID | 요구 | 코드 근거 | 문서 상태 | 판정 |
|---|---|---|---|---|
| A-1 | 옵션 owner=ROOT, 저장 id=child | `lib/trade/category-form/resolve-for-category.ts:46,60` | LOCKED | PASS |
| A-2 | Admin SSOT `/admin/menus/trade` | `app/admin/trade/feed-topics/page.tsx:5` redirect | LOCKED | PASS |
| A-3 | SUV=body_type 옵션 | `search-candidate-expansion.ts:213` (검색만 확인) | LOCKED | PARTIAL |
| A-4 | child 폼 옵션 편집기 없음 | — | LOCKED | NOT_PROVEN |
| B-1 | 홈·무카테고리 검색 buy/work 제외 | `home-posts-query-server.ts:229` | LOCKED | PASS |
| B-2 | 반대 의도 exclude 규칙 | `sell-intent-list-ssot.ts:88-115` | LOCKED | PASS |
| B-3 | legacy null meta=sell | `sell-intent-list-ssot.ts:95` | LOCKED | PASS |
| B-4 | 부동산·렌터카 미적용 | `sell-intent-list-ssot.ts:11-15` | LOCKED | PASS |
| C-1 | 검색 T1→T4 tier | `marketplace-discovery-rank.ts:60` | LOCKED | PASS |
| C-2 | ranked window 키에 page 없음 | `search-ranked-window-cache.ts:37-46` | LOCKED | PASS |
| C-3 | page1/2 같은 window slice | `home-posts-route-core.ts:612,654` | LOCKED | PASS |
| C-4 | 검색 무관 매물 제외 | `home-posts-query-server.ts:620-724` band5 tail 출력 | LOCKED | **FAIL** (K-1) |
| C-5 | 검색 인덱스·마이그레이션 금지 | `20270506120000_trade_search_text_trgm.sql` 존재 | LOCKED | **FAIL** (K-2, 이후 정책이 대체) |
| C-6 | 50+ pagination, 라운드당 쿼리 ≤3 | — | — | NOT_PROVEN |
| C-7 | q 있을 때 sort 는 순서만 | `home-posts-route-core.ts:600` | — | PARTIAL |
| D-1 | 회원 후기 작성 UI 제거 | `can-open-trade-review-sheet.ts:31`, `TradeFlowBanner.tsx:144` 재연결 | LOCKED | **FAIL** (K-4) |
| D-2 | review_wait 탭 제거 | `lib/mypage/buyer-manage-tabs.ts:6` | LOCKED | PASS |
| D-3 | `?review=1` 미부착 | `trade-chat-surface.ts:66-74` | LOCKED | PASS |
| D-4 | 완료 알림 → 메신저 방 | `tradeChatNotificationHref` | LOCKED | PARTIAL |
| D-5 | submit-review API 유지 | `TradeReviewWriteSheet.tsx:61` | — | PASS |
| E-1~3 | 레거시 구매·판매 경로 redirect | `app/(main)/mypage/trade/*`, `philife/purchases/*` | PASS | PASS ×3 |
| E-4 | AccountTab salesCount | `AccountTab.tsx` 없음 | PASS | PARTIAL |
| E-5 | trade-counts API 유지 | `app/api/my/trade-counts/route.ts:37` | — | PASS |
| F-1 | page1 pin ≤3 | `feed-promotion-projection.ts:37,284` | PASS | PASS |
| F-2 | 검색은 pin 없이 배지 | `route-core:736` | PASS | PASS |
| F-3 | 상세 더 알리기 시트 | `PostDetailView.tsx:1168` | PASS | PASS |
| F-4 | trade-ads/apply 회원 경로 아님 | 참조 0건 | PASS | PASS |
| F-5 | trade_post_ads 유지 | — | KEEP | NOT_PROVEN |
| G-1 | 찜 단일 toggleFavorite | `toggleFavorite.ts:5` | PASS | PASS |
| G-2 | favorite_count writer 금지 | `api/favorites/toggle/route.ts:11` | PASS | PASS |
| G-3 | 목록·상세 신고 모달 | `HomeProductList.tsx:1227` | PASS | PASS (기능 결함은 TM-07·08) |
| G-4 | 상세 공유 | `PostDetailView.tsx:756` | PASS | PASS |
| G-5 | 신고 dedup | — | — | NOT_PROVEN |
| H-1 | silent 갱신 자리 패치 | `home-list-freshness.ts:26` | PASS | PASS |
| H-2 | 새 글 N CTA | `home-list-freshness.ts:6` | PASS | PARTIAL |
| H-3 | PTR 즉시 최신 | `HomeProductList.tsx:446` | PASS | PASS |
| H-4 | Realtime·bumped_at 미사용 | — | PASS | NOT_PROVEN |
| I-1 | 작성 진입 단일 | `app/(main)/write/[categoryId]` | PASS | PASS |
| I-2 | composition 필터 홈 금지 | `MarketFilterSheet.tsx:900` | PASS | PASS |
| I-3 | 중고차 sell/buy 위젯 | `UsedCarSellFields` | PASS | PASS |
| I-4 | 운영 52 checks | 증거 파일 없음 | PASS | NOT_PROVEN |
| CC-1 | overlay JSONB 스키마 | `parse-field-composition.ts` | PASS | PARTIAL |
| CC-2 | 상세 단일 projector | `TradeCompositionDetailSection` | PASS | PASS |
| CC-3 | 7번째 카테고리 anti-fork | 테스트만 | PASS | PASS |
| CC-4 | 중고차 overlay gap QA | — | 후속 | NOT_PROVEN |
| U3-1 | 글쓰기 순서 | `TradeWriteForm.tsx` | PASS | NOT_PROVEN |
| U3-2 | 빈 ROOT gate 없음 | `TradeWriteForm.tsx:256` | PASS | PARTIAL |
| U3-3 | profile별 가격 writer | — | PASS | NOT_PROVEN |
| U4-1 | 카드 순서 사진→가격→제목→지역→♡→홍보 | `PostCard.tsx:333,343` 홍보가 지역보다 앞 | PASS | PARTIAL |
| U4-2 | 검색 카드 100×100 | `ProductCard.tsx:59` | PASS | PASS |
| U4-3 | 카드에서 판매중·spec 제거 | `PostCard.tsx` | PASS | PARTIAL |
| U5-1 | 상세 slot 순서 | `PostDetailView.tsx:1340-1536` | PASS | PASS |
| U5-2 | 채팅 CTA 인라인 | — | PASS | PARTIAL |
| U5-3 | 구매자 ⋯ 신고·공유 중복 없음 | — | PASS | NOT_PROVEN |
| U5-4 | related Suspense | `trade-detail.service.ts:145` | PASS | PASS |
| U6-1 | 내 상품 필터 5종 | `MyProductsView.tsx:45-99` | PASS | PARTIAL |
| U6-2 | ⋮ 판매완료 | `MyProductActions.tsx:60-88` (CUT 2 `3195e27ff` 에서 제거) | PASS | **FAIL** |
| U6-3 | ⋮ 4-state 제외 | 같은 파일 | PASS | PASS |
| GL-1 | 비로그인 → location=all | `resolve-trade-marketplace-default-city.ts:125` | LOCKED | PASS |
| GL-2 | 401 만으로 guest 판정 금지 | hydrate-scope | LOCKED | PARTIAL |
| GL-3 | 일시 오류 1/2/4초 재시도 | `use-trade-marketplace-location-hydrate.ts:115` | LOCKED | PASS |
| GL-4 | UNSET 동안 fetch 차단 | `client-location-fetch.ts:35` | LOCKED | PASS |
| GL-5 | 회원 master CITY 우선 | `default-city.ts:151` | LOCKED | PARTIAL |
| GL-6 | 헤더 「전체」 표시 | — | LOCKED | NOT_PROVEN |
| LS-1 | 카테고리 IN 하드 필터 | `home-posts-route-core.ts:500-575` | DONE | PASS |
| LS-2 | 공통 membership resolver | `api/trade/feed/route.ts:29` | DONE | PASS |
| LS-3 | 회원 목록 fetch 단일 `/api/philife/posts` | `HomeProductList.tsx:383` | — | PASS |
| LS-4 | T5-B ROOT 확장 후 STOP | 미선택 시 전체 tail | DONE | PARTIAL |
| LS-5 | SIM-BOTH | `route-core:604` | DONE | PARTIAL |
| LS-6 | `assembleMarketplaceSearchOrder` SSOT | 호출 0건 | DONE | **FAIL** (사문) |
| LS-7 | 단일 `assembleMarketplaceListOrder` | 없음 | TARGET | **FAIL** (미구현) |
| LS-8 | LOCAL→NEARBY→NATIONWIDE tier | `browse-location-tiers.ts:68` | OWNER 10-16 | PASS |
| LS-9 | NEARBY=64km | `trade-browse-radius.ts:9,17` | — | PASS |
| LS-10 | `radius=` 만 하드 경계 | `discovery-rank.ts:126-145` | — | PASS |
| LS-11 | tier 실패 → 503 | `api/philife/posts/route.ts:48` | — | PASS |
| LS-12 | slim select·보이는 페이지만 hydrate | `home-posts-query-server.ts:74` | — | PASS |
| LS-13 | search_text trgm 후보 | 운영 인덱스 존재 확인 (`posts_search_text_trgm_idx`) | — | PASS |
| LS-14 | strongRelated ≥3자 | — | — | NOT_PROVEN |
| LS-15 | SSOT-5 CASE A–H 8/8 | 사전 점검 B/D/E/H FAIL, 사후 기록 없음 | PROBE | NOT_PROVEN |
| BR-1 | 기본=master LGU+거리 전체 | `default-city.ts` | — | PARTIAL |
| BR-2 | ↺ 와 「전체 초기화」 같은 href | `TradePrimaryTabs.tsx:157` vs `MarketFilterSheet.tsx:593` | — | **FAIL** |
| BR-3 | PTR 은 URL 불변 | `HomeProductList.tsx:446` | — | PASS |
| BR-4 | PTR 키 = committed 전체 | `trade-market-pull-refresh-surface.ts:5` | — | PARTIAL |
| BR-5~7 | PTR window 재생성·epoch·sort 유지 | `getPostsForHome.ts:544` 등 | — | PASS ×3 |
| BR-8 | 조용한 64km fallback 금지 | `trade-browse-radius.ts:31-39` 비숫자 → 64 | — | PARTIAL |
| BR-9 | 테스트 행렬 1–20 | — | — | NOT_PROVEN |
| TL-1~3 | signal 금지·peek 복원·고정 키 금지 | `getPostsForHome.ts` | — | PASS ×3 |
| TL-4 | prewarm 키 일치 | `bottom-nav-tap-prewarm-trade.ts:23,54` | — | PARTIAL |
| TL-5,6,8 | rAF 지연 금지·dynamic 모달·Cache-Control | — | — | PASS ×3 |
| TL-7 | 첫 페이로드 RSC | 클라 셸 (의도) | — | PARTIAL |
| TP-1 | 1차 탭 loading=null | `market/loading.tsx:6` | — | PASS |
| TF-1 | 목록=`/api/trade/feed` | 실제는 getPostsForHome | — | **FAIL** (문서 stale, K-5) |
| TF-2,3 | IN 64개 분할·slug→category | — | — | PASS ×2 |
| TF-4 | cursor pagination | — | 향후 | NOT_PROVEN |
| HP-1,2,4 | related 경유·compose 이동·prefetch | — | — | PASS ×3 |
| HP-3 | listPriceOffers 병렬 | 가격 제안 삭제됨 (`4b9034c0b`) | — | PARTIAL |
| CH-1 | 예약중 비예약자 새 채팅 차단 | `item-trade-chat-start-core.ts:275` | ✅ | PASS |
| CH-2 | 판매완료 CTA 비활성 | `PostDetailView.tsx:979` (서버는 TM-21) | ✅ | PASS |
| CH-3 | 상세 → 채팅 허브 | 메신저 방으로 이동 | ✅ | PARTIAL |
| CH-4 | 구매자 후기 → 매너 | `TradeReviewWriteSheet.tsx:61` | ✅ | PASS |
| CH-5 | 상품×구매자 방 1개 | 운영 unique `product_chats_post_id_seller_id_buyer_id_key` 확인 · 중복 0건 | — | PASS |
| CH-6,7 | trade_item dedupe·틴트 | — | — | PASS ×2 |
| ML-1~4 | contextMeta·칩 없음·15건 페이지·배치 meta | — | — | PASS ×4 |
| SL-1 | L1/C3/U1/S1/T1 SSOT | `trade-bridge-exit-conditions.ts` | LOCKED | PASS |
| SL-2 | S1 p95 측정 | — | 유보 | NOT_PROVEN |

> 집계 120 = PASS 73 · PARTIAL 23 · FAIL 8 · NOT_PROVEN 16.
> "×N" 표기는 행 하나에 N건을 묶은 것이다.
> 문서들이 근거로 드는 `.qa-logs/cut-*` 런타임 증거 파일은 저장소에 없어서 다시 확인할 수 없었다.

### 1.2 `/dibamarket` · `/philife` · 위치 SSOT

**`/dibamarket` — 폐기 확정**
- 커밋 `5a139ecf3` 에서 코드를 되돌렸고, `20261106120000_drop_dibamarket_complete.sql` 로 스키마를 삭제했다.
- 남은 흔적: `resolve-dibay-surface.ts:119` 매핑(사문).
- 운영 DB 에는 별도 원장 `dibay_items` 테이블이 **0행으로 남아 있다** (위도·경도 컬럼 보유). `product_chats.dibay_item_id` 도 사용 0건이다.

**`/philife`** — 페이지 자체는 커뮤니티 홈이다. 거래와 엮인 곳은 다음과 같다.
- 거래 목록 API 의 이름이 `/api/philife/posts` 다. 이름만 그렇고 내용은 거래다.
- `/philife/sales` 가 `/mypage/trade/sales` 와 중복된다.
- 거래 채팅 빈 목록 CTA 가 `/philife` 로 간다 (TM-52).

**위치 SSOT**
- 타입: `lib/trade/location/trade-browse-location.ts`
- 반경: `lib/trade/location/trade-browse-radius.ts`
- tier: `lib/trade/location/national/browse-location-tiers.ts`
- 어느 문서도 이 파일들을 authority 로 명시하지 않았다.

### 1.3 문서 간 충돌 (Owner 정리 필요)

| ID | 충돌 | 코드가 따르는 쪽 |
|---|---|---|
| K-1 | 검색 무관 매물: CUT C 「제외」 vs LS §8 「ROOT 까지 STOP」 vs LS §1.1 「tail 표시」 | §1.1 (카테고리 미선택 시 전국 무관 글 tail) |
| K-2 | CUT C 「검색 인덱스 금지」 vs LS pg_trgm 도입 | LS |
| K-3 | 검색 내 지역 순위 축 | LS |
| K-4 | CUT D 「회원 후기 UI 제거」 vs 거래 프로세스 문서 「구매자 후기」 | 후기 재연결 (`73128807a` CUT 3, lock 문서 없음) |
| K-5 | 목록 canonical API: TF `/api/trade/feed` vs LS `/api/philife/posts` | LS |
| K-6 | ↺ 초기화 범위 (BR vs GL vs 코드) | 코드: 필터만 초기화 |
| K-7 | 비로그인 기본 `location=all` 금지(BR) vs 허용(GL) | GL |
| K-8 | 반경 기본값: null(L-SOFT) vs 64km(주석·draft) vs sanitize→64 | 혼재 |
| K-9 | UI-6 ⋮ 판매완료 | 코드에서 제거됨 |
| K-10 | UI-4 카드 순서 | 홍보가 앞 |
| K-11 | UI 컷 「다음 순서」 서술 불일치 | 기록 문제 |
| K-12 | 「CUT A–J」 인용, 거래 CUT J 문서 없음 | — |
| K-13 | 「홈 /philife = 거래 피드」 (lightweight §7·TF) | 현재 커뮤니티 홈 |
| K-14 | 상세 채팅 진입: `/mypage/trade/chat` 허브 vs 메신저 방 | 메신저 방 |
| K-15 | hot-path 규칙의 listPriceOffers | 기능 삭제됨 |

이 밖에 거래 CUT 1–4 커밋(`3195e27ff`·`73128807a`·`8ed7f66ec`)은 기존 lock 을 바꿨지만 hard-lock 문서가 없다.

---

## 2. Facebook Marketplace + 당근 비교표

분류 기호: ✅ DIBAY 정상 · ⚠ 구현됐으나 결함 · ◐ 일부 · ✗ 기획에 있으나 미구현 · ⊘ 정책상 불필요 · ➕ 도입 검토

| # | 영역 | FB Marketplace | 당근 | DIBAY 현재 | 분류 |
|---|---|---|---|---|---|
| 1 | 홈 피드 | 인기 물품 그리드, 카드=가격·제목·지역 | 동네 최신 + ML 노출, 거래완료 1일 후 홈 제외 | 지역 tier → 최신/인기/거리, 2/3/4열 그리드 | ✅ (거래완료 노출 정책은 ➕) |
| 2 | 지역 우선·타 지역 | 위치 자유 변경, 인증 없음 | 내 동네 ≤2, 동네인증 | 비로그인·주소 없음=전국, 대표주소 CITY 우선, 전국 선택 | ✅ |
| 3 | 거리 반경 | 반경 선택(로그아웃 기본 65km), 직선 원 | 숫자 반경 없음 (평균 7~10km), 검색 2km 필터 | 5/10/30/64km. 단 **시 중심점 기준** (게시물 좌표 없음) | ⚠ TM-10 |
| 4 | 필터·정렬 | 정렬·가격·상태 5종·등록일·카테고리 | 추천/최신/가격/가까운순, 판매중만 | 마켓 시트: 카테고리·거리·상태·가격·정렬(최신/거리/인기). 전역 검색엔 없음 | ◐ TM-11 |
| 5 | 검색 | 결과 「알림 받기」 | 필터 초기화 ↻, 키워드 알림 | 전역 검색=제목만 10건. `/market?q=` 검색면은 UI 진입 없음 | ⚠ TM-11 · 키워드 알림 ➕(후순위) |
| 6 | 카테고리별 양식 | 일반/차량/부동산 별도 | 중고차 등록증 인증, 부동산 상세 | 6 profile composition (중고·차·부동산·환전·일자리·렌터카) | ✅ (저장 결함 TM-05) |
| 7 | 사진 | 첫 사진=썸네일 (제3자) | 길게 눌러 순서 변경 | 10장, 대표=첫 장. 순서 결함 TM-26 | ⚠ |
| 8 | 판매자 신뢰 | 평점 5개 이상 공개, 배지 | 매너온도·재거래희망률·응답률·본인인증 | 매너(후기) 반영 존재. 응답률·배지 범위는 NOT_PROVEN | ◐ |
| 9 | 문의 | 정형 문구 「구매 가능한가요?」 | 채팅하기, 가격 제안 토글, 자주 쓰는 문구 | 채팅 CTA, 가격 제안 UX 삭제됨 (`4b9034c0b`) | ✅ (정형 첫 문구 ➕ 소규모) |
| 10 | 상태 | 판매중/대기/완료, 문의자 전원 자동 메시지 | 판매중/예약중/거래완료/숨김, 예약중 알림 받기 | inquiry/negotiating/reserved/completed + 숨김, 예약자 지정 | ⚠ TM-17·18 (API 우회) |
| 11 | 찜·공유·신고·후기 | 저장·신고·리뷰 | 관심·가격 인하 알림·후기 30분 후 | 찜 ✅ · 공유 ✅ · **신고 ⚠ TM-07·08** · 후기 ✅ (문서 충돌 K-4) | ⚠ |
| 12 | 내 목록·채팅 | 내 품목, Messenger 연동 | 판매/구매/관심 내역 | 내 상품·판매·구매·찜, 메신저 거래 채팅 | ⚠ TM-01 (P0) |
| 13 | 반응형 | 데스크톱 필터 사이드바 | 웹 목록·앱 중심 | 2/3/4열, 검색 1열 (hard-lock), 하단 바 폭 불일치 | ◐ TM-43 |
| 14 | 빈·오류 | 필수 누락 시 다음 비활성 | 업로드 실패 원인 안내 | 오류+재시도 ✅, 빈 화면 2종, 업로드 실패 원인 미표시 | ◐ TM-04·40 |
| α1 | 끌어올리기 | 없음 (유료 Boost) | 하루 6개·글당 15회 | 「더 알리기」 유료 홍보만 (끌올은 U6-3 에서 제외) | ⊘ 기존 결정 유지 |
| α2 | 나눔 | 가격 0 = 무료 | 0원=나눔 | 나눔 지원. 검색·내 상품에서 「₱0」 표시 | ⚠ TM-09 |
| α3 | 거래 희망 장소 | 없음 | 지도 핀 | trade_meet_spot ✅ (목록 좌표 노출 TM-29) | ⚠ |
| α4 | 숨기기·차단 | 품목 숨기기 | 차단·글 안 보기 | 차단·제한 ✅ | ✅ |
| — | 결제·배송·에스크로·예약 승인 | 있음 | 있음 | 직거래 정책 | ⊘ 비교 제외 |

**도입 검토(➕) 결론:** 지금 단계에서는 새 기능을 추가하지 않는다. 결함 수정이 먼저다. 후보는 다음 세 가지이고, 모두 Owner 결정 사항이다.
1. 거래완료 글의 홈 노출 기간
2. 정형 첫 문의 문구
3. 키워드 알림

---

## 3. 전체 사용자 시나리오 점검표

### 3.1 지역·거리 (§3 지시)

| 시나리오 | 판정 | 근거 |
|---|---|---|
| 비로그인·주소 없음 → 전체 | PASS | `resolve-trade-marketplace-default-city.ts:127` |
| 로그인·대표주소 없음 → 전체 | PASS | 같은 파일 `:133` |
| 대표주소 있음 → 기본 지역 | PASS | 대표 CITY + 거리 전체, 내 지역→주변→전국 |
| 지역 직접 선택 | PASS | `marketplace-browse-state.ts:288` |
| 5·10km 반경 | **PARTIAL** | 서버 SQL `trade_lgu_id IN (반경 내 LGU)`. 기준은 선택 LGU 중심점, 경계 포함. 시 단위라 실제 반경과 어긋남 (TM-10) |
| 반경 변경 → 목록·URL·캐시 | PASS / 개수 NOT_PROVEN | URL `radius`, prewarm 키 일치 |
| 필터 취소 → 기존 조건 유지 | **PARTIAL** | URL 은 유지. 다시 열면 버린 입력이 남음 (TM-27) |
| 전국 선택 | PASS | |
| 대표주소 변경 → 재평가 | PASS | `trade-marketplace-master-address-reset.ts:106` |
| 화면 이동 후 복귀 | PASS (상세↔목록) / NOT_PROVEN (하단 탭) | URL 기준 |
| 위치 없는 게시물 | PASS | 레거시 region 매핑, 실패 시 제외. 운영: LGU 없는 글 2/200 |
| 페이지네이션 후 필터 유지 | PASS | 매 요청에 파라미터 포함 |
| 거리 밖 혼입 | PASS | `marketplace-discovery-rank.ts:145` |
| 로그인↔로그아웃 전환 | PASS (코드) / 실기기 NOT_PROVEN | `client-session-wipe.ts` |

### 3.2 검색 (§4)

| 시나리오 | 판정 | 비고 |
|---|---|---|
| 상품명 정확 검색 | PASS | 전역은 제목 ILIKE |
| 설명·속성 검색 | **FAIL (전역)** / PARTIAL (`/market?q=`) | 전역=제목만. `search_text`=제목+meta 8키, 설명 제외 |
| 한·영·숫자·특수문자 | PASS | `%_,*()\` 를 공백 처리. 인젝션 경로 없음 |
| 짧은 검색어 | PARTIAL | `/market?q=` 1글자면 2000행 순위 계산 |
| 검색+카테고리/지역/가격/상태 | **FAIL (전역: 지역만)** / PARTIAL (`/market?q=`) | |
| 최신·관련도 | PARTIAL | 관련도 옵션 없음. 전역은 최신만 |
| 결과 없음 | PARTIAL | 전역은 DB 실패도 「없음」(TM-28). `/market?q=` 는 tail 때문에 사실상 나오지 않음 (TM-24) |
| 초기화 | PASS | |
| 뒤로가기 복원 | PASS | URL |
| 중복·누락·무한 로딩 | PARTIAL | offset + 동률 기준 없음 (TM-33) |
| 더보기 | **FAIL (전역: 10건 고정)** | |

### 3.3 흐름 A–G

| 흐름 | 판정 | 막히는 지점 |
|---|---|---|
| A 방문자 | PARTIAL | 전국 목록 ✅. 검색은 전역 10건·필터 없음 (TM-11). 로그인 필요 동작 게이트 NOT_PROVEN |
| B 지역 사용자 | PARTIAL | 반경 의미 불일치 (TM-10), 필터 시트 잔존 (TM-27) |
| C 판매자 | **FAIL** | 큰 사진 업로드 실패 (TM-04), 수정 시 지운 값·사진 미반영 (TM-05·06), 상세 최대 5분 stale (TM-25), 판매내역 구매자 혼동 (TM-01) |
| D 구매자 | PARTIAL | 문의·재사용·후기 자격 ✅. 신고 결함 (TM-07·08) |
| E 다중 구매자 | **FAIL** | 방 분리 ✅, 판매자 목록에서 구매자 혼동 (TM-01), 글별 구매자 목록 누락 (TM-19) |
| F 예외 | PARTIAL | 업로드 실패 원인 미표시, 검색 실패 위장, 판매완료 글 서버 미차단 (TM-21) |
| G 관리자 | PARTIAL | 숨김·삭제 RPC ✅. 판매중·완료 탭 기준 불일치 (TM-31), 효과 없는 설정 (TM-32), 숨김 글 REST 직접 조회 (TM-03) |

### 3.4 판매자·구매자·채팅 (§8)

| # | 시나리오 | 판정 |
|---|---|---|
| 1 | 본인 글 상세 | PASS (UI 숨김 + 서버 거부) |
| 2 | 문의 → 방 생성 | PASS |
| 3 | 재문의 재사용·race | PASS — 운영 unique 확인, 중복 쌍 0 |
| 4 | 다른 구매자 별도 방 | PASS |
| 5 | 판매자: 구매자별 목록 | **FAIL — TM-01 (P0)**, TM-19 |
| 6 | 구매자: 상품별 거래 | PASS |
| 7 | 상태 전이 | PARTIAL — TM-17·18 |
| 8 | 완료·확인·후기 | PARTIAL — 자격 검증 ✅, 자동확정 지연 (TM-36) |
| 9 | 숨김·삭제·완료 글 채팅 | PARTIAL — TM-21 |
| 10 | 신고·차단·제한 | PARTIAL — 레거시 생성 API 가 우회 (TM-20) |
| 11 | unread·알림 동기화 | NOT_PROVEN |
| 12 | 1:1·그룹·주문 채팅 분리 | PASS |

**운영 RLS 확인 결과**
- `product_chats` SELECT 는 참가자만 가능하다.
- 회원 JWT 의 쓰기 권한은 회수돼 있다. 쓰기는 모두 service-role API 를 거친다.
- `favorites` 는 unique(user_id, post_id) 다.

---

## 4. 결함 원인 및 우선순위 목록

공통 사항
- 원인은 코드 기준으로 확정했다.
- 운영 영향을 따로 측정한 항목은 「운영」 열에 적었다.
- 웹=W, DB=D, 네이티브=N. 이번 목록에 네이티브 변경은 없다.

### P0 (2)

| ID | 결함 | 근거 | 재현 / 실제 → 기대 | 운영 | 최소 수정 | 구분 |
|---|---|---|---|---|---|---|
| **TM-01** | 판매내역에서 다른 구매자가 표시되고, 그 사람에게 신고·차단이 실행됨 | `lib/mypage/sales-history-scope.ts:55-56` 는 정확히 맞는 방이 없으면 판매자가 낀 **아무 방**이나 고름. `app/api/my/sales/route.ts:159-167` → `SalesHistoryCard.tsx:206` 신고·차단 시트 | X 의 product_chats 만 있고 chat_rooms 가 없는 글 → X 행에 Y 표시 → X 가 표시돼야 함 | **영향 행 8건** (product_chats 445 중 chat_rooms 없는 11건, 그중 다른 구매자 방이 있는 8건) | fallback 을 「정확히 일치」 또는 「판매자·구매자가 뒤집힌 쌍」으로만 제한. 없으면 product_chats.buyer_id 사용 | W |
| **TM-02** | 예약·판매완료 구매자 user_id 공개 노출 | 목록 select 에 `reserved_buyer_id, sold_buyer_id` 포함 (`trade-posts-range-query.ts:43`, `home-posts-query-server.ts:84-90` `*` 폴백). 읽기는 service-role (`resolve-posts-read-clients.ts:57`) 이라 마스킹 함수를 우회. 비로그인 응답은 `public, max-age=30`. DB: `posts_public_select USING true` + anon 컬럼 GRANT 에 `sold_buyer_id` 포함 (`reserved_buyer_id` 는 제외됨) | 비로그인 `GET /api/philife/posts?location=all` 또는 anon REST `select=sold_buyer_id` → UUID 노출 → 노출되면 안 됨 | sold_buyer_id 보유 **64건**. API 응답 실측은 NOT_PROVEN | (W) 목록 select·폴백에서 두 컬럼과 `*` 제거. (D) anon·authenticated 의 `sold_buyer_id` SELECT GRANT 회수 (reserved 와 같은 방식). 사용처는 서버 API 로 이동 | W + D |

### P1 (9)

| ID | 결함 | 근거 | 실제 → 기대 | 최소 수정 | 구분 |
|---|---|---|---|---|---|
| TM-03 | 관리자 숨김 글을 anon REST 로 직접 조회 가능 | `posts_public_select`·`posts_select` 정책 `USING true` (운영 확인) | 숨김 20건의 제목·본문·사진을 id 로 조회 가능 → 공개 정책은 `moderation_state='visible' and owner_state='none'` 만. 본인·관리자는 service-role 경로 | SELECT 정책 교체. 앱 읽기는 service-role 이라 화면 영향은 작음. 직접 anon 읽기 사용처는 사전 grep 필요 | D |
| TM-04 | 일반 거래 사진 업로드에 클라이언트 축소가 없어, 약 4.5MB 넘는 카메라 원본이 실패 | `lib/posts/uploadPostImages.ts:17-34`. 축소 유틸 `client-image-upload-prepare.ts` 미사용. 413 응답을 null 로 삼켜 원인 미표시 | 「N장 중 M장」만 안내 → 축소 후 업로드, 실패 사유 표시 | `prepareImageFileForFunctionUpload` 적용 + 오류 전달 | W (실기기 확인 필요) |
| TM-05 | 수정에서 지운 속성·체크 해제·거래장소 삭제가 저장되지 않음 (직거래→나눔 전환 시 `direct_deal` 잔존 포함) | 서버 `{...before.meta, ...body.meta}` 병합 (`trade-lifecycle-policy.ts:448-451`, 직접 확인). 클라는 빈 값을 키째 뺌 (`TradeWriteForm.tsx:93-138,1786`) | 이전 값 유지 → 삭제 | composition 소유 키를 null 포함해서 전송 + 서버는 null 이면 키 삭제 | W |
| TM-06 | 사진을 전부 지워도 목록 썸네일이 남음 | `trade-lifecycle-policy.ts:457-463` (직접 확인) | 옛 사진 표시 → 썸네일 없음 | `imageUrls` 가 명시적으로 비면 `thumbnail_url=null` | W |
| TM-07 | 「작성자 신고하기」 무동작 | `ReportReasonModal.tsx:41` 은 `?reportAuthor=1` 로 이동만 하고, 이 파라미터를 읽는 코드가 없음 | 이동만 함 → 사용자 신고 시트 열림 | 모달에서 `ReportActionSheet targetType=user` 열기 | W |
| TM-08 | 게시글 신고 사유 코드 유실 | `ReportReasonModal.tsx:44` 가 한국어 문구를 보내고 정규식으로 추론 | 3개 사유가 `other` 로 저장 → 선택한 코드 그대로 저장 | `reasonCode` 직접 전달 | W |
| TM-09 | 검색·내 상품에서 나눔·카테고리별 가격 오표시 + 통화 PHP 고정 | `ProductCard.tsx:77`, `MyProductCard.tsx:108` `formatPrice(price)`. `post-with-meta-to-product.ts` 에 is_free_share 없음 | 나눔이 「₱0」 → 「무료나눔」, 피드와 같은 가격 | `buildPostListPreviewModel().feedPrice` 공용화 | W |
| TM-10 | 거리 5·10km 가 실제 반경과 다르게 동작 | 게시물에 좌표가 없음 (운영: meta 좌표 0건, `trade_lgu_id` 만 있음). LGU 중심점 간 거리 (`lgu-centroids.ts:88`) → 5km 는 대개 선택한 시 하나만 남음. 시트 옵션 5/10/30/64 vs 상수 프리셋 32/64/96/160 불일치 | 「5km」인데 옆 시의 가까운 매물은 빠지고 같은 시의 먼 매물은 포함 → 표시 값과 실제 범위 일치 | **권장:** 시트 옵션을 시 단위로 의미 있는 값으로 교체하고 「시 중심 기준」 문구 표시. 게시물 좌표 도입(DB)은 하지 않음. Owner 결정 1 | W |
| TM-11 | 거래 홈 검색 = 전역 검색 (제목만·10건·필터 없음·더보기 없음). `/market?q=` 검색면(필터·지역·페이지 지원)은 UI 진입 없음 | `SearchButton.tsx:10`, `trade-match-only-server.ts:73-98` | 검색 + 필터 조합 불가 → 거래 결과 「더보기」로 `/market?q=` 진입 | 전역 결과의 거래 섹션에 「거래에서 더 보기」 → `/market?q=&location=현재` 추가. TM-24 선행 필요 | W |

### P2 (21)

| ID | 결함 | 근거 | 최소 수정 | 구분 |
|---|---|---|---|---|
| TM-17 | seller-listing-state 가 reserved→completed 를 직접 허용 → 구매자 없는 sold | `seller-listing-chat-transitions.ts:25`, `seller-listing-state/route.ts:253`. 운영 해당 0건 | completed 거부, seller-complete 로만 처리 | W |
| TM-18 | 레거시 trade-status API 에 전이 검사 없음 (완료→판매중 가능) | `app/api/chat/rooms/[roomId]/trade-status/route.ts:187-233`. 클라 호출 0건 | 410 처리 | W |
| TM-19 | 글별 구매자 목록에서 product_chats 에만 있는 구매자 누락. 상태가 방별로 구분되지 않음 | `app/api/my/post-buyer-chats/route.ts:100` | 두 원장을 buyer_id 로 합치고 product_chats 상태 우선 | W |
| TM-20 | `POST /api/chat/create-room` 이 예약·제한 검사를 우회하고 chat_rooms 없는 행 생성 (TM-01 의 원천) | `legacy-product-chat-create-or-get.ts:41-107`. UI 호출 0건 | 410 또는 `resolveTradeChatEntry` 위임 | W |
| TM-21 | 판매완료 글 신규 문의를 서버가 막지 않음 | `item-trade-chat-start-core.ts:271`. 운영: sold 이후 생성된 방 2건 (정상 예외 여부 미확정) | 기존 방 없음 + sold + `!allowChatAfterSold` → 403 | W |
| TM-22 | 외부 https 이미지 URL 저장 허용 | `persistable-storage-media-ref.ts:25-43` | 자사 Storage + `post-images/{userId}/` 접두사만 허용 | W |
| TM-23 | 서버가 카테고리 존재·trade 타입·can_write 미검증 | `create/route.ts:31-34`, `owner-trade-update/route.ts:134` | 서버 조회 후 거부 | W |
| TM-24 | `/market?q=` 에 무관 전국 글 tail (결과 없음 미표시) | `shouldAllowSearchExpansionTail` 미호출. K-1 문서 충돌 | Owner 결정 2 이후 band5 차단 | W |
| TM-25 | 수정 후 상세가 최대 5분 stale | `next.config` `staleTimes.dynamic:300`, `ProductTradeEditPageClient.tsx:120` (강한 추정, 런타임 NOT_PROVEN) | 저장 성공 시 `router.refresh()` | W |
| TM-26 | 대표 사진 편집·혼합 시 순서 바뀜 | `TradeWriteForm.tsx:1624,1708`, `ImageUploader.tsx:214` | 배열 순서대로 파일만 치환 | W |
| TM-27 | 필터 시트 취소 후 다시 열면 버린 입력 잔존 | `MarketFilterSheet.tsx:354-358` | 열릴 때 URL 기준 재동기화 | W |
| TM-28 | 전역 검색에서 DB 실패를 빈 결과로 표시 | `trade-match-only-server.ts:92,117` | `ok:false` 반환 | W |
| TM-29 | 목록 응답에 거래장소 lat/lng/place_id 포함 | `home-posts-query-server.ts:125-135`. 운영 장소 보유 글 132건 | 목록 매핑에서 좌표 제거 | W |
| TM-30 | 판매완료 문구 2종 (「거래완료」/「판매완료」) + 상태 뱃지 구현 4갈래 | `ui-phase-finish.ts:117` vs `trade.ts:330` | 하나의 키로 통일 | W |
| TM-31 | 관리자 「판매중·판매완료」 탭 기준이 앱과 다름 | `trade-posts-query.ts:154-161` vs `public-listing-status.ts:36` | 같은 판정 함수 사용 | W |
| TM-32 | 효과 없는 관리자 설정 (`/admin/home-feed`, `/admin/exposure-policies`) | 앱 소비처 0건 | 「앱 미연결」 표시 (삭제·연결은 별도 지시) | W |
| TM-34 | 검색 카드 지역 표기가 원시값 연결 | `post-with-meta-to-product.ts:8` | `resolveTradeListingPublicCityLabel` 사용 | W |
| TM-35 | ↺ 버튼과 「전체 초기화」가 다른 href (BR-2) | `TradePrimaryTabs.tsx:157` vs `MarketFilterSheet.tsx:593` | 같은 빌더 사용 (범위는 K-6 정리 후) | W |
| TM-37 | 구인·환전 수정에서 사진 전부 삭제 불가 | `TradeWriteForm.tsx:1625` | edit 시 `[]` 전송 | W |
| TM-38 | 목록 페이지마다 offset 0 부터 재조회 (지역 tier × 카테고리 구간) | `home-posts-query-server.ts:949-1004` | 단계별 커서 또는 순위 창 캐시 | W |
| TM-39 | 예약 중 비예약 구매자는 기존 방이 있어도 상세 CTA 진입 403 | `item-trade-chat-start-core.ts:275` (기존 방 재사용보다 먼저 검사) | 기존 방 조회를 먼저 | W |

### P3 (20)

| ID | 결함 | 근거 | 구분 |
|---|---|---|---|
| TM-33 | 정렬 동률을 가르는 기준 없음 (`created_at` 만, offset) | `trade-posts-range-query.ts:301` → `id` 보조 정렬 추가 | W |
| TM-36 | 자동확정이 /api/my 진입 때만 실행, trust 이벤트·알림 없음 | `apply-buyer-auto-confirm.ts` | W |
| TM-40 | 빈 화면 2종, 카테고리 빈 화면에 CTA 없음·한국어 하드코딩 | `PostListByCategory.tsx:960` | W |
| TM-41 | 거리 정렬이 2000행 상한에 닿으면 빈 페이지 + hasMore=true | `home-posts-query-server.ts:380,1008` (운영 200건이라 잠재) | W |
| TM-42 | 카테고리 우선 경로가 1000행 넘으면 잘림 | `:831-861` (잠재) | W |
| TM-43 | 하단 바 폭 불일치·토스트 `bottom-24` 하드코딩 | `HomeProductList.tsx:1221` | W |
| TM-44 | `/api/trade/feed` 일반 경로가 오류를 빈 목록으로 삼킴 | `fetch-trade-feed-page.ts:321` | W |
| TM-45 | 전역 검색 제출 시 location 파라미터 유실 | `GlobalSearchView.tsx:70,257` | W |
| TM-46 | posts 부분 인덱스 중복 (`idx_posts_trade_category_id` 계열 2개, 운영 확인) | 마이그레이션 2건 | D |
| TM-47 | 신고 중복 방지·room 참가자 검증 없음 / 찜 select→insert race (unique 는 있음 → 23505 처리만) | `reports/route.ts:102`, `favorites/toggle/route.ts:75` | W |
| TM-48 | seller-complete 가 예약자와 다른 방 완료 허용, 동시 호출 race | `seller-complete/route.ts:61-115` | W |
| TM-49 | Storage 고아 파일 (수정 시 뺀 사진·부분 실패·초안 폐기) | `trade-write-exit-cleanup.ts`. 운영 버킷은 커뮤니티와 공유라 거래분 산출은 NOT_PROVEN | W |
| TM-50 | 서버 입력 상한 없음 (가격 음수·길이·이미지 수) | `create/route.ts:58` | W |
| TM-51 | `/products/new` 레거시 등록이 항상 400 | `save-product-from-form.ts:38` → `/write` redirect | W |
| TM-52 | 거래 채팅 빈 목록 CTA → `/philife` (커뮤니티) | `trade-chat-surface.ts:47` | W |
| TM-53 | 신고 사유 코드 체계 3개·i18n 없음 | `report-utils.ts:5,26` | W |
| TM-54 | 관련 글 카드가 토큰 미사용 (rounded-md·`#ccd0d5`) | `PostDetailRelatedSections.tsx:119` | W |
| TM-55 | 숨김·삭제 뱃지 한국어·gray 하드코딩 | `public-listing-status.ts:70` | W |
| TM-56 | `post_reports`·`posts_masked` 에 anon·authenticated 의 과다 GRANT (INSERT/UPDATE/DELETE/TRUNCATE). RLS·security_invoker 로 실제 쓰기는 막히지만 TRUNCATE 는 RLS 대상이 아님 | 운영 `role_table_grants` | D |
| TM-57 | 사문 코드·잔재: `TradeHeaderComposeButton`, `write-launcher/*`, `HomeTradeReelsSideRail`, `FavoriteProductCard`, `SearchView`, `assembleMarketplaceSearchOrder`, `dibay_items` 0행 테이블, `/dibamarket` 매핑 | import 0건 | W (+D) — 삭제는 별도 지시가 있을 때만 |

> ID 12–16 은 결번이다 (집계 중 병합).

---

## 5. UI·UX·CTA·SSOT 통합 설계안

새 디자인 시스템은 만들지 않는다. 기존 `PostCard`·`buildPostListPreviewModel`·`Sam.*`·`dibay-overlay` 를 SSOT 로 삼고, 어긋난 쪽을 맞춘다.

### 5.1 화면별 차이와 방향

| 영역 | 현재 | 통합 방향 |
|---|---|---|
| 상품 카드 | 9개 구현, 가격 경로 2종 | 그리드=`PostCard`, 가로형=`ProductCard`(검색·내 상품) 2종만 남긴다. 가격·지역·상태는 모두 `buildPostListPreviewModel` 하나에서 가져온다 (TM-09·34) |
| 상태 뱃지 | 4갈래, sold 문구 2종 | `TradeListingStatusBadge` 하나로 모으고 문구 키를 통일한다 (TM-30·55) |
| 글쓰기 CTA | 활성 4곳, 아이콘 2종(FileText/Plus), 문구 3종 | 진입 경로는 그대로 두고 **아이콘 Plus + 문구 「판매하기」**로 맞춘다. `/market` 헤더는 유지하고 빈 화면에 같은 CTA 를 추가 (TM-40) |
| 주요/보조 CTA | `Sam.btn` 사용 15건, 나머지는 `bg-sam-primary` 직접 사용 | 새로 고치는 파일에서만 `Sam.btn.primary/secondary` 로 바꾼다 (일괄 교체 금지) |
| 하드코딩 색 | hex 24건·팔레트 88건 | 수정 대상 파일에 한해 `sam-*` 토큰으로 바꾼다 |
| 빈·로딩·오류 | 빈 화면 2종 | `CategoryEmptyState` + i18n + 판매 CTA 로 통일 |
| 시트 | 17개 중 15개 `dibay-overlay` | 남은 2개(`TradeWriteBottomSheet`·`MobileConfirmBottomSheet`)는 추후 정리. 이번 범위 아님 |
| 하단 여백 | 토스트 `bottom-24` | `MAIN_BOTTOM_NAV_BODY_CLEARANCE` 사용 (TM-43) |
| 반응형 | 그리드 2/3/4열, 검색 1열 (hard-lock) | 유지. 하단 고정 바 폭만 본문 컬럼 기준으로 맞춘다 |
| 신고 UI | `ReportReasonModal` / `ReportActionSheet` 2종 | `ReportActionSheet`(코드 전송) 하나로 모은다 (TM-07·08·53) |

### 5.2 iOS·Android
- 이번 결함은 모두 웹 레이어다. 네이티브 파일 변경은 0이다.
- 업로드 축소(TM-04)는 iPhone HEIC·Android 고해상도 카메라에서 실기기 확인이 필요하다.

### 5.3 중복·충돌 구현 (13 묶음)

| # | 묶음 | 개수 |
|---|---|---|
| 1 | 카드 | 9 |
| 2 | 가격 렌더 | 2 |
| 3 | 상태 뱃지 | 4 |
| 4 | 글쓰기 CTA | 활성 4 + 사문 3 |
| 5 | 피드 리스트 (`HomeProductList`/`PostListByCategory`) | 2 |
| 6 | 빈 화면 | 2 |
| 7 | 신고 UI | 2 |
| 8 | 신고 사유 코드 | 3 |
| 9 | 등록 경로 (`/write`, `/products/new`) | 2 |
| 10 | 이미지 URL 병합 로직 | 3 |
| 11 | 신규/수정 제출 블록 | 2 |
| 12 | 거래 원장 (`chat_rooms`·`product_chats`·메신저 방) | 3 |
| 13 | 판매자 표면 (`/philife/sales`, `/mypage/trade/sales`) | 2 |

---

## 6. 샘플 상품 및 썸네일 운영 설계안

### 6.1 기존 구조 조사 결과
- `posts` 에는 데모·샘플 플래그, 시드, 큐레이션 테이블이 **없다**.
- 재사용할 수 있는 패턴은 커뮤니티의 `is_sample_data` 다 (플래그 + 관리자 뱃지 + 일괄 삭제 마이그레이션). 다만 공개 조회에서 이 플래그로 거르지 않는 한계가 있다.
- 거래 홈 상단 히어로 배너(`platform_promotion_distributions` placement=TRADE_HOME)는 운영 중이다.
- 운영 실데이터는 활성 거래 글 약 115건, 판매자 25명이다. 카테고리 6개 중 렌터카 5건, 환전 10건으로 빈약하다.

### 6.2 방식 비교

| 방식 | 장점 | 위험 | 판정 |
|---|---|---|---|
| ① `posts` 에 `is_sample` 행 INSERT | 검색·필터와 자연 통합 | 실제 판매자·채팅·찜·신고·통계·관리자 집계와 섞인다. 모든 쿼리에 제외 조건이 필요하고, 하나라도 빠지면 허위 매물이 된다 | **불채택** (지시서 원칙과도 충돌) |
| ② 별도 테이블 `trade_showcase_items` + 관리자 화면 | 운영자가 통제 | DB 변경·관리자 UI 신규·승인 필요. 지금 규모에 비해 과함 | 후순위 |
| ③ **코드 내 정적 카탈로그(JSON) + 자체 이미지(`public/`)를 별도 섹션으로 렌더** | DB 0, 실제 원장과 완전 분리, 채팅 경로 자체가 없음, 웹 배포만으로 켜고 끔 | 콘텐츠 수정에 배포가 필요 | **권장** |

### 6.3 권장안 (③) 상세

**노출 위치·조건**
- 실제 목록 아래에 별도 섹션 「이런 상품을 올릴 수 있어요 · 예시」를 둔다.
- 노출 조건: 현재 조회 범위(지역·카테고리)의 실제 활성 글이 **12건 미만**일 때만. 검색 결과(q 있음)에는 노출하지 않는다.
- 실제 피드의 정렬·페이지·개수에는 절대 섞지 않는다.

**표시**
- 카드 왼쪽 위에 「예시」 뱃지를 단다.
- 판매자명·지역·시간·찜·⋮ 은 표시하지 않는다.
- 가격은 「예시 가격」으로 표기한다.

**상호작용**
- 카드를 누르면 상세 페이지가 아니라 안내 시트를 연다 ("DIBAY 예시 상품입니다").
- 시트의 CTA 는 「내 물건 판매하기」 → `/market/sell` 하나뿐이다.
- 채팅·찜·신고·공유 경로가 없다. 같은 SSOT 상세 컴포넌트를 재사용하지 않으므로 거래 기능에 연결될 수 없다.

**수량·배분 (약 36개)**

| 카테고리 | 개수 | 구성 |
|---|---|---|
| 중고거래 | 18 | 가전·가구·유아·스포츠·패션·도서 각 3 |
| 중고차 | 6 | |
| 부동산 | 6 | 콘도·하우스·렌트 |
| 렌터카 | 6 | |
| 환전·일자리 | **0** | 금융·고용 예시는 실제 제안으로 오인될 위험이 있어 제외 |

- 가격대(나눔 0 포함)와 상태 메타를 다양하게 구성한다.

**이미지**
- 자체 촬영 또는 저작권이 명확한 이미지만 쓴다. 상표·로고·인물이 없어야 한다.
- 스톡 이미지를 쓴다면 상업 이용·재배포 조건을 문서로 남긴다.
- 형식: 1:1, 800px WebP, 장당 약 80KB 이하.
- 저장 위치: `public/images/trade-showcase/` (Storage·DB 미사용).
- 카드는 기존 `PostCard` 의 비율·radius 를 따르는 「예시 전용 래퍼」로 만든다.

**축소·중단**
- 위의 12건 임계값으로 자동 축소한다.
- 전체 중단 스위치: 1단계는 코드 상수(배포로 끔). 관리자 토글이 필요해지면 기존 `admin_settings` 키 하나를 추가한다 (이때 DB 데이터 변경 승인 필요).

**검색·필터 QA**
- 샘플을 운영 검색에 넣지 않는다.
- 필터·지역·정렬 검증은 vitest fixture(`lib/trade/**/__tests__`)와 기존 런타임 매트릭스 스크립트로 한다.

**변경 구분**
- 웹만이다. DB 0, 네이티브 0.

---

## 7. 수정 범위·순서·위험

### 7.1 구분

**웹만으로 해결 (48건)**
- TM-01, 04–11, 17–45, 47–55, 57(코드 부분)

**DB 변경 필요 (4건)** — 운영 적용은 Owner 승인 후
- TM-02: `sold_buyer_id` 컬럼 GRANT 회수 (웹 수정과 함께)
- TM-03: posts 공개 SELECT 정책 교체
- TM-46: 중복 인덱스 DROP
- TM-56: 과다 GRANT 회수
- (선택) TM-57: `dibay_items` 정리

**네이티브 변경**
- 0건.

**실기기 검증이 필요한 것**
- TM-04 (iOS HEIC·Android 대용량 사진)
- TM-01·19 (판매자 판매내역)
- 지역·로그인 전환 (§3.1 NOT_PROVEN)

### 7.2 수정 파일·DB 객체·화면 범위 (주요)

**웹**
- `lib/mypage/sales-history-scope.ts`
- `app/api/my/sales`, `app/api/my/post-buyer-chats`
- `lib/posts/trade-posts-range-query.ts`, `home-posts-query-server.ts`
- `lib/trade/trade-lifecycle-policy.ts`
- `components/write/trade/TradeWriteForm.tsx` (SSOT)
- `lib/posts/uploadPostImages.ts`
- `components/post/ReportReasonModal.tsx`
- `components/product/ProductCard.tsx`, `components/mypage/products/MyProductCard.tsx`
- `lib/search/post-with-meta-to-product.ts`
- `components/trade/MarketFilterSheet.tsx`
- `lib/search/global/trade-match-only-server.ts`
- `app/api/posts/create`, `owner-trade-update`
- `app/api/trade/seller-listing-state`
- 레거시 API 2개
- 관리자 `trade-posts-query.ts`

**DB 객체**
- `public.posts` SELECT 정책 2개 + 컬럼 GRANT
- `post_reports`·`posts_masked` GRANT
- 인덱스 1개

**화면**
- 거래 홈·카테고리·검색·필터 시트
- 글쓰기·수정·상세
- 내 상품·판매내역·글별 구매자
- 신고
- 관리자 게시물 탭

### 7.3 권장 순서 (한 묶음 = 한 번의 main 반영)

| 단계 | 대상 | 변경 | 회귀 위험 | 검증 |
|---|---|---|---|---|
| 1 | **TM-01·19·20** (판매자 구매자 혼동) | 웹 | 판매내역 표시 | 운영 8건 대상 판매자 화면 대조 (판매자 계정 실기기), vitest |
| 2 | **TM-02 (웹)·29** (목록 노출 컬럼) | 웹 | `HomeProductList.tsx:121` 의 비교 로직 교체 필요 | 비로그인 응답 JSON 에 두 컬럼·좌표 없음 확인 |
| 3 | TM-02 (DB)·03·56 | DB (승인 필요) | anon 직접 읽기 사용처 확인 필요 (사전 grep) | 운영 `pg_policies`·GRANT 재조회, 앱 목록·상세 정상 |
| 4 | 글쓰기 P1 (TM-04·05·06) + TM-26·37·22·23·25 | 웹 (`TradeWriteForm` SSOT 1파일 중심) | 등록·수정 전 카테고리 | 6 profile 등록→수정→상세→목록 왕복, 실기기 사진 업로드 |
| 5 | 신고 (TM-07·08·53) | 웹 | 신고 저장 형식 | 관리자 신고 화면에서 사유 코드 확인 |
| 6 | 가격·카드·뱃지 통일 (TM-09·30·34·55) | 웹 | 검색·내 상품 표시 | 나눔·부동산·렌터카 카드 대조 |
| 7 | 상태 API 정리 (TM-17·18·21·39·48) | 웹 | 판매 단계 전이 | 예약→완료→확인→후기 시나리오 |
| 8 | 지역·검색 (TM-10·11·24·27·28·35·45) | 웹 | **Owner 결정 1·2 이후** | §3.1·3.2 행렬 재실행 |
| 9 | 관리자 (TM-31·32) | 웹 | 관리자 집계 | 앱과 같은 글로 탭 카운트 대조 |
| 10 | 샘플 콘텐츠 (§6) | 웹 | 실제 피드와 섞이지 않아야 함 | 12건 임계값 경계, 채팅 경로 0 |
| 11 | P3 잔여 | 웹·DB | 낮음 | 해당 vitest |

### 7.4 Owner 승인이 필요한 결정

1. ~~**거리 반경 정책 (TM-10)**~~ — **정정 (2026-10-27 실행표):** 승인 계약이 「LGU 중심점 매칭」(`list-ssot-target.md:33`, browse 규칙 :28)이고 구현이 이와 일치한다. 결함이 아니므로 옵션 변경 권장을 철회한다 (`trade-marketplace-2026-10-27-fix-execution-table.md` §1.2).
2. **검색 무관 매물 tail (K-1·TM-24)**
   - 권장: LS §8·§10 잠금대로 카테고리 미선택 시 무관 tail 을 끄고 「결과 없음」을 표시.
3. **회원 후기 UI (K-4)**
   - 권장: 현재 코드(구매자 후기 유지)를 승인하고 CUT D 문서를 개정.
4. **DB 변경 3건 운영 적용** (TM-02 DB 분, TM-03, TM-56) 승인.
5. **샘플 콘텐츠 권장안 ③ 승인**
   - 대상: 수량 36개, 환전·일자리 제외, 이미지 공급원.
   - 이미지 저작권 확인 주체도 정해야 한다.
6. **문서 정리**
   - K-1~K-15 충돌 해소 문서와 CUT 1–4 hard-lock 문서를 작성할지.
   - 작성하면 문서만 바뀌므로 빌드는 생략된다.

---

## 8. 측정 한계 (NOT_PROVEN)

- 실기기(Android·iPhone·태블릿)·Preview·Production 화면: 측정하지 않았다.
- API 실응답(TM-02 의 실제 JSON, TM-25 의 stale 시간): 코드 근거만 있다.
- 운영 Storage 의 거래 고아 파일 수: 버킷을 커뮤니티와 공유해서 분리 산출할 수 없었다.
- unread·알림 동기화, Realtime: 측정하지 않았다.
- 외부 비교: FB 반경 선택값·사진 최대 장수, 당근 사진 최대 장수는 공식 문서로 확인하지 못했다.
