# E. /home 헤더·스켈레톤·전환 감사 (읽기 전용 · 2026-10-20)

표기: **[코드 증명]** = 코드만으로 확정 / **[런타임 확인 필요]** = 실제 렌더 순서·네트워크 타이밍에 의존.

---
## 1. /home 헤더 제목 오류 ("내용을 불러올 수 없습니다." + 뒤로가기 → /philife)

**원인 [코드 증명]**
- `/home` 페이지는 `CommunityHomeSurface` 를 직접 렌더 — `app/(main)/home/page.tsx:7-9`.
- 그러나 커뮤니티 허브 판정 SSOT 들이 모두 `/`·`/philife`·`/community` 3개만 인정:
  - `resolveMainTabKeepAliveHub` — `lib/layout/resolve-main-surface.ts:83`
  - `isCommunityHomeSurfacePath` — `lib/layout/resolve-main-surface.ts:69`
  - `resolveMainSurface` — `lib/layout/resolve-main-surface.ts:29-35` → `/home` 은 `"other"`.
- RegionBar: 허브가 아니면 MAIN HUB 헤더(`RegionBarMainHubTier1`)를 건너뜀 — `components/layout/RegionBar.tsx:81-93`.
- `resolveMainTier1Subpage` 에서 `/home` 은 커뮤니티 허브 null-return(`lib/layout/resolve-main-tier1.ts:57`)에 안 걸리고 최종 폴백 `{ backHref:"/philife", titleText:"" }` — `lib/layout/resolve-main-tier1.ts:596-597`.
- 페이지 extras 도 제목을 주지 않음: `CommunityFeed` 의 `MySubpageHeader registerMainTier1={false}` — `components/community/CommunityFeed.tsx:1761-1762` → `MySubpageHeader.tsx:111-114` 는 tier1 없이 ctaLinks/stickyBelow 만 등록.
- 결과: `stringTitle` 비어 `common_content_unavailable` 출력 — `components/layout/RegionBar.tsx:141-161`, 문구 `lib/i18n/catalog/common.ts:21` ("내용을 불러올 수 없습니다.").
- 테스트가 결함을 가림: `/home` 을 `EXTRAS_REQUIRED` 로 분류 — `lib/layout/__tests__/dibay-chrome-title-coverage.test.ts:141-142`. 실제로는 extras 가 tier1 title 을 등록하지 않으므로(위 1761 행) 거짓 PASS.

**부수 증상 [코드 증명]** (/home 이 "other" 이므로)
- 하단 탭 활성 없음: `isPhilifeConsumerBottomNavSurface` 가 `/home` 미포함 — `lib/main-menu/philife-bottom-nav-layout.ts:34-39` (하단 탭 자체는 노출: `lib/navigation/bottom-nav-route-policy.ts:87-113`).
- 탐색 칩/지역 선택 규칙 미적용 — `lib/layout/mobile-top-tier1-rules.ts:62-63`.
- 피드 허브 상태 복원·저장·스크롤 복원 effect 가 모두 조기 return — `components/community/CommunityFeed.tsx:168-171, 518, 540, 558`.
- 하단 탭 스크롤 숨김·허브 여백 규칙 미적용 — `lib/layout/use-bottom-nav-scroll-hide-behavior.ts:52`, `lib/philife/philife-hub-path.ts:4` (→ `lib/layout/main-bottom-nav-hub-clearance.ts:54`).
- 하단 탭 push 축: `"other"` → null(슬라이드 없음) — `lib/navigation/compute-main-bottom-nav-push-axis.ts:30`.

