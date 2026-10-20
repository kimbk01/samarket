# C. 내정보(mypage) 레이아웃 계약 전수 감사 (읽기 전용)

- 기준: 저장소 `/home/user/samarket` 현재 작업 트리 (2026-10-20). 코드·DB·배포 변경 없음.
- 표기: 코드에서 실행 경로를 확인한 것 = 근거 file:line. 실화면·실기기로 확인하지 않은 것 = **확인 필요**.
- 폭 표기 "좌/우" = 폰(767px 이하)에서 화면 끝 → 본문 글자까지 가로 여백(px). "최대폭" = 태블릿·웹 본문 최대 폭.

---

## 1. 전역 레이아웃 규칙 (실제 코드)

### 1.1 셸 구조
- `app/(main)/layout.tsx:17-20` → `MainAppProviders` → `MainAppProviderTree.tsx:146` 에서 `ConditionalAppShell regionBarInLayout={true}`.
- `app/(main)/mypage/layout.tsx:10-16` — `sam-domain-shell` div + `MypageToastHost` 만. 헤더·폭 규칙 없음.
- `ConditionalAppShell.tsx:328-335` — 모든 페이지 children 을 `APP_MAIN_COLUMN_CLASS`(가운데, 좌우 여백 0) 로 감쌈.
- 전역 상단 헤더: `ConditionalAppShell.tsx:341-347` `hubChromeHeader` → `AppStickyHeader` → `RegionBar`.
  - 단, `hubScrollColumn = regionBarInLayout && mainScrollInMainColumn && !isChatRoomDetail` (`lib/layout/main-hub-scroll-column.ts:16-24`). `mainScrollInMainColumn` 은 뷰포트 잠금 경로(주소 관리 3종·매장주문 리뷰·카트/체크아웃·채팅방·`/stores/owner/*`)에서 false (`lib/layout/main-shell-viewport.ts:16-20`, `conditional-app-shell-flags.ts:158-159`). 이때 `f.showRegionBar` 도 false(`conditional-app-shell-flags.ts:235`) → **전역 헤더가 아예 안 그려지고 페이지가 자체 헤더를 그림**.
  - `getMobileTopTier1RuleSet` 의 `suppressMainTier1`(`lib/layout/mobile-top-tier1-rules.ts:108-121`): 프로필 수정 경로, `/mypage/trade/chat/[id]`, `/stores/owner*`, `/stores/*`(browse·gift-mall 제외) 등에서 전역 1단 숨김.
- 전역 헤더 종류 (`components/layout/RegionBar.tsx`):
  - `/mypage` 정확히 = 메인 허브 → `RegionBarMainHubTier1` → `SectionHeader titleAlign="left"` (**제목 왼쪽**, `RegionBarMainHubTier1.tsx:88-91`). `/mypage/*` 하위는 허브 아님(`lib/layout/resolve-main-surface.ts:87`).
  - 그 외 하위 = `DetailHeader` (`RegionBar.tsx:173-191`) → `SectorHeaderBar` 기본 `centerAlign="center"` (**제목 가운데**, `components/layout/sector-header/DefaultHeader.tsx:160-172`, `SectorHeaderBar.tsx:15`). 좌=뒤로, 우=`rightSlot` 또는 `showHubQuickActions` 이면 `MyHubHeaderActions`(알림함 종 1개, `components/my/MyHubHeaderActions.tsx:121-129`).
  - 제목·부제·뒤로는 `resolveMainTier1Subpage(pathname)`(`lib/layout/resolve-main-tier1.ts`) 기본값 위에 페이지가 `MySubpageHeader`→`MainTier1Extras` 로 덮어씀(`components/my/MySubpageHeader.tsx:93-117`). 페이지가 `subtitle` 을 안 주면 **경로 기본 부제가 그대로 남음**(`RegionBar.tsx:135`: `o?.subtitle ?? base.subtitle`).
- `MySubpageHeader` 는 전역 헤더가 있으면 **자기 DOM 을 그리지 않음**(`MySubpageHeader.tsx:136-180`, 마지막 `return null`). `inlineChrome` 이면 페이지 안에 `DetailHeader` 를 직접 그림(`:153-167`).

### 1.2 헤더 치수 (`app/sector-header.css`)
- 높이 `--sector-header-h: 52px` (`:3`), 부제 있으면 56px (`:4`, `:82-85`), 768px 이상은 모두 56px (`:493-498`).
- 헤더 행 최대폭 `--sector-header-max-width: 768px` (`:5`, `:74`), 좌우 12px(`:6`).
- 그리드 `40px 1fr auto` (`:70`) — 오른쪽 슬롯 폭이 40px 와 다르면 제목이 수학적 가운데에서 약간 밀림.
- 제목 굵기 700 (`:25`) — 문서 기준 "17/600"(아래 1.4)과 다름.

### 1.3 폭·여백 토큰
- 앱 공용 컬럼: `APP_MAIN_COLUMN_MAX_WIDTH_CLASS = max-w-[42rem] sm:46rem md:52rem lg:60rem xl:66rem` (`lib/ui/app-content-layout.ts:12-13`).
- 앱 공용 거터: `APP_MAIN_GUTTER_X_CLASS = "pl-[10px] pr-2"` (좌10/우8, `app-content-layout.ts:19`).
- `APP_MAIN_TAB_SCROLL_BODY_CLASS` = 컬럼 + `APP_MAIN_FEED_STACK_CLASS`(거터 10/8 + `pt-1 gap-1`) (`app-content-layout.ts:41,72`).
- 내정보 전용: `MYPAGE_COLUMN_MAX_WIDTH_CLASS = "max-w-[40rem]"`, `MYPAGE_GUTTER_X_CLASS = "px-4 md:px-5"` (`lib/ui/mypage-responsive-breakpoints.ts:47-48`).
- 브레이크포인트: 모바일 ≤767 / 태블릿 768–1199 / 데스크톱 ≥1200, 모두 1열 (`mypage-responsive-breakpoints.ts:1-18`, `lib/ui/app-viewport-layout-breakpoints.ts:9-10`).
- 홈 본문: `MYPAGE_HOME_BODY_CLASS = mx-auto 40rem px-4 md:px-5 pt-2 + 하단탭 여백` (`lib/ui/mypage-home-starbucks-styles.ts:18-19`) — 바깥은 `APP_MAIN_COLUMN_CLASS`(여백 0, `app/(main)/my/MyContent.tsx:160`) → **폰 16/16, 태블릿 20/20, 최대 640px** (문서 기준과 일치).
- **`MyScreen` 본문**: 바깥 `APP_MAIN_TAB_SCROLL_BODY_CLASS`(10/8) 안에 다시 `40rem px-4 md:px-5` (`components/mypage/ds/MyScreen.tsx:121-125`) → **폰 26/24, 태블릿 30/28** (거터 이중 적용 · 좌우 비대칭). 문서 기준 16/20 위반.

