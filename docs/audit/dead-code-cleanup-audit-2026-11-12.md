# DIBAY 죽은 코드·불필요 파일 감사 (삭제 전 감사)

- 작성: 2026-11-12 15:40 PHT · 기준 트리 **origin/main 500272d9f** (로컬 main f1e7190ef 는 뒤처져 있어 최신 main 을 내보내 따로 분석)
- 성격: **감사만** — 이 문서 작성 외에 삭제·커밋·푸시는 하지 않음. 삭제는 아래 D0~D6 단계별 Owner 승인 후 진행.
- 판정 표기: 확인됨(코드·grep 증거 있음) / **NOT_PROVEN**(확인 못 함)

## 0. 요약

| 구분 | 건수 | 규모 | 판정 |
|---|---|---|---|
| 로컬 디스크 잡동사니 (git 밖) | 폴더 10여 개 | **약 15GB+** (Users/ 10GB · android build 2.1GB · .next 2.1GB · APK 542MB · 병합 끝난 worktree) | 확인됨 |
| git 에 올라간 임시·로그 파일 | 루트 15 + .qa-logs 31 + supabase/.temp 9 + reports 2 | 약 4.3MB | 확인됨 |
| 죽은 소스 파일 (어떤 페이지·API·proxy 에서도 import 안 됨, 참조 0) | **375** | 22,941 줄 | 확인됨 |
| 테스트·스크립트만 문자열로 참조하는 죽은 파일 | **146** | 18,943 줄 | 확인됨 (삭제 시 계약 테스트 동반 정리) |
| 통화 관련 죽은 파일 | 28 | 1,792 줄 | 확인됨 — **통화 변경 규정 대상, 별도 절차** |
| 죽은 API 라우트 (호출 0 / 별칭 / 410 / 시험만) | 80 | 약 4,765 줄 | 확인됨 (외부 OAuth 1건 NOT_PROVEN) |
| 고아 스크립트 (package.json·CI·훅·다른 스크립트 어디서도 안 부름) | 71 | — | 확인됨 |
| 참조 없는 public 파일 | 62 | 7.5MB | 코드 참조 0 확인 · **운영 DB image_url 사용 여부 NOT_PROVEN** |
| 안 쓰는 npm 패키지 | 1 (`omggif`) | — | 확인됨 |
| **결함(삭제 아님)** | 1 | — | 구매확정 API 가 410 인데 화면이 아직 호출 |

## 1. 감사 방법

1. **import 그래프**: git 추적 소스 13,771개를 읽어 `import/export from`·`import()`·`require()`·`vi.mock()` 를 tsconfig 별칭(`@/`·`@domain/*`)까지 풀어 연결. 시작점 = Next 진입 파일(page·layout·route·loading·error·not-found·manifest 등 1,888개) + `proxy.ts`·`instrumentation.ts`·`next.config.js`. 시작점에서 닿지 않는 `app·components·lib·hooks·contexts·services·repositories·types·config` 파일 = 죽은 후보 552개.
2. **2차 문자열 대조**: 후보마다 경로·파일명이 다른 코드 파일(문서 제외)에 문자열로라도 나오는지 대조 → 참조 0 / 테스트·스크립트만 / 주석·이름 겹침(20건, 직접 열어 모두 주석·다른 파일 확인) 으로 나눔. 동적 import 누락 없음.
3. **API**: 라우트 1,132개 URL 을 `${...}` 를 와일드카드로 바꾼 전체 코드(네이티브 Swift/Kotlin·public sw·vercel.json 포함)와 대조 → 문자열 호출 없는 162개를 서브에이전트 3개가 호출 헬퍼(`philifeMeetingApi`·`communityMessengerRoomResourcePath`·`CONTACTS_API_BASE`·`apiBase` 등)·네이티브·웹훅까지 추적해 77개는 실제 호출(CALLED)로 제외, 나머지를 분류. 「없음」 판정 키워드는 최신 main 스냅숏에서 다시 grep 해 확인.
4. **로컬 파일**: `git status --ignored`·`du`·`git worktree list`·병합 여부(`merge-base --is-ancestor origin/main`) 확인.

## 2. 로컬 디스크 정리 (D0 — git 밖, 앱·배포 영향 없음)

| 대상 | 크기 | 내용 | 권고 |
|---|---|---|---|
| `Users/bkkim/projects/samarket/` (중첩 폴더) | **10GB** | 실수로 만든 절대경로 복사본 — `.next-r5-prod`·`.next-gift-*`·`.next-v2-proof`·`.tmp` 등 옛 빌드 결과 8개 | 삭제 |
| `android/app/build`·`android/build`·`android/.gradle` | 2.2GB | Gradle 결과물 (다시 만들어짐) | 삭제 (다음 빌드 때 재생성) |
| `.next/` | 2.1GB | 개발 서버 캐시 | 삭제 가능 (`npm run clean`) |
| `docs/perf/*.apk` 4개 | 542MB | 9~10월 시험 APK (gitignore 됨) | 삭제 |
| `ios/App/build` | 83MB | Xcode 결과물 | 삭제 |
| `.tsbuild/`·`tsconfig.*.tsbuildinfo` | 66MB | tsc 증분 캐시 | 삭제 가능 |
| `.recovery/`·`.recovery-manifest/` | 38MB | 9월 통화·배달 복구용 패치·tar·증거 덤프 | 보관 필요 없으면 삭제 (`.recovery/finance-*.patch`·`phase-a-call-wip.patch` 는 열어보고 결정) |
| `.tmp/`·`.tmp-verify/`·`.worktrees/`(빈 폴더)·`test-results/`·`staging-results.json` | 2MB | 시험 임시 | 삭제 |
| `.env.local.bak*`·`.env.local.before-auth-patch`·`.env.local.prod-backup-settlement-verify*`·`.env.bundle6-test-app.local`·`.env.vercel.*` | 11개 | **운영 키가 든 백업 사본** | 삭제 권고 (보안상 사본 최소화). `.env.local` 원본만 유지 |
| `AuthKey_3747N7936Z.p8` | 1개 | Apple 개인키가 프로젝트 루트에 있음 (gitignore 됨) | 삭제가 아니라 **저장소 밖 안전한 위치로 이동** 권고 |
| 병합 끝난 worktree | 16개 · 약 12GB | `.claude/worktrees/*`(moim-m1~m6·hub-*·i18n-d·scroll-f·shell-ssr-c) + `../samarket-cicache·deploydoc·ph-otp·tsfix` — 모두 origin/main 에 병합됨 | `git worktree remove`. 단 **미커밋 변경 있는 것 제외**: hub-keepalive(15)·moim-topic(5)·msg-p0(4, 브랜치 미병합)·samarket-wt-header(15). moim-* 는 오늘 생성 — 다른 세션 사용 중이면 그 세션 종료 후 |
| 로컬 브랜치 175개 중 병합된 90개 / 원격 85개 중 병합된 35개 | — | — | 병합된 것 삭제 (원격 삭제는 GitHub 변경이라 별도 승인) |
| `git stash` 104개 | — | — | 목록 확인 후 정리 (내용 미확인 — NOT_PROVEN) |

## 3. git 에 올라간 임시·로그 파일 (D1)

| 파일 | 마지막 수정 | 권고 |
|---|---|---|
| `.next-build-full.txt` · `build-webpack.log` · `.perf-prod-measure-err.log`(0바이트) | 4~5월 | 삭제 |
| `messenger-r2-d1-*.log` 7개 · `messenger-r2-m5-perf.log` | 5월 | 삭제 |
| `delivery-phase1-ux-measure*.json` 2개 · `delivery-phase2-store-detail-after.json` | 5월 | 삭제 |
| `staging-results.json` (내용 `[]`) | 10-20 | 삭제 (스테이징 체계 철회됨) |
| `reports/android-play-in-app-update/*` 2개 | 10-17 | 삭제 (`docs/` 로 옮길 가치 없으면) |
| `.qa-logs/` 추적 파일 31개 (QA 스크립트·결과 JSON) | ~10-20 | 삭제 + gitignore. 다시 쓸 QA 스크립트는 `scripts/qa/` 로 이동 |
| `supabase/.temp/` 9개 (CLI 캐시: project-ref·pooler-url 등) | 매번 바뀜 | **git 추적 해제 + gitignore** (지금도 `cli-latest` 가 매번 변경으로 잡힘) |

규정상 코드 없는 커밋은 단독 반영하지 않으므로 D1 은 D2 와 같은 PR 에 넣는다.

## 4. 죽은 소스 파일 (D2 · D3)

### D2 — 참조 0 (375개 · 22,941 줄)
폴더별: components/admin 74 · components/stores 21 · components/community 19 · lib/community-messenger 18 · components/community-messenger 17 · lib/stores 16 · components/mypage 14 · components/my 11 · lib/admin 11 · components/delivery 10 · lib/ui 9 · lib/chat-domain 6 · components/chats 5 · components/regions 5 · lib/chats 5 · lib/admin-dashboard 4 · lib/auth 4 · lib/business 4 · lib/categories 4 · lib/notifications 4 · lib/trade 4 · components/addresses 3 · components/layout 3 · components/member-orders 3 · components/onboarding 3 · components/reports 3 · components/write-launcher 3 · lib/addresses 3 · lib/admin-audit 3 · lib/gift-certificate 3 · lib/messenger 3 · lib/navigation 3 · lib/posts 3 · components/notifications 2 · components/philife 2 · lib/admin-business 2 · lib/admin-users 2 · lib/ads 2 · lib/chat 2 · lib/i18n 2 · lib/mypage 2 · lib/products 2 · lib/shared-notifications 2 · app/(main) 1 · app/account 1 · components/ads 1 · components/auth 1 · components/favorites 1 · components/gift-certificate 1 · components/home-feed 1 · components/home 1 · components/market 1 · components/member-benefits 1 · components/offers 1 · components/product 1 · components/reviews 1 · components/search 1 · components/trade 1 · components/ui 1 · components/write 1 · hooks/useHasOwnerStores.ts 1 · hooks/useMeStoreBySlug.ts 1 · hooks/usePriceOffersProductRealtime.ts 1 · lib/admin-products 1 · lib/admin-reviews 1 · lib/admin-settings 1 · lib/alarm 1 · lib/comments 1 · lib/community 1 · lib/currency 1 · lib/dibay 1 · lib/domains 1 · lib/html 1 · lib/http 1 · lib/map 1 · lib/my 1 · lib/neighborhood 1 · lib/offers 1 · lib/permissions 1 · lib/profile 1 · lib/push 1 · lib/release-archive 1 · lib/search 1 · lib/startup 1 · lib/store-commerce 1 · lib/store-order-chat 1 · lib/test-utils 1 · lib/utils 1 · hooks/use-is-mobile-viewport.ts 1 · lib/constants.ts 1 · lib/layout 1 · lib/mypage-settings 1 · lib/platform-popup 1 · lib/point-policies 1 · lib/supabase.ts 1 · lib/types.ts 1 · lib/types 1

대표 예: `components/admin/AdminSidebar.tsx`(새 셸로 대체) · `components/mypage/MyPageHeader.tsx`(`components/my/MyPageHeader` 로 대체) · `components/stores/detail/StoreDetailPage.tsx` · `lib/supabase.ts`·`lib/types.ts`·`lib/constants.ts`(같은 이름 폴더로 옮겨진 뒤 남은 옛 파일) · `components/admin/settings/_quarantine/*` · 각 폴더 `index.ts` 배럴(아무도 배럴로 import 안 함).

**보존 (삭제 제외)**: AGENTS.md 가 단일 정의로 지목한 파일 3개 — `lib/chat-domain/samarket-three-chat-pillars.ts` · `lib/trade/trade-lightweight-goals.ts` · `lib/chat-domain/ports/call-signaling-boundary.ts`. import 는 없지만 규정 문서의 기준 파일이다.

### D3 — 테스트·스크립트가 파일을 문자열로 읽기만 함 (146개 · 18,943 줄)
폴더별: components/admin 26 · components/stores 12 · lib/community-messenger 7 · components/mypage 6 · lib/admin 6 · components/community-messenger 4 · components/delivery 4 · components/layout 4 · components/my 4 · lib/messenger 4 · lib/notifications 4 · components/chats 3 · components/offers 3 · components/search 3 · lib/auth 3 · lib/categories 3 · lib/stores 3 · lib/admin-products 2 · lib/chat-domain 2 · lib/chat 2 · lib/chats 2 · lib/posts 2 · lib/search 2 · app/(main) 1 · components/chat 1 · components/favorites 1 · components/philife 1 · components/product 1 · components/reviews 1 · components/write-launcher 1 · hooks/use-delivery-store-search.ts 1 · hooks/use-is-desktop-shell-viewport.ts 1 · lib/addresses 1 · lib/admin-business 1 · lib/ads 1 · lib/automation 1 · lib/backup 1 · lib/business 1 · lib/comments 1 · lib/community-feed 1 · lib/constants 1 · lib/datetime 1 · lib/delivery 1 · lib/env 1 · lib/gift-certificate 1 · lib/main-menu 1 · lib/member-benefits 1 · lib/ops 1 · lib/philife 1 · lib/platform-popup 1 · lib/points 1 · lib/push 1 · lib/release-archive 1 · lib/reports 1 · lib/startup 1 · lib/system 1 · lib/trade-ads 1 · lib/trade 1