**/home 의 의도된 역할 = 레거시 별칭(진입 경로 없음)**
- 원래 `redirect("/philife")` 였음 → `0785fc381`(2026-07-26)에서 Cold Boot 이유로 직접 렌더로 변경, `28a90af51` 에서 `CommunityHomeSurface` 로 교체 (git log). 그러나 같은 커밋이 SSOT(`resolve-main-surface.ts:5-9` 계약)에는 `/home` 을 넣지 않음.
- `CommunityHomeSurface` 권한 목록에도 `/home` 없음 — `components/community/CommunityHomeSurface.tsx:4`.
- 진입처 조사 결과 (node_modules 제외 grep):
  - next.config redirects: `/home` 없음 — `next.config.js:114-160`. proxy.ts: 없음(`proxy.ts:137-143` 은 `/test-signup` 만). middleware.ts 없음.
  - PWA `start_url: "/"` — `app/manifest.ts:17`. Capacitor 는 origin 만 로드 — `capacitor.config.ts:22,53`.
  - 하단 탭 href·푸시 딥링크·로그인 기본값·`public/sw.js` notificationclick: `/home` 참조 없음.
  - 남은 참조: 라우트 존재 강제 `scripts/verify-app-routes.cjs:29`, Android 허용 루트 `android/app/src/main/java/com/dibay/app/DibayAppRouteGuard.java:27`(폴더 동기화 목록일 뿐), 측정 스크립트 `scripts/measure-font-performance.mjs:6`, 단위테스트 `tests/unit/startup-api-scheduler.test.ts:15`, e2e 주석 "`/home` 는 Philife 로 redirect" `tests/e2e/bootstrap-structure-verification.spec.ts:183`(현행 코드와 불일치).
- 이중 마운트 여부 [코드 증명]: 실제 DOM keep-alive 레이어 없음. "keep-alive"는 명칭뿐이고 허브 라우트는 단일 `children` Surface — `components/layout/MainShellTabContentTransition.tsx:28-31`, `AppRouteTransition.tsx:340-341`. 따라서 `/home` 이 두 번째 `CommunityHomeSurface` 를 동시에 띄우는 일은 없음. 단 `/home`↔`/philife` 이동 시 서로 다른 page 세그먼트라 피드가 언마운트·재마운트(재요청 여부는 snapshot 캐시 의존 — [런타임 확인 필요]).

**수정 위치** — ⚠ 정정 2026-10-20 (Owner): 아래 (b) HTTP 리다이렉트 권장안은 **폐기**. `/home` Cold Boot 직접 렌더 계약 유지 · 최종안 = 설계서 §13-1 경로 판정 SSOT 단일화 (a).
- 근거: `/home` 은 어떤 진입점(start_url·탭·푸시·로그인)의 대상도 아니며, (a) 등록안은 동일 3-경로 리터럴이 흩어진 ~15곳(`resolve-main-surface.ts:32,69,83`, `mobile-top-tier1-rules.ts:63`, `resolve-main-tier1.ts:57`, `philife-bottom-nav-layout.ts:36`, `BottomNav.tsx:113`, `CommunityFeed.tsx:170`, `community-hub-state.ts:23`, `philife-hub-path.ts:4`, `bottom-nav-tap-prewarm-data.ts:56`, `main-bottom-nav-prefetch-pick.ts:45`, `use-bottom-nav-scroll-hide-behavior.ts:52` 등)을 모두 고쳐야 하고 하나라도 빠지면 같은 유형 결함 재발. `/` 의 Cold Boot "redirect 금지"(`app/(main)/page.tsx:5`)는 start_url 인 `/` 에 대한 계약이며 `/home` 은 cold boot 대상 아님.
- 변경: `next.config.js` `redirects()` 에 `{ source: "/home", destination: "/philife", permanent: false }` 추가 (RSC `redirect()` 는 200+CSR 이라 쓰지 않음 — `next.config.js:110-113` 근거). `app/(main)/home/page.tsx` 는 `verify:routes` 때문에 폴더 유지(`scripts/verify-app-routes.cjs:29`), 주석을 "next.config 리다이렉트로 도달 불가"로 정정.
- 테스트 정정: `dibay-chrome-title-coverage.test.ts:22,142` 에서 `/home` 제거(또는 redirect 대상으로 분리).
- 대안 (a) 은 Owner 가 "/home 직접 렌더 유지"를 명시할 때만: `isCommunityHomeSurfacePath` 에 `/home` 추가 후 위 리터럴들을 전부 이 함수 호출로 치환.