### 1.4 하단 요소
- BottomNav: `position:fixed; bottom:0; z-index:1200` (`app/app-bottom-nav.css:13-18`), 높이 60px+safe.
- 하단탭 노출 경로: `isBottomNavEligibleRoute` (`lib/navigation/bottom-nav-route-policy.ts:87-111`). 내정보에서 **숨김**: 주소 3종(`isMypageAddressFlowPath`), 매장주문 리뷰, 프로필 수정 경로(`/mypage`?edit 아님: `/mypage/section/account/profile/edit`, `/mypage/profile(/edit)`, `/mypage/edit`), `/mypage/trade/chat/[id]`, `/my/settings*`. **그 외 모든 `/mypage/*` 는 하단탭 표시**(`/mypage/section/settings/*` 포함).
- 셸 하단 여백: 일반 하위 = `pb-[calc(76px+safe)]` (`conditional-app-shell-flags.ts:274-284`, `lib/main-menu/bottom-nav-config.ts:210-211`). 본문이 직접 여백을 갖는 경로(`isMainBottomNavHubBodyClearancePath`)는 셸 `pb-0`: `/mypage`, `/mypage/trade/*`, **`/mypage/store-orders`, `/mypage/store-orders/*`** (`lib/layout/main-bottom-nav-hub-clearance.ts:38-49,52-64`).
- `MyStickyCta`: `fixed inset-x-0 bottom-0 z-30`, 안쪽 40rem·16/20px, 아래 패딩 = 키보드/안전영역만 (`components/mypage/ds/MyStickyCta.tsx:73-76`). **하단탭 높이·z 를 고려하는 코드 없음**(`lib/ui/use-form-keyboard-viewport.ts` 에 BottomNav 참조 없음) → 하단탭이 있는 경로에서 z-1200 탭이 z-30 CTA 를 덮음(코드상). 실화면 **확인 필요**.
- 고객센터 FAB: `SupportFabHost` — `SupportContextProvider` 가 enabled 일 때만, `fixed`, z-[1255], 하단탭 있으면 `bottom: 60px+safe+10px`, 없으면 `safe+16px`, 앱 컬럼 오른쪽 `px-4` (`components/support/SupportFabHost.tsx:62-87`, `lib/main-menu/bottom-nav-config.ts:250,253-254`).
- 셸 자식이 `MainShellTabContentTransition`(`overflow-hidden` push host) 안에 있으므로 이 래퍼에 transform 이 남아 있으면 `fixed` CTA 기준점이 바뀔 수 있음 — **확인 필요**.

### 1.5 승인 문서의 폭·헤더 기준 (인용)
- `docs/customer-platform/03-NAVIGATION.md`·`04-DESIGN-SYSTEM.md`: **폭·헤더 정렬·헤더 높이 규정 없음**. 관련 항목은 "Icon | 헤더/툴바 | gear · bell · share"(03 `:31`), Spacing `--sam-space-1…6`(04 `:76`), Skeleton "muted surface placeholders; reduced-motion: no shimmer"(04 `:84`), "skeleton | first paint preferred | mypage/admin"(03 `:48`).
- `docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md` §1.8 (`:381-389`):
  > 모바일 ≤767 | 1열, 좌우 16px, 행 52px
  > 태블릿 768–1199 | **같은 1열**, 가운데 정렬, 본문 최대 폭 **40rem(640px)**, 행·본문 좌우 **20px**
  > 데스크톱 ≥1200 | 태블릿과 동일
  > 구현: `MYPAGE_COLUMN_MAX_WIDTH_CLASS = "max-w-[40rem]"`, `MYPAGE_GUTTER_X_CLASS = "px-4 md:px-5"` … `APP_MAIN_COLUMN_MAX_WIDTH_CLASS`(앱 공용)는 **수정 안 함**.
- 같은 문서 `:561`, `:960`: "헤더 `MySubpageHeader`(52px, 제목 17/600, 뒤로 44×44) → `MyScreen` 이 감쌈. 본문 좌우 16px, 태블릿(≥768px) 20px, 1열 최대 폭 40rem 가운데 정렬".
- 같은 문서 §1.2 (`:241-249`): `MyScreen` = "하위 화면 골격", `MyPageStackShell` 을 "흡수·대체"; `MyStateView` — "`MainFeedRouteLoading`(피드 모양) 내정보 사용 **금지**"; `MyStickyCta` = "하단 고정 주/보조 CTA, 키보드 위·safe-area".
- 같은 문서 §1.5 (`:331-347`): 스켈레톤 = 화면 유형별 구조 일치, `app/(main)/mypage/loading.tsx`(null) 유지, section/loading 삭제.
- 같은 문서 `:308`: 토스트 위치 "하단 탭바가 보이는 화면 = 탭바 위 16px, 탭바 없는 하위 화면 = safe-bottom + 16px, `MyStickyCta` 있는 화면 = CTA 위 8px" — 하단탭과 CTA 동시 노출 규정은 없음.
- `docs/mypage-v2/dibay-mypage-v2.1-supplement.md:101`: "화면 헤더 | 52px, 제목 17/600, 왼쪽 뒤로(44×44 터치)". `:106`: "하단 고정 CTA | 버튼 46px + 위아래 10px + 하단 안전영역, 키보드 열리면 키보드 위".
- **제목 정렬(가운데/왼쪽)에 대한 승인 규정은 찾지 못함** — 현행 코드 관례: 메인 허브 = 왼쪽, 하위(`DetailHeader`) = 가운데.

### 1.6 스켈레톤 경계
- `app/(main)/mypage/` 아래 `loading.tsx` 는 루트 1개뿐 (`app/(main)/mypage/loading.tsx:2-4`, `return null`). 하위 라우트 loading.tsx 없음.

---

## 2. 전 경로 표

범례 — 셸: **MS**=`MyScreen`(`components/mypage/ds/MyScreen.tsx`), **SH**=`MySubpageHeader` 직접 + 페이지 자체 본문, **STK**=`MyPageStackShell`, **SUB**=`MypageSubpageShell`, **INL**=`MySubpageHeader inlineChrome`(페이지 내부 헤더), **G**=전역 헤더만(페이지 헤더 등록 없음).
헤더: **G-C**=전역 `DetailHeader`(뒤로 좌·제목 가운데), **G-L**=전역 허브 `SectionHeader`(제목 왼쪽, 뒤로 없음). 높이 52=부제 없음/56=부제 있음(폰 기준, 768+ 는 모두 56). 우측 🔔=알림함.
여백 "26/24·640" = 폰 좌26/우24px, 태블릿 30/28px, 최대 640px(=V1, 1.3 참조).