화면에서는 안 쓰이지만 계약 테스트(`readFileSync` 로 소스 검사)나 `verify-*.cjs`·`i18n-quality-baseline.json` 이 경로를 들고 있다. 파일만 지우면 그 테스트가 깨지므로 **같은 PR 에서 해당 테스트 단언·기준 파일을 함께 정리**해야 한다.

### 별도로 import 그래프상 「테스트에서만 import」되는 파일 290개
(`lib/messenger` 79 · `lib/stores` 28 · `lib/admin` 24 · `lib/notifications` 22 · `lib/chat-domain` 22 …) — 순수 함수가 테스트로만 검증되고 제품에서 안 불리는 상태. 대부분 「설계만 하고 연결 안 한」 계약 모듈로 보이나 의도(다음 단계 연결 예정 여부)는 **NOT_PROVEN** — 이번 삭제 범위에 넣지 않고 목록만 남김.

## 5. 죽은 API (D4)

| URL | 판정 | 근거 |
|---|---|---|
| `/api/admin/community-messenger-home-cutover-gate` | DEAD | fetch 없음(lib·테스트만) |
| `/api/admin/community-messenger/friend-requests/[id]` | DEAD | UI 는 비관리자 friend-requests 만 호출 |
| `/api/admin/community-messenger/reports/[id]/action` | DEAD | 관리자 UI 는 /api/admin/reports/[id]/action 사용 |
| `/api/admin/community-messenger/rooms/[id]/ghost` | DEAD | 계약 테스트가 「더 이상 호출 안 함」 단언 |
| `/api/admin/community/point-ledger` | DEAD | UI 는 /api/admin/community/points 사용 |
| `/api/admin/delivery/bottom-nav` | ALIAS | /api/admin/stores/bottom-nav 재수출, 페이지는 redirect |
| `/api/admin/notification-settings` | DEAD | 스크립트 파일경로 검사만 |
| `/api/admin/notification-settings/upload-sound` | DEAD | UI 는 notification-sound-ssot/upload 사용 |
| `/api/admin/notification-sound-ssot/preview-resolver` | DEAD | 감사 테스트 목록에만 있음 |
| `/api/admin/philife-reports` | ALIAS | community-reports 재수출, 호출 0 |
| `/api/admin/philife-reports/[id]` | ALIAS | community-reports/[id] 재수출, 호출 0 |
| `/api/admin/philife/sections` | ALIAS | community/sections 재수출, 호출 0 |
| `/api/admin/philife/sections/[id]` | ALIAS | 재수출, 호출 0 |
| `/api/admin/philife/settings` | ALIAS | community/settings 재수출, 호출 0 |
| `/api/admin/philife/topics` | ALIAS | 재수출, 호출 0 |
| `/api/admin/philife/topics/[id]` | ALIAS | 재수출, 호출 0 |
| `/api/admin/trade-ad-products/[id]` | DEAD | 타입 import 만 |
| `/api/app/notification-sound-config` | DEAD | 테스트가 「더 이상 fetch 안 함」 단언 |
| `/api/app/order-match-alert-sound` | DEAD | fetch 없음 |
| `/api/auth/oauth/callback` | DEAD_EXT? | /auth/callback 로 넘기는 옛 진입점. 저장소 안 호출 0, 외부 콘솔 redirect URI 등록 여부 확인 못 함 |
| `/api/admin/notification-campaigns/[campaignId]/test-send` | TEST_ONLY | scripts/qa 만, UI 는 컬렉션 test-send 사용 |
| `/api/admin/delivery-ads/business-cash/charge-requests/[id]` | GONE_410 | 410 |
| `/api/admin/gift-certificates/conversions/[id]/approve` | GONE_410 | 410 |
| `/api/admin/startup-config/upload-image` | GONE_410 | 410 |
| `/api/admin/store-orders/[orderId]/approve-refund` | GONE_410 | legacy write gate 로 항상 차단 |
| `/api/admin/store-orders/[orderId]/cancel-request` | GONE_410 | legacy write gate 로 항상 차단 |
| `/api/admin/store-orders/[orderId]/mark-paid` | GONE_410 | legacy write gate 로 항상 차단 |
| `/api/admin/store-point-charges/[id]` | GONE_410 | 410 |
| `/api/admin/store-points/[storeId]/adjust` | GONE_410 | 410 |
| `/api/admin/store-settlements` | GONE_410 | 410 |
| `/api/admin/store-settlements/[settlementId]` | GONE_410 | 410 |
| `/api/admin/trade-post-ads/[id]` | GONE_410 | 410 legacy_read_only |
| `/api/categories/trade-expand-ids` | DEAD | 호출 0 |
| `/api/chat/rooms/[roomId]/job-contact` | DEAD | 호출 0 |
| `/api/chat/rooms/[roomId]/trade-status` | GONE_410 | 410 trade_sold_only |
| `/api/community-messenger/blocked` | DEAD | 차단은 /api/me/relations/blocked 사용 |
| `/api/community-messenger/calls/[sessionId]/missed` | TEST_ONLY | scripts/qa 만 — 통화 규정 대상 |
| `/api/community-messenger/group-rooms/[roomId]/messages` | DEAD | 방 전송은 rooms/[id]/messages 사용 |
| `/api/community-messenger/rooms/[roomId]/room-snapshot-diagnostics-e2e` | TEST_ONLY | E2E 진단(운영 차단) |
| `/api/community/neighborhood-feed` | ALIAS | philife 주소로만 호출(핸들러는 사용 중) |
| `/api/community/neighborhood-posts/[postId]` | ALIAS | philife 주소로만 호출(핸들러는 사용 중) |
| `/api/community/posts/[postId]/comments/[commentId]/like` | ALIAS | philife 주소로만 호출(핸들러는 사용 중) |
| `/api/community/posts/[postId]/view` | ALIAS | philife 주소로만 호출(핸들러는 사용 중) |
| `/api/community/posts/[postId]/share/internal` | DEAD | 공유 UI 는 share/targets 사용 |
| `/api/delivery/search` | ALIAS | /api/stores/search 재수출, 호출 0 |
| `/api/feed/candidates` | DEAD | 호출 0 |
| `/api/feed/home-policies` | DEAD | 호출 0 |
| `/api/feed/personalized-policies` | DEAD | 호출 0 |
| `/api/me/addresses/[id]/set-default` | DEAD | 정책 표에만, UI 는 PATCH /api/me/addresses/[id] |
| `/api/me/delivery-ads/performance` | DEAD | UI 는 /api/me/delivery-ads/[campaignId]/performance |
| `/api/me/points/promotion-orders/[id]` | DEAD | 목록 루트만 호출 |
| `/api/me/store-coupons/checkout-quote` | TEST_ONLY | scripts/qa 만, 제품은 best-eligible |
| `/api/me/store-coupons/claim` | TEST_ONLY | scripts/qa 만 |
| `/api/me/store-coupons/claimable` | TEST_ONLY | scripts/qa·테스트만 |
| `/api/me/store-owner-hub-badge/store-attention` | DEAD | 루트 배지 URL 만 호출 |
| `/api/me/store-owner-hub-badge/unreads` | DEAD | 루트 배지 URL 만 호출 |
| `/api/me/stores/[storeId]/gift-certificates/cash-outs` | GONE_410 | 410 |
| `/api/me/stores/[storeId]/gift-certificates/conversions` | GONE_410 | POST 410, GET 호출 0 |
| `/api/me/stores/[storeId]/gift-certificates/revenue` | GONE_410 | 410 |
| `/api/me/stores/[storeId]/orders/[orderId]/delivery` | DEAD | 호출 0 |
| `/api/me/stores/[storeId]/orders/[orderId]/review` | DEAD | UI 는 reviews/[rid]/reply 사용 |
| `/api/me/stores/[storeId]/platform-inquiries` | GONE_410 | POST 410, GET 호출 0 |
| `/api/me/stores/[storeId]/point-charges` | GONE_410 | 410 |
| `/api/me/stores/[storeId]/points` | GONE_410 | 410 |
| `/api/my/purchases/[chatId]` | DEAD | 루트 /api/my/purchases 만 호출 |
| `/api/posts/[postId]/related` | DEAD | RSC 로 대체, fetch 0 |
| `/api/posts/[postId]/trade-ads/apply` | GONE_410 | 410 AD-P0-3 |
| `/api/posts/[postId]/trade-ads/products` | DEAD | 호출 0 |
| `/api/stores/[slug]/inquiries` | DEAD | 매장 문의는 /api/me/stores/[id]/inquiries |
| `/api/system/messenger-monitoring-summary` | DEAD | 개발 전용(운영 404), 문서에만 |
| `/api/system/supabase-connectivity` | DEAD | 개발 진단, 호출 0 |
| `/api/system/supabase-project` | DEAD | 개발 진단, 호출 0 |
| `/api/test-logout` | DEAD | 호출 0 (test-login 쌍) |
| `/api/trade/product-chat/[roomId]/submit-review` | GONE_410 | 410, 호출 0 |
| `/api/users/by-username/[username]/community-posts` | DEAD | 호출 0 |
| `/api/users/by-username/[username]/public-profile` | DEAD | 제품은 /api/users/[id]/public-profile |

- **ALIAS**: 다른 핸들러를 그대로 재수출하는 옛 주소. 지워도 원 핸들러는 남는다. `/api/community/*` 별칭 4개는 반대로 **원 핸들러를 philife 주소가 재수출**하므로 route 파일을 지우면 안 되고, 정리하려면 핸들러를 philife 쪽으로 옮기는 작업이 필요 (단순 삭제 대상 아님).
- **GONE_410**: 이미 410 을 돌려주는 막힌 라우트. 호출처 없음 확인 → 삭제해도 동작 변화 없음 (404 로 바뀌는 것만 차이).
- **TEST_ONLY**: `scripts/qa` 만 부름 — 라우트를 지우면 해당 QA 스크립트도 같이 지운다.
- `/api/auth/oauth/callback`: Google·Apple·Kakao 콘솔에 이 주소가 redirect URI 로 남아 있는지 **NOT_PROVEN** — 콘솔 확인 전에는 지우지 않음.

**유지 (외부 호출)**: `/api/system/messenger-readiness` · `/api/webhooks/delivery-rider-location` · `/api/webhooks/external-delivery` · `/api/community-messenger/calls/[sessionId]/push-ack`

## 6. 통화 관련 (D5 — 통화 변경 규정 적용)

죽은 파일 28개 (`lib/call/*` 옛 WebRTC 시그널링·`callSoundManager`·`perfect-negotiation`, `components/community-messenger/call-ui/*`, `call-history` 배지 등) + 라우트 5개:

| `/api/community-messenger/calls/[sessionId]/accept` | DEAD_CALL | 웹·Android·iOS 모두 calls/sessions/[id] 사용 — 통화 규정 대상 |
| `/api/community-messenger/calls/[sessionId]/end` | DEAD_CALL | 동일 — 통화 규정 대상 |
| `/api/community-messenger/calls/[sessionId]/reject` | DEAD_CALL | 동일 — 통화 규정 대상 |
| `/api/community-messenger/calls/stub-message` | DEAD_CALL | 제품 호출 0, 코드 주석 「Preserve route」 — 통화 규정 대상 |
| `/api/community-messenger/calls/[sessionId]/missed` | TEST_ONLY | scripts/qa 만 |

AGENTS.md 「통화 변경 규정」상 웹·서버 통화 코드도 대상이다. 삭제여도 **영향 분석 문서 → Owner 승인 → 통화만 단독 PR → 실기기 행렬 확인** 순서로 따로 진행한다. 특히 `calls/[sessionId]/accept·end·reject` 는 **설치된 구 바이너리**(`user_devices.app_version`)가 아직 부르는지 운영 DB·로그로 확인해야 한다 — 현재 **NOT_PROVEN**.

## 7. 그 밖의 후보 (D6)

- **고아 스크립트 71개** — `_tmp-*`(13개, 이름부터 임시), 일회성 `apply-*`·`patch-*`·`sam-*-codemod`·`phase2-*` 코드모드 등. 목록은 부록 C.
- **package.json 스크립트 315개** 중 위 고아와 별개로 옛 단계 이름(`ops1:*`·`nhr1:*`·`lfc1:*`·`pds1`)이 다수 — 실행 대상 파일은 모두 존재(깨진 항목 0). 정리 여부는 사용 빈도 확인 필요 (**NOT_PROVEN**).
- **public 미참조 62개 (7.5MB)**: `next.svg`·`vercel.svg`·`globe.svg`·`window.svg`·`file.svg`(create-next-app 기본 파일)·`exchange-default.svg` 는 삭제 가능. `public/icons/**`(56개)는 코드상 「정적 아이콘 폴백 금지」로 안 쓰이지만 운영 DB `image_url` 에 `/icons/...` 가 남아 있는지 **NOT_PROVEN** — 읽기 전용 조회 후 결정.
- **npm**: `omggif` 는 import 0 → 제거. (`@capacitor/ios·android·assets` 는 네이티브 빌드용, `jsdom` 은 테스트 환경용이라 유지.)
- **redirect 전용 페이지 130개** (`app/(main)/my/*` 46 · `mypage/*` 21 · `admin/delivery-orders/*` 10 …): 옛 주소·알림 딥링크 호환용이라 이번 삭제 대상에서 제외.