**영향 범위**: 커뮤니티 도메인 헤더·하단탭만. 거래·배달·메신저 무영향. 네이티브 무변경(Android guard 는 `/home` 허용 유지해도 리다이렉트로 수렴).

**회귀 검증**: 기존 `lib/layout/__tests__/resolve-main-surface.test.ts`(36-58), `lib/layout/__tests__/dibay-chrome-title-coverage.test.ts`. 추가: (1) next.config redirects 에 `/home→/philife` 존재 단언 (2) coverage 테스트에 "EXTRAS_REQUIRED 경로는 해당 페이지가 `registerMainTier1` true 로 제목을 등록해야 한다" 소스 단언 — 거짓 PASS 재발 방지.

---
## 2. 다른 화면 진입 중 커뮤니티 피드 스켈레톤 노출

**원인 A [코드 증명 — 스켈레톤 선택 자체]**: `app/(main)/philife/loading.tsx:2-5` 가 `MainFeedRouteLoading`(= `CommunityFeedSkeleton`, `components/layout/MainRouteLoading.tsx:11-18`)을 반환. `philife` 아래 하위 loading.tsx 가 없으므로(`find app/(main)/philife -name loading.tsx` → 이 파일 1개) `/philife/[postId]`(async, `app/(main)/philife/[postId]/page.tsx:16-33,72-74`), `/philife/write`, `/philife/my`, `/philife/purchases/[chatId]`, `/philife/meetings/[meetingId]` 등 **피드가 아닌 화면**의 로딩 UI 가 피드 스켈레톤.
- 추가: 페이지 자체 Suspense fallback 도 피드 스켈레톤 — 글쓰기 `app/(main)/philife/write/page.tsx:22`, 내 활동 `app/(main)/philife/my/page.tsx:14`.
- `/chats/*` 도 피드 스켈레톤 — `app/(main)/chats/loading.tsx` (`MainFeedRouteLoading rows=4`).
- 실제 노출 시간·빈도(프리페치 적중 시 생략 가능) → [런타임 확인 필요].

**원인 B [코드 증명 — 재마운트 구조 / 노출 여부는 런타임 확인 필요]**: 허브 헤더가 없는 화면(`hubChromeHeader` null)에서 `pushAxis` 가 있으면 dual-panel push 세션이 `exiting: prev.node` 를 별도 패널에 렌더 — `components/route-transition/AppRouteTransition.tsx:618-660, 880-916`. 표면 div(`:918-933`) ↔ push-viewport 전환은 부모 트리가 달라 `children` 이 언마운트/재마운트되므로 진입 화면의 클라이언트 상태가 초기화되어 자체 스켈레톤이 다시 보일 수 있음. `prev.node` 가 이전 페이지(예: 피드)를 그리는지 새 세그먼트를 그리는지는 App Router 의 children 요소 해석에 의존 → [런타임 확인 필요]. (허브↔허브·허브 헤더 경로는 단일 surface fallback enter 로 dual-panel 미사용 — `:540-591`, `main-shell-hub-fallback-enter.ts:11-16`; dual-panel intent 소스는 비어 있음 `:95`.)

**/home 특유**: `app/(main)/home/loading.tsx` 없음, `app/loading.tsx`·`app/(main)/loading.tsx` 없음 → `/home` 진입 시 세그먼트 로딩 스켈레톤 없음. `/home` 은 허브 헤더(hubScrollColumn) 경로라 dual-panel 아님. 즉 "/home 피드 스켈레톤이 타 화면에 보이는" 경로는 코드상 확인되지 않음 — 관찰된 피드 스켈레톤은 원인 A(`philife/loading.tsx`)일 가능성이 높음 [런타임 확인 필요].