| # | 경로 | 셸 (파일) | 헤더 종류·정렬·높이·우측 | 본문 최대폭·좌우여백 | 하단 CTA | 하단탭 / FAB 간섭 | 스켈레톤 | 기준 위반 |
|---|---|---|---|---|---|---|---|---|
| 1 | `/mypage` | `MyContent` → `MyPageHeader`(components/my, `MySubpageHeader` 래퍼) + `MyPageHomeDashboard` (`app/(main)/my/MyContent.tsx:156-170`) | G-L "내정보", 뒤로 없음, 우측 `MyMypageHeaderActions`(알림함) (`RegionBarMainHubTier1.tsx:84-91`), 52 | 640 · 16/16 (태블릿 20) (`mypage-home-starbucks-styles.ts:18-19`) | 없음 | 하단탭 O, 본문 `pb-[60px+safe]`, 셸 pb-0 / FAB 없음 | loading.tsx=null(유지 규정), 프로필만 스켈레톤 | 없음 (기준값 그 자체) |
| 2 | `/mypage/account` | MS `template="hub"` (`account/page.tsx:9`) | G-C "계정", **부제 = 경로 기본 `tier1_my_account_subtitle` 노출**(`resolve-main-tier1.ts:432-434`) → 56, 🔔 | 26/24·640 | 없음 | 탭 O / 없음 | MS 상태 슬롯 | 거터 이중(V1) |
| 3 | `/mypage/addresses` | INL (`components/addresses/AddressManagementClient.tsx:459-489`) | 페이지 내부 `DetailHeader` 가운데, 우측 "+추가" 텍스트 버튼, 52. 전역 헤더 없음(뷰포트 잠금) | 앱 컬럼 42–66rem · **좌우 0** (`lib/addresses/mypage-address-manage-layout.ts:19`; 카드 자체 여백 **확인 필요**) | 하단 plane(비고정) `ADDR_BOTTOM_BAR` | 하단탭 X / 없음 | `MyStateView list` | 폭 640 아님, 여백 16 아님 |
| 4 | `/mypage/addresses/edit` | INL (`AddressEditorPageClient.tsx:51-63`) | 내부 `DetailHeader` 가운데, 52 | 편집기 내부 `px-4`(`:206`), 스켈레톤 `px-[10px]`(`:266`) — 최대폭 **확인 필요** | 하단 plane | 탭 X / 없음 | form 스켈레톤 | 폭 불일치(확인 필요) |
| 5 | `/mypage/addresses/search` | INL (`AddressPlatformSearchClient.tsx:162-172`) | 내부 가운데, 52 | 42–66rem · 0 (`mypage-address-manage-layout.ts:19`) | 없음 | 탭 X / 없음 | list | 폭·여백 |
| 6 | `/mypage/ads` | SH (`ads/MyAdsPageClient.tsx:394-407`) | G-C, 부제 56, **우측 없음**(SH 기본 `showHubQuickActions=false`) | 640 · **16/16** (바깥 거터 없음) | 없음 | 탭 O / 없음 | 자체 | 우측 아이콘 불일치, 셸 미사용 |
| 7 | `/mypage/ads/apply` | SH (`ads/apply/MyAdsApplyPageClient.tsx:76-113`) | G-C 부제 56, 우측 없음 | 640 · 16/16 | **MyStickyCta** | **탭 O → CTA(z30)가 탭(z1200)에 가림(코드상)** / 없음 | form | CTA·탭 겹침, 셸 미사용 |
| 8 | `/mypage/ads/feed-request` | SH (`ads/feed-request/page.tsx:521-575`) | G-C 부제 56, 우측 없음 | **`max-w-lg`(512px) px-4** · `bg-background`(비 sam 토큰) (`:528,:575`) | MyStickyCta (`:1218`) + 수동 `pb-28` | 탭 O → CTA 가림 / **FAB O**(SupportContext) | 자체 | 폭 512, 토큰, CTA 겹침 |
| 9 | `/mypage/benefits` | SH + 자체 2겹 (`benefits/page.tsx:122-129`) | G-C 부제 56, 우측 없음 | 26/24·640 | 없음 | 탭 O / 없음 | `MyStateView` | 거터 이중, 셸 미사용 |
| 10 | `/mypage/community-activity` | SH 래퍼 `MypageCommunityActivityChrome` (`components/mypage/community-activity/MypageCommunityActivityChrome.tsx`) | G-C 부제 56, 우측 없음 | 26/24·640, `py-4` | 없음 | 탭 O / 없음 | Suspense → 같은 Chrome + `ActivitySkeleton` (`page.tsx:26-33`) | 거터 이중, 셸 미사용 |
| 11 | `/mypage/community-posts` | SH 래퍼 `MypageCommunityPostsChrome` | G-C 부제 56, 우측 없음 | 26/24·640 | 없음 | 탭 O / 없음 | Chrome + `MyCommunityPostsSkeleton` | 동일 |
| 12 | `/mypage/coupons` | G (`CustomerCommerceHubPage legacyAlias="coupons"`, `coupons/page.tsx:22-30`) — 배달 주문허브와 공유 | G-C 제목 `commerce_hub_title`, **뒤로 → `/stores`**(`resolve-main-tier1.ts:201-208`), 우측 장바구니(`CommerceHubChromeSync.tsx:11-22`), + 2단 허브 탭(`AppStickyHeader.tsx:129`) | **42–66rem · 10/8** (`CustomerCommerceHubBody.tsx:25`) | 없음 | 탭 O / **FAB O**(PAYMENT? `buildMemberSupportContext`) | `CouponWalletCardsSkeleton` | 폭·여백, 뒤로 목적지(내정보에서 진입 시 /stores) |
| 13 | `/mypage/customer-center` | MS `template="hub"` (`components/mypage/cs/CustomerCenterHubClient.tsx:120-127`) | G-C 52, 🔔 | 26/24·640 | 없음 | 탭 O / FAB X(DISABLED, `:62`) | MS | 거터 이중 |
| 14 | `/mypage/customer-center/{notice,system,marketing}` | MS `template="board"` (`CustomerCenterBoardListClient.tsx:243-248`) | G-C 52, 우측 검색 아이콘(`headerRight`) — 🔔 대체 | 26/24·640 | 없음 | 탭 O / 없음 | `MyStateView board` | 거터 이중 |
| 15 | `/mypage/customer-center/*/[id]`, `/mypage/notices/[noticeId]` | MS `template="detail"` (`CustomerCenterBoardDetailClient.tsx:249`) | G-C 52, 🔔 | 26/24·640 | 댓글 입력바 `fixed bottom-0 z-30` 40rem 16/20 (`CustomerCenterCommentsPanel.tsx:341-344`) | 탭 O → **입력바 가림(코드상)** | detail | 거터 이중, 입력바·탭 겹침 |
| 16 | `/mypage/gift-certificates` | G (`CustomerCommerceHubPage legacyAlias="gifts"`) | 12번과 동일 (`resolve-main-tier1.ts:210-218`) | 42–66rem · 10/8 | 없음 | 탭 O / FAB **확인 필요** | fallback | 12번과 동일 |
| 17 | `/mypage/gift-certificates/[instanceId]` | G (`OwnedGiftInstanceSupportShell` → `OwnedGiftInstanceDetailView`) | G-C `gift_certificate_wallet_title`, 뒤로 → 상품권 허브, 우측 없음 (`resolve-main-tier1.ts:220-228`) | 42–66rem · 10/8 (`OwnedGiftInstanceDetailView.tsx:124`) | MyStickyCta (`:321`) | 탭 O → CTA 가림 / **FAB O** | 자체 스켈레톤 | 폭·여백, CTA 겹침 |
| 18 | `/mypage/inbox`, `/mypage/inquiries` | 브리지 → `MemberCsNoteListClient` (SH) (`components/mypage/cs/MemberCsNoteListClient.tsx:92-97`) | G-C 부제 56, 우측 없음 | 바깥 10/8 + `CUSTOMER_CENTER_LIST_COLUMN_CLASS`(폰 전폭, sm 42rem·md 48rem·lg 56rem) + `px-3 sm:px-4` → **폰 22/20**, 최대 896px (`lib/mypage/customer-center-layout.ts:15-16`) | 없음 | 탭 O / 없음 | 브리지 스켈레톤 `pt-16`(`MypageCsOwnerCareBridge.tsx:22`) — 실제 화면과 상단 위치 다름 | 폭·여백 |
| 19 | `/mypage/inbox/[threadId]`, `/mypage/inquiries/[threadId]` | 브리지 → `MemberCsNoteThreadClient` (SH, `:88-106`) | G-C, 로딩 중 제목 빈 문자열 → "내용을 표시할 수 없습니다" 순간 노출 가능(**확인 필요**), 우측 없음 | 10/8 + `CUSTOMER_CENTER_FORM_COLUMN_CLASS`(36rem/md 40rem, `px-4 md:px-6`) → 폰 26/24, 태블릿 34/32 | 없음 | 탭 O / 없음 | 동일 | 폭·여백 |
| 20 | `/mypage/offers` | MS `template="list"` (`components/offers/MyOffersTabsScreen.tsx:52`) | G-C "가격 제안" 52, 🔔 (Owner 캡처와 일치: 뒤로+가운데 제목+종) | 26/24·640 — 탭·목록 모두 40rem 박스 안(`:53`) → 넓은 화면에서 좁은 박스 + 좌우 배경 (회색 띠 원인 색상은 **확인 필요**) | 없음 | 탭 O / 없음 | 페이지 Suspense `null`(`offers/page.tsx:9`), 목록은 MyOffersView 내부 | 거터 이중 |
| 21 | `/mypage/order-notifications` | SH (`order-notifications/page.tsx:11-20`) | G-C 부제 56, 뒤로 → `/mypage/notifications`(→ `/notifications` 리다이렉트), 우측 없음 | **42–66rem · 10/8** (40rem 없음) | 없음 | 탭 O / 없음 | 없음 | 폭·여백 |
| 22 | `/mypage/points` | SH + `CUSTOMER_CENTER_*` (`points/page.tsx:288-300`) | G-C 부제 56, 우측 없음 | 26/24·640 | 없음 | 탭 O / 없음 | 구조 일치 스켈레톤(`:114-121`) | 거터 이중, 셸 미사용 |
| 23 | `/mypage/points/charge` | SH (`points/charge/page.tsx:110-118`) + `PointChargeForm layout="page"` | G-C 부제 56, 우측 없음 | 10/8 + FORM column(36rem/md 40rem, `px-4 md:px-6`) (`components/points/PointChargeForm.tsx:76`) → 폰 26/24, 태블릿 34/32; 스켈레톤은 `40rem px-4`(`charge/page.tsx:26`)라 로딩→본문 가로 위치 변함 | MyStickyCta | 탭 O → CTA 가림 / **FAB O** | 자체 | 폭·여백·스켈레톤 불일치, CTA 겹침 |
| 24 | `/mypage/points/expiring` | SH (`points/expiring/page.tsx:105-115`) | G-C 부제 56, 우측 없음 | 26/24·640 | 없음 | 탭 O / 없음 | `ExpiringSkeleton` | 거터 이중 |
| 25 | `/mypage/points/promotions` | SH (`points/promotions/page.tsx:147-156`) | G-C 부제 56, 우측 없음 | 640 · **16/16** (바깥 거터 없음) | 없음 | 탭 O / 없음 | Suspense 빈 div(`:212`) | 셸 미사용 |
| 26 | `/mypage/products` | SUB + stickyBelow 필터 (`components/mypage/products/MyProductsPageClient.tsx:50-71`) | G-C 부제 56, 우측 없음, 헤더 아래 필터 바 | 10/8 + `MyProductsView` 40rem(여백 없음) → **폰 10/8**, 최대 640 (`MyProductsView.tsx:368`) | **임의 고정 바** `fixed inset-x-0 bottom-0 z-20`, 전폭·거터 10/8, 아래 패딩=하단탭 높이 (`MyProductsView.tsx:401-413`) | 탭 O (바가 탭 위 영역에 그려짐, z는 탭보다 낮음) / 없음 | 자체 | 폭·여백, CTA 규격(MyStickyCta 아님·전폭) |
| 27 | `/mypage/recent-viewed` | SH (`components/recent-viewed/RecentViewedList.tsx:148-157`) | G-C 부제 56, 우측 "전체 삭제" 버튼 | 26/24·640 | 없음 | 탭 O / 없음 | 자체 list | 거터 이중 |
| 28 | `/mypage/required/dibay-id` | MS (`required/dibay-id/page.tsx:9`) | G-C 52, 🔔 | 26/24·640 | MyStickyCta (`ProfileDibayIdSection`) | 탭 O → CTA 가림 | MS | 거터 이중, CTA 겹침 |
| 29 | `/mypage/required/phone` | MS (`required/phone/page.tsx:9`) | G-C 52, 🔔 | 26/24·640 | MyStickyCta (`PhoneVerificationBox verifyCtaPlacement="sticky"`, `MypageRequiredPhoneClient.tsx:96`) | 탭 O → CTA 가림 | MS | 동일 |
| 30 | `/mypage/section/[section]` (account·trade·community·store·messenger·settings) | **STK** `MyPageStackShell` (`components/mypage/MyPageSectionMenuClient.tsx:23-52`, `mobile/MyPageStackShell.tsx:45-53`) | G-C 52, 🔔 | **42–66rem · 10/8** (40rem 없음) | 없음 | 탭 O (`/mypage/section/store*` 도 탭 O — `conditional-app-shell-flags.ts:174-175` 의 "하단 탭 숨김" 변수는 미사용) | **`MainFeedRouteLoading`**(`section/[section]/page.tsx:13`) | 폭·여백, STK 잔존(§1.2 "흡수·대체"), 피드 스켈레톤 금지 위반 |
| 31 | `/mypage/section/[section]/[item]` (렌더되는 항목: account/{favorite,blocked,hidden}-users · settings/{device-permissions, language, country, region, chat-settings, notifications, personalization, video-autoplay, cache, terms, version, leave} · store/{payment, rider} · community/{liked-posts, favorite-posts, community-friends, reports}) | MS (`components/mypage/MyPageItemRouteClient.tsx:69`) — 나머지 항목은 서버 리다이렉트(`lib/mypage/mypage-section-legacy-redirect.ts:18-44`) | G-C 52, 🔔 (기본값 `resolve-main-tier1.ts:548-550` 을 MS 가 덮음) | 26/24·640 | settings/cache·settings/leave 만 MyStickyCta (`CacheSettingsContent.tsx:57`, `AccountDeletionRequestForm.tsx:10`) | 탭 O → 두 화면 CTA 가림 | Suspense `MyStateSkeleton template` (`[item]/page.tsx:31`) | 거터 이중, cache·leave CTA 겹침 |
| 32 | `/mypage/section/account/profile/edit?setup=1` (그 외 → `/mypage?edit=profile` 시트) | 자체 `ProfileEditForm` + `ProfileEditHeader` (`components/my/edit/ui/ProfileEditHeader.tsx:26-45`) | 자체 fixed 헤더, 제목 가운데, 52; 전역 헤더 숨김(`isProfileEditPath`) | **max 768px · 16/16** (`lib/ui/profile-edit-starbucks-styles.ts:6`) | `ProfileEditBottomSaveBar` fixed z-30, 768px px-4 (`ProfileEditBottomSaveBar.tsx:27-32`) | 탭 X / 없음 | `MyStateSkeleton form` | 폭 768 (640 아님), CTA 규격 별도 |
| 33 | `/mypage/store-inquiries` | MS `template="list"` (`store-inquiries/page.tsx:9`) | G-C 52, 🔔 | 26/24·640 | 없음 | 탭 O / 없음 | MS | 거터 이중 |
| 34 | `/mypage/store-orders` | MS `template="list"` + `MyStoreOrdersView suppressTier1Sync` (`store-orders/page.tsx:11-13`) | G-C 52, 🔔 | 26/24·640 | 없음 | 탭 O(배달 탭 변형 **확인 필요**). **셸 pb-0**(hub clearance 목록 포함, `main-bottom-nav-hub-clearance.ts:43`) + 본문 `pb-4` 만 → **마지막 행이 탭에 가림(코드상)** | `MyStateView list thumb` | 거터 이중, 하단 여백 누락 |
| 35 | `/mypage/store-orders/[orderId]` | SH + 자체 2겹 (`store-orders/[orderId]/page.tsx:14-26`) | G-C 부제 56, 우측 장바구니 링크 | 26/24·640 | MyStickyCta (`MyStoreOrderDetailView.tsx:1149-1150`) | 탭 O → CTA 가림, 셸 pb-0 / FAB 조건부(`:653-660`) | 자체 | 거터 이중, CTA 겹침 |
| 36 | `/mypage/store-orders/[orderId]/review` | INL (`review/page.tsx:11-21`) | 내부 `DetailHeader` 가운데, 부제 56, 전역 헤더 없음(뷰포트 잠금) | **42–66rem · 10/8** (`lib/stores/store-order-review-page-layout.ts:13`) | 인라인 하단 바(flex, fixed 아님) | 탭 X / FAB X | 없음 | 폭·여백 (배달 `/orders/store/*/review` 와 공용) |
| 37 | `/mypage/support-history` | MS (`components/support/MemberSupportHistoryClient.tsx:23-30`) | G-C 52, 🔔 | 26/24·640 | 없음 | 탭 O / FAB X | 페이지 Suspense 스켈레톤 `pt-16`(`support-history/page.tsx:13`) — MS 헤더 없이 그림 | 거터 이중, 스켈레톤 위치 불일치 |
| 38 | `/mypage/trade/favorites` | trade layout (`app/(main)/mypage/trade/layout.tsx:15-23`) + `TradeHubLayoutHeader`(SH, `registerMainTier1={false}`, 2단 탭) + `TradeHubSectionShell` 카드 | G-C 제목=경로 기본 `nav_trade_hub_favorites`, 부제 `tier1_trade_hub_subtitle` 56, 🔔(기본 true), 헤더 아래 거래허브 탭 | **42–66rem · 10/8** (`APP_MAIN_FEED_STACK_CLASS max-w-none`) + 카드 내부 패딩 | 없음 | 탭 O, 본문 자체 clearance / 없음 | 없음 | 폭·여백(문서 `:1104` "820px 최대 폭 40rem" 미적용) |
| 39 | `/mypage/trade/reviews` | 38번과 동일 + `TradeReviewsManagementView` | 동일 (`nav_trade_hub_reviews`) | 동일 | 없음 | 동일 | 없음 | 동일 |
| 40 | `/mypage/trade/chat/compose` (전이 화면 → 채팅방/목록 리다이렉트) | `TradeChatComposeClient` → `TradeChatComposePreparingShell` | G-C 기본 `tier1_trade_hub_title`(`resolve-main-tier1.ts:128-134`) | 확인 필요 | 없음 | 탭 O | **`MainFeedRouteLoading`** (`compose/page.tsx:23`) | 피드 스켈레톤 |
| 41 | `/mypage/trust` | MS `template="detail"` (`components/mypage/trust/MypageTrustContent.tsx:129`) | G-C, 부제 = 경로 기본 `tier1_trust_subtitle`(`resolve-main-tier1.ts:497-499`) 56, 🔔 | 26/24·640 | 없음 | 탭 O / 없음 | MS | 거터 이중 |