## 8. 결함 (삭제와 별개 · 보고만)

- **구매확정 버튼이 막힌 API 를 호출**: `/api/trade/product-chat/[roomId]/buyer-confirm` route 는 410(`trade_sold_only`)을 돌려주는데 `components/trade/TradeFlowBanner.tsx:254`·`components/mypage/purchases/PurchaseHistoryCard.tsx:179,212` 가 아직 이 주소로 POST 한다 (서브에이전트 확인 · 최신 main 에서 화면 실행 재현은 하지 않음 → 화면 FAIL 여부 **NOT_PROVEN**).

## 9. 확인 못 한 것 (NOT_PROVEN)

- DB 쪽 미사용 객체(함수·테이블·트리거·RLS)와 pg_net 등 DB 에서 API 를 부르는 경로 — 이번 감사 범위 밖, 조회 안 함.
- 외부 콘솔 redirect URI(`/api/auth/oauth/callback`), 운영 DB 의 `/icons/*` 이미지 경로, 구 앱 바이너리의 옛 통화 API 호출.
- 「테스트에서만 import」 290개의 향후 연결 계획.
- `docs/`(1,137개 · 문서·감사 기록)는 기록 보존 성격이라 감사하지 않음.

## 10. 삭제 진행안 (승인 단위)

| 단계 | 내용 | 영향 | 검증 |
|---|---|---|---|
| D0 | 로컬 디스크 정리 (git 밖) | 없음 | `git status` 동일 · 미커밋 worktree 제외 확인 |
| D1+D2 | 추적 잡파일 + 참조 0 소스 375개 삭제, `omggif` 제거, `supabase/.temp` 추적 해제 | 번들 변화 없음(원래 안 닿는 파일) | `typecheck:build` · `typecheck:test` · vitest 전체 · eslint · `verify:routes` |
| D3 | 테스트만 참조 146개 + 해당 계약 테스트 단언 정리 | 테스트 코드만 변경 | 위와 같음 |
| D4 | 죽은 API (DEAD·ALIAS(재수출 쪽만)·GONE_410·TEST_ONLY) 삭제 + 관련 QA 스크립트·권한 정책 표(`member-consent-mutation-policy`·`member-action-policy`) 항목 정리 | 해당 URL 404 | 위 + 라우트 감사 테스트 |
| D5 | 통화 관련 — 통화 규정 절차(영향 분석 문서 → 승인 → 단독 PR → 실기기 행렬) | 통화 | 실기기 행렬 |
| D6 | 고아 스크립트 · public 기본 svg · (DB 확인 후) public/icons | 없음 | 위와 같음 |

각 단계는 PR 1개 · 웹 변경(네이티브 파일 무변경)으로 앱 재빌드 필요 없음.