**수정 위치**: `app/(main)/philife/loading.tsx` → 중립(null 또는 `MainFormRouteLoading`)으로 바꾸고 피드 스켈레톤은 `/philife` 루트 page 자체(CommunityFeed 내부 `CommunityFeed.tsx:2045-2046`)에만 둠; 상세 `[postId]`·`post/[postId]` 는 상세 전용 loading.tsx 추가; `write/page.tsx:22`, `my/page.tsx:14` fallback 교체.

**영향 범위**: 커뮤니티(Philife) 하위 라우트만. `/chats` 는 거래/레거시 채팅 도메인 — 별도 작업으로 분리(혼합 금지 규정).

**회귀 검증**: 기존 `lib/startup/__tests__/startup-app-ready.test.ts:64-77` 이 `philife/loading.tsx` 에 `MainFeedRouteLoading` 포함을 **강제** → 수정 시 이 단언 갱신 필요. `scripts/verify-no-tab-skeleton-blocking.cjs:33-44`(탭 루트 page 만 검사). 추가: "비피드 philife 하위 page/loading 은 `MainFeedRouteLoading|CommunityFeedSkeleton` 금지" 소스 테스트.

---
## 3. 전역 라우트 로딩 vs 페이지 로딩 중복

**loading.tsx 목록(관련 허브)**: philife=피드 스켈레톤 / market·stores·mypage·my·community-messenger·post = `null` / chats=피드 스켈레톤 / write=폼 스켈레톤 (`app/(main)/{market,stores,mypage,my,community-messenger,post}/loading.tsx`, `app/(main)/write/loading.tsx`). `app/loading.tsx`·`app/(main)/loading.tsx`·`community/`·`home/` loading 없음.
**레이아웃 Suspense**: `app/layout.tsx`, `app/(main)/layout.tsx`, `MainAppProviderTree.tsx`, `community/layout.tsx` 에 Suspense fallback 없음; `ConditionalAppShell.tsx` 는 `Suspense` import 만(:4) 사용처 없음; `MainShellTabContentTransition` 은 `overlay={null}`·`pendingPushNode={null}` (:43-46) → 전역 레이아웃 레벨 스켈레톤 없음 [코드 증명].

**순차 이중 스켈레톤 후보**
- (i) `/philife/write`·`/philife/my`: `philife/loading.tsx`(세그먼트 Suspense) → 페이지 RSC 셸 도착 후 페이지 내부 `<Suspense fallback=MainFeedRouteLoading>` 로 **다른 경계의 같은 스켈레톤이 다시 마운트**(애니메이션 재시작 플래시) — 구조 [코드 증명], 육안 플래시 [런타임 확인 필요].
- (ii) `/philife` 진입: `philife/loading.tsx` 피드 스켈레톤 → 페이지 커밋 후 `CommunityFeed` 가 snapshot 없으면 `loading && postsForList.length===0` 로 자체 `CommunityFeedSkeleton` (`CommunityFeed.tsx:2045-2046`) → 2단 스켈레톤 [런타임 확인 필요 — `/philife/page.tsx` 는 await 없음(10행 주석)이라 loading 경계 노출은 RSC 지연 시에만].
- (iii) 원인 2-B 의 dual-panel 재마운트로 진입 화면 자체 스켈레톤 재시작 [런타임 확인 필요].
**수정 위치**: 2번과 동일(philife/loading.tsx, write/my page fallback). 한 경로에 스켈레톤 소유자는 하나(세그먼트 loading 또는 페이지 Suspense 중 하나)로.
**회귀 검증**: `startup-app-ready.test.ts`, `verify-no-tab-skeleton-blocking.cjs`, `lib/main-menu/__tests__/main-hub-intent-transition-contract.test.ts:46-50`. 추가: "page 가 자체 Suspense fallback 을 가지면 상위 세그먼트 loading.tsx 와 같은 스켈레톤 금지" 소스 테스트.

---
## 4. 전환 중 이전 화면 헤더/본문 잔존

