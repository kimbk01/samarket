# D — CSS 캐스케이드 레이어(#124) · 내정보 전환/스켈레톤 · 네이티브 근거 (읽기 전용 감사)

기준: 로컬 HEAD `13388f73c` (브랜치 `claude/gifted-cori-78bfpo`), `origin/main` = `49318dd1a` (#124 머지 커밋, 13388f73c 포함 확인 `git merge-base --is-ancestor`).
저장소·git·DB·배포 변경 없음. 실측은 저장소 밖 스크래치에서 `@tailwindcss/postcss` 4.2.1 로 globals.css 를 직접 컴파일한 결과(`audit2/css/pre.css`, `post.css`).

---

## Part 1 — CSS cascade layers (#124)

### 1-1. 커밋 확인
- `git show 13388f73c --stat`: `app/globals.css +8`, `app/samarket-components.css +1 −20` (2 files, 9+/20−).
  - globals.css:1-7 — 맨 앞에 `@layer properties, theme, base, components, utilities;` 추가.
  - samarket-components.css — #123 이 넣은 레이어 밖 백업 규칙 제거, 주석만 교체(:315).
- `46335b6ae` (#123) CSS 부분: samarket-components.css 에서 `@layer components` 안의 `:is(a, button).sam-btn-primary, :is(a,button).sam-btn.sam-btn--primary { color }` 를 지우고, 파일 하단(레이어 밖, 구 :1317-1334)에 **unlayered** 백업 `background-color: var(--sam-primary); color: var(--sam-text-on-primary)` + `:active` 배경을 추가. #124 가 이 백업을 그대로 삭제함 → 현재 HEAD 에 백업 없음.

### 1-2. 전역 CSS import 순서 (app/layout.tsx:30 → `./globals.css` 단일)
| # | 파일 (globals.css 줄) | @layer 사용 |
|---|---|---|
| 0 | globals.css:7 `@layer properties, theme, base, components, utilities;` (#124) | 순서 선언 |
| 1 | design-tokens.css (:10) | 없음(unlayered, 변수) |
| 2 | dibay-overlay.css (:11) | 없음 |
| 3 | member-admin-dialog.css (:12) | 없음 |
| 4 | platform-popup.css (:13) | 없음 |
| 5 | lib/community/community-design-tokens.css (:14) | 없음 |
| 6 | delivery-tokens.css (:15) | 없음 |
| 7 | **delivery-components.css (:16)** | `@layer components {` :5 (파일 전체 중 상단 블록) + :1247 이후 unlayered 블록("Modal chrome — unlayered so preflight… cannot wash out UI") |
| 8 | delivery-order-confirm-modal.css (:17) | 없음 |
| 9 | **app-shell.css (:18)** | `@layer components {` :69 |
| 10 | chat-viewport-shell.css (:19) | 없음 |
| 11 | app-bottom-nav.css (:20) | 없음 |
| 12 | app-desktop-side-nav.css (:21) | 없음 |
| 13 | sector-header.css (:22) | 없음 |
| 14 | dibay-chrome-ssot.css (:23) | 없음 |
| 15 | store-commerce-action-bar.css (:24) | 없음 |
| 16 | owner-compact-shell.css (:25) | 없음 |
| 17 | delivery-domain-switcher.css (:26) | 없음 |
| 18 | auth-oauth-panel.css (:27) | 없음 |
| 19 | community-share-sheet.css (:28) | 없음 |
| 20 | market-list-detail-transition.css (:29) | 없음 |
| 21 | pretendard variable css (:31) | 없음 |
| 22 | **tailwindcss (:32)** | 내부 첫 줄 `@layer theme, base, components, utilities;` (node_modules/tailwindcss/index.css:1) + theme/base(preflight)/utilities |
| 23 | **samarket-components.css (:36)** | `@layer components {` :10, :1476 (나머지 일부 unlayered, 예: 어드민 사이드바 @media) |
| 24 | globals.css 본문 | `@layer base` :261 (button font/color inherit), `@layer components` :966, `@layer utilities` :1007 (safe-area padding), 그 외 대부분 unlayered |

라우트 단위 CSS(전역 아님, 모두 **@layer 없음 = unlayered**): `app/(main)/community-messenger/layout.tsx:1-4` (messenger-view-transitions / messenger-presentation / messenger-home-bottom-sheet / delivery-chat-room.css), `components/mypage/MyStoreOrdersView.tsx:4`·`MyStoreOrderExpandPanel.tsx:41` (store-order-list-tokens.css), *.module.css 4개(스피너). unlayered 라 #124 와 무관.

컴파일 결과 unlayered 최상위 규칙: pre 571 / post 569 (차이 2 = #123 백업 2규칙 제거).

### 1-3. 실효 레이어 순서 (실측)
- **pre-#124** (`git show 13388f73c^:app/globals.css` 컴파일): `properties < components < theme < base < utilities`
  - components 가 compiled 1732행(delivery-components.css 의 `.delivery-page`)에서 처음 등장, theme/base/utilities 는 5196행 Tailwind 선언에서 등장 → **components 가 base(preflight)보다 앞 = base 가 이김**. 커밋 메시지의 원인 진단은 사실.
- **post-#124**: `properties < theme < base < components < utilities` (Tailwind v4 기본과 동일).
- 확인 필요: Next 16 프로덕션 CSS 파이프라인(Turbopack/lightningcss 최소화)이 레이어 순서를 보존하는지 — 원리상 보존되나 배포 산출물 직접 확인 안 함.

### 1-4. 실효 캐스케이드 변화 (무엇이 바뀌었나)
변화는 **"base vs components" 한 쌍뿐**이다. 나머지는 동일:
- components < utilities: pre/post 동일 → Tailwind 유틸이 sam-* 를 덮는 관계 **불변**.
- unlayered 규칙: pre/post 모두 모든 레이어를 이김 → 불변.
- theme < components 로 바뀌었으나 theme 레이어는 `:root,:host` 변수뿐이고 components 의 `:root`는 `--call-*`만 정의 → 충돌 없음.
- `!important` 역순: components 안 important 는 `.sam-tier1-header__*`, `.sam-input.owner-store-profile-field-edge` 등 크기·테두리뿐, base 의 important 는 `[hidden]{display:none!important}` 하나 → 실충돌 없음.

base(preflight + globals.css:261) 가 설정하는 속성 (post.css 기준):
`*,::before,::after{margin:0;padding:0;border:0 solid}`, `h1-h6{font-size:inherit;font-weight:inherit}`, `a{color:inherit;text-decoration:inherit}`, `button,input,select,textarea{font:inherit;letter-spacing;color:inherit;border-radius:0;background-color:transparent;opacity:1}`, `small`, `b,strong`, `ol,ul{list-style:none}`, `img,svg…{display:block}`, `img,video{max-width;height:auto}`, `table`, `::placeholder`, `button{max-width:100%;font:inherit;color:inherit}`(globals.css:261-270).

결과:
- components 레이어 규칙 총 557개 중 **180개가 margin/padding/border 를 선언** → pre 에서는 `*{margin:0;padding:0;border:0 solid}` 때문에 **모든 요소에서 무효**였고, post 에서 처음으로 적용됨.
- 412개가 color/background/font-size/font-weight/line-height/radius 등 선언 → 대상 요소가 `a`/`button`/`input`/`h1-6`/`small`일 때만 pre 에서 무효였고 post 에서 적용.
- 즉 "좋은 변화"(의도대로 sam-* 가 preflight 를 이김)와 "숨어 있던 규칙이 갑자기 살아나는 변화"가 **같은 현상**이다. 기존 화면이 sam-* 규칙 무효 상태를 전제로 유틸로 맞춰져 있었다면 그 부분은 유틸이 이기므로 불변, 유틸 없이 sam-* 만 쓴 곳은 외형이 바뀐다.
- 개발자들이 이 문제를 알고 우회한 흔적: delivery-components.css:1247-1252 ("`@layer components` 안 규칙은 화면에 반영되지 않을 수 있음" → unlayered 로 이동), app-shell.css:102 주석(padding-bottom 을 utilities 로), globals.css:1003-1006. 이 우회 규칙들은 unlayered/utilities 라 #124 로 바뀌지 않음.
- "base 가 이기는 것에 의존하던" 의도적 규칙은 찾지 못함. 다만 아래 위험 목록처럼 **결과적으로 의존하던 화면**은 존재.

### 1-5. 위험 목록 (post-#124 에서 새로 적용되는 구체 셀렉터·화면)
| 위험 | 셀렉터 (정의) | 새로 적용되는 것 | 사용처(예) | 판정 |
|---|---|---|---|---|
| 중 | `.sam-card`, `.sam-card--*`, `.sam-section`, `.sam-page-section` (samarket-components.css:26-40, 132-158) | `border 1px sam-border` (pre 는 border-width 0) | MyTopBanner.tsx:27, CategoryListByType.tsx:72, TradeHubSectionShell, MyPageMobileMenuRow, TradeHistoryStackPanel, AdPostCard, ChatRoomList, PostDetailView, TradePrimaryColumnStickyAppBar(sam-section) | 카드 테두리 신규 표시 — 시각 확인 필요 |
| 중 | `.sam-card-pad`, `.sam-card-pad-x`, `.sam-card__body` (:42-49, 136) | padding 16px (pre 0) | MyTopBanner.tsx:27, mypage/benefits/page.tsx:148, CategoryListByType.tsx:72, AdPostCard.tsx:32,63, GuestLoginRequiredPanel | 내부 여백 증가 — 내정보 배너 높이 변화 가능 |
| 중 | `h1-h6` + `sam-text-*` (:52-127) | font-size/weight/line-height 토큰 적용 (pre 는 inherit=body 14px) | `<h*>` + sam-text-* 323곳, 이 중 크기가 실제 바뀌는 page-title(17)/hero(18)/card-title(15)/helper(13)/xxs/body-secondary/profile-display 132곳. 예: GroupChatHomePageClient.tsx:55 (14→17px), services/AllServicesContent.tsx:11, group/[token]/page.tsx:187, StoreDetailInfoPublic.tsx:352 (hero 14→18px), StoreCommissionLedgerTable.tsx:338-371 (helper 14→13px) | 제목 크기 변화(설계 의도 복원이나 실측 안 됨) |
| 중 | `button`/`a` + `sam-text-*` | font-size·line-height 적용 (pre 는 `font:inherit`) | `<button|a|Link|input…>` + sam-text-* 최소 57곳 (한 줄 className 기준) | 버튼 글자 크기·줄높이 변화 |
| 중 | `.sam-btn` 계열 (:166-300) | padding-x 16px, border 1px, 배경·글자색, font-size 14px | Sam.btn.* 67개 파일 + 문자열 34개 파일 | 의도된 수정(#123/#124 대상). 유틸로 이미 덮은 곳 불변 |
| 중 | `.sam-input`, `.sam-input-surface-soft`, `.sam-textarea`, `.sam-select` (:367-375) | border 1px, padding 12px 4면, font-size 16px, line-height | Admin 배달 알림 AdminDeliveryAlertsPage.tsx:633-700,942-1030 (`h-8`/`h-9`), AdminDeliveryAutoActionsPage.tsx:744 (`h-7`), BusinessApplyForm, OwnerStoreProfileForm, PhoneVerificationBox, PhilifeNeighborhoodWriteForm, AdminStoreBannerAdWriterPanel(Sam.input.base) | min-height 46px 는 pre 에도 적용 → 높이 동일, 테두리·여백·16px 글자 신규. `h-7/h-8` 지정 입력은 min-h 46 이 이겨 그대로 46px(클리핑 없음 추정, 실측 확인 필요). /admin 대시보드 외 관리자 화면은 #124 에서 확인 안 됨 |
| 중 | `.sam-tabs`, `.sam-tab`, `.sam-tabs--scroll .sam-tab` (:537-560) | 하단 border, 탭 padding, 색·글자 | SortTabs.tsx, FavoriteFilterBar.tsx, CategoryListByType.tsx, StoreMenuCategoryChips.tsx, OwnerMenuCategoriesClient.tsx, TradePrimaryTabs.tsx | `/market` 계열 포함 — 커밋은 "/market 변화 0" 이라 했으나 이 컴포넌트 전부는 아님 → 확인 필요 |
| 하 | `.sam-header-action` (:1481) | border 1px transparent (레이아웃 +2px) | ChatInputBar.tsx:234,393,536, notifications/page.tsx, AddressRowCard, CustomerCenterBoardListClient | 아이콘 버튼 크기 +2px 가능 (h-/w- 유틸이 있으면 box-sizing 으로 흡수) |
| 하 | `.sam-settings-group`, `.sam-settings-section-title` (:1223~) | 테두리·패딩 | SettingsSection.tsx, NotificationsSettingsContent.tsx (내정보 설정) | 내정보 설정 화면 외형 변화 |
| 하 | `.delivery-btn-*`, `.delivery-badge`, `.delivery-category-chip` (delivery-components.css) | border·padding-inline·색 | ProductBadgeRow, StorePublicMenuList, StoreOrderNoticeStrip, /stores | 커밋이 "/stores 아웃라인 버튼 정상화" 확인 |
| 하 | `.stores-browse-header-primary-tab*` | border·padding | /stores/browse | 확인 필요 |
| 하 | `.main-bottom-nav-fab-sector__list` (:2288) | padding .125rem .25rem 0 신규 | 전역 하단 FAB 섹터 메뉴 | 미세 |
| 하 | `.app-safe-top` (app-shell.css:94) | padding-top safe-top | TSX 사용처 0 | 영향 없음 |
| 하 | `[data-admin] .admin-sidebar*` | border-color 만 | 관리자 사이드바 | border-width 는 유틸 → 영향 미미 |

(원자료: `audit2/css/spacing.txt` 180행, `comp-list.txt` 434행, `spacing-usage.txt` 클래스별 사용 파일 수.)

### 1-6. (a) 전역 루트 수정 vs (b) 내정보 한정 수정
- (a) 이미 main 반영(`49318dd1a`). Production 반영 여부·실화면: **NOT_PROVEN**.
  - 장점: 원인(레이어 순서 역전) 자체 제거. 180개 component 규칙·sam-text 132개 heading 등 설계 시스템이 문서대로 동작. 유틸 > 컴포넌트 관계 유지(AGENTS.md "Sam.btn.primary 같은 시맨틱 클래스 우선" 계약과 일치).
  - 단점: 영향 범위 = 앱 전체. 커밋 검증은 내정보·/stores·/market·/philife·/admin 대시보드·메신저 헤더뿐 → 위 표의 관리자 배달 알림, 설정, 그룹채팅/서비스 h1, 매장 상세 hero, 카드 테두리 등 미확인.
- (b) 내정보 한정(예: #123 방식의 unlayered 백업 또는 `[data-mypage] …` 스코프 규칙):
  - unlayered 규칙은 **utilities 까지 이김**(#123 백업이 `bg-*`/`text-*` 유틸을 무시했던 것과 동일) → 내정보 안에서 유틸로 색·여백을 조정한 곳이 깨지는 새 위험. 재발(다른 화면의 sam-* 무효)은 그대로 남고, 같은 백업을 화면마다 복제해야 함.
- **권고: (a) 유지.** 근거: 실측 레이어 순서(1-3)로 원인 확정, (b)는 cascade 상 utilities 를 이기는 부작용(46335b6ae 의 unlayered 규칙)이 구조적으로 따라옴. 롤백 대신 위 표의 "중" 항목 화면(내정보 배너·설정, 관리자 배달 알림/자동조치, 그룹채팅·서비스·매장 상세 제목, sam-tabs 사용 화면)을 1회 시각 확인하고, 회귀가 나오면 해당 컴포넌트만 유틸로 보정.

---

## Part 2 — 내정보 라우트 전환·스켈레톤

### 2-1. loading.tsx 목록 (app/(main), 상위 app/loading.tsx·app/(main)/loading.tsx **없음**)
| 파일 | 덮는 세그먼트 | 렌더 |
|---|---|---|
| mypage/loading.tsx | `/mypage` 및 하위 전체(자체 loading 없음) | `null` (주석: 하단 탭 전환에 스켈레톤 금지) |
| my/loading.tsx | `/my` 및 하위 | `null` |
| my/store-orders/loading.tsx | `/my/store-orders/**` | 인라인 카드형 로딩(RouteLoadingInline) — `/mypage/store-orders` 에는 없음(비대칭) |
| philife/loading.tsx | `/philife/**` | MainFeedRouteLoading rows=5 (피드 스켈레톤) |
| services/loading.tsx | `/services/**` | MainFeedRouteLoading rows=5 |
| market/loading.tsx | `/market/**` | null |
| stores/loading.tsx | `/stores/**` | null |
| stores/[slug]/cart, post, products/[id], shop, write, features, chats, community-messenger/(루트·calls·calls-v3·calls/[sessionId]·delivery-chats·trade-chats·rooms/[roomId]) | 각 세그먼트 | 각 도메인 전용(내정보 무관) |

→ **내정보 하위 경로에 피드/홈 스켈레톤이 뜨는 상위 loading 은 없음.** (`/mypage` 는 philife·services 밖.)
- 내정보 세그먼트는 `export const dynamic = "force-dynamic"` (mypage/layout.tsx:4, my/layout.tsx:3).
- 다른 탭 → `/mypage/x` 진입 시 `/mypage` 세그먼트가 새로 들어오므로 loading(null) → **본문 빈 화면 + 헤더**가 먼저 보일 수 있음. `/mypage/a` → `/mypage/b` 는 공유 레이아웃 아래 하위 세그먼트에 loading 이 없어 이전 화면을 RSC 도착까지 유지하는 동작으로 추정 — Next 16 동작 문서(node_modules/next/dist/docs) 미존재로 **확인 필요**.

### 2-2. 헤더 소유·제목 계산
- 헤더는 **레이아웃 소유**: ConditionalAppShell.tsx:342-348 이 `hubChromeHeader = <AppStickyHeader/>` 를 넘기고, AppRouteTransition.tsx:932 가 `{hubChromeHeader}{children}` 를 **한 push-surface** 안에 렌더 → 헤더와 본문이 함께 슬라이드(MainShellTabContentTransition.tsx:20-31 계약 "Header + Body = ONE transform surface"). 이전 페이지 헤더를 남겨 두는 구조 아님. 이전 화면 스냅샷(exiting)도 없음("OLD does not translate").
- 제목은 **pathname 동기 계산**: RegionBar.tsx:45,59 `resolveMainTier1Subpage(pathNoQuery)` → 페이지가 `MySubpageHeader` 의 useLayoutEffect 로 `MainTier1Extras` 를 덮음(MySubpageHeader.tsx 99-117, 언마운트 시 :117 `setMainTier1Extras(null)`). 따라서 **이전 페이지 제목이 남는 경로는 없음**(cleanup 이 null). 대신 페이지 마운트 전(위 null loading 구간 등)에는 **기본 제목**이 보임:
  - 실측(jiti 로 함수 직접 실행, `audit2/kinds.tsv`): 내정보/my 145개 라우트 중 **67개가 기본 제목 ""(빈 제목)**.
  - 결함: resolve-main-tier1.ts:547 `starts(p, "/mypage/section/")` — `starts()`(:7-9)가 `prefix + "/"` 로 비교해 `"/mypage/section//"` 가 되어 **절대 매칭 안 됨**. 주석의 "섹션 제목 덮어쓰기 전 기본값(내정보)"이 작동하지 않고 `/mypage/section/*` 전부 빈 제목으로 떨어짐(:596 fallback).
  - `/mypage/points/charge|expiring|ledger` 빈 제목 vs `/my/points/*` 는 제목 있음(별칭 비대칭).
- 결론: "다른 페이지 제목"이 아니라 "빈 제목 → 페이지 제목"으로 바뀌는 깜빡임 가능(페이지가 Suspense/loading 상태일 때). 실기기 **NOT_PROVEN**.

### 2-3. 우→좌 진입·역방향 복귀 적용 범위 (route-transition-enter-kind.ts)
결정 순서: 메신저 억제 → 매장오너 스택 → 커머스 자식 → 매장 신청 → 매장 허브 → 프로필 편집(:191) → 주소(:195) → 거래 상세 → 판매자 허브(:218) → 배달 소비자 → 커머스 스택(:274,:289) → 매장 오너 → **내정보 스택(:302)** → 내정보 store 섹션(:322, 내정보↔내정보에선 도달 불가) → 하단 탭 인덱스.
`/mypage` 에서 진입/`/mypage` 로 popstate 복귀 실측 결과:
- `mypage-stack-forward/back` (300ms, 우→좌 / 좌→우): **130개** — 일반 하위(`/my/**` 별칭·`/my/business/**` 포함, `/mypage/section/**`, store-orders, settings, offers, inbox, customer-center 등).
- `profile-edit-forward/back` (300ms): 5개 — `/mypage/edit`, `/my/edit`, `/mypage/profile`, `/mypage/profile/edit`, `/mypage/section/account/profile/edit`.
- `address-platform-forward/back` (300ms): 3개 — `/mypage/addresses`, `/edit`, `/search`.
- **규칙 밖 `rtl-forward/ltr-back`(일반 메인셸 440ms)**: 3개 — `/mypage/products`, `/mypage/points/promotions`(판매자 허브 분기 :218), `/mypage/gift-certificates/[id]`(커머스 분기 :289). 방향은 같으나 시간·클래스가 다름(AppRouteTransition.tsx:617 의 300ms 주입 대상 아님).
- **`subtle`(슬라이드 없음)**: 3개 — `/mypage/trade/chat`, `/compose`, `/[roomId]` (mypage-stack-slide.ts:21 의도적 제외).
- 같은 깊이 이동·popstate 아닌 링크 뒤로(`dNext<dPrev` 아님)는 forward 로 처리(:310-314).
- 화면 경로 분기: hubChromeHeader 가 있는 일반 하위는 hub-fallback(단일 surface, AppRouteTransition.tsx:600-620). 뷰포트 잠금 경로(`/mypage/addresses*`, `/mypage|my/store-orders/*/review` — conditional-app-shell-flags.ts:158-159)는 hubChromeHeader=null → **이중 패널 push(`exiting: prev.node`, :640)** 로 이전 화면 React 요소를 다른 부모에 다시 렌더(재마운트 가능) — 확인 필요.

### 2-4. 오류와 데이터 동시 표시
- `components/my/MyNotificationsView.tsx:817-833`: 하나의 `error` 상태를 목록 위에 표시하고, `grouped.length === 0 && !error` 가 아니면 목록도 렌더. 로드 실패 시에는 rows 를 비워(:285,294,318) 동시 표시 없음. 그러나 **읽음 처리 실패(:441,449)·삭제 실패(:475,488,597,611)** 는 rows 유지 + 같은 error 슬롯 → 오류 문구(“콘텐츠 없음”류 키 해석)와 목록이 **동시에 보임**. (/mypage/notifications, /my/notifications)
- `mypage/points/page.tsx:406` 은 loadError 시 MyStateView 만(배타) — 정상.
- `lib/mypage/use-mypage-cursor-list.ts:176-180`: 조용한 재검증 실패는 기존 목록 유지·배너 없음(의도), 비조용 실패는 캐시 없을 때만 → 동시 표시 없음.

---

## Part 3 — 네이티브/앱 근거 (파일 읽기)
- Android `android/app/build.gradle:18-19` — `versionCode 7`, `versionName "1.2.4"`. 마지막 번호 변경 `8f061db82`.
- iOS `ios/App/App.xcodeproj/project.pbxproj:698,723,746,772` — `CURRENT_PROJECT_VERSION = 7` (4곳 일치), `MARKETING_VERSION = 1.2` (:706,731,756,782). 마지막 번호 변경 `912d97214`.
- `capacitor.config.ts:46-55` — `DIBAY_LOCAL_RUNTIME` 미설정 시 `server.url = resolveCapacitorServerUrlFromEnv()` → 기본 `https://samarket.vercel.app` (lib/platform/capacitor-server-url.ts:5,21-28). `ios/App/App/capacitor.config.json:7` 도 `https://samarket.vercel.app`. Android assets 의 capacitor.config.json 은 저장소에 없음(생성물) — 확인 필요.
  → 앱은 운영 웹을 원격 로드하므로 CSS(#124)는 **웹 배포만으로 앱에 반영**.
- `public/sw.js` (178줄): `message`(:4)·`push`(:19)·`notificationclick`(:144) 만 처리. **fetch 핸들러·Cache Storage 없음** → SW 가 CSS/HTML 을 캐시하지 않음. next.config `headers()` 에서 `/sw.js` no-store(:179-182), `/api/*` no-store. Next 정적 CSS 청크는 해시 파일명.
- `npm run verify:native-version-bump`: **세션 가드 훅이 실행을 차단**("verify 로컬 실행 금지"). 스크립트(scripts/verify-native-version-bump.mjs:43-56, scripts/lib/native-release.mjs:165-168)를 정적으로 따라가면 base = merge-base(origin/main, HEAD)=HEAD → `HEAD^1`(48f443ddd), 변경 파일 = `app/globals.css`, `app/samarket-components.css` 뿐, `origin/main` 까지 범위에도 android/ios/capacitor/package.json 변경 없음 → 예상 출력:
  `[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)` (실행 결과 아님 — NOT_PROVEN)
  - 참고: 마지막 Android 번호 변경(8f061db82) 이후 `ios/App/App.xcodeproj/project.pbxproj`·`ios/App/DibayPushServiceExtension/Info.plist` 변경 이력 있음(이번 범위 밖).

---

## 요약 권고
1. CSS: **(a) 유지**. 원인(레이어 역전)은 컴파일 실측으로 확정. (b)는 unlayered 가 utilities 까지 이기는 구조적 부작용이 있음. 위험 표 "중" 화면 1회 시각 확인 필요(Production NOT_PROVEN).
2. 내정보 전환: 130/145 라우트가 300ms 스택 규칙, 3개는 440ms 일반 규칙, 3개(거래 채팅)는 의도적 제외. 헤더는 레이아웃 소유·본문과 같은 surface.
3. 범위 밖 결함(보고만): resolve-main-tier1.ts:547 `starts(p, "/mypage/section/")` 매칭 불가 → `/mypage/section/*` 기본 제목 빈 문자열; 내정보 67개 경로 기본 제목 없음; `/mypage/store-orders` loading 비대칭; MyNotificationsView 액션 오류가 목록과 같은 슬롯에 표시.


---
> 보완 2026-10-20: 이 부록의 제안은 본 설계서 §11~§16 이 대체·확정한다 (필수정보 §11 · 헤더/CTA §12 · /home §13 · 사진 §14).