## 부록 A — D2 참조 0 파일 (375)
```
app/(main)/chats/ChatsPageClient.tsx  (16)
app/account/delete-request/AccountDeleteRequestPageClient.tsx  (21)
components/addresses/AddressDesignationField.tsx  (178)
components/addresses/AddressFineTuneMapClient.tsx  (113)
components/addresses/address-labels.ts  (10)
components/admin/AdminModerationStatusBadge.tsx  (43)
components/admin/AdminSidebar.tsx  (110)
components/admin/AdminStatusBadge.tsx  (40)
components/admin/ad-products/AdProductTable.tsx  (201)
components/admin/ad-products/AdminAdProductsPageClient.tsx  (44)
components/admin/ads/AdminFeedAdRequestQueue.tsx  (195)
components/admin/audit/AdminAuditFilterBar.tsx  (95)
components/admin/audit/AdminAuditLogListPage.tsx  (91)
components/admin/audit/AdminAuditLogTable.tsx  (81)
components/admin/audit/AdminAuditSummaryCards.tsx  (54)
components/admin/banners/AdminBannerChangeLogList.tsx  (40)
components/admin/banners/AdminBannerListPage.tsx  (65)
components/admin/business/AdminBusinessActionPanel.tsx  (88)
components/admin/business/AdminBusinessLogList.tsx  (48)
components/admin/categories/CategoryDragList.tsx  (117)
components/admin/categories/CategoryEditModal.tsx  (184)
components/admin/categories/CategoryStatusBadge.tsx  (21)
components/admin/categories/CategoryTable.tsx  (129)
components/admin/categories/CategoryTypeBadge.tsx  (29)
components/admin/chats/AdminLinkedChatRoomsCard.tsx  (107)
components/admin/console/AdminConsoleDetailPane.tsx  (40)
components/admin/console/AdminConsoleListPane.tsx  (31)
components/admin/console/AdminConsoleSplitView.tsx  (38)
components/admin/console/AdminConsoleToolbar.tsx  (31)
components/admin/dashboard/AdminKpiCards.tsx  (63)
components/admin/dashboard/AdminNoticeCard.tsx  (18)
components/admin/dashboard/AdminQuickLinks.tsx  (83)
components/admin/dashboard/AdminRecentActivityPanels.tsx  (222)
components/admin/dashboard/AdminStatusSummaryPanels.tsx  (194)
components/admin/dashboard/AdminTrendChart.tsx  (101)
components/admin/delivery-orders/AdminDeliveryOrderChatDbClient.tsx  (33)
components/admin/delivery-orders/AdminMemoBox.tsx  (43)
components/admin/delivery-orders/AdminOrderTimeline.tsx  (38)
components/admin/delivery-orders/CancelRequestTable.tsx  (90)
components/admin/delivery-orders/DeliveryAuditLogTable.tsx  (76)
components/admin/delivery-orders/DeliveryAuditLogsClient.tsx  (149)
components/admin/delivery-orders/DeliveryCancellationsClient.tsx  (105)
components/admin/delivery-orders/DeliveryOrderBadges.tsx  (58)
components/admin/delivery-orders/DeliveryOrdersByBuyerClient.tsx  (84)
components/admin/delivery-orders/DeliveryOrdersByStoreClient.tsx  (85)
components/admin/delivery-orders/DeliveryOrdersProgressPanel.tsx  (113)
components/admin/delivery-orders/DeliveryReasonModal.tsx  (62)
components/admin/delivery-orders/DeliveryReportsClient.tsx  (138)
components/admin/delivery-orders/HoldReasonModal.tsx  (32)
components/admin/delivery-orders/OrderAmountCard.tsx  (35)
components/admin/delivery-orders/OrderDetailCard.tsx  (128)
components/admin/delivery-orders/OrderItemsTable.tsx  (43)
components/admin/delivery-orders/OrderReportTable.tsx  (76)
components/admin/delivery-orders/RefundDecisionModal.tsx  (34)
components/admin/delivery-orders/RefundRequestTable.tsx  (83)
components/admin/delivery-orders/SettlementFilterBar.tsx  (74)
components/admin/delivery-orders/SettlementTable.tsx  (69)
components/admin/delivery-orders/do-admin-locale.ts  (8)
components/admin/delivery-orders/useDoAdminStatusLabels.ts  (61)
components/admin/menus/CategorySubtopicFormModal.tsx  (223)
components/admin/menus/CategorySubtopicsModal.tsx  (40)
components/admin/menus/MainBottomNavFabEditor.tsx  (308)
components/admin/menus/MenuManagementTable.tsx  (231)
components/admin/menus/TradeSubtopicsPanel.tsx  (194)
components/admin/operations/AdminOperationsHubPage.tsx  (77)
components/admin/order-notifications/AdminNotificationList.tsx  (245)
components/admin/personalized-feed/UserBehaviorProfileTable.tsx  (76)
components/admin/points/AdminPointChargeFilterBar.tsx  (50)
components/admin/post-ads/AdminAdTable.tsx  (181)
components/admin/reports/AdminModerationLogList.tsx  (53)
components/admin/reviews/AdminTrustSummaryCards.tsx  (42)
components/admin/settings/AdminCategoryManagement.tsx  (149)
components/admin/settings/ServiceCategoryTable.tsx  (72)
components/admin/settings/SubcategoryTable.tsx  (101)
components/admin/store-points/AdminStorePointPoliciesPage.tsx  (73)
components/admin/stores/AdminStoreBannerAdsPage.tsx  (79)
components/admin/stores/AdminStoreInsertionControlPage.tsx  (95)
components/admin/stores/AdminStoreVisibleToggle.tsx  (79)
components/admin/users/AdminStaffTable.tsx  (102)
components/ads/AdStatusBadge.tsx  (28)
components/auth/AuthComplianceRedirect.tsx  (156)
components/chats/ChatImageStack.tsx  (33)
components/chats/ChatRoomList.tsx  (307)
components/chats/ChatRoomListMenu.tsx  (152)
components/chats/ChatsHubStickyAppBar.tsx  (14)
components/chats/ChatsPhilifeHubMainTier1Sync.tsx  (25)
components/community-messenger/CommunityMessengerBellPinnedAlerts.tsx  (60)
components/community-messenger/MessengerPrimarySectionNav.tsx  (17)
components/community-messenger/MessengerServiceStrip.tsx  (81)
components/community-messenger/domain-shell-canary/DomainCanaryShellRow.tsx  (101)
components/community-messenger/domain-shell-canary/DomainTradeListingContextDock.tsx  (64)
components/community-messenger/domain-shell-canary/TradeDomainShellRow.tsx  (100)
components/community-messenger/home/MessengerHomeFabPlusIcon.tsx  (10)
components/community-messenger/room/CommunityMessengerRoomComposerEarly.tsx  (57)
components/community-messenger/room/CommunityMessengerRoomComposerSurface.tsx  (4)
components/community-messenger/room/CommunityMessengerRoomLayoutInlineShell.tsx  (20)
components/community-messenger/room/MessengerRoomR2M11CLayoutTimingBridge.tsx  (29)
components/community-messenger/room/StoreOrderBuyerMessengerRoomBackRegistrar.tsx  (28)
components/community-messenger/room/phase2/StoreOrderOwnerMessengerActionBar.tsx  (136)
components/community-messenger/room/phase2/TradeMarketplaceContextBanner.tsx  (59)
components/community-messenger/room/phase2/store-order-delivery-detail-drawer-context.tsx  (10)
components/community-messenger/room/use-store-order-buyer-messenger-room-back-override.ts  (27)
components/community/Card.tsx  (2)
components/community/CategoryBadge.tsx  (2)
components/community/CommentItem.tsx  (47)
components/community/CommentList.tsx  (41)
components/community/CommunityCategoryBadge.tsx  (10)
components/community/CommunityCommentForm.tsx  (48)
components/community/CommunityCommentList.tsx  (4)
components/community/CommunityFilterBar.tsx  (15)
components/community/CommunityImageGallery.tsx  (29)
components/community/CommunityLikeButton.tsx  (28)
components/community/CommunityLocationBadge.tsx  (10)
components/community/CommunityMetaBar.tsx  (25)
components/community/LikeButton.tsx  (2)
components/community/LocationBadge.tsx  (2)
components/community/NeighborFollowButton.tsx  (82)
components/community/PhilifeHomeFeedPage.tsx  (6)
components/community/share/CommunitySharePreviewCard.tsx  (49)
components/community/ui/CommunityViberSurfaces.tsx  (53)
components/delivery/ui/DeliveryAddressCard.tsx  (36)
components/delivery/ui/DeliveryBadge.tsx  (28)
components/delivery/ui/DeliveryButton.tsx  (55)
components/delivery/ui/DeliveryCard.tsx  (22)
components/delivery/ui/DeliveryDivider.tsx  (4)
components/delivery/ui/DeliveryInfoCard.tsx  (30)
components/delivery/ui/DeliveryInput.tsx  (12)
components/delivery/ui/DeliverySection.tsx  (20)
components/delivery/ui/DeliveryStickyCTA.tsx  (19)
components/delivery/ui/DeliveryThumbnail.tsx  (36)
components/favorites/FavoriteToggleButton.tsx  (59)
components/gift-certificate/GiftArtwork.tsx  (43)
components/home-feed/HomeTradeReelsSideRail.tsx  (427)
components/home/HomeServicesBlock.tsx  (66)
components/layout/AppTier1HeaderTitleCluster.tsx  (28)
components/layout/SearchButton.tsx  (36)
components/layout/StoresHubMainAppProviders.tsx  (28)
components/market/MarketCategoryRouteFallback.tsx  (27)
components/member-benefits/MemberProfileFrame.tsx  (52)
components/member-orders/MemberOrderItems.tsx  (24)
components/member-orders/MemberOrderSummary.tsx  (32)
components/member-orders/MemberOrderTimeline.tsx  (30)
components/my/MyOrderRelatedSection.tsx  (50)
components/my/MyQuickLinks.tsx  (109)
components/my/MySafeTradeCard.tsx  (31)
components/my/MySectionList.tsx  (135)
components/my/MyServiceGrid.tsx  (111)
components/my/MyServicesCategoryGrid.tsx  (79)
components/my/MyStoreOrdersHomePreview.tsx  (225)
components/my/ProfileStatRow.tsx  (14)
components/my/settings/NoticeDetailContent.tsx  (87)
components/my/settings/SettingsAdminEntry.tsx  (62)
components/my/settings/settings-icons.tsx  (94)
components/mypage/KamarketPayCard.tsx  (24)
components/mypage/MyActivitySection.tsx  (40)
components/mypage/MyInterestSection.tsx  (86)
components/mypage/MyPageMobileFold.tsx  (45)
components/mypage/MyTradeSection.tsx  (102)
components/mypage/MypagePurchaseSalesHubTabs.tsx  (37)
components/mypage/MypageTradeHubChatList.tsx  (23)
components/mypage/TradeHubSideNav.tsx  (43)
components/mypage/myinfo/myinfo-theme.ts  (39)
components/mypage/profile/ProfilePublicEditForm.tsx  (163)
components/mypage/required/RequiredInfoActiveStepPanel.tsx  (156)
components/mypage/store-orders/MypageStoreOrderChatStatus.tsx  (85)
components/mypage/trade/TradeHubPrimarySurface.tsx  (14)
components/notifications/DiBaYNotificationOnboardingGate.tsx  (9)
components/notifications/GlobalOrderChatUnreadSound.tsx  (11)
components/offers/OfferListSeller.tsx  (403)
components/onboarding/DibayIdOnboardingClient.tsx  (237)
components/onboarding/OnboardingAddressClient.tsx  (100)
components/onboarding/OnboardingUsernameClient.tsx  (175)
components/philife/PhilifeHeaderMessengerButton.tsx  (120)
components/philife/PhilifeTitleWithRegionRow.tsx  (14)
components/product/ProductStatusBadge.tsx  (48)
components/regions/MyRegionSettingsView.tsx  (95)
components/regions/PrimaryRegionBadge.tsx  (12)
components/regions/RegionSelectorForm.tsx  (121)
components/regions/SavedRegionCard.tsx  (63)
components/regions/SavedRegionList.tsx  (52)
components/reports/BlockedUserCard.tsx  (53)
components/reports/BlockedUserList.tsx  (54)
components/reviews/ReviewList.tsx  (36)
components/search/RecentSearches.tsx  (74)
components/stores/StoreCommerceSummaryCard.tsx  (125)
components/stores/StoreDetailInfoCard.tsx  (168)
components/stores/StoreTaxonomyThumb.tsx  (47)
components/stores/advertising/DeliveryAdAdminFirstPartyStepProgress.tsx  (40)
components/stores/advertising/DeliveryAdOwnerCustomPeriodBoard.tsx  (51)
components/stores/advertising/DeliveryAdOwnerPlacementChipGrid.tsx  (49)
components/stores/advertising/DeliveryAdOwnerStepProgress.tsx  (43)
components/stores/browse/BrowsePrimaryIndustryVisual.tsx  (74)
components/stores/browse/StoresIndustryGrid.tsx  (51)
components/stores/chrome/DeliveryConsumerHeaderRow.tsx  (5)
components/stores/chrome/DeliveryTier1Header.tsx  (32)
components/stores/home/StoreHubSearchStrip.tsx  (46)
components/stores/home/StoreOwnerOpsSection.tsx  (154)
components/stores/home/hub/StoresHomeFeedList.tsx  (104)
components/stores/home/hub/StoresHomeFoodDiscoveryRail.tsx  (65)
components/stores/home/hub/StoresHomeLcpObserver.client.tsx  (17)
components/stores/home/hub/StoresHomeStoreDiscoveryRail.tsx  (49)
components/stores/store-browse-category-ui.ts  (15)
components/stores/store-category-pill-styles.ts  (8)
components/stores/store-order-detail/StoreDetailOrderSkeleton.tsx  (64)
components/trade/PostSellerTradeStrip.tsx  (40)
components/ui/TimeAgo.tsx  (25)
components/write-launcher/WriteLauncherGroup.tsx  (33)
components/write-launcher/WriteLauncherItem.tsx  (48)
components/write-launcher/WriteLauncherOverlay.tsx  (37)
components/write/WritePageShell.tsx  (17)
hooks/useHasOwnerStores.ts  (21)
hooks/useMeStoreBySlug.ts  (75)
hooks/usePriceOffersProductRealtime.ts  (109)
lib/addresses/google-maps-content-retention-notes.ts  (56)
lib/addresses/google-retention-technical-lock.ts  (28)
lib/admin-audit/admin-audit-utils.ts  (76)
lib/admin-audit/build-audit-summary.ts  (44)
lib/admin-audit/map-audit-log-row.ts  (38)
lib/admin-business/build-admin-store-taxonomy-patch.ts  (5)
lib/admin-business/map-admin-store-to-business.ts  (40)
lib/admin-dashboard/admin-dashboard-utils.ts  (43)
lib/admin-dashboard/build-admin-dashboard-payload-dev-cache.ts  (32)
lib/admin-dashboard/empty-dashboard-payload.ts  (109)
lib/admin-dashboard/merge-dashboard-payload-preserve-refs.ts  (189)
lib/admin-products/posts-management-label-i18n.ts  (73)
lib/admin-reviews/getReviewsFromDb.ts  (120)
lib/admin-settings/service-categories-sync-client.ts  (52)
lib/admin-users/admin-user-utils.ts  (229)
lib/admin-users/member-type-client.ts  (47)
lib/admin/admin-store-orders-query.ts  (108)
lib/admin/ads-operator/ads-creative-storage-policy.ts  (18)
lib/admin/delivery-orders-admin/do-admin-label-i18n.ts  (58)
lib/admin/fetch-admin-dashboard-stats-deduped.ts  (30)
lib/admin/fetch-admin-posts-management-deduped.ts  (49)
lib/admin/fetch-admin-store-order-detail.ts  (25)
lib/admin/fetch-admin-store-orders-deduped.ts  (32)
lib/admin/fetch-admin-store-orders-query-deduped.ts  (30)
lib/admin/fetch-admin-store-orders-scoped.ts  (33)
lib/admin/security-checklist.ts  (16)
lib/admin/store-orders-csv.ts  (50)
lib/ads/ad-label-i18n.ts  (131)
lib/ads/philife-write-ad-product-i18n.ts  (44)
lib/alarm/playAlarmSound.ts  (25)
lib/auth/is-terminal-auth-session-failure.ts  (20)
lib/auth/kasama-session-cookies.ts  (46)
lib/auth/native/native-kakao-auth-plugin.web.ts  (13)
lib/auth/request-auth-cache.ts  (8)
lib/business/fetch-owner-store-settlements-deduped.ts  (44)
lib/business/owner-store-settlement-i18n.ts  (42)
lib/business/store-owner-apply-page-slide.ts  (10)
lib/business/to-owner-store-page-phase.ts  (22)
lib/categories/category-href-server.ts  (20)
lib/categories/getCategoryBySlug.ts  (11)
lib/categories/getQuickCreateCategories.ts  (35)
lib/categories/use-home-header-tabs.ts  (3)
lib/chat-domain/dual-write-room-domain.ts  (63)
lib/chat-domain/ports/bootstrap-port.ts  (13)
lib/chat-domain/ports/cache-port.ts  (23)
lib/chat-domain/ports/notification-port.ts  (16)
lib/chat-domain/ports/sound-port.ts  (26)
lib/chat-domain/shell/notification-shell-aggregator.ts  (20)
lib/chat/general-room-mapping.ts  (35)
lib/chat/store-order-chat-summary-i18n.ts  (108)
lib/chats/chat-room-path-utils.ts  (36)
lib/chats/getChatRoomsFromDb.ts  (34)
lib/chats/server/chat-room-load-contract.ts  (22)
lib/chats/surfaces/chat-hub-segment.ts  (6)
lib/chats/surfaces/chat-hub-tab-defs.ts  (36)
lib/comments/getComments.ts  (39)
lib/community-messenger/chat-list/chat-list-presenter.ts  (53)
lib/community-messenger/chat-list/use-community-chat-list-realtime.ts  (4)
lib/community-messenger/delivery-chat-list/delivery-chat-list-timestamp.ts  (2)
lib/community-messenger/group/group-room-reply-service.ts  (22)
lib/community-messenger/group/group-room-unread.ts  (31)
lib/community-messenger/home/messenger-list-action-busy-key.ts  (10)
lib/community-messenger/monitoring/measure-server.ts  (29)
lib/community-messenger/native-voice/native-voice-outgoing-runtime-flag.ts  (30)
lib/community-messenger/read/room-list-badge.ts  (14)
lib/community-messenger/realtime/community-messenger-room-meta-realtime-channel.ts  (36)
lib/community-messenger/room/cm-room-push-entry-warm.ts  (28)
lib/community-messenger/room/cm-room-timeline-entry-paint.ts  (6)
lib/community-messenger/room/messenger-room-composer-early-context.tsx  (13)
lib/community-messenger/server/messenger-room-page-rsc-timers.ts  (55)
lib/community-messenger/trade-chat-list/category-menu-chip-style.ts  (9)
lib/community-messenger/trade-chat-list/trade-chat-list-theme.ts  (11)
lib/community-messenger/trade-meta-hydration-pending.ts  (24)
lib/community/fetch-community-post-comments-deduped.ts  (71)
lib/currency/coin-inflow-writer.ts  (95)
lib/dibay/scroll-store-detail-to-menu-tabs.ts  (11)
lib/domains/anchors.ts  (25)
lib/gift-certificate/admin-gift-primary-button.ts  (13)
lib/gift-certificate/gift-offer-canonical-message.ts  (68)
lib/gift-certificate/project-gift-transfer-messenger-status.ts  (10)
lib/html/sanitize-product-html.ts  (15)
lib/http/fetch-json.ts  (109)
lib/i18n/label.ts  (14)
lib/i18n/message-key-serialization.contract.ts  (20)
lib/map/places-new-experimental.ts  (140)
lib/messenger/contracts/domain-snapshots.ts  (17)
lib/messenger/contracts/phase11d-shell-home-compose.ts  (327)
lib/my/updateMySettings.ts  (16)
lib/mypage/mypage-home-stat-config.ts  (92)
lib/mypage/required-info-flow.ts  (70)
lib/navigation/dibay-back-ssot-hard-lock.ts  (31)
lib/navigation/nav-perf-log.ts  (27)
lib/navigation/store-detail-animated-back.ts  (45)
lib/neighborhood/philife-db-expected.ts  (36)
lib/notifications/fetch-owner-store-commerce-notifications-rpc.ts  (49)
lib/notifications/messenger-notification-cooldown.ts  (26)
lib/notifications/policy/notification-badge-policy.ts  (9)
lib/notifications/policy/notification-sound-policy.ts  (25)
lib/offers/pick-buyer-primary-offer.ts  (20)
lib/permissions/use-dibay-device-permissions.ts  (42)
lib/posts/getPostById.ts  (40)
lib/posts/getPostsByAuthor.ts  (28)
lib/posts/getSimilarPosts.ts  (49)
lib/products/favorite-utils.ts  (52)
lib/products/web-post-links.ts  (17)
lib/profile/default-profile.ts  (14)
lib/push/send-web-push-for-user.ts  (10)
lib/release-archive/release-archive-label-i18n.ts  (84)
lib/search/recent-searches-local.ts  (56)
lib/shared-notifications/order-notification-emit.ts  (27)
lib/shared-notifications/shared-notification-store.ts  (8)
lib/startup/startup-detect.ts  (47)
lib/store-commerce/build-shared-order-for-chat.ts  (102)
lib/store-order-chat/delivery-room-quick-replies.ts  (21)
lib/stores/advertising/admin-delivery-ad-first-party-step.ts  (14)
lib/stores/buyer-public-label-cache.ts  (45)
lib/stores/fetch-store-public-server.ts  (29)
lib/stores/load-admin-coupon-control-center.ts  (7)
lib/stores/load-commerce-settings-cached.ts  (32)
lib/stores/load-owner-point-deposit-context.ts  (173)
lib/stores/log-store-order-stock-restore-failure.ts  (36)
lib/stores/make-store-slug.ts  (15)
lib/stores/persist-store-order-item-options.ts  (57)
lib/stores/store-paid-ad-campaign-validation.ts  (143)
lib/stores/store-paid-ad-campaign-writer.ts  (202)
lib/stores/store-popular-menu-stats-cache.ts  (41)
lib/stores/store-secondary-browse-icons.ts  (8)
lib/stores/stores-browse-sub-chip-ui.ts  (13)
lib/stores/stores-home-category-fallback-icons.ts  (8)
lib/stores/use-stores-home-first-lcp.ts  (136)
lib/test-utils/e2e-app-wide-phase-global.ts  (23)
lib/trade/marketplace/assemble-marketplace-search-order.ts  (53)
lib/trade/marketplace/search-relevance-rank.ts  (6)
lib/trade/tabs/scroll-trade-primary-tab-strip.ts  (80)
lib/trade/trade-home-hub-navigation.ts  (88)
lib/ui/admin-users-starbucks-styles.ts  (35)
lib/ui/dibay-pull-refresh-eligibility.ts  (35)
lib/ui/i18n-compact-label-classes.ts  (38)
lib/ui/messenger-fab-palette.ts  (77)
lib/ui/store-detail-viewport-metrics-cache.ts  (9)
lib/ui/use-cm-room-composer-height.ts  (81)
lib/ui/use-long-press-or-tap.ts  (93)
lib/ui/use-mobile-keyboard-inset.ts  (91)
lib/ui/use-swipe-tab-navigation.ts  (82)
lib/utils/sort-products.ts  (61)
components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx  (255)
components/community/CommunityCommentItem.tsx  (4)
components/mypage/MyPageHeader.tsx  (17)
components/reports/UserBlockButton.tsx  (100)
components/stores/detail/StoreDetailPage.tsx  (5)
hooks/use-is-mobile-viewport.ts  (25)
lib/addresses/address-source-architecture.ts  (82)
lib/community-messenger/monitoring/server-store.ts  (11)
lib/constants.ts  (8)
lib/layout/main-tier1.ts  (25)
lib/messenger/contracts/domain-app-icon-badge.ts  (9)
lib/mypage-settings/store.ts  (53)
lib/platform-popup/destination-contract.ts  (35)
lib/point-policies/point-reward-simulate.ts  (25)
lib/supabase.ts  (22)
lib/types.ts  (10)
lib/types/samarket-chat.ts  (150)
```