**헤더 위치 [코드 증명]**: `regionBarInLayout=true`(`components/layout/MainAppProviderTree.tsx:146`) + 대부분 경로 `hubScrollColumn`(`lib/layout/main-hub-scroll-column.ts:16-23`) → 헤더(`AppStickyHeader`→`RegionBar`)가 push surface 안 `hubChromeHeader` 로 본문과 같은 surface — `components/layout/ConditionalAppShell.tsx:339-347`, `AppRouteTransition.tsx:918-930`. 헤더·본문은 같은 커밋에서 `usePathname()` 으로 갱신(`RegionBar.tsx:45-60`).
**불일치 창**
- (a) 세그먼트 loading 표시 중: 헤더=새 경로 제목, 본문=스켈레톤 — 일관(제목은 새 경로 기준) [코드 증명]. 단 2번 원인 A 로 상세 화면 제목 + 피드 스켈레톤 조합 발생.
- (b) extras 등록(MySubpageHeader)은 `useLayoutEffect` set + cleanup `setMainTier1Extras(null)` — `components/my/MySubpageHeader.tsx:93-117`; 저장소는 경로 키 없는 단일 state — `contexts/MainTier1ExtrasContext.tsx:80-90`. 같은 커밋 안에서 이전 cleanup → 새 set 순서라 페인트 전 정합 [코드 증명]. 그러나 MySubpageHeader 가 페이지 내부 Suspense 경계 **안쪽**에 있으면 fallback 동안 base 제목(빈 제목이면 "내용을 불러올 수 없습니다")이 먼저 보임 — 경로별 [런타임 확인 필요].
- (c) dual-panel(허브 헤더 없는 경로)에서 exiting·entering 이 둘 다 extras 를 등록하면 형제 layoutEffect 순서상 `ltr`(뒤로)일 때 entering 이 먼저, exiting 이 나중 등록 → **이전 화면 제목이 남을 수 있음** (`AppRouteTransition.tsx:880-891` 패널 순서). `prev.node` 가 실제로 이전 페이지를 그리는지에 의존 → [런타임 확인 필요].
- (d) `/home` 특유: 전환과 무관하게 정착 후에도 제목 비어 있음(1번) — 잔존이 아니라 미등록.
**수정 위치**: (b)·(c) 근본안 = `MainTier1ExtrasContext` 에 등록 시 `pathname` 키를 저장하고 `RegionBar.tsx:61-62` 에서 현재 pathname 과 다른 extras 무시. `/home` 은 1번 수정으로 해소.
**영향 범위**: `MainTier1Extras` 사용 전 도메인(내정보·커뮤니티·거래 하위) — 공용 셸이므로 변경 시 전 도메인 회귀 필요.
**회귀 검증**: `lib/layout/__tests__/dibay-chrome-title-coverage.test.ts`, `lib/layout/__tests__/conditional-app-shell-cart-transition-remount-contract.test.ts`, `lib/main-menu/__tests__/main-hub-intent-transition-contract.test.ts`, `components/route-transition/route-transition-enter-kind.test.ts`. 추가: extras pathname 불일치 시 무시 단위 테스트(RTL 로 A 등록→B 경로 렌더 시 A 제목 미표시).

---
## 요약
| # | 판정 | 핵심 위치 |
|---|---|---|
| 1 | 결함 [코드 증명] | `resolve-main-surface.ts:83`, `resolve-main-tier1.ts:597`, `CommunityFeed.tsx:1762`, 테스트 `:142` 거짓 PASS. 권장 수정 = `next.config.js` `/home→/philife` 307 |
| 2 | 결함 [코드 증명: 스켈레톤 선택] / 노출 타이밍 [런타임] | `philife/loading.tsx:4`, `philife/write/page.tsx:22`, `philife/my/page.tsx:14` |
| 3 | 이중 경계 구조 [코드 증명] / 육안 플래시 [런타임] | 위 + `CommunityFeed.tsx:2045` |
| 4 | 허브 경로 일관 [코드 증명] / dual-panel·Suspense 내 extras 잔존 [런타임 확인 필요] | `MySubpageHeader.tsx:93-117`, `MainTier1ExtrasContext.tsx:80`, `AppRouteTransition.tsx:880-891` |