### 2.1 내정보 메뉴에서 가는 내정보 밖 목적지

| # | 경로 (진입 메뉴) | 셸 | 헤더 | 본문 폭·여백 | 하단 CTA | 하단탭 / FAB | 스켈레톤 | 비고 |
|---|---|---|---|---|---|---|---|---|
| 42 | `/stores/owner/apply` (매장 입점 행, `lib/mypage/mypage-home-menu-config.ts:170,193`; `/mypage/business/apply` 리다이렉트) | `StoresOwnerApplyShell` (`app/(main)/stores/owner/StoresOwnerLayoutClient.tsx:30,47-49`) | 전역 헤더 숨김(`mobile-top-tier1-rules.ts:94-98`) → 자체 `StoresOwnerStackHeader variant="admin"` **fixed, h-14(56px), 제목 왼쪽, 헤더 폭 제한 없음(전폭), 좌우 12/16px** (`components/business/owner/StoresOwnerStackHeader.tsx:55-94`, `StoresOwnerApplyHeaderChrome.tsx:13-22`) — Owner 캡처(제목 왼쪽)와 일치 | `max-w-[42rem] px-2` (8px) (`stores/owner/apply/page.tsx:283`) | 오너 고정 푸터(BodyPortal, `BusinessApplyForm.tsx:556-570`, 안쪽 `px-2` `lib/business/owner-admin-footer-actions.ts:31-32`) | 탭 X / FAB O(`OwnerSupportContextBridge`, 위치는 오너 셸 규칙 — **확인 필요**) | 확인 필요 | 매장 오너 도메인 셸(내정보 셸 아님). `resolve-main-tier1.ts:524` 의 apply 분기는 앞선 `/stores/owner/.+` 분기(`:517-522`)에 가려 도달 불가 |
| 43 | `/stores/owner` (승인 매장 보유 시 매장 행, `mypage-home-menu-config.ts:177,183`) | `BusinessAdminShell` (`StoresOwnerLayoutClient.tsx:55-63`) | 오너 셸 자체 헤더 | 오너 셸 | 오너 셸 | 메인 탭 X | 오너 셸 | 매장 도메인 — 통일 범위 밖 |
| 44 | `/community-messenger/trade-chats` (거래채팅 행 `mypage-home-menu-config.ts:44`; `/mypage/purchases`·`/mypage/trade/purchases`·`/mypage/trade/chat` 리다이렉트) | 메신저 허브 리스트 | 메신저 셸 효과가 1단 덮어씀 | 메신저 규칙(768+ 분할) | 없음 | 탭 O | 메신저 | 메신저 도메인 — 통일 범위 밖 |
| 45 | `/community-messenger?section=chats` (홈 stat 「안읽은 채팅」, `lib/mypage/mypage-home-stat-config.ts:27`) | 메신저 허브 | G-L(메인 허브) | 메신저 | 없음 | 탭 O | 메신저 | 범위 밖 |
| 46 | `/notifications` (`/mypage/notifications` 리다이렉트, `notifications/page.tsx:4`) | SH (`app/(main)/notifications/page.tsx:123-215`) | G-C, **뒤로 → `/`**, 우측 설정·더보기 | 42–66rem · 10/8 | 없음 | 탭 O | 확인 필요 | 내정보 기준 폭 미적용 |
| 47 | `/privacy` (정책 행 `mypage-home-menu-config.ts:307`) | `LegalDocumentPageClient` (`components/legal/LegalDocumentPageClient.tsx:110`) | G-C, **`resolveMainTier1Subpage` 미등록 → 제목 빈 값 → "내용을 표시할 수 없습니다" 표시**(`resolve-main-tier1.ts:596-597`, `RegionBar.tsx:152-162`), 뒤로 기본 `/philife`(히스토리 우선), 🔔; 본문에 별도 큰 h1 | `max-w-3xl`(768) `px-4 py-8` | 없음 | 탭 O | 없음 | 제목 누락·중복, 폭 |
| 48 | `/business-info` (정책 행 `:312`) | `BusinessInfoPageClient` (`app/(main)/business-info/BusinessInfoPageClient.tsx:48`) | 47과 동일(제목 누락) | `max-w-3xl px-4 py-8` | 없음 | 탭 O | 텍스트 "불러오는 중…" | 동일 |
| 49 | `/mypage?edit=profile` (프로필 수정) | 홈 위 시트 (`MyContent.tsx:171-173`) | 시트 | 시트 규칙(문서 `:582` "태블릿 = 시트 폭 최대 40rem") — **확인 필요** | 시트 내부 | 홈 탭 | — | 시트 감사는 범위 밖 |
| — | `/mypage/section/settings/terms` (약관 행) | 31번(MS `MyPolicyHub`) | | | | | | 31번 참조 |