## 부록 B — D3 테스트만 참조 (146)
```
app/(main)/group-chat/GroupChatHomePageClient.tsx  (87)  <= lib/layout/__tests__/sector-header-back-unify.test.ts
components/admin/ads/AdminAdApplicationsPage.tsx  (201)  <= lib/admin-reports/__tests__/p1-2-report-sanction-ad-authority-contract.test.ts, lib/admin/__tests__/admin-aro-ia-001-domain-common-connection.test.ts
components/admin/ads/AdminCommunityPromotionQueue.tsx  (263)  <= lib/admin-reports/__tests__/p1-2-report-sanction-ad-authority-contract.test.ts, lib/admin/__tests__/admin-aro-ia-001-domain-common-connection.test.ts
components/admin/banners/AdminBannerDetailPage.tsx  (198)  <= lib/stores/advertising/__tests__/ads-final-banner-p2.test.ts
components/admin/banners/AdminBannerFilterBar.tsx  (59)  <= lib/promotion/__tests__/reaudit-r3-contract.test.ts
components/admin/dashboard/AdminActionCenter.tsx  (367)  <= lib/admin/__tests__/admin-aro-ac-001-dashboard.test.ts, lib/admin/__tests__/admin-aro-ops-ux-002-b4-finance-control-plane.test.ts
components/admin/dashboard/AdminRevenueOpsStrip.tsx  (80)  <= lib/i18n/__tests__/w3-hongbo-term-allowlist.test.ts
components/admin/dashboard/DashboardQuickLinksBySection.tsx  (72)  <= lib/admin/__tests__/dashboard-quick-links-contract.test.ts
components/admin/dashboard/DashboardUrgentBlock.tsx  (71)  <= lib/admin/__tests__/admin-real-operation-cut-b-finance-ssot.test.ts, lib/admin/__tests__/admin-real-operation-cut-e-control-plane.test.ts
components/admin/delivery-orders/DeliveryOrderDetailClient.tsx  (500)  <= lib/admin/__tests__/admin-aro-ops-ux-002-repair-defects.test.ts, lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts
components/admin/delivery-orders/DeliveryOrdersDashboardClient.tsx  (390)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts, lib/admin/__tests__/data-reset-blocker-close-b1-b2-b4-b5.test.ts
components/admin/delivery-orders/DeliveryOrdersKpiCards.tsx  (90)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts
components/admin/delivery-orders/DeliveryRefundsClient.tsx  (109)  <= lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts, lib/admin/store-orders/__tests__/admin-store-order-r4b-orders.test.ts
components/admin/delivery-orders/DeliverySettlementsClient.tsx  (107)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts
components/admin/delivery-orders/OrderFilterBar.tsx  (135)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts
components/admin/delivery-orders/OrderTable.tsx  (221)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts
components/admin/finance/AdminFinanceOpsQueue.tsx  (206)  <= lib/admin/__tests__/admin-real-operation-cut-c-ads-operation.test.ts, lib/admin/pagination/__tests__/parse-admin-list-page.test.ts
components/admin/member-notes/AdminMemberNotesPage.tsx  (504)  <= components/admin/member-notes/__tests__/member-inquiry-console-layout-contract.test.ts, lib/admin/__tests__/p0-inquiry-admin-complete-contract.test.ts
components/admin/platform-inquiries/AdminPlatformInquiriesPage.tsx  (223)  <= lib/admin/__tests__/p0-inquiry-admin-complete-contract.test.ts, scripts/verify-three-currency-product.mjs
components/admin/platform-popup/AdminPlatformPopupHubPage.tsx  (426)  <= lib/admin/ads-exposure/__tests__/popup-operational-rewire.contract.test.ts, lib/platform-popup/__tests__/product-completion-ux.test.ts
components/admin/platform-popup/AdminPlatformPopupRequestQueue.tsx  (114)  <= components/admin/ui/__tests__/admin-tech-id-ratchet.test.ts
components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx  (717)  <= lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts, lib/admin/__tests__/admin-aro-rst-cov-001-coverage.test.ts
components/admin/store-points/AdminStorePointLedgerByDatePage.tsx  (204)  <= scripts/verify-three-currency-product.mjs
components/admin/stores/AdminStoreBannerAdWriterPanel.tsx  (368)  <= lib/stores/__tests__/delivery-v4-reaudit-r2-cache.test.ts
components/admin/stores/AdminStoreOrdersPage.tsx  (586)  <= lib/admin/__tests__/data-reset-blocker-close-b1-b2-b4-b5.test.ts, lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts
components/admin/stores/AdminStorePaidAdWriterPanel.tsx  (478)  <= lib/stores/__tests__/delivery-v4-reaudit-r2-cache.test.ts
components/admin/support/AdminSupportControlPlane.tsx  (337)  <= lib/admin/__tests__/admin-aro-ops-ux-002-b6-support-control-plane.test.ts, lib/admin/__tests__/admin-aro-ops-ux-002-b8-shared-ui-contract.test.ts
components/chat/index.ts  (3)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
components/chats/ChatHubTopTabs.tsx  (53)  <= lib/ui/__tests__/dibay-global-header-tabs-ssot.test.ts
components/chats/ChatRoomCard.tsx  (245)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/chats/GeneralChatRoomCard.tsx  (175)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/community-messenger/MessengerHomeFabSector.tsx  (335)  <= lib/layout/__tests__/keyboard-root-policy.test.ts
components/community-messenger/MessengerLineFriendRow.tsx  (441)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/community-messenger/domain-shell-canary/DomainShellCanaryHomeGate.tsx  (352)  <= lib/notifications/__tests__/p2-badge-facts-io-parity.test.ts
components/community-messenger/friend-list/CommunityMessengerFriendStatusBadge.tsx  (31)  <= lib/i18n/quality/i18n-quality-baseline.json
components/delivery/navigation/DeliveryDomainSwitcherOverlay.tsx  (547)  <= components/stores/__tests__/v4-w3-customer-screens.test.tsx, scripts/verify-delivery-dial-navigation-contract.cjs
components/delivery/ui/DeliveryModal.tsx  (153)  <= lib/layout/__tests__/html-shell-flags.test.ts, lib/stores/__tests__/delivery-ui-state-contrast-ssot.test.ts
components/delivery/ui/DeliveryPriceSummary.tsx  (37)  <= lib/i18n/quality/i18n-quality-baseline.json
components/delivery/ui/index.ts  (17)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
components/favorites/FavoriteProductCard.tsx  (95)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/layout/MainDesktopSideNav.tsx  (141)  <= scripts/verify-owner-badge-boundary.cjs
components/layout/RegionBarExplorationTier1.tsx  (9)  <= scripts/verify-single-community-surface-authority.cjs
components/layout/Tier1ExplorationTitleRow.tsx  (68)  <= lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts
components/layout/UnifiedTier1AddressPillHeading.tsx  (40)  <= lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts
components/my/PhoneVerificationRequestForm.tsx  (254)  <= lib/auth/__tests__/phone-otp-contract.test.ts, lib/mypage/__tests__/mypage-r7-request-dedupe.test.ts
components/my/ProfileActionButtons.tsx  (27)  <= lib/mypage/__tests__/mypage-r6-customer-center-policy.test.ts
components/my/mypage/MypageDashboardPrimitives.tsx  (228)  <= lib/i18n/quality/i18n-quality-baseline.json
components/my/settings/SettingsToggleRow.tsx  (53)  <= lib/mypage/__tests__/mypage-r7-request-dedupe.test.ts
components/mypage/MessengerOverviewPanel.tsx  (143)  <= lib/messenger/trade/__tests__/trade-list-preview-viewer.test.ts
components/mypage/MyPointCard.tsx  (54)  <= lib/currency/__tests__/currency-visual-ssot-contract.test.ts
components/mypage/ServiceGrid.tsx  (85)  <= lib/i18n/quality/i18n-quality-baseline.json
components/mypage/SummaryMenu.tsx  (101)  <= lib/i18n/quality/i18n-quality-baseline.json
components/mypage/myinfo/RequiredInfoList.tsx  (273)  <= lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts
components/mypage/required/RequiredInfoFlowClient.tsx  (209)  <= lib/mypage/__tests__/mypage-r7-request-dedupe.test.ts
components/offers/OfferButton.tsx  (27)  <= lib/i18n/quality/i18n-quality-baseline.json
components/offers/OfferStatusBuyer.tsx  (172)  <= lib/mypage/__tests__/mypage-r7-request-dedupe.test.ts
components/offers/useMyPriceOffersForProduct.ts  (114)  <= lib/mypage/__tests__/mypage-r7-request-dedupe.test.ts
components/philife/index.ts  (6)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
components/product/ProductCard.tsx  (141)  <= lib/points/__tests__/ad-shortage.test.ts, lib/promotion/__tests__/list-search-promo-badge-single-render.test.ts
components/reviews/ReviewCard.tsx  (50)  <= lib/i18n/quality/i18n-quality-baseline.json
components/search/SearchFilterBar.tsx  (172)  <= lib/trade/__tests__/marketplace-cut-i-category-matrix.test.ts, lib/trade/category-form/__tests__/composition-root-authority-leak-fix.test.ts
components/search/SearchResultList.tsx  (34)  <= lib/promotion/__tests__/list-search-promo-badge-single-render.test.ts, lib/trade/__tests__/marketplace-cut-g-favorite-report-share.test.ts
components/search/SearchView.tsx  (249)  <= lib/search/global/__tests__/global-search-entry-and-back.test.ts, lib/trade/category-form/__tests__/composition-root-authority-leak-fix.test.ts
components/stores/StoreMenuBoardPreamble.tsx  (131)  <= lib/stores/__tests__/delivery-ui-state-contrast-ssot.test.ts, scripts/verify-samarket-thumbnail-contract.cjs
components/stores/StorePublicMenuList.tsx  (276)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/stores/StoresRootTier1HeaderActions.tsx  (105)  <= lib/chats/__tests__/cut6a-customer-home-owner-badge-gate.test.ts, scripts/verify-owner-badge-boundary.cjs
components/stores/browse/StoresBrowseHeaderPrimaryTabs.tsx  (140)  <= lib/ui/__tests__/chrome-s3-tab-tiers.test.ts, scripts/verify-stores-home-hub-contract.cjs
components/stores/browse/StoresBrowseHeaderSubTopicChips.tsx  (285)  <= lib/stores/__tests__/browse-category-single-transition-gate.test.ts, scripts/verify-stores-home-hub-contract.cjs
components/stores/home/StoreHorizontalStoreTile.tsx  (80)  <= scripts/verify-samarket-thumbnail-contract.cjs
components/stores/home/hub/StoresHomeCategoriesSkeleton.tsx  (62)  <= scripts/verify-stores-home-hub-contract.cjs
components/stores/home/hub/StoresHomeCategoryHeaderStack.tsx  (15)  <= scripts/verify-stores-home-hub-contract.cjs
components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx  (156)  <= scripts/verify-stores-home-hub-contract.cjs
components/stores/home/hub/StoresHomeHubBelowFold.tsx  (124)  <= scripts/verify-stores-home-hub-contract.cjs
components/stores/home/hub/StoresHomeSearchModal.tsx  (342)  <= lib/promotion/__tests__/reaudit-r3-contract.test.ts, lib/stores/__tests__/delivery-ui-state-contrast-ssot.test.ts
components/stores/home/hub/StoresHomeSubCategoryPanel.tsx  (205)  <= components/stores/__tests__/v4-w3-customer-screens.test.tsx, scripts/verify-stores-home-hub-contract.cjs
components/write-launcher/WriteLauncher.tsx  (144)  <= lib/layout/__tests__/keyboard-root-policy.test.ts
hooks/use-delivery-store-search.ts  (160)  <= lib/delivery/search/__tests__/search-oor-presentation-parity.test.ts, lib/stores/__tests__/delivery-viewer-gate.test.ts
hooks/use-is-desktop-shell-viewport.ts  (26)  <= lib/device/tests/dibay-shell-authority-structure.test.ts
lib/addresses/unspecified-address-nickname.ts  (16)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/admin-business/business-management-matrix.ts  (230)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/admin-products/admin-product-utils.ts  (98)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/admin-products/posts-management-utils.ts  (396)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/admin/admin-delivery-order-filters.ts  (52)  <= lib/admin/__tests__/admin-delivery-vertical-hollow-contract.test.ts
lib/admin/data-reset/index.ts  (106)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/admin/delivery-orders-admin/labels.ts  (52)  <= lib/i18n/__tests__/i18n-quality-rules.test.ts
lib/admin/domain-control/finance-operator-ops.ts  (53)  <= lib/finance/__tests__/finance-p0-currency-fixes.test.ts
lib/admin/platform-admin-db.ts  (18)  <= lib/admin/__tests__/admin-authority-skew-cutover.test.ts
lib/admin/prelaunch-reset/index.ts  (26)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/ads/ad-utils.ts  (32)  <= lib/i18n/catalog/ad-application-labels.ts
lib/auth/completion/index.ts  (32)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/auth/oauth-profile-upsert.ts  (24)  <= lib/auth/completion/__tests__/common-auth-completion-contract.test.ts, lib/auth/completion/__tests__/dead-completion-quarantine-contract.test.ts
lib/auth/twilio-verify.ts  (79)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/automation/automation-utils.ts  (29)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/backup/backup-utils.ts  (53)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/business/business-utils.ts  (44)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/categories/admin-categories.ts  (96)  <= lib/i18n/catalog/admin.ts, lib/trade/category-form/__tests__/admin-taxonomy-ssot-a2.test.ts
lib/categories/fallback-categories.ts  (165)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/categories/upsertCategorySettings.ts  (19)  <= lib/trade/category-form/__tests__/overlay-surface-observability-contract.test.ts
lib/chat-domain/create-or-find/index.ts  (254)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/chat-domain/index.ts  (35)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/chat/createOrJoinRoom.ts  (56)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/chat/store-order-chat-summary-body.ts  (65)  <= lib/i18n/catalog/store-order-chat-summary-labels.ts
lib/chats/chat-list-last-message-display.ts  (29)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/chats/trade/index.ts  (6)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/comments/createComment.ts  (39)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/community-feed/community-feed-empty-hint.ts  (29)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/community-messenger/bootstrap-lite-policy.ts  (44)  <= lib/community-messenger/__tests__/call-stub-room-tip-exposure-guard.test.ts
lib/community-messenger/group/group-room-file-service.ts  (30)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/community-messenger/monitoring/index.ts  (29)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/community-messenger/notifications/index.ts  (6)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/community-messenger/room/use-messenger-room-composer-early.ts  (152)  <= lib/community-messenger/__tests__/friend-reject-block-policy-contract.test.ts
lib/community-messenger/room/use-messenger-room-composer-surface.ts  (154)  <= lib/community-messenger/__tests__/friend-reject-block-policy-contract.test.ts
lib/community-messenger/stores/index.ts  (11)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/constants/sort.ts  (20)  <= lib/i18n/quality/i18n-quality-baseline.json, lib/trade/marketplace/__tests__/marketplace-query-contract.test.ts
lib/datetime/format-kst-datetime.ts  (25)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/delivery/prewarm-delivery-domain-dial.ts  (65)  <= scripts/verify-delivery-dial-navigation-contract.cjs
lib/env/twilio-verify.ts  (42)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/gift-certificate/gift-certificate-hard-lock.ts  (38)  <= scripts/verify-gift-certificate-hard-lock.mjs
lib/main-menu/main-bottom-nav-interaction-contract.ts  (43)  <= scripts/verify-delivery-dial-navigation-contract.cjs
lib/member-benefits/member-visual-config.ts  (33)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/messenger/contracts/domain-notification-authority-product-bridge.ts  (20)  <= lib/messenger/__tests__/phase6-bootstrap-cache.test.ts, lib/messenger/__tests__/shell-integration-phase45.contract.test.ts
lib/messenger/contracts/domain-read-room-presentation-compose.ts  (321)  <= components/community-messenger/domain-shell-canary/__tests__/store-order-customer-list-leave-contract.test.ts
lib/messenger/contracts/domain-realtime-authority-product-bridge.ts  (73)  <= lib/messenger/__tests__/phase6-bootstrap-cache.test.ts, lib/messenger/__tests__/shell-integration-phase45.contract.test.ts
lib/messenger/index.ts  (49)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/notifications/badge-equation-registry.ts  (93)  <= lib/admin/__tests__/p0-point-admin-complete-contract.test.ts, lib/notifications/badge-authority-rebuild/__tests__/slice2-1-runtime-isolation.test.ts
lib/notifications/engine/index.ts  (56)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/notifications/notify-store-points.ts  (51)  <= lib/admin/__tests__/p0-inquiry-admin-complete-contract.test.ts, lib/notifications/__tests__/redo-2026-10-28-b04-dq1-owner-ops.test.ts
lib/notifications/policy/owner-notification-preference-storage.server.ts  (102)  <= lib/notifications/policy/__tests__/owner-admin-preference-storage-authority.test.ts
lib/ops/fallback-cleanup-verification.ts  (42)  <= scripts/verify-legacy-fallback-cleanup-structural.mjs
lib/philife/index.ts  (3)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/platform-popup/index.ts  (39)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/points/point-utils.ts  (90)  <= lib/i18n/catalog/points-labels.ts
lib/posts/getPostCountByCategory.ts  (35)  <= lib/i18n/quality/i18n-quality-baseline.json, scripts/verify-posts-client-db-boundary.cjs
lib/posts/seller-cancel-sale-ui.ts  (3)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/push/native/notification-sound-native-bridge.ts  (16)  <= scripts/notification-sound-ssot-lock-manifest.json, scripts/verify-notification-sound-ssot-contract.mjs
lib/release-archive/release-archive-utils.ts  (25)  <= lib/i18n/catalog/release-archive-labels.ts
lib/reports/createCommunityPostReport.ts  (50)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/search/global/semantics/index.ts  (51)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/search/search-utils.ts  (96)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/startup/index.ts  (56)  <= lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts, lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts
lib/stores/apply-admin-store-order-refund.ts  (32)  <= lib/stores/__tests__/store-order-recovery-integrity.test.ts, scripts/verify-store-order-recovery-integrity.mjs
lib/stores/modifiers/sample-kimchi-demo.ts  (90)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/stores/stores-home-sub-category-slide.ts  (3)  <= scripts/verify-stores-home-hub-contract.cjs
lib/system/system-utils.ts  (16)  <= lib/i18n/quality/i18n-quality-baseline.json
lib/trade-ads/charge-trade-post-ad-points.ts  (78)  <= lib/i18n/quality/i18n-quality-baseline.json, lib/points/__tests__/member-point-ledger-only-contract.test.ts
lib/trade/seller-trade-flow-client.ts  (130)  <= lib/i18n/quality/i18n-quality-baseline.json
```

