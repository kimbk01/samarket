# DIBAY 크롬 전수 감사 — 1단 헤더 · 2/3단 탭 · 하단 네비 · 통일 규격 설계 (2026-11-02, 승인 요청)

> 범위: 감사 + 개선 설계안만. **코드 변경 없음 · 커밋/배포 없음.**
> 근거 수준: 모든 결함은 **코드 PASS 수준(파일:줄)** 근거이다. 실기기·Production 화면은 이번에 보지 않았다 → 화면 영향은 전부 **NOT_PROVEN**.
> 재사용한 기존 설계: 헤더 = `docs/mypage-v2/dibay-mypage-v3-real-screen-redesign.md` §12 (구현 완료, `app/sector-header.css`), 거래 R1/R2 = `docs/audit/trade-uiux-2026-10-27-device-audit-and-unified-spec.md` §3, 하단 FAB = `docs/main-bottom-nav-fab-sector-contract.md`, 셸 = `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md`.

---

## 0. 판정

| 영역 | 정본(SSOT) 존재 | 정본 사용률 | 판정 |
|---|---|---|---|
| 1단 헤더 | **있음** — `app/sector-header.css` + `components/layout/sector-header/*` (`DetailHeader`·`SectionHeader`·`SearchHeader`) | 고객 하위 화면 대부분(RegionBar 126 경로·MyScreen 33·MySubpageHeader 13 등) | **FAIL (부분)** — 정본 밖 헤더 약 20종, 뒤로가기 구현 8종 |
| 뒤로가기 | **있음** — `components/navigation/AppBackButton.tsx` (‹ 글리프, 48×48) | 정본 바 밖에서 쓰면 40px·왼쪽 정렬로 떨어짐 | **FAIL** |
| 2/3단 탭 | **정본 2개가 서로 모순** — pill(`dibay-chrome-ssot.css`) vs 밑줄(`Sam.tabs`) | 변형 12종 | **FAIL** |
| 하단 네비 | **있음** — `components/layout/BottomNav.tsx` + `app/app-bottom-nav.css`, 노출 규칙 1함수 | 고객 1종 + 사장님 1종 | **FAIL (부분)** — 활성 오빗 갈색, 허브 본문 여백 부족, 숨김 로직 이원화 |
| 자동 숨김 | 헤더: **없음** / 탭: 배달만 / 하단: 있음(경로별) | 메커니즘 4종 | **FAIL** — 규칙 없음 |
| DIBAY 브랜드색(`--sam-primary` #0B421A) | 계약(04-DESIGN-SYSTEM) | 하단 활성 라벨·아이콘만 준수. 2단 탭은 거래만 준수 | **FAIL** |

---

## 1. 1단 헤더 감사

### 1-1. 정본 규격 (현재 코드 = §12 구현값, 변경 대상 아님)

| 항목 | 하위 화면 (제목 가운데) | 메인 허브 (제목 왼쪽) | 근거 |
|---|---|---|---|
| 높이 | 52px (+부제 56px) + safe-top | 동일 | `sector-header.css:13-14` |
| 좌우 여백 | max(4px, safe) → 아이콘 바깥선 = 화면 끝 16px | max(12px, safe) | `:22-26` |
| 격자 | 대칭 3열 `[side] 1fr [side]`, 슬롯 실측 → 제목 화면 실제 중앙 | `40px 1fr auto` | `SectorHeaderBar.tsx:37-61`, css `:110-136` |
| 뒤로 | 터치 48×48 · ‹ 24px | 40 · 24px | `:17-18, 101-102, 127-128` |
| 우측 아이콘 | 터치 48 · 24px · 간격 0 | 타일 36 · 22px · 간격 8 (터치 `::after` 48) | `:103-106, 129-131, 188-212` |
| 제목 | 17px/600/22px/-0.3px, 1줄 말줄임 | 왼쪽 정렬 | `:43-46, 384-399` |
| 상하 중앙 | grid `align-items:center` + 슬롯 flex center | 동일 | `:114, 145-150` |
| 표면 | 크림 96% + blur, 하단 1px #e5e5e5, 그림자 없음 | 동일 | `:30-32, 64-68` |

### 1-2. 결함

| ID | 결함 | 근거 | 심각도 |
|---|---|---|---|
| H-01 | `.sector-header-back` 기본값이 **40px · `justify-content:flex-start`**. 정본 바(`.sector-header-bar`) 밖에서 `AppBackButton` 을 쓰면 터치 40px·아이콘 왼쪽 쏠림 → 같은 ‹ 인데 위치가 화면마다 다름 | `sector-header.css:264-270` vs `:294-296` | P1 |
| H-02 | 정본 바 밖 `AppBackButton` 사용처 (B형): 메신저 홈 `CommunityMessengerHome.tsx:3410`, 그룹방 `GroupChatRoomClient:190`, 이벤트 `PlatformEventBoard:212`·`DetailPageClient:81`, `CategoryListSubheader:24`, `AllServicesContent:10`(aria "뒤로" 하드코딩), `StoreOrderBuyerChatTop:362`, 거래채팅 `ChatDetailView:2047`, `MeetingRoomHero:145`, `write/[categoryId]:107`, `StoresOwnerStackHeader:66` | 헤더 감사 표 B | P1 |
| H-03 | 뒤로 버튼 클래스 강제 덮어쓰기 (C형): `!h-[44px] !w-[36px]` (`StoresBrowseHeaderChrome:102`), 36px (`StoresGreenFixedHeaderChrome:90`), 36px 원형 (`OwnerMobileAdminHeader:24,107`) | — | P1 |
| H-04 | ‹ 대신 **SVG 쉐브론**(다른 모양·굵기) 사용: `StoreDetailBackRow.tsx:17-21,88-101` → 매장 상세·주문·슬러그 3화면 | — | P1 |
| H-05 | 헤더 높이 불일치: 메신저 홈 **48px**(`h-12`, :3407), 이벤트 48px, 전체서비스 48px, 거래채팅 56px(`h-14`), 메신저 방 56/60px, 사장님 스택 56px, 배달 browse 54px, 배달 홈 50px+43px | 헤더 감사 표 §3 | P1 |
| H-06 | 제목 규격 이탈: 이벤트 15px 왼쪽, 사장님 14px bold, 배달 browse 20px/800, `MessengerSplitTopBar` 17/600 손복사(토큰 미사용) + 뒤로 48 / 스페이서 40 불일치(:44,70) | — | P2 |
| H-07 | 직접 `router.back()` (fallback 없음 → 딥링크·푸시 진입 시 앱 밖/빈 화면 위험): `ProductTradeEditPageClient:134`, `write/[categoryId]:83`, `AddressSelectClient:400`, `MessengerPillarHierarchyMotionShell:43`, `OutgoingDial:68` | — | P1 (통화 파일 `OutgoingDial` 은 **통화 규정 대상 — 이번 설계에서 제외**) |
| H-08 | 우측 아이콘 크기 7종: 24/48(정본) · 22/36(허브) · 18/36·44(메신저 방) · 20/44(거래채팅·상품상세) · 20/36(사장님) · 20/40(닫기) | 헤더 감사 §4 | P2 |
| H-09 | 간격 주석·토큰 모순: `sector-header.css:28-29` 값 8px·주석 6px / `tier1-header-icon.ts:9`·`samarket-components.css:1552` "0" / `app-tier1-header.ts:5` "48px 행·40 hit·4px gap"(구 규격) | — | P3 (문서·주석) |
| H-10 | safe-top 직접 `env()` 사용(토큰 `--safe-top` 우회): `CallPeerDetailPanel:137`, `CallHeader:40` | — | P3 (**통화 파일 — 제외, 보고만**) |
| H-11 | Android 하드웨어 뒤로: 오버레이 열림 때만 리스너(`lib/ui/overlay-back-stack.ts:30-57`). 그 외는 WebView 기본 history.back → 헤더 ‹ 의 fallback 정책(`runHistoryBackWithFallback`)과 **다를 수 있음** (히스토리 0 에서 ‹ 는 fallback 이동, 하드웨어 뒤로는 앱 종료 가능). 03-NAVIGATION "browser back = gesture back" 계약과 정합 여부 | 코드 근거만, 실기기 **NOT_PROVEN** | P2 (네이티브 동작 — 실기기 재현 후 판단) |

### 1-3. 1단 헤더 통일 규격 (제안 — 정본 확장, 수치 변경 없음)

| 규칙 | 내용 |
|---|---|
| **H-R1 컴포넌트** | 고객 앱 상단 1행은 `DetailHeader`(하위) · `SectionHeader titleAlign="left"`(메인 허브) · `SearchHeader`(검색) 3종만. 화면 고유 레이아웃(아바타·주소 버튼)은 **center 슬롯에 넣는다** — 행·높이·좌우 슬롯은 정본 그대로 |
| **H-R2 뒤로** | 모든 뒤로 = `AppBackButton` (‹ 글리프, 터치 48×48, 24px, 가운데 정렬). `.sector-header-back` **기본값 자체를 48·center 로 변경**해 바 밖에서도 같은 위치(H-01 근본 수정). className 으로 크기 덮어쓰기 금지(eslint/verify 로 강제). SVG 쉐브론 금지 |
| **H-R3 뒤로 CTA 동작** | 히스토리 증명 시 `router.back()`, 아니면 화면의 `backHref`(상위 화면) 로 replace. 직접 `router.back()` 금지 → `runHistoryBackWithFallback` 경유. 700ms 연타 잠금 유지 |
| **H-R4 높이·제목** | 52px 고정(+부제 56). 제목 17/600 토큰만. 48·50·54·56·60px 헤더 폐지 (메신저 방 헤더는 아래 「Owner 결정」 참고) |
| **H-R5 우측 아이콘** | 하위 화면 24px/터치 48/간격 0, 허브 22px 타일 36/간격 8 — 2종만. 하위 화면 최대 2개, 초과 시 ⋯ 메뉴 |
| **H-R6 자동 숨김** | 1단 헤더는 **스크롤로 숨기지 않는다** (레거시 앱형: 헤더 고정, 하단만 숨김). 투명→불투명 전환(이미지 히어로 상세)은 `elevated` 1방식만 |

---

## 2. 2단·3단 탭 감사

### 2-1. 현재 정본 2개 (모순)

| | A. DIBAY pill | B. Sam 밑줄 |
|---|---|---|
| 파일 | `app/dibay-chrome-ssot.css`, `lib/ui/dibay-secondary-tabs.ts`, `DibaySecondaryTabRow.tsx` | `app/samarket-components.css:549-630`, `Sam.tabs` |
| 행/항목 높이 | 44 / 36 | 44 |
| 글자 | 비선택 13/500 → **선택 15/600 (폭 변함 → 줄 흔들림)** | 14/500 → 600 · `--scroll` 변형 **12px** |
| 선택색 | 도메인별: 거래 #0b421a · 커뮤니티/배달/채팅 #296044 · 내정보/기본 #243832 | 텍스트 `--sam-text-primary`, 밑줄 3px `--sam-primary` |
| 반경 | 18px pill (04 계약 「칩 4px」 위반) | 밑줄 4px |
| 눌림 | scale .97 + opacity .88 (비선택만) | opacity .88 |
| focus-visible | **없음** (04 계약 위반) | **없음** |

### 2-2. 결함

| ID | 결함 | 근거 | 심각도 |
|---|---|---|---|
| T-01 | 정본 2개 모순. `lib/ui/app-top-menu.ts:2-3` "최종 규격 = 밑줄" vs pill SSOT. `TradeManagementTabBar.tsx:26-55` 는 경로에 따라 **두 방식 모두 렌더** | — | P1 |
| T-02 | 탭 변형 12종 (pill·pill 손조립·상태 pill·거래 상단 탭·pill-in-밑줄·밑줄·이중 밑줄·임의 밑줄 4종·배민 미러·배달홈·배달 아이콘 탭·배달 칩·임의 pill 4종·사각 칩·iOS 세그먼트) | 탭 감사 §2 | P1 |
| T-03 | 선택색 비브랜드: #296044/#243832(도메인 accent), 검정 #181818(`delivery-components.css:1449-1477`), `bg-sam-fg`(Philife 알림 :1145), `bg-sam-ink`(모임·사장님 상품), 갈색 #362415(배민 미러) / 하드코딩 `#0B421A`(`StoresBrowseHeaderMenuTabs:224`, `delivery-baemin-mirror.ts:56,58`) | — | P1 |
| T-04 | 높이 6종: 32·36·40·44·48·52 / 글자 6종: 11·12·13→15·14·16·17 | — | P2 |
| T-05 | 표시줄 5종: 3px 전폭 · 2px inset · 2px 글자폭 슬라이드 · 3.3px 48px 고정 · **이중 표시줄**(`CommunityMessengerGroupMemberPicker:193-213`) | — | P2 |
| T-06 | 눌림 상태 없음: 밑줄 임의 4종·배민·배달홈·배달 아이콘·세그먼트·`Sam.chip`·사각 칩. pill `:active` 가 `aria-selected` 기준이라 aria 없는 `TradeManagementTabBar` 상태행은 **선택 탭도 눌림 축소** | `dibay-chrome-ssot.css:169-172` | P2 |
| T-07 | ARIA 누락: role/aria-selected 없음 `TradeManagementTabBar:46-51`, `PhilifeMeetingHubClient:150` / tablist 없음 `MemberOrderTabs:29,55` | — | P2 |
| T-08 | 선택 탭 자동 스크롤 없음(가로 스크롤 행에서 선택 탭이 화면 밖): `TradeTopicChipsRow`/`MarketCategoryFeed`, 메신저·채팅 탭, MyTabs scroll, `MemberOrderTabs`, `NotificationInboxTabBar`, `DeliveryHomeMenuBoard:212`, `OwnerProductsHubClient`, `StoresHomeCategoryStickyBelow` | — | P2 |
| T-09 | `.sam-tabs` 가 `sticky top-0` + 흰 배경 고정 → 헤더 `stickyBelow` 안(내정보)에 들어가면 도메인 색 헤더 안에 흰 띠, 시트 안에선 sticky 무효. `MarketCategoryFeed` 회색 셸 + 흰 트랙 + pill 3중 → 구분선 이중 위험 | `MyScreen.tsx:128`, `secondary-tabs-surface.ts:5` | P2 (화면 **NOT_PROVEN**) |
| T-10 | 미사용 정본 잔재 0 importer: `AppSegmentTabs`, `AppFilterBar`, `AppPill`, `home/SortTabs`, `CategoryListByType`, `HomeCategoryChip(s)` | — | P3 |

### 2-3. 탭 통일 규격 (제안)

**계층 정의 — 「모양 = 계층」 1:1**

| 계층 | 용도 | 모양 | 규격 |
|---|---|---|---|
| **2단 (섹션 전환)** | 화면 안 큰 분류 (거래/커뮤니티 상단, 메신저 채팅·친구, 알림, 내정보 판매/구매, 주문 상태) | **밑줄 탭** | 행 44px · 글자 **15px** · 비선택 500 `--sam-text-secondary` / 선택 **600 `--sam-primary`(글자+표시줄)** · 표시줄 **2px 글자폭+좌우 4px**, 200ms 슬라이드 · 선택 시 글자 크기 불변(굵기만) · 탭 2~4개 = 균등 분할, 5개+ = 가로 스크롤 + 좌우 16px |
| **3단 (필터·주제)** | 2단 아래 세부 주제·카테고리·필터 | **칩** | 높이 32px · 글자 13/500 · 비선택 `--sam-surface` + 1px `--sam-border` · 선택 **`--sam-primary` 배경 + 흰 글자 600** · 반경 = **Owner 결정 1** · 간격 8px · 좌우 16px · 가로 스크롤 |

**공통 상호작용 (2단·3단 모두)**
- 눌림: `:active` → 배경 `color-mix(--sam-primary 8%)` + scale .97 (선택 여부 무관, reduced-motion 시 scale 제거) 100ms.
- focus-visible: 2px `--sam-primary` 35% 링 (04 계약).
- ARIA: 2단 = `tablist`/`tab`/`aria-selected`, 3단 필터 = `aria-pressed`(다중) 또는 `tab`(단일) — 컴포넌트가 강제, 소비자 수동 부여 금지.
- 선택 시 `scrollIntoView({inline:'center'})` 를 컴포넌트가 수행.
- 위치: 1단 헤더 바로 아래 헤더 크롬(`stickyBelow`)에 넣고 **헤더와 함께 고정**. 본문 안 `sticky top-0` 금지(시트 안 무효 문제 제거). 배경 = 헤더 배경 상속(흰 띠 제거). 구분선은 탭 행 하단 1줄만.
- 정본 컴포넌트 2개로 축소: `DibayTabs`(2단) · `DibayChips`(3단). 나머지 12종은 이 둘로 치환하고 `app-top-menu.ts`·미사용 6파일 삭제.

**도메인 accent 처리**: 2단·3단 선택색은 **전 도메인 `--sam-primary` 하나**. 도메인 구분은 헤더 배경 틴트(`--dibay-domain-surface`)로만 유지. 배달(배민 미러)·배달홈 갈색/검정 선택색도 브랜드색으로 → 「배달 UI Frozen 사본」 규칙과 충돌 가능 → **Owner 결정 3**.

---

## 3. 하단 네비 감사

### 3-1. 정본 규격 (현재)

| 항목 | 값 | 근거 |
|---|---|---|
| 탭 | 커뮤니티 · 거래 · 배달 · 채팅 · 내정보 (DB/어드민 구성, fallback `bottom-nav-config.ts:323-336`) | |
| 높이 | 60px + safe-bottom, 항목 48px | `app-bottom-nav.css:22,130-176` |
| 아이콘 | 22px (활성 23px), stroke 2 → 2.4, 채움 전환 없음 | `:228-252` |
| 라벨 | 11px/500, 활성 700 | `:266-305` |
| 색 | 활성 `--dibay-green` #0B421A (**브랜드 준수**), 비활성 #604C4C 82%, 활성 골드 18% 배경 | `:4-7,194-197` |
| 눌림 | scale .97 + 햅틱 | `:185-187`, `BottomNav.tsx:390` |
| 오빗 | 현재 도메인 탭이 원형으로 솟음(2.625rem, 36% 돌출) | `:559-571, 709-716` |
| 노출 규칙 | `isBottomNavEligibleRoute` 1함수 + `shouldRenderMainBottomNav` 런타임 | `lib/navigation/bottom-nav-route-policy.ts:90-135` |
| 스크롤 숨김 | 아래 12px 숨김 / 위 12px·맨위·1.8s 정지 시 표시, 경로별 on | `use-bottom-nav-scroll-hide-behavior.ts:47-230` |

### 3-2. 결함

| ID | 결함 | 근거 | 심각도 |
|---|---|---|---|
| B-01 | **활성 오빗 = 갈색**. `--app-bottom-nav-orbit-bg-active: var(--delivery-dark)` → `--dibay-brown` #362415. 비활성 오빗은 초록 → 「선택하면 갈색」으로 의미 역전. 오빗 그림자도 스타벅스 초록 `rgba(0,98,65,…)` 하드코딩 | `app-bottom-nav.css:564,712,479,566-568` · `delivery-tokens.css:31` (직접 확인) | **P1** |
| B-02 | 허브 본문 하단 여백 = `60px + safe` 로 **오빗 돌출분 미포함**. 오빗이 뜨는 바로 그 허브(/philife·/market·/stores·/mypage·메신저 홈)에서 마지막 행이 오빗에 가려질 수 있음 (셸 기본은 `76px + overhang + safe` 로 다름) | `main-bottom-nav-hub-clearance.ts:6-7` vs `bottom-nav-config.ts:208` (직접 확인) · 화면 **NOT_PROVEN** | P1 |
| B-03 | 숨김 로직 이원화: 키보드 숨김 = probe(고객) vs `html[data-kb-open]` CSS(사장님) / 스크롤 숨김 hook 2개(오버플로 검사 유무 다름) / browse 전용 3번째 hook / `MarkAppShellReadyOnce` 가 활성 탭 재계산 | `ConditionalAppShell.tsx:128-133,262-291`, `owner-compact-shell.css:343-347` | P2 |
| B-04 | 스크롤 숨김 상태에서 `pointer-events:none` 만, `inert` 없음 → 숨은 탭이 포커스 순서에 남음 (키보드 숨김만 inert) | `ConditionalAppShell.tsx:459` | P2 |
| B-05 | 스크롤 숨김 적용 경로가 들쭉날쭉: Philife 피드 on, 거래 일부 on, /stores 하위 on·/stores 홈 off, /mypage off, 메신저 통화기록 on. 규칙 문서 없음 | `resolveBottomNavScrollHideEnabled :47-69` | P2 |
| B-06 | 다크모드 미대응: 바가 크림 #FFFCFC + #0B421A 고정(나머지 앱은 `--sam-primary` 다크 #4FBA6E). 상수명 `BOTTOM_NAV_DARK_BAR_HEX = "#fffcfc"` 오기 | `bottom-nav-config.ts:171`, `design-tokens.css:507` | P3 (다크모드 사용 범위 **확인 못 함**) |
| B-07 | 배지 링 `ring-white` + `ring-sam-surface` 동시 적용 → CSS 순서 의존 | `hub-badge-ui.ts:3`, `bottom-nav-config.ts:173` | P3 |
| B-08 | 사장님 하단 네비: 가운데 버튼 `aria-current` 없음, ≥768 에서 `display:none` 인데 본문 여백은 남음, 주석 z-55 ↔ 실제 1200 | `owner-compact-shell.css:42-49,323-335`, `owner-mobile-ui-tokens.ts:47` | P3 |
| B-09 | `/rider` 가 노출 규칙에서 제외되지 않음 → 라이더 화면에 고객 5탭 노출 (의도 여부 **확인 못 함**) | `bottom-nav-route-policy.ts:90-118` (직접 확인) | Owner 결정 4 |
| B-10 | 죽은 코드: `BottomNavTabDeliveryHomeHub`/`TradeHomeHub`(:431-847 렌더 안 됨), `compose{Delivery,Trade,Philife}BottomNavDisplayTabs`, `MainDesktopSideNav`, 어드민 탭 스타일 필드(`iconActiveClass` 등) 미사용, `BOTTOM_NAV_KEYBOARD_RESIZED_CLASS` 정의만 있고 미적용, 미사용 import | 하단 감사 §4 | P3 |
| B-11 | 문서 낡음: `.cursor/rules/chat-detail-bottom-nav-authority.mdc` 가 없는 함수 `suppressBottomNavForChatDetail` 인용 | — | P3 (문서) |

### 3-3. 하단 네비 통일 규격 (제안)

| 규칙 | 내용 |
|---|---|
| **B-R1 색** | 활성 = 아이콘·라벨 `--sam-primary` · 굵기 700/stroke 2.4 (현행 유지). 비활성 = `--sam-icon-default` 계열 1색. **오빗 활성 = `--sam-primary`, 비활성 = `--sam-primary` 85%**(또는 골드 링) — 갈색 제거. 그림자 = `color-mix(--sam-primary 22%)` 토큰 |
| **B-R2 눌림** | 탭 scale .97 + 햅틱(현행) · 오빗 scale .94(현행). 눌림 배경색은 골드 10%로 통일 (hover 와 동일) |
| **B-R3 여백** | 본문 하단 여백 토큰 **1개**: `--app-bottom-nav-clearance = 60px + 오빗 돌출 + safe-bottom`. 허브 clearance·셸 76px/82px 모두 이 토큰 사용 |
| **B-R4 숨김** | 키보드 숨김·스크롤 숨김 모두 단일 hook (`useBottomNavVisibility`) → 숨김 시 `inert` 공통. 사장님 네비도 같은 hook |
| **B-R5 스크롤 자동 숨김 규칙** | 「긴 목록 피드 허브(커뮤니티 피드·거래 목록·배달 목록·메신저 목록)」 = 숨김 on, 「내정보·설정·폼」 = off. 판정 함수 1개에 경로 표로 고정 — **Owner 결정 2** |
| **B-R6 배지** | 숫자 배지 = red-600 18px `99+`, 링 `--sam-surface` 1종 |

---

## 4. 구현 단계 (승인 후 · 각 단계 끝에 화면이 깨지지 않도록 묶음)

모두 **웹 변경**(`app/`·`components/`·`lib/`) — 네이티브 빌드 불필요. 통화 파일(`OutgoingDial`·`CallHeader`·`CallPeerDetailPanel`·`call*`)은 **전 단계 제외** (통화 변경 규정).

| 단계 | 내용 | 바뀌는 파일 | 영향 화면 · 깨질 수 있는 것 · 같은 단계 처리 |
|---|---|---|---|
| **S1 뒤로 통일** | H-01 `.sector-header-back` 기본 48·center / H-03 className 덮어쓰기 제거 / H-04 SVG→`AppBackButton` / H-07 직접 `router.back()` → fallback 경유(통화 제외 4곳) / verify: `AppBackButton` className 크기 덮어쓰기·`router.back(` 직접 호출 금지 | `sector-header.css`, `StoresBrowseHeaderChrome`, `StoresGreenFixedHeaderChrome`, `OwnerMobileAdminHeader`, `StoreDetailBackRow`, `ProductTradeEditPageClient`, `write/[categoryId]`, `AddressSelectClient`, `MessengerPillarHierarchyMotionShell` | 어드민 `AdminPageHeader`(187곳)도 48px 로 커짐 → 어드민 헤더 행 높이 확인 필요 · 배달 헤더(배민 미러) 좌측 정렬 변경 |
| **S2 헤더 통일** | H-02·H-05·H-06: 메신저 홈·이벤트·전체서비스·그룹방·카테고리·사장님 스택·`MessengerSplitTopBar` → `DetailHeader`/`SectionHeader`. 주석·토큰 H-09 정리 | 각 화면 + `app-tier1-header.ts`, `tier1-header-icon.ts` | 메신저 홈 높이 48→52 (목록 시작 위치 4px 이동) · 메신저 split ≥768 좌측 pane 정렬 |
| **S3 탭 통일** | `DibayTabs`·`DibayChips` 2 컴포넌트 신설(위 2-3 규격) → V1~V12 치환, `.sam-tabs` sticky 제거, 미사용 6파일·`app-top-menu.ts` 삭제 | `dibay-chrome-ssot.css`, `samarket-components.css`, `lib/ui/*`, 탭 사용 화면 ~35 | 거래 홈 탭(`TradePrimaryTabs`)은 `getPostsForHome` 단일 비행·prewarm 키와 무관(표현만) 확인 · 배달 탭은 Owner 결정 3 후 · 스켈레톤 높이(`TradePrimaryTabs:53-55` 32px)도 같은 단계에서 일치 |
| **S4 하단 네비** | B-01 오빗색·그림자 토큰 / B-02 clearance 토큰 1개 / B-03·B-04 단일 hook + inert / B-05 숨김 규칙 표 / B-07 배지 / B-08 사장님 / B-10 죽은 코드 / B-11 문서 | `app-bottom-nav.css`, `bottom-nav-config.ts`, `main-bottom-nav-hub-clearance.ts`, `use-bottom-nav-scroll-hide-behavior.ts`, `ConditionalAppShell.tsx`, `OwnerMobileBottomNav`, `BottomNav.tsx` | 하단 고정 CTA(`fixed-bottom-bar-occupancy`)·토스트·고객센터 FAB 위치가 clearance 에 의존 → 같은 토큰으로 함께 변경 · FAB 섹터 계약(`main-bottom-nav-fab-sector-contract`) verify 재실행 |

검증(각 단계 최종 HEAD 1회): `npm run typecheck:build` + 관련 vitest(`lib/ui/__tests__`, `lib/navigation`, `lib/layout`) + 변경 파일 eslint + `verify:design-system-hard-lock`·`verify:main-bottom-nav-fab-sector-contract`·`verify:routes`. 이후 Owner 기기(로그인·저장 주소·휴대폰)에서 단계별 화면 확인 — 확인 전까지 화면 판정은 NOT_PROVEN.

---

## 5. Owner 결정 필요 (규정·계약으로 정할 수 없는 것만)

| # | 결정 | 충돌 내용 | 권고 |
|---|---|---|---|
| 1 | 3단 칩 반경 | 04-DESIGN-SYSTEM 「칩 4px」 vs 현재 pill 18px·rounded-full 다수 (승인 설계 ↔ 현행 충돌) | 계약대로 **4px** (`rounded-ui-rect`) |
| 2 | 하단 네비 스크롤 자동 숨김 범위 | 현재 경로별 들쭉날쭉, 계약 없음 | 긴 피드 4허브 on · 내정보/폼 off |
| 3 | 배달 화면 탭 선택색 | 배달 UI Frozen 사본(배민 미러 갈색·검정) vs 브랜드색 통일 | 배달도 `--sam-primary` 로 통일 |
| 4 | `/rider` 하단 고객 5탭 | 의도 여부 코드로 판단 불가 | 라이더 화면 숨김 |
| 5 | 메신저 방 헤더(56/60px·아바타형) | 카톡형 방 헤더는 별도 계약(`community-messenger-mobile-room-viewport.md`) 대상 | **이번 범위 제외** (뒤로 위치만 48px 정렬 확인) |

---

## 6. 남은 위험 · 확인 못 함

- 실기기·Production 화면 미확인 → 결함의 **화면 영향 전부 NOT_PROVEN** (특히 B-02 가림, T-09 흰 띠, H-11 하드웨어 뒤로).
- 다크모드 실제 사용 범위 확인 못 함 (B-06).
- 어드민 화면은 감사 범위에 포함했으나(뒤로 B형 187곳) 어드민 테이블 레이아웃은 Admin 컴포넌트 우선 규정 → S1 영향만 확인.
- 통화 관련 헤더·뒤로 결함(H-07 `OutgoingDial`, H-10)은 통화 규정상 별도 증거·계획·승인 없이는 손대지 않음 — 보고만.