### 2.2 렌더 없이 리다이렉트만 하는 `/mypage` 라우트 (레이아웃 계약 없음)
`business`, `business/apply`, `business/orders`, `business/profile`, `edit`, `logout`, `notifications`, `offers/received`, `offers/sent`, `points/ledger`, `profile`, `profile/edit`, `purchases`, `purchases/[chatId]`, `required`, `reviews`, `sales`, `section/settings/notices`, `section/settings/support`, `settings`, `settings/[section]`(**Suspense 폴백 `MainFeedRouteLoading` 를 먼저 그린 뒤 리다이렉트**, `settings/[section]/page.tsx:34`), `store-orders/[orderId]/chat`, `trade`, `trade/chat`, `trade/chat/[roomId]`(폴백 `MainFeedRouteLoading`, `:25`), `trade/purchases`, `trade/sales` — 각 `page.tsx` 의 `redirect(...)`. 75개 page.tsx 중 28개.
`/my/*` 별칭(약 40개)은 대부분 `/mypage/*` 로 리다이렉트(`app/(main)/my/**/page.tsx`), `/my/business/*` 는 오너 도메인.

---

## 3. 서로 다른 변형과 개수 (렌더 경로 41행 기준, 2.1 의 내정보 밖 제외)

### 3.1 본문 폭·여백 변형
| ID | 내용 | 폰 좌/우 | 태블릿 좌/우 | 최대폭 | 경로 수 | 해당 # |
|---|---|---|---|---|---|---|
| V0 | 홈 (`APP_MAIN_COLUMN` + 40rem px-4/md:px-5) | 16/16 | 20/20 | 640 | 1 | 1 |
| V1 | `APP_MAIN_TAB_SCROLL_BODY`(10/8) + 40rem px-4/md:px-5 (MyScreen 및 동일 수동 조합) | 26/24 | 30/28 | 640(-40) | 19 | 2,9,10,11,13,14,15,20,22,24,27,28,29,31,33,34,35,37,41 (+ 31 은 다수 항목 묶음) |
| V2 | 40rem px-4/md:px-5 만 (바깥 거터 없음) | 16/16 | 20/20 | 640 | 3 | 6,7,25 |
| V3 | `APP_MAIN_TAB_SCROLL_BODY` 만 (앱 컬럼·10/8) | 10/8 | 10/8 | 672→1056 | 7 | 12,16,17,21,30,38,39 |
| V4 | 10/8 + FORM 컬럼(36/40rem, px-4/md:px-6) | 26/24 | 34/32 | 640 | 2 | 19,23 |
| V5 | 10/8 + CS LIST 컬럼(px-3/sm:px-4, 최대 56rem) | 22/20 | 26/24 | 896 | 1 | 18 |
| V6 | 10/8 + 40rem (여백 없음) | 10/8 | 10/8 | 640 | 1 | 26 |
| V7 | 앱 컬럼, 거터 0 (주소) | 0 (확인 필요) | 0 | 672→1056 | 2(+1 확인 필요) | 3,5,(4) |
| V8 | 앱 컬럼 + 10/8 (매장주문 리뷰 공용) | 10/8 | 10/8 | 672→1056 | 1 | 36 |
| V9 | `max-w-lg` px-4 | 16/16 | 16/16 | 512 | 1 | 8 |
| V10 | 768px px-4 (프로필 setup) | 16/16 | 16/16 | 768 | 1 | 32 |
| — | 내정보 밖: 42rem px-2(#42) · 3xl px-4(#47,48) · 앱 컬럼 10/8(#46) | | | | 4 | |

→ **본문 폭/여백 변형 11종(내정보 안)**. 문서 기준(16/20·640)에 맞는 것은 V0·V2 (4경로)뿐.

### 3.2 헤더 변형
| ID | 내용 | 경로 수 |
|---|---|---|
| H1 | 전역 허브 `SectionHeader` 제목 왼쪽, 뒤로 없음 (홈) | 1 |
| H2 | 전역 `DetailHeader` 가운데, 우측 🔔 (MS·STK·trade·부제 유무 혼재) | MS 계열 11 (2,13,15,20,28,29,31,33,34,37,41) + STK 1 (30) + trade 2 (38,39) = 14 |
| H3 | 전역 `DetailHeader` 가운데, **우측 없음** (SH 직접 사용 — `showHubQuickActions` 기본 false, `MySubpageHeader.tsx:71`) | 14 (6,7,8,9,10,11,18,19,21,22,23,24,25,26) |
| H4 | 전역 `DetailHeader` 가운데, 우측 기능 버튼(검색·전체삭제·장바구니) | 4 (14,27,35, 12/16 장바구니 포함 시 6) |
| H5 | 페이지 내부 `DetailHeader`(inlineChrome, 뷰포트 잠금, 전역 없음) 가운데 | 4 (3,4,5,36) |
| H6 | 자체 fixed `ProfileEditHeader` 가운데 | 1 (32) |
| H7 | 오너 `StoresOwnerStackHeader` 제목 왼쪽 56px 전폭 (내정보 밖 #42) | 1 |
| H8 | 전역 `DetailHeader` + 제목 미등록("내용을 표시할 수 없습니다") (내정보 밖 #47,48) | 2 |
- 높이: 폰에서 MS·STK 경로는 대부분 52px(부제 없음), SH 직접 경로·거래허브·주문상세 등은 56px(부제 있음) — 같은 내정보 하위인데 헤더 높이가 4px 다름. 부제가 페이지가 아니라 **경로 기본값에서 새는** 곳 2개(#2, #41).
- 헤더 행 최대폭 768px(`sector-header.css:5`) ≠ 본문 640px → 태블릿·웹에서 뒤로 버튼·제목 좌측 끝이 본문 좌측 끝과 어긋남(모든 H2–H5).

### 3.3 하단 CTA 변형
| ID | 내용 | 경로 |
|---|---|---|
| C1 | `MyStickyCta` (fixed z-30, 바 전폭, 안쪽 40rem 16/20) | 7,8,17,23,28,29,31(cache·leave),35 = 9화면 |
| C2 | `ProfileEditBottomSaveBar` (768px) | 32 |
| C3 | 임의 fixed z-20 전폭(10/8), 하단탭 높이만큼 띄움 | 26 |
| C4 | 댓글 입력바 fixed z-30 40rem | 15 |
| C5 | 비고정 하단 plane (주소·매장 리뷰) | 3,4,36 |
| C6 | 오너 푸터 (내정보 밖) | 42 |
- C1·C4 는 **10/10 화면 모두 하단탭이 함께 마운트되는 경로** → 코드상 CTA·입력바가 z-1200 하단탭 밑에 깔림. C1 안쪽 버튼 여백(16px)과 V1 본문 여백(26px)도 10px 어긋남.

### 3.4 기타 위반 목록
- `MainFeedRouteLoading` 사용(문서 §1.2 금지): `section/[section]/page.tsx:13`, `settings/[section]/page.tsx:34`, `trade/chat/[roomId]/page.tsx:25`, `trade/chat/compose/page.tsx:23`.
- `MyPageStackShell` 잔존(문서: MyScreen 이 흡수·대체): `MyPageSectionMenuClient.tsx:23,31,38`.
- 스켈레톤 위치 불일치(`pt-16`, 헤더 없이): `support-history/page.tsx:13`, `MypageCsOwnerCareBridge.tsx:22`; 포인트 충전 스켈레톤 폭 ≠ 본문 폭(`points/charge/page.tsx:26` vs `PointChargeForm.tsx:76`).
- `/mypage/store-orders(/*)` 하단 여백 누락(셸 pb-0 + 본문 clearance 없음): `main-bottom-nav-hub-clearance.ts:43` + `MyScreen.tsx:123-125`, `MyStoreOrdersView.tsx:1015-1032`.
- 헤더 제목 굵기 700(`sector-header.css:25`) vs 문서 17/600.
- `resolve-main-tier1.ts` 도달 불가 분기: `/mypage/purchases|sales|reviews` 중복(`:391-418`, 그리고 `:56` 에서 이미 null), `/stores/owner/apply`(`:524`).
- `conditional-app-shell-flags.ts:174-175` `isDeliveryMyInfoStoreSection` 정의만 있고 미사용(주석은 "하단 탭 숨김").
- 쿠폰·상품권 지갑(#12,16) 뒤로 기본값이 `/stores` — 내정보에서 들어와도 히스토리 실패 시 배달 홈으로 감(`resolve-main-tier1.ts:201-218`).

---

## 4. 단일 기준 제안 (승인 문서 §1.8·v2.1 §3.2 와 일치)

### 4.1 기준
1. **본문**: 폰 좌우 **16px**, 768px 이상 **20px**, 최대폭 **40rem(640px)** 가운데, 1열. = `MYPAGE_COLUMN_MAX_WIDTH_CLASS` + `MYPAGE_GUTTER_X_CLASS` 단 1회 적용(앱 피드 거터 10/8 과 겹치지 않음). 홈(V0)과 동일.
2. **헤더**: 하위 화면 = 전역 1단 `DetailHeader` 1개(뒤로 왼쪽 · 제목 가운데 · 52px/부제 56px), 페이지는 `MyScreen`(→`MySubpageHeader`)으로만 등록. 홈만 허브 헤더(제목 왼쪽). 우측 = 기본 🔔(`MyScreen` 관례), 화면 기능 아이콘이 있으면 그것으로 대체. 뷰포트 잠금 화면(주소·리뷰)만 `inlineChrome`(같은 `DetailHeader`)을 유지. 근거: 현행 하위 화면 다수(H2) 관례 + 문서 "왼쪽 뒤로". 제목 정렬은 승인 문서에 규정이 없어 **현행 다수(가운데)로 고정**.
3. **하단 CTA**: `MyStickyCta` 하나. 하단탭이 마운트된 경로에서는 바를 탭 위(`bottom = 60px + safe`)로 올리거나, CTA 화면을 하단탭 숨김 경로로 지정 — 둘 중 문서 `:1025`("하단 고정 CTA 는 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 위(현행)")와 맞는 **탭 위 배치**로 정함. 본문 하단 여백도 같은 값(탭 60 + CTA 66 + safe).
4. **스켈레톤**: `MyScreen state` / `MyStateView` 만, 헤더는 즉시 그림(문서 §1.5). `MainFeedRouteLoading`·`pt-16` 폴백 제거.
5. 헤더 행 폭(768px)은 앱 전역 토큰이라 이번 기준에서 **변경하지 않음**(다른 도메인 영향). 태블릿에서 헤더-본문 좌측 정렬 차이는 남은 위험으로 기록.

### 4.2 바뀌어야 할 파일 (기준 적용 시)
- 공통
  - `components/mypage/ds/MyScreen.tsx:121-125` — 바깥 `APP_MAIN_TAB_SCROLL_BODY_CLASS` 를 거터 없는 래퍼로 교체(예: `lib/ui/mypage-responsive-breakpoints.ts` 에 `MYPAGE_SCROLL_BODY_CLASS` 신설). 이것만으로 V1 21경로가 16/20 이 됨.
  - `components/mypage/ds/MyStickyCta.tsx:73-76` — 하단탭 마운트 여부(`useBottomNavOccupiesClearance`, `lib/layout/bottom-nav-scroll-chrome-context.tsx`)에 따라 bottom 오프셋·본문 여백(`MY_STICKY_CTA_BODY_CLEARANCE_CLASS`) 조정.
  - `components/mypage/cs/CustomerCenterCommentsPanel.tsx:341` — 같은 처리.
  - `lib/layout/main-bottom-nav-hub-clearance.ts:43` 또는 `MyScreen` — `/mypage/store-orders(/*)` 하단 여백 복구(배달 허브 `/orders` 경로 영향 확인 필요).
- 수동 조합 → `MyScreen` 전환(또는 같은 클래스): `app/(main)/mypage/benefits/page.tsx`, `order-notifications/page.tsx`, `points/page.tsx`, `points/charge/page.tsx`(+ `components/points/PointChargeForm.tsx:76`), `points/expiring/page.tsx`, `points/promotions/page.tsx`, `ads/MyAdsPageClient.tsx`, `ads/apply/MyAdsApplyPageClient.tsx`, `ads/feed-request/page.tsx`, `store-orders/[orderId]/page.tsx`, `components/mypage/community/MypageCommunityPostsChrome.tsx`, `components/mypage/community-activity/MypageCommunityActivityChrome.tsx`, `components/recent-viewed/RecentViewedList.tsx`, `components/mypage/i18n/MypageSubpageShell.tsx` + `components/mypage/products/MyProductsPageClient.tsx` + `MyProductsView.tsx:368,401-413`, `components/mypage/mobile/MyPageStackShell.tsx`·`components/mypage/MyPageSectionMenuClient.tsx`, `components/mypage/cs/MemberCsNoteListClient.tsx`·`MemberCsNoteThreadClient.tsx`(+ `lib/mypage/customer-center-layout.ts`), `components/gift-certificate/OwnedGiftInstanceDetailView.tsx:124`.
- 거래 허브: `app/(main)/mypage/trade/layout.tsx:20` (40rem·16/20 컬럼 추가).
- 주소·매장 리뷰(공용 컴포넌트 — 배달/오너 경로 회귀 확인 필요): `lib/addresses/mypage-address-manage-layout.ts:19`, `components/addresses/AddressEditorPageClient.tsx`, `lib/stores/store-order-review-page-layout.ts:13`(내정보 경로 분기 필요).
- 프로필 setup: `lib/ui/profile-edit-starbucks-styles.ts:6`, `components/my/edit/ui/ProfileEditBottomSaveBar.tsx:32` (768px → 40rem).
- 스켈레톤: `app/(main)/mypage/section/[section]/page.tsx:13`, `settings/[section]/page.tsx:34`, `trade/chat/compose/page.tsx:23`, `trade/chat/[roomId]/page.tsx:25`, `support-history/page.tsx:13`, `components/mypage/cs/MypageCsOwnerCareBridge.tsx:22`, `points/charge/page.tsx:26`.
- 헤더 제목 등록: `lib/layout/resolve-main-tier1.ts` 에 `/privacy`·`/business-info` 추가(+ 페이지 h1 중복 정리 `components/legal/LegalDocumentPageClient.tsx:110`, `app/(main)/business-info/BusinessInfoPageClient.tsx:48`); 쿠폰·상품권 지갑 뒤로 기본값(`:201-218`)은 배달 허브 공용이라 범위 결정 필요.
- 범위 밖(보고만): `/stores/owner/apply`(오너 셸·왼쪽 제목·42rem px-2), 메신저 목적지, `/notifications`.

### 4.3 남은 위험 / 확인 필요
- MyStickyCta·댓글 입력바가 하단탭에 가리는지 실화면 미확인(코드 근거만) — NOT_PROVEN.
- `/mypage/offers` 캡처의 회색 띠 색 출처, 주소 목록 카드 자체 좌우 여백, 쿠폰/상품권 허브 FAB 조건, `MainShellTabContentTransition` transform 이 fixed 요소에 주는 영향 — 확인 필요.
- 헤더 행 768px vs 본문 640px 정렬 차이는 전역 토큰 변경 없이는 남음.


---
> 보완 2026-10-20: 이 부록의 제안은 본 설계서 §11~§16 이 대체·확정한다 (필수정보 §11 · 헤더/CTA §12 · /home §13 · 사진 §14).