## 부록 C — 통화 관련 죽은 파일 (28)
```
components/admin/settings/_quarantine/AdminMessengerCallSoundsSection.deprecated.tsx  (497)
components/community-messenger/MessengerCallLogDeleteConfirmDialog.tsx  (34)
components/community-messenger/call-history/CommunityMessengerCallAvatarOverlay.tsx  (48)
components/community-messenger/call-ui/CallButtons.tsx  (45)
components/community-messenger/room/message/CallStubActionPopover.tsx  (187)
components/messenger/call/call-icon-assets.ts  (2)
lib/call/call-realtime.ts  (14)
lib/call/call-session-manager.ts  (7)
lib/call/callSoundManager.ts  (68)
lib/call/getUserMediaByCallType.ts  (30)
lib/call/perfect-negotiation.ts  (66)
lib/call/signaling.ts  (82)
lib/call/use-outgoing-call-blocked.ts  (18)
lib/community-messenger/call-busy-policy.ts  (139)
lib/community-messenger/call-media-onboarding-storage.ts  (22)
lib/community-messenger/call-session-ui-state.ts  (18)
lib/community-messenger/call-timeline-policy.ts  (57)
lib/community-messenger/call-v4/presentation/call-v4-presentation-log.ts  (6)
lib/community-messenger/stores/call-session-bridge.ts  (74)
lib/community-messenger/call-media-stack.ts  (26)
lib/community-messenger/outgoing-call-surfaces.ts  (24)
components/community-messenger/call-history/CommunityMessengerCallStatusBadge.tsx  (23)
components/community-messenger/call-ui/index.ts  (4)
lib/call/actions/call-end-guard.ts  (49)
lib/call/call-session-state.ts  (145)
lib/call/index.ts  (12)
lib/call/mapCallEndToRoomEvent.ts  (43)
lib/notifications/client/room-missed-call-badge-store.ts  (52)
```

## 부록 D — 고아 스크립트 (71)
```
scripts/_inject-store-buyer-i18n-batch.mjs
scripts/_scan-stores-korean.mjs
scripts/_tmp-audit-owner-i18n.mjs
scripts/_tmp-audit-stores-home-i18n.mjs
scripts/_tmp-audit-stores-i18n.mjs
scripts/_tmp-cm-auto-i18n.mjs
scripts/_tmp-cm-hardcoded-report.mjs
scripts/_tmp-extract-i18n-keys.mjs
scripts/_tmp-parse-tsc-errors.mjs
scripts/_tmp-phase-i18n-count.mjs
scripts/_tmp-phase4-files.mjs
scripts/_tmp-phase7-check-client.mjs
scripts/_tmp-phase7-find-missing-t-hook.mjs
scripts/_tmp-phase7-migrate.mjs
scripts/_tmp-phase7-scan.mjs
scripts/_verify-bootstrap-lite-rooms-3run.mjs
scripts/_verify-mark-read-permission.mjs
scripts/add-11th-article.mjs
scripts/append-admin-qa-keys.mjs
scripts/apply-community-dpoint-financial-writer.mjs
scripts/apply-create-store-order-atomic-min-order-coupon-authority.mjs
scripts/apply-gift-certificate-cancel-order-restore.mjs
scripts/apply-platform-popup-bc-spend-ledger-fix.mjs
scripts/apply-ptr-reveal-audience-migration.mjs
scripts/apply-r2-d1-delivery-schema-via-dashboard.mjs
scripts/audit-community-dpoint-ledger-duplicates.mjs
scripts/audit-remote-imports.mjs
scripts/benchmark-runtime-dev.sh
scripts/build-admin-stores-en-zh-json.mjs
scripts/build-phase2-view-destructure.cjs
scripts/capture-trade-market-only.mjs
scripts/check-admin-misc-keys.mjs
scripts/community-messenger-real-usage.spec.cjs
scripts/copy-store-orders-serviceability-snapshot-sql.mjs
scripts/dev-benchmark-hmr-probe.cjs
scripts/extract-phase2-chunks.cjs
scripts/fix-admin-misc-remainder.mjs
scripts/generate-phase2-view-split.cjs
scripts/measure-dibay-dev-snapshot.mjs
scripts/measure-font-performance.mjs
scripts/measure-image-platform-baseline.mjs
scripts/measure-store-browse-perf.mjs
scripts/measure-store-taxonomy-tap-response.mjs
scripts/measure-stores-home-network-10s.mjs
scripts/merge-admin-misc-map.mjs
scripts/migrate-admin-misc-phase.mjs
scripts/next-typecheck-diagnostics-first.test.mjs
scripts/patch-admin-misc-korean.mjs
scripts/patch-store-product-public-utf8.cjs
scripts/phase-a-chat-notification-decompose.ts
scripts/phase-b-formula-runtime-proof.ts
scripts/phase2-vm-prefix.cjs
scripts/rebuild-admin-misc-catalog.mjs
scripts/run-active-call-lifecycle-smoke.sh
scripts/run-full-canonical-backfill.sh
scripts/run-incoming-call-revert-smoke.sh
scripts/runtime-business-cc-readonly-cases.ts
scripts/sam-admin-typography-shadow.mjs
scripts/sam-shadow-codemod.mjs
scripts/sam-typography-codemod-app.mjs
scripts/sam-typography-codemod-lib.mjs
scripts/sam-typography-codemod.mjs
scripts/sync-admin-misc-locales.mjs
scripts/verify-apply-p4-call-heartbeat-migrations.mjs
scripts/verify-cm-bootstrap-lite-bundle-active-membership.mjs
scripts/verify-delivery-hero-lcp.mjs
scripts/verify-native-admin-call-ringtone-contract.cjs
scripts/verify-r2-d1-delivery-schema.mjs
scripts/verify-shell-fetch-storm.mjs
scripts/verify-store-order-chat-messenger-backfill.mjs
scripts/verify-stores-a-campaign-migration-read.mjs
```

## 부록 E — D0 실행 결과 (2026-11-12 15:44 PHT)

| 항목 | 결과 |
|---|---|
| 빌드 캐시·임시 폴더 삭제 | `Users/`(10GB) · `android/app/build`·`android/build`·`android/.gradle` · `ios/App/build` · `.next` · `.tsbuild` · `tsconfig.*.tsbuildinfo` · `.tmp` · `.tmp-verify` · `.worktrees` · `test-results` — 모두 다시 만들어지는 결과물 |
| 시험 APK 4개 | 휴지통 `~/.Trash/samarket-d0-cleanup-20261112/apk/` 로 이동 |
| env 백업 10개 | 휴지통 `~/.Trash/samarket-d0-cleanup-20261112/env/` 로 이동. **유지**: `.env.local`, `.env.vercel.production`(QA 스크립트 대체 경로 + `.env.local` 에 없는 FCM·Naver·Semaphore 키 보유) |
| Apple 키 | `AuthKey_3747N7936Z.p8` → `~/.appstoreconnect/private_keys/` (권한 600). `scripts/generate-apple-client-secret.mjs` 는 `APPLE_AUTH_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_3747N7936Z.p8` 로 실행 |
| worktree | 병합·미변경 16개 제거. **남김**: `samarket-wt-header`·`moim-topic`(감사 중 새 커밋 — 다른 세션 사용 중), `hub-keepalive`(미커밋 15), `msg-p0`(미병합·미커밋) |
| 로컬 브랜치 | origin/main 에 완전히 포함된 85개 삭제 (176 → 91). 원격 브랜치는 손대지 않음 |
| 보류 | `.recovery/`(9월 미병합 여부 불명 패치·tar 포함 — 병합 여부 확인 전 보존) · `git stash` 104개(내용 미확인) |
| 디스크 | 사용량 347GiB → 325GiB (약 22GiB 확보) |
| 저장소 | 추적 파일 삭제 0 · `git status` 전후 동일 |

삭제한 브랜치 (복구: `git branch <이름> <SHA>`):
```
audit/route-audit c559dfdb4
chore/call-sheet-cleanup c944653a7
chore/moim-m1-remove-legacy fcbb8c36e
chore/moim-open-items d8a168cb2
cursor/apple-iap-topup 23d71d110
cursor/marketing-consent-p0 a7543dc47
cursor/marketing-p0-revert-overreach 62d4e50fb
docs/claude-auto-merge-process 38ac071d8
docs/d1-prod-measure d9f28d473
docs/deploy-process-pr-flow 05262df71
docs/messenger-desktop-wide-design aaae70110
docs/messenger-room-desktop-width-design e7a9bc881
docs/windows-desktop-shell-design 5c04dbc77
feat/consent-age-gate-20271105 1df59b812
feat/contacts-sync-3b 13b8feb82
feat/desktop-side-rail 8eef5d1bd
feat/ios-new-account-transition 90b419c88
feat/messenger-chat-home-layout dca01c445
feat/messenger-desktop-wide 2bee0d63b
feat/messenger-room-desktop-width 3c3d40498
feat/moim-category-topic bbc16efb5
feat/moim-m2-schema 0cb9f6c5c
feat/moim-m3-screens 2ab70c38b
feat/moim-m4-schedules 884e5800c
feat/moim-m5-admin e8d69c043
feat/moim-m6-report-sanction 718c62112
feat/terms-consent-policy db82322c8
fix/admin-app-releases-ci 32e01d4b6
fix/admin-topic-audit-name-en 1ee340ef6
fix/ads-boost-single-pin-1105 f0c169171
fix/ads-global-region c4fcdcda3
fix/age-gate-test-date c90a09740
fix/app-boot-profile-recovery e5b8b8c38
fix/apple-iap-admin-ratchet 42d25719e
fix/auth-infinite-wait 230c78351
fix/b2b-group-save-refresh cf2302c80
fix/backlog-bundle2 ac19339de
fix/community-swipe-single-transition 365c9afc4
fix/community-trade-header-switch d4ffb5a90
fix/consent-gate-stores-defer 65d104d0d
fix/contacts-admin-ui-ratchet abd19011a
fix/contacts-sync-audit 775571000
fix/contacts-sync-final 504a5a0b7
fix/contacts-sync-remaining-ordered 9a7a39785
fix/d1-audit-fail fa27a5a48
fix/d1-hub-revisit-home-delivery 52615005b
fix/d1-live-slot-login f780ac988
fix/d1-remaining-r1-r5 c13061575
fix/d1-s1-live-surface 5f25b4644
fix/header-switch-right-community-fit eda16c47f
fix/header-switch-shift 1d7816761
fix/hub-switch-no-slide 47eef0f11
fix/ios-call-locked-answer 682a8da01
fix/ios-call-media-permission 68901b386
fix/ios-call-permission-telegram b872c4a6b
fix/ios-mic-preask 780e992a8
fix/ios-plist-key-order 0ea8cb302
fix/ios-review-consent-button ac130094c
fix/ios-review-web-db 5ed73f999
fix/ios27-uiscene 5568ded35
fix/messenger-chat-home-verify 7cd5a83b5
fix/mypage-hang-deadline 78ef31411
fix/ph-otp-route 152d1a2dd
fix/r1-home-banner-early 30fda4fba
fix/remove-ios-preask 780e992a8
fix/revert-ios-preask df8fa91a8
fix/shell-ssr-c e341cd0c9
fix/trade-sample-badge 8e31db255
fix/trade-tab2-fit b0b7c7583
fix/windows-pwa-store-readiness 648779e86
perf/build-skip-duplicate-typecheck 9217df061
perf/c4-first-screen-js 84d08525a
perf/ci-cache eca9485e6
perf/d1-hub-retention a7f512d40
perf/d1-reveal-cost 67d6b629a
perf/d1-s2-css-hide b302a0362
perf/hub-keepalive-b a40413237
perf/i18n-admin-split-d 39ea67754
perf/messenger-p0 8ddd0b6d3
perf/messenger-p0-5 05c190451
perf/next-typecheck-diagnostics-first 92f75b17b
perf/scroll-subscribe-f b2a4b4535
rebased-domain-entry-hang b558e468d
revert-b 24deb0549
revert/d1-s2 55aeece1f
```

## 부록 F — D1+D2 실행 결과 (2026-11-12 · 기준 origin/main ec3b29ad1 · 브랜치 `chore/dead-code-cleanup-d1-d2`)

**삭제 379개**
- D1 git 추적 잡파일 78개: 루트 로그·측정 JSON 15개 · `reports/` 2개 · `.qa-logs/` 52개(문서 본문의 「31」은 최상위 항목 수였고, 실제 추적 파일은 53개) · `supabase/.temp/` 9개(추적만 해제하고 로컬 파일은 유지, gitignore 추가)
- D2 참조 0 소스 **301개 · 18,724줄** (아래 목록)
- `omggif` 패키지 제거 (`package.json` · `package-lock.json` 의 omggif 항목만 삭제)

**감사 목록에서 빼고 남긴 것 (D3 로 넘김)**
- 감사 목록 362개 중 **57개**: 남겨 둔 D3 파일(테스트만 참조)이 import 하는 파일이라 지우면 타입검사가 깨짐 → 그 D3 파일과 함께 정리
- `components/admin/console/*` 4개: 계약 테스트가 폴더 + 파일명을 따로 이어 붙여 읽음 (문자열 대조에서 놓침)
- `hooks/use-is-mobile-viewport.ts`: 기기 권한 목록(`DIBAY_SHADOW_DEVICE_AUTHORITIES_REMAINING`)에 경로로 등록됨
- `.qa-logs/v4-abc-policy-5gate.mjs`: 통화 FSI 매니페스트·`qa:call-v4-5gate` 가 사용 → 통화 규정상 유지

**같이 바꾼 시험 1개**: `lib/config/__tests__/test-db-write-production-guard.test.ts` — 삭제한 `.qa-logs` 스크립트 3개를 목록에서 빼고, 스크립트 수 하한을 113 → 105 / 110 으로 낮춤 (`scripts/` 는 변경 0, 줄어든 수는 모두 `.qa-logs` 삭제분)

삭제한 D2 파일:
```
app/(main)/chats/ChatsPageClient.tsx
app/account/delete-request/AccountDeleteRequestPageClient.tsx
components/addresses/AddressDesignationField.tsx
components/addresses/AddressFineTuneMapClient.tsx
components/addresses/address-labels.ts
components/admin/AdminModerationStatusBadge.tsx
components/admin/AdminSidebar.tsx
components/admin/AdminStatusBadge.tsx
components/admin/ad-products/AdProductTable.tsx
components/admin/ad-products/AdminAdProductsPageClient.tsx
components/admin/audit/AdminAuditFilterBar.tsx
components/admin/audit/AdminAuditLogListPage.tsx
components/admin/audit/AdminAuditLogTable.tsx
components/admin/audit/AdminAuditSummaryCards.tsx
components/admin/banners/AdminBannerListPage.tsx
components/admin/business/AdminBusinessActionPanel.tsx
components/admin/business/AdminBusinessLogList.tsx
components/admin/categories/CategoryDragList.tsx
components/admin/categories/CategoryEditModal.tsx
components/admin/categories/CategoryStatusBadge.tsx
components/admin/categories/CategoryTable.tsx
components/admin/categories/CategoryTypeBadge.tsx
components/admin/chats/AdminLinkedChatRoomsCard.tsx
components/admin/dashboard/AdminKpiCards.tsx
components/admin/dashboard/AdminNoticeCard.tsx
components/admin/dashboard/AdminQuickLinks.tsx
components/admin/dashboard/AdminRecentActivityPanels.tsx
components/admin/dashboard/AdminStatusSummaryPanels.tsx
components/admin/dashboard/AdminTrendChart.tsx
components/admin/delivery-orders/AdminDeliveryOrderChatDbClient.tsx
components/admin/delivery-orders/AdminMemoBox.tsx
components/admin/delivery-orders/CancelRequestTable.tsx
components/admin/delivery-orders/DeliveryAuditLogTable.tsx
components/admin/delivery-orders/DeliveryAuditLogsClient.tsx
components/admin/delivery-orders/DeliveryCancellationsClient.tsx
components/admin/delivery-orders/DeliveryOrdersByBuyerClient.tsx
components/admin/delivery-orders/DeliveryOrdersByStoreClient.tsx
components/admin/delivery-orders/DeliveryReasonModal.tsx
components/admin/delivery-orders/DeliveryReportsClient.tsx
components/admin/delivery-orders/HoldReasonModal.tsx
components/admin/delivery-orders/OrderReportTable.tsx
components/admin/delivery-orders/RefundDecisionModal.tsx
components/admin/menus/CategorySubtopicFormModal.tsx
components/admin/menus/CategorySubtopicsModal.tsx
components/admin/menus/MainBottomNavFabEditor.tsx
components/admin/menus/MenuManagementTable.tsx
components/admin/menus/TradeSubtopicsPanel.tsx
components/admin/operations/AdminOperationsHubPage.tsx
components/admin/order-notifications/AdminNotificationList.tsx
components/admin/personalized-feed/UserBehaviorProfileTable.tsx
components/admin/points/AdminPointChargeFilterBar.tsx
components/admin/post-ads/AdminAdTable.tsx
components/admin/reports/AdminModerationLogList.tsx
components/admin/reviews/AdminTrustSummaryCards.tsx
components/admin/settings/AdminCategoryManagement.tsx
components/admin/settings/ServiceCategoryTable.tsx
components/admin/settings/SubcategoryTable.tsx
components/admin/store-points/AdminStorePointPoliciesPage.tsx
components/admin/stores/AdminStoreBannerAdsPage.tsx
components/admin/stores/AdminStoreInsertionControlPage.tsx
components/admin/stores/AdminStoreVisibleToggle.tsx
components/admin/users/AdminStaffTable.tsx
components/ads/AdStatusBadge.tsx
components/auth/AuthComplianceRedirect.tsx
components/chats/ChatImageStack.tsx
components/chats/ChatRoomList.tsx
components/chats/ChatsHubStickyAppBar.tsx
components/chats/ChatsPhilifeHubMainTier1Sync.tsx
components/community-messenger/CommunityMessengerBellPinnedAlerts.tsx
components/community-messenger/MessengerPrimarySectionNav.tsx
components/community-messenger/MessengerServiceStrip.tsx
components/community-messenger/domain-shell-canary/DomainTradeListingContextDock.tsx
components/community-messenger/domain-shell-canary/TradeDomainShellRow.tsx
components/community-messenger/room/CommunityMessengerRoomComposerEarly.tsx
components/community-messenger/room/CommunityMessengerRoomComposerSurface.tsx
components/community-messenger/room/CommunityMessengerRoomLayoutInlineShell.tsx
components/community-messenger/room/MessengerRoomR2M11CLayoutTimingBridge.tsx
components/community-messenger/room/StoreOrderBuyerMessengerRoomBackRegistrar.tsx
components/community-messenger/room/phase2/StoreOrderOwnerMessengerActionBar.tsx
components/community-messenger/room/phase2/TradeMarketplaceContextBanner.tsx
components/community-messenger/room/phase2/store-order-delivery-detail-drawer-context.tsx
components/community-messenger/room/use-store-order-buyer-messenger-room-back-override.ts
components/community/Card.tsx
components/community/CategoryBadge.tsx
components/community/CommentList.tsx
components/community/CommunityCategoryBadge.tsx
components/community/CommunityCommentForm.tsx
components/community/CommunityCommentList.tsx
components/community/CommunityFilterBar.tsx
components/community/CommunityImageGallery.tsx
components/community/CommunityLikeButton.tsx
components/community/CommunityLocationBadge.tsx
components/community/CommunityMetaBar.tsx
components/community/LikeButton.tsx
components/community/LocationBadge.tsx
components/community/NeighborFollowButton.tsx
components/community/PhilifeHomeFeedPage.tsx
components/community/share/CommunitySharePreviewCard.tsx
components/community/ui/CommunityViberSurfaces.tsx
components/gift-certificate/GiftArtwork.tsx
components/home-feed/HomeTradeReelsSideRail.tsx
components/home/HomeServicesBlock.tsx
components/layout/AppTier1HeaderTitleCluster.tsx
components/layout/SearchButton.tsx
components/layout/StoresHubMainAppProviders.tsx
components/market/MarketCategoryRouteFallback.tsx
components/member-benefits/MemberProfileFrame.tsx
components/member-orders/MemberOrderItems.tsx
components/member-orders/MemberOrderSummary.tsx
components/member-orders/MemberOrderTimeline.tsx
components/my/MyOrderRelatedSection.tsx
components/my/MyQuickLinks.tsx
components/my/MySafeTradeCard.tsx
components/my/MySectionList.tsx
components/my/MyServiceGrid.tsx
components/my/MyServicesCategoryGrid.tsx
components/my/MyStoreOrdersHomePreview.tsx
components/my/ProfileStatRow.tsx
components/my/settings/NoticeDetailContent.tsx
components/my/settings/SettingsAdminEntry.tsx
components/my/settings/settings-icons.tsx
components/mypage/KamarketPayCard.tsx
components/mypage/MyActivitySection.tsx
components/mypage/MyInterestSection.tsx
components/mypage/MyPageMobileFold.tsx
components/mypage/MyTradeSection.tsx
components/mypage/MypagePurchaseSalesHubTabs.tsx
components/mypage/MypageTradeHubChatList.tsx
components/mypage/TradeHubSideNav.tsx
components/mypage/myinfo/myinfo-theme.ts
components/mypage/profile/ProfilePublicEditForm.tsx
components/mypage/store-orders/MypageStoreOrderChatStatus.tsx
components/mypage/trade/TradeHubPrimarySurface.tsx
components/notifications/DiBaYNotificationOnboardingGate.tsx
components/notifications/GlobalOrderChatUnreadSound.tsx
components/offers/OfferListSeller.tsx
components/onboarding/DibayIdOnboardingClient.tsx
components/onboarding/OnboardingAddressClient.tsx
components/onboarding/OnboardingUsernameClient.tsx
components/philife/PhilifeHeaderMessengerButton.tsx
components/philife/PhilifeTitleWithRegionRow.tsx
components/product/ProductStatusBadge.tsx
components/regions/MyRegionSettingsView.tsx
components/regions/PrimaryRegionBadge.tsx
components/regions/RegionSelectorForm.tsx
components/regions/SavedRegionCard.tsx
components/regions/SavedRegionList.tsx
components/reports/BlockedUserCard.tsx
components/reports/BlockedUserList.tsx
components/reports/UserBlockButton.tsx
components/reviews/ReviewList.tsx
components/stores/StoreCommerceSummaryCard.tsx
components/stores/StoreDetailInfoCard.tsx
components/stores/advertising/DeliveryAdAdminFirstPartyStepProgress.tsx
components/stores/advertising/DeliveryAdOwnerCustomPeriodBoard.tsx
components/stores/advertising/DeliveryAdOwnerPlacementChipGrid.tsx
components/stores/advertising/DeliveryAdOwnerStepProgress.tsx
components/stores/browse/BrowsePrimaryIndustryVisual.tsx
components/stores/browse/StoresIndustryGrid.tsx
components/stores/chrome/DeliveryConsumerHeaderRow.tsx
components/stores/chrome/DeliveryTier1Header.tsx
components/stores/detail/StoreDetailPage.tsx
components/stores/home/StoreHubSearchStrip.tsx
components/stores/home/StoreOwnerOpsSection.tsx
components/stores/home/hub/StoresHomeLcpObserver.client.tsx
components/stores/home/hub/StoresHomeStoreDiscoveryRail.tsx
components/stores/store-browse-category-ui.ts
components/stores/store-category-pill-styles.ts
components/stores/store-order-detail/StoreDetailOrderSkeleton.tsx
components/trade/PostSellerTradeStrip.tsx
components/ui/TimeAgo.tsx
components/write/WritePageShell.tsx
hooks/useHasOwnerStores.ts
hooks/useMeStoreBySlug.ts
lib/addresses/google-maps-content-retention-notes.ts
lib/addresses/google-retention-technical-lock.ts
lib/admin-audit/admin-audit-utils.ts
lib/admin-audit/build-audit-summary.ts
lib/admin-audit/map-audit-log-row.ts
lib/admin-business/build-admin-store-taxonomy-patch.ts
lib/admin-business/map-admin-store-to-business.ts
lib/admin-dashboard/admin-dashboard-utils.ts
lib/admin-dashboard/build-admin-dashboard-payload-dev-cache.ts
lib/admin-dashboard/empty-dashboard-payload.ts
lib/admin-dashboard/merge-dashboard-payload-preserve-refs.ts
lib/admin-reviews/getReviewsFromDb.ts
lib/admin-settings/service-categories-sync-client.ts
lib/admin-users/admin-user-utils.ts
lib/admin-users/member-type-client.ts
lib/admin/admin-store-orders-query.ts
lib/admin/ads-operator/ads-creative-storage-policy.ts
lib/admin/fetch-admin-dashboard-stats-deduped.ts
lib/admin/fetch-admin-posts-management-deduped.ts
lib/admin/security-checklist.ts
lib/admin/store-orders-csv.ts
lib/ads/philife-write-ad-product-i18n.ts
lib/alarm/playAlarmSound.ts
lib/auth/is-terminal-auth-session-failure.ts
lib/auth/kasama-session-cookies.ts
lib/auth/native/native-kakao-auth-plugin.web.ts
lib/auth/request-auth-cache.ts
lib/business/fetch-owner-store-settlements-deduped.ts
lib/business/owner-store-settlement-i18n.ts
lib/business/store-owner-apply-page-slide.ts
lib/business/to-owner-store-page-phase.ts
lib/categories/category-href-server.ts
lib/categories/getCategoryBySlug.ts
lib/categories/getQuickCreateCategories.ts
lib/categories/use-home-header-tabs.ts
lib/chat-domain/ports/bootstrap-port.ts
lib/chat-domain/ports/cache-port.ts
lib/chat-domain/ports/notification-port.ts
lib/chat-domain/ports/sound-port.ts
lib/chat-domain/shell/notification-shell-aggregator.ts
lib/chat/general-room-mapping.ts
lib/chats/chat-room-path-utils.ts
lib/chats/getChatRoomsFromDb.ts
lib/chats/server/chat-room-load-contract.ts
lib/comments/getComments.ts
lib/community-messenger/chat-list/chat-list-presenter.ts
lib/community-messenger/chat-list/use-community-chat-list-realtime.ts
lib/community-messenger/delivery-chat-list/delivery-chat-list-timestamp.ts
lib/community-messenger/group/group-room-reply-service.ts
lib/community-messenger/group/group-room-unread.ts
lib/community-messenger/home/messenger-list-action-busy-key.ts
lib/community-messenger/native-voice/native-voice-outgoing-runtime-flag.ts
lib/community-messenger/realtime/community-messenger-room-meta-realtime-channel.ts
lib/community-messenger/room/cm-room-push-entry-warm.ts
lib/community-messenger/room/cm-room-timeline-entry-paint.ts
lib/community-messenger/server/messenger-room-page-rsc-timers.ts
lib/community-messenger/trade-chat-list/category-menu-chip-style.ts
lib/community-messenger/trade-chat-list/trade-chat-list-theme.ts
lib/community-messenger/trade-meta-hydration-pending.ts
lib/community/fetch-community-post-comments-deduped.ts
lib/currency/coin-inflow-writer.ts
lib/dibay/scroll-store-detail-to-menu-tabs.ts
lib/domains/anchors.ts
lib/gift-certificate/admin-gift-primary-button.ts
lib/gift-certificate/gift-offer-canonical-message.ts
lib/gift-certificate/project-gift-transfer-messenger-status.ts
lib/html/sanitize-product-html.ts
lib/http/fetch-json.ts
lib/i18n/label.ts
lib/i18n/message-key-serialization.contract.ts
lib/layout/main-tier1.ts
lib/map/places-new-experimental.ts
lib/messenger/contracts/domain-snapshots.ts
lib/messenger/contracts/phase11d-shell-home-compose.ts
lib/my/updateMySettings.ts
lib/mypage/mypage-home-stat-config.ts
lib/navigation/dibay-back-ssot-hard-lock.ts
lib/navigation/nav-perf-log.ts
lib/navigation/store-detail-animated-back.ts
lib/neighborhood/philife-db-expected.ts
lib/notifications/fetch-owner-store-commerce-notifications-rpc.ts
lib/notifications/messenger-notification-cooldown.ts
lib/notifications/policy/notification-badge-policy.ts
lib/notifications/policy/notification-sound-policy.ts
lib/permissions/use-dibay-device-permissions.ts
lib/posts/getPostById.ts
lib/posts/getPostsByAuthor.ts
lib/posts/getSimilarPosts.ts
lib/products/favorite-utils.ts
lib/products/web-post-links.ts
lib/profile/default-profile.ts
lib/push/send-web-push-for-user.ts
lib/shared-notifications/order-notification-emit.ts
lib/shared-notifications/shared-notification-store.ts
lib/startup/startup-detect.ts
lib/store-commerce/build-shared-order-for-chat.ts
lib/store-order-chat/delivery-room-quick-replies.ts
lib/stores/advertising/admin-delivery-ad-first-party-step.ts
lib/stores/buyer-public-label-cache.ts
lib/stores/fetch-store-public-server.ts
lib/stores/load-admin-coupon-control-center.ts
lib/stores/load-commerce-settings-cached.ts
lib/stores/load-owner-point-deposit-context.ts
lib/stores/log-store-order-stock-restore-failure.ts
lib/stores/make-store-slug.ts
lib/stores/persist-store-order-item-options.ts
lib/stores/store-paid-ad-campaign-validation.ts
lib/stores/store-paid-ad-campaign-writer.ts
lib/stores/store-popular-menu-stats-cache.ts
lib/stores/store-secondary-browse-icons.ts
lib/stores/stores-home-category-fallback-icons.ts
lib/stores/use-stores-home-first-lcp.ts
lib/test-utils/e2e-app-wide-phase-global.ts
lib/trade/marketplace/assemble-marketplace-search-order.ts
lib/trade/marketplace/search-relevance-rank.ts
lib/trade/tabs/scroll-trade-primary-tab-strip.ts
lib/trade/trade-home-hub-navigation.ts
lib/types/samarket-chat.ts
lib/ui/admin-users-starbucks-styles.ts
lib/ui/dibay-pull-refresh-eligibility.ts
lib/ui/i18n-compact-label-classes.ts
lib/ui/store-detail-viewport-metrics-cache.ts
lib/ui/use-cm-room-composer-height.ts
lib/ui/use-long-press-or-tap.ts
lib/ui/use-mobile-keyboard-inset.ts
lib/ui/use-swipe-tab-navigation.ts
lib/utils/sort-products.ts
```
