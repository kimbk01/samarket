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
| H-06 | 제목 규격 이탈: 이벤트 15px 왼쪽, 사장님 14px bold, 배달 browse 20px/800, `MessengerSplitTopBar` 17/600 손복사(토큰 미사용). (정정 2026-11-02: split 바 뒤로는 행 밖이라 40px — 스페이서 40과 일치했음. 「48/40 불일치」는 오기) | — | P2 |
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
| T-03 | 선택색 비브랜드: #296044/#243832(도메인 accent), 검정 #181818(`delivery-components.css:1449-1477`), `bg-sam-fg`(Philife 알림 :1145), `bg-sam-ink`(모임·사장님 상품), 갈색 #362415(배민 미러) / 하드코딩 `#0B421A`(`StoresBrowseHeaderMenuTabs:224`, `delivery-browse-chrome.ts:56,58`) | — | P1 |
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
| **2단 (섹션 전환)** | 화면 안 큰 분류 (거래/커뮤니티 상단, 메신저 채팅·친구, 알림, 내정보 판매/구매, 주문 상태) — ★ **Owner 고정(2026-11-02): 이름 잘림 0 · 넘치면 항상 가로 스와이프** (메뉴가 늘어도 잘리지 않음. 4개 이하 균등 채움도 글자보다 좁아지지 않음) | **밑줄 탭** | 행 44px · 글자 **15px** · 비선택 500 `--sam-text-secondary` / 선택 **600 `--sam-primary`(글자+표시줄)** · 표시줄 **2px 글자폭+좌우 4px**, 200ms 슬라이드 · 선택 시 글자 크기 불변(굵기만) · 탭 2~4개 = 균등 분할, 5개+ = 가로 스크롤 + 좌우 16px |
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

---

# 7. 계획 수정 — 배달 계약 · 스크롤 시 남는 메뉴 계약 반영 (2026-11-02 · Owner 지시)

> Owner 지시: 「배달 부분의 헤더 규정의 계약을 파기하면 안 된다」 · 「배달 헤더·탭메뉴는 다른 계약이 있으니 확인하고, 스크롤 올렸을 때 남는 메뉴·보이는 메뉴의 계약을 확인하고 계획을 수정하라. 구현된 부분이라면 배달은 계약 확인 후 리버트·재구현」.

## 7-1. 배달 헤더·탭 계약 (승인·구현 완료 문서)

| 문서 | 지위 |
|---|---|
| `docs/audit/delivery-master-plan-2026-10-29.md` | Owner 승인 2026-10-29 · 구현 보고 `delivery-baemin-impl-report-2026-10-30.md` (실기 PASS 항목 포함) |
| `docs/audit/delivery-category-compare-design-2026-10-29.md` §2-4 (배민 실측) · §7 (동작 명세) | 위 계획서의 근거 문서 |
| `docs/audit/delivery-menu-structure-design-2026-10-29.md` §1-3 | 같음 |

계약 내용 (원문 요약 · 인용 위치):

| 요소 | 계약 | 근거 |
|---|---|---|
| 상단바 (← 업종명 + 검색·주문·장바구니·알림) | **항상 고정**, 방향에 따라 숨기거나 보이는 동작 없음 | master-plan §WP3 「상단」·§WP4 「스크롤」, compare §7 「상단바·2차 탭」 |
| 주소줄 | 스크롤 위치 0~주소줄 높이 구간에서 상단바 아래로 밀려 **접힘**(스크롤 비례, 흔들림 0). **위로 스크롤해도 다시 나오지 않음** — 최상단에 도달해야 보임 | compare §2-4 「위로 스크롤할 때」, §7 「주소줄」 |
| 2단 업종 텍스트 탭 + 밑줄 | **항상 고정**. 선택 = `--sam-fg` 굵게 + 2px 그린 밑줄, 밑줄 `translateX` 180ms, 선택 탭 가운데 자동 스크롤, `router.replace`, 탭별 스크롤 기억 | compare §7 |
| 원형 칩 | 콘텐츠와 함께 스크롤되어 사라짐 (위로 스크롤해도 안 나옴) | compare §2-4, menu-structure §1-3 |
| 정렬 칩 | `position: sticky` 로 **2단 탭 아래 고정** | compare §7 |
| 하단 내비 | 배달 홈·업종 목록에서 **항상 고정** (스크롤 숨김 해제). 본문 하단 여백 = 기존 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 유지 | compare §7, master-plan §WP3 |
| 매장 헤더 | 배너 위 투명 + 흰 아이콘 → 스크롤 후 흰 배경 + 「← 매장명」 왼쪽 정렬, 공유·검색·장바구니 | master-plan §WP6 |
| 뒤로 | 배달 전 단계 왼쪽→오른쪽 140ms, 1단 페이지는 탭을 바꿨어도 한 번에 홈 | master-plan §WP4 |

코드 대조 (2026-11-02, 코드 근거만 · 실기 NOT_PROVEN):
- 하단 내비 고정: `lib/layout/use-bottom-nav-scroll-hide-behavior.ts` 가 `/stores`·`/stores/browse*` 를 숨김 제외 — **계약과 일치**.
- 주소줄 접힘·탭 고정: `use-stores-home-header-collapsed.ts`(홈), `StoresBrowseHeaderScrollCollapse` 센티널(browse) — 구현 보고 `s2-04` PASS.
- 확인 필요 1건 (고치지 않음 · 보고만): browse 2단 탭 선택 글자색이 코드상 `#362415`(배민 미러 `delivery-browse-chrome.ts:40-43`)로, compare §7 원문 「`--sam-fg` 굵게」와 표기가 다르다. 이후 승인 문서에서 바뀐 것인지 **확인 못 함**.

## 7-2. 스크롤할 때 남는 메뉴 · 다시 보이는 메뉴 — 도메인별 계약표

| 화면 | 1단 헤더 | 2/3단 탭 | 하단 내비 | 근거 |
|---|---|---|---|---|
| **배달** 홈·업종 목록 | 고정 | 2단 탭 고정 · 정렬 칩 탭 아래 고정 · 주소줄/원형 칩은 위치로 접힘(위로 스크롤해도 안 나옴) | **고정** | 7-1 |
| 배달 매장 상세·하위 | 투명→흰 헤더(위치 기준) | 매장 메뉴 탭(`CategoryStickyTabs`) 고정 | 숨김(경로 규칙) | master-plan §WP6, `bottom-nav-route-policy.ts` |
| 메인 하단 내비 일반 (커뮤니티 피드·거래 플로팅면·메신저 통화 기록 등) | 고정 (숨김 동작 없음) | 헤더 크롬 안 → 함께 고정 | 아래로 스크롤 시 숨김 · **위로 스크롤 즉시 표시** · 맨 위 즉시 표시 · 멈춘 뒤 1.8초 표시 | `docs/main-bottom-nav-fab-sector-contract.md` §5 |
| 내정보 홈 | 고정 | — | **고정** (스크롤 숨김 해제 — 흔들림) | `use-bottom-nav-scroll-hide-behavior.ts` 주석, mypage v3 spec |
| 내정보 L2 이하 | 고정 | — | 숨김 | mypage v3 final spec §헤더 |
| 그 밖 | **계약 없음** | 계약 없음 | 경로별 코드만 | → Owner 결정 2 유지 |

## 7-3. 계획에서 빼는 것 (배달 = 별도 계약 우선)

배달 범위 = `/stores/**` 소비자 화면(홈·browse·매장·장바구니·주문), 매장 주문 채팅(`StoreOrderBuyerChatTop`, `ChatDetailView` 의 `isStoreOrderChat`), 매장 사장님 헤더(`OwnerMobileAdminHeader`·`StoresOwnerStackHeader`).

| 기존 항목 | 수정 |
|---|---|
| H-03 (배달 헤더 뒤로 크기 덮어쓰기 제거) | **철회** — 배달 계약 헤더. 그대로 둔다 |
| H-04 (매장 헤더 SVG 화살표 → ‹) | **철회** — 매장 헤더 계약(`StoreDetailBackRow` 아이콘 슬롯) 유지 |
| H-05·H-06 중 배달 헤더(54px browse·50px 홈·사장님 56px) | **철회** |
| H-R6 자동 숨김 | 배달은 7-1 계약 그대로(위치 기준 접힘, 방향 동작 없음). 비배달은 「1단 헤더 숨김 없음」 유지 |
| T-03 중 배달 선택색 (갈색·검정) · V6~V9 배달 탭 | **철회** — 배달 탭 계약(compare §7) 유지. S3 탭 통일 대상에서 제외 |
| Owner 결정 3 (배달 탭 선택색) | **삭제** — 배달 계약으로 확정 |
| B-05 / Owner 결정 2 (하단 내비 숨김 범위) | 배달 홈·browse **고정은 계약** — 변경 대상 아님. 비배달 화면만 결정 대상. (정정 2026-11-02: §3-2 B-05 의 「메신저 통화 기록만 on」은 오기 — 메신저 허브·거래/배달 채팅 목록도 이미 on) |
| B-R3 하단 여백 토큰 | 배달 홈·browse 의 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 는 계약값 — S4 에서 배달 경로는 값 변경 금지(토큰 이름 교체만 허용, 계산값 동일) |
| B-01 오빗 활성색 | 오빗 색이 `--delivery-primary`·`--delivery-dark` 토큰을 씀. 배달 토큰 자체는 바꾸지 않고, 하단 내비 전용 토큰을 새로 두는 방식만 허용 → **Owner 결정 6 (신규)**: 오빗 활성색을 브랜드 그린으로 바꿀지 |

## 7-4. S1 반영분 점검 결과 (리버트 필요 여부)

- 반영 커밋 `f424351f2` 변경 파일 13개 중 **배달 파일 0개** (`git diff be5d808aa f424351f2 --name-only` 에 stores·owner·StoreOrder 없음).
- `app/sector-header.css` 는 opt-in 규칙(`.sector-header-back--touch`) 추가만. 기본 `.sector-header-back`(40px·왼쪽) **변경 없음** → 배달 헤더 뒤로가기 크기·위치 그대로.
- `ChatDetailView` 는 매장 주문 채팅(`isStoreOrderChat`)일 때 클래스 미적용.
- 계약 테스트 `lib/layout/__tests__/sector-header-back-unify.test.ts` 가 배달 6개 파일에 opt-in 클래스가 없음을 고정.
- 결론: **배달 리버트 대상 없음**. (작업 중 배달 파일을 바꿨던 중간 상태는 커밋 전 되돌렸고 main 에 들어가지 않았다.)
- 메신저 pillar(`MessengerPillarHierarchyMotionShell`) 직접 `router.back()` 은 메신저 내비 hard-lock(「ONE ACTION」) 때문에 S1 에서 제외했다.

## 7-5. 수정된 단계

| 단계 | 상태 | 범위 (배달 제외) |
|---|---|---|
| S1 뒤로 | **반영 `f424351f2`** · 실기 NOT_PROVEN | 비배달 자체 헤더 9곳 + 직접 `router.back()` 3곳 |
| S2 헤더 | **반영** · 실기 NOT_PROVEN | 실측 결함: `/events`·`/services` 에 헤더 2줄(‹ 2개)·`/events` 1단 제목 「내용을 불러올 수 없습니다.」 (Production `8f7d1a5ae` · 내장 브라우저 375px · 2026-11-02). 수정: 이벤트 2·전체서비스·그룹방·카테고리(`/features/*`) 자체 헤더 제거 → 전역 1단에 제목·뒤로 등록, 커뮤니티 헤더 메신저 → `DetailHeader`, split 바 뒤로·제목 토큰화, 헤더 주석 모순(H-09) 정정. 배달·사장님·통화·메신저 방 제외 |
| S3 탭 | **반영** · Owner 결정 1 = 칩 4px (2026-11-02) · 실기 NOT_PROVEN | 방식: 행에 `data-dibay-tab-tier` 가 있을 때만 새 규격(opt-in) → 표시 없는 배달·사장님 행은 알약 그대로. 2단 밑줄(`DibaySecondaryTabRow` 기본·커뮤니티 주제·내정보 거래 허브·알림함·`Sam.tabs` 사용 화면·모임 탭) / 3단 칩 4px(거래 주제·거래 상태·신고·고객센터 필터). 선택 탭 자동 스크롤(공용 행·`MyTabs`), 포커스 링, 눌림, ARIA(거래 상태·주문 탭·모임). 이중 밑줄(메신저 멤버 선택) 제거, 죽은 탭 파일 7개 삭제. **제외**: 배달 탭 전부, 사장님 탭(알림함·종·상품), 바텀시트 안 탭(팝업 SSOT T3 계약 — 거래 이력 시트·친구 요청 시트), 쿠폰·상품권 허브 탭(`CustomerCommerceHub*` — 배달 주문 허브와 같은 경로 계열, 확인 못 함), `.sam-tabs` sticky·흰 바탕(본문 안 탭 고정이 풀리는 회귀 위험 — 별도 단계) |
| S4 하단 | **반영** · Owner 결정 2·6 = 권고대로 (2026-11-02) · 실기 NOT_PROVEN | 결정 6: 원형 탭 선택 = 하단 내비 브랜드 그린(미선택 85%·그림자 그린) — 배달 토큰 미사용, 「선택하면 갈색」 결함 제거. 결정 2: 숨김 규칙표를 `resolveBottomNavScrollHideEnabled` 한 곳에 고정 — 기존 동작이 권고와 일치(커뮤니티 피드·거래 목록·메신저 목록 on / 내정보·배달 홈·업종 off), 동작 변경 없음. 숨긴 탭 `inert`(포커스·누름 차단). 비배달 허브 본문 여백에 원형 탭 높이 추가(커뮤니티·거래 목록·내정보 홈·메신저 목록), 배달 허브 여백은 계약값 그대로. 배지 링 색 1개. 렌더 안 되던 허브 탭 컴포넌트 2개·미사용 import·상수 삭제. 낡은 규칙 문서 2개 정정. **제외**: 사장님 하단 내비(B-08), 다크 모드(B-06, 사용 범위 확인 못 함), `/rider` 탭 노출(Owner 결정 4 미정), 섹터별 하단 탭 조립 함수(`compose*BottomNavDisplayTabs` — 테스트만 쓰는 죽은 함수, 배달 레이아웃 파일 포함이라 보류), 숨김 hook 단일화(B-03, 고객용은 이미 1개·사장님용은 배달 범위) |

---

# 8. 진행 원장 (단일 정의 · 2026-11-02 · 이 표만 보고 진행한다)

> 이 절이 이 감사의 **유일한 진행 상태표**다. 위 §0~§7 의 상태 문구와 다르면 이 표가 맞다.
> 상태: **완료(코드)** = 로컬 검증 PASS + main 반영(운영·실기 확인 전) · **남음** = 이 계획 범위 안, 아직 안 함 · **제외** = 별도 계약 영역이라 이 계획에서 손대지 않음 · **결정 필요** = Owner 결정 없이는 진행 불가.
> 운영·실기 확인은 항목별로 아직 0건 → 전 항목 실화면 NOT_PROVEN.

## 8-1. 항목별 상태

| ID | 내용 | 상태 | 근거 (main SHA) |
|---|---|---|---|
| H-01·H-02 | 자체 헤더 뒤로 48×48·‹ 16px 선 (비배달 9곳) | 완료(코드) | `f424351f2` |
| H-03·H-04·H-05(배달) | 배달 헤더 뒤로·화살표·높이 | 제외 | 배달 헤더 계약 (§7-1) |
| H-05·H-06(비배달) | 이벤트·전체서비스·그룹방·카테고리 헤더 2줄 → 전역 1단 1줄, 메신저 스택 `DetailHeader`, split 바 토큰 | 완료(코드) | `88e4ac9da` |
| H-07 | 직접 `router.back()` → 폴백 (상품 수정·글쓰기·주소) | 완료(코드) | `f424351f2` |
| H-07(메신저 pillar) | 메신저 목록 전환 뒤로 | 제외 | 메신저 내비 hard-lock 「ONE ACTION」 |
| H-07·H-10(통화) | 통화 화면 뒤로·safe-top | 제외 | 통화 변경 규정 |
| H-08 | 우측 아이콘 크기 7종 | 해당 없음 | 남은 대상이던 `ProductDetailHeaderToolbar` 는 미사용 파일로 팝업 정리(`ae2fd84b2`)에서 삭제됨 — 상품 상세는 공통 헤더 사용. 나머지(메신저 방·사장님)는 제외 |
| H-09 | 헤더 간격 주석 모순 | 완료(코드) | `88e4ac9da` |
| H-11 | Android 하드웨어 뒤로 = ‹ 동작 일치 여부 | **제외 (수정 금지)** | 정해진 계약: `docs/customer-platform/03-NAVIGATION.md` 「browser back = gesture back」 · 안드로이드 뒤로 리스너 1개(`lib/ui/overlay-back-stack.ts`, 계약 테스트 `overlay-back-stack.test.ts`·`dibay-overlay-contract.test.ts`). 고치면 전체 뒤로 흐름이 깨짐 — Owner 2026-11-02 「계약 있음, 수정 금지」 |
| T-01·T-02·T-03(비배달) | 2단 밑줄·3단 칩 4px 정본, 선택색 브랜드 그린 | 완료(코드) | `0ca1179ae` |
| T-01(거래 상단 탭) | 거래 상단 2단 탭(판매·둘러보기·지역·카테고리)이 여전히 알약형(14px·옅은 그린 바탕) | **운영 PASS** (Production `5d02aff17`, 2026-11-03 00:0x PHT, 375px: 탭 4개 공용 2단 클래스·15px·잘림 0·선택 「둘러보기」 그린 글자+밑줄·바탕 없음) · Owner 「S3 밑줄형」 | 운영 확인 FAIL(알약형 14px·그린 16% 바탕) → 승인 설계 충돌(시안 v2 ↔ S3) Owner 결정 「S3 밑줄형」 → `TradePrimaryTabs` 탭 4개를 공용 2단 탭 클래스로 교체, 로딩 자리표시도 밑줄형. 시험 페이지 375px: 탭 4개 15px·잘림 0·선택 「둘러보기」 그린 글자+밑줄·탭 칸 260px 한 줄(더 좁으면 탭 칸만 스와이프). S3 보고의 「거래 상단 탭 적용」은 틀린 보고였음 |
| T-02·T-03(배달·사장님) | 배달 탭·사장님 탭 | 제외 | 배달 탭 계약 (§7-1) |
| ★ 2단 스와이프 | 2단 탭 이름 잘림 0·넘치면 가로 스와이프 (Owner 고정) | 완료(코드) | `08e42167a` |
| T-04~T-08 | 높이·글자·표시줄·눌림·ARIA·선택 탭 자동 스크롤 (비배달) | 완료(코드) | `0ca1179ae` + 자동 스크롤 누락 4곳(주문 탭·알림함·내정보 거래 허브·모임 탭) 이 커밋. 주문 탭 글자 칸 말줄임(`truncate`)도 Owner 고정 「2단 이름 잘림 0」에 맞춰 해제 |
| T-09 | 헤더 크롬 안 탭 줄의 흰 띠·쓸모없는 상단 고정 | **운영 PASS** (Production `5d02aff17`, `/mypage/products`: 탭 줄 배경 투명·static, 헤더 rgb(243,242,235) 그대로) | 운영 실측(`28d47d618`, `/mypage/products`): 헤더 rgb(243,242,235) 아래 탭 줄 rgb(255,255,255)·sticky → 헤더 안(`[data-app-sticky-header]`·`.sector-header-shell`) 탭 줄만 고정 해제·배경 투명. 본문 안 탭 줄 sticky 는 유지(회귀 방지). 이 커밋 |
| T-10 | 죽은 탭 파일 7개 | 완료(코드) | `0ca1179ae` |
| 시트 안 탭 | 거래 이력·친구 요청 시트 탭 | 제외 | 팝업 SSOT T3 규격 |
| 쿠폰·상품권 허브 탭 | `CustomerCommerceHubPrimaryTabs` | 제외 | 코드 확인: 이 탭은 `/orders`·`/orders/activity`(배달 주문 화면)에서만 나옴 (`AppStickyHeader` — `/mypage/*` 에서는 안 나옴) → 배달 범위 |
| B-01 | 원형 탭 선택 = 브랜드 그린 (결정 6) | 완료(코드) | `28d47d618` |
| B-02 | 비배달 허브 본문 여백 + 원형 탭 높이 | 완료(코드) | `28d47d618` |
| B-03 | 숨김 hook 단일화 | 완료(코드·변경 없음) | 고객용 hook 은 이미 1개 / 사장님용은 제외 |
| B-04 | 숨긴 하단 탭 inert | 완료(코드) | `28d47d618` |
| B-05 | 스크롤 숨김 규칙표 (결정 2) | 완료(코드) | `28d47d618` (동작 변경 없음) |
| B-06 | 다크 모드 하단 내비 | 해당 없음 | Owner 2026-11-02: 다크 모드는 없는 기능 |
| B-07 | 배지 링 색 1개 | 완료(코드) | `28d47d618` |
| B-08 | 사장님 하단 내비 | 제외 | 사장님(배달 사업자) 범위 |
| B-09 | `/rider` 고객 5탭 노출 | 해당 없음 | Owner 2026-11-02: 라이더는 없는 기능 |
| B-10 | 죽은 코드: 허브 탭 컴포넌트 2개 | 완료(코드) | `28d47d618` |
| B-10 | 죽은 코드: `compose*BottomNavDisplayTabs` | 완료(코드) — 거래·커뮤니티 2개만 | `e1758b66d` 에서 3개 삭제했으나, 배달 파일(`delivery-bottom-nav-layout.ts`)은 「배달 범위라 보류」라고 한 것을 번복한 것이라 Owner 「되돌리기」(2026-11-02)로 배달 파일·관련 테스트 2개를 원래대로 복원. 거래·커뮤니티 쪽 삭제만 유지 |
| B-11 | 낡은 규칙 문서 | 완료(코드) | `28d47d618` |

## 8-2. 다음 순서 (이 순서로만 진행 · 단계 끝에 1회 보고)

| 순서 | 할 일 | 완료 조건 |
|---|---|---|
| 1 | **운영 화면 확인** — Production SHA 확인 후 `/events`·`/services`(헤더 1줄), 2단 탭 스와이프(긴 이름), 원형 탭 색, 목록 끝 여백. 조건(로그인 여부·주소·화면 폭·PHT 시각) 표기 | 항목별 PASS/FAIL + 캡처. Owner 휴대폰 확인은 별도 NOT_PROVEN 으로 남김 |
| 2 | 1에서 FAIL 이 나오면 그 항목만 수정 | 같은 확인 재실행 PASS |
| 3 | 「남음」 3건 순서대로: T-09 → H-08(상품 상세) → B-10(compose 함수) | 각 항목 코드 PASS + main 반영 |
| 4 | 「결정 필요」 4건은 Owner 답을 받은 뒤에만: B-09 `/rider` · B-06 다크 모드 · 쿠폰·상품권 허브 탭 분류 · H-11(실기 로그 확보 후) | Owner 결정 기록 |
| — | 「제외」 항목은 이 계획에서 하지 않는다 (배달·사장님·통화·메신저 방·메신저 pillar·시트 안 탭) | — |

## 8-3. 순서 1 결과 — 운영 화면 확인 (2026-11-02 23:0x PHT)

조건: Production = **`28d47d618`** (Vercel 운영 배포 READY, S1~S4 포함) · 데스크톱 앱 내장 브라우저 · 화면 폭 375px 흉내 · 로그인 쿠키 있음(어느 계정인지 확인 못 함 — Owner 계정 판정 아님) · 저장 주소 Pasay(거래 화면 주소 기준).
**Owner 휴대폰 화면 확인은 아님 → 휴대폰 PASS 는 NOT_PROVEN 그대로.**

| 항목 | 화면 | 판정 | 증거 (실측값) |
|---|---|---|---|
| 헤더 1줄 | `/events` | PASS | 뒤로 버튼 1개, 1단 제목 「이벤트」, 페이지 자체 헤더 0개 (이전 `8f7d1a5ae`: 헤더 2줄·「내용을 불러올 수 없습니다.」) |
| 헤더 1줄 | `/services` | PASS | 뒤로 버튼 1개, 제목 「전체 서비스」 |
| 2단 잘림 0·스와이프 | `/philife` 주제 줄 | PASS | 탭 9개 · 잘린 탭 0 · 줄 폭 267 / 내용 654px · overflow-x auto · 끌기로 170px 이동 · 글자 15px |
| 2단 규격 | `/community-messenger` 탭 | PASS | 탭 4개 15px · 잘림 0 · 선택 「대화」 글자 rgb(11,66,26) + 밑줄 scaleX 1, 나머지 밑줄 0 |
| 2단 규격 | `/mypage/products` 탭 | PASS | 탭 5개 15px · 잘림 0 · 선택 「전체」 그린 글자 + 밑줄 · 모서리 0 |
| 2단 규격 | `/market` 거래 상단 탭 | **FAIL** | 알약형 `rounded-full` · 14px · 선택 바탕 그린 16% — S3 규격 미적용 (위 T-01 거래 상단 탭) |
| 원형 탭 색 | `/philife`·`/market`·`/community-messenger` | PASS | 선택 원형 탭 배경 rgb(11,66,26) = `#0B421A` (커뮤니티·거래·채팅 3곳) |
| 목록 끝 여백 | `/philife` 맨 아래 | PASS | 본문 하단 여백 75.12px(탭 60 + 원형 15.12) · 마지막 글 아래 629px < 원형 탭 위 744px · 「모든 글을 불러왔어요」 가림 없음 |
| 스크롤 숨김 | `/philife` 아래로 스크롤 | PASS | 하단 내비 숨김 클래스·transform 적용, 위로 스크롤 시 `--scroll-visible` 로 복귀 |

보고만 (범위 밖 데이터): 커뮤니티 주제 이름 「필리핀생할」 — 오타로 보이는 운영 데이터(어드민 등록값), 이번 작업에서 수정하지 않음.

## 8-4. 순서 3 결과 (2026-11-02)

| 항목 | 결과 |
|---|---|
| T-09 | 완료(코드) — 헤더 안 탭 줄 흰 띠 제거·고정 해제. 운영 재확인 대기 |
| H-08 | 해당 없음 — 대상 파일이 이미 삭제됨(`ae2fd84b2`) |
| B-10 | 완료(코드) — 죽은 조립 함수 3개 정리 |

검증: 관련 테스트 514개 파일 중 실패 2(기존 내정보 캐시 테스트, 이번 변경 무관) · 타입 검사 2종 오류 0 · 디자인 시스템·하단 FAB 계약 검사 PASS.
남은 순서: **없음** — 「결정 필요」 0건. 쿠폰·상품권 허브 탭 = 배달 주문 화면 전용이라 제외, H-11 = 계약 영역이라 제외(수정 금지), 다크 모드·라이더 = 없는 기능(해당 없음). 운영 재확인(T-09·거래 상단 탭) PASS (2026-11-03). 자동 스크롤 누락 4곳 완료(코드).

## 8-5. 마무리 (2026-11-03 00:xx PHT)

| 항목 | 결과 |
|---|---|
| 운영 재확인 | 거래 상단 탭 PASS · 내정보 탭 흰 띠 PASS (Production `5d02aff17`, 내장 브라우저 375px, 로그인 쿠키 있음 — 계정 확인 못 함) |
| T-08 누락 4곳 | 완료(코드) — 주문 탭·알림함·내정보 거래 허브·모임 탭 선택 탭 자동 스크롤, 주문 탭 말줄임 해제 |
| 계획 내 남은 항목 | **없음** |
| 남은 확인 | Owner 휴대폰 화면 확인 NOT_PROVEN · T-08 4곳은 운영 배포 후 화면 확인 전 |
| 기존 결함 (보고만, 이번 변경 무관) | 메신저 이미지 자동 저장 테스트 15건 실패 · 내정보 캐시 테스트 2건 실패 — 변경 없는 main 에서도 동일 |

---

# 9. 재감사 — 설계 대비 구현 · 완료 분 재검사 (2026-11-03 · 근거: `origin/main` 코드 검색 · 커밋 · 운영 실측)

## 9-1. 설계 규칙별 구현 여부

| 규칙 (§1-3·§2-3·§3-3) | 구현 | 근거 / 미적용 내용 |
|---|---|---|
| H-R1 상단 1행 정본 3종 | **부분** | 이벤트·전체서비스·그룹방·카테고리·메신저 스택 = 정본(S2). 남음: 거래 채팅 헤더 56px(`ChatDetailView.tsx:2046` `MESSENGER_CHAT_HEADER_SECTOR_HEIGHT_CLASS`) — 설계 H-05 표에 있었으나 S2 대상 목록에서 빠짐(**누락**) |
| H-R2 뒤로 = `AppBackButton`, 크기 덮어쓰기·SVG 금지 | **부분** | 비배달 자체 헤더 9곳 opt-in(S1). 설계는 「기본값 변경」이었으나 배달 계약 지시로 opt-in 으로 바꿈(**설계와 다른 구현**). 관리자 「← 목록」 텍스트 링크 5곳 미적용 |
| H-R3 직접 `router.back()` 금지 | **부분** | 3곳 교체(S1). 남음: 관리자 3곳(`OpsDocumentForm:303`·`AdminOrderDetailModal:56`·`AdminMemberControlCenter:127`) **미적용**. 통화(`OutgoingDial:68`)·메신저 pillar·로그인(`NativeOAuthLaunchClient:267`)은 계약 영역 제외 |
| H-R4 높이 52px·제목 17/600 | **부분** | 남음: 거래 채팅 56px (위 H-R1 과 같은 항목) |
| H-R5 우측 아이콘 2종(24/48·22/36) | **미적용** | 거래 채팅 우측 20px/44px(`ChatDetailView.tsx:2130-2133`). 상품 상세 대상은 삭제됨(`ae2fd84b2`) |
| H-R6 1단 헤더 스크롤 숨김 없음 | 해당 없음(현행 그대로) | 변경 불필요 |
| 2단 = 밑줄 15px·선택 그린·잘림 0·스와이프 | **완료** | 운영 PASS: 커뮤니티·메신저·내정보·거래 상단 탭 |
| 2단 밑줄 「200ms 슬라이드」 | **설계와 다름** | 탭마다 밑줄이 나타나는 방식(scaleX)으로 구현 — 한 밑줄이 옆으로 미끄러지는 동작 아님 |
| 3단 = 칩 32px·4px·선택 그린 바탕 | **완료(코드)** | 거래 주제·거래 상태·신고·고객센터 필터. 운영 화면 확인 전 |
| 정본 컴포넌트 2개(`DibayTabs`·`DibayChips`) | **설계와 다름** | 만들지 않음 — 기존 줄에 `data-dibay-tab-tier` 표시 방식 |
| ARIA 를 컴포넌트가 강제 | **설계와 다름** | 각 화면이 직접 넣는 방식 그대로 (누락 3곳만 보강) |
| 본문 안 탭 줄 `sticky top-0` 금지 | **부분(의도적)** | 헤더 안 탭 줄만 해제(T-09, 운영 PASS). 본문 탭 줄 sticky 는 회귀 방지로 유지 |
| 선택 탭 자동 스크롤 | **완료(코드)** | 공용 줄·`MyTabs`·주문·알림함·거래 허브·모임 |
| 포커스 링·눌림 | **완료(코드)** | 표시 있는 줄·`sam-tab--section` |
| B-R1 원형 탭 브랜드 그린 | **완료** | 운영 PASS rgb(11,66,26) |
| B-R2 하단 탭 눌림 배경 골드 10% | **미적용** | `app/app-bottom-nav.css:185` 눌림 = scale 0.97 만 |
| B-R3 여백 토큰 1개 | **부분** | 비배달 허브 여백(원형 탭 높이 포함)·배달 허브 여백 2개 + 셸 상수 76px/82px(`bottom-nav-config.ts:211-217`) 그대로 — 1개로 합치지 않음 |
| B-R4 숨김 hook 1개·inert | **부분** | inert 완료. 고객용 hook 은 원래 1개, 사장님용은 제외 |
| B-R5 숨김 규칙표 | **완료(코드)** | `resolveBottomNavScrollHideEnabled` 주석 표, 동작 변경 없음 |
| B-R6 배지 링 1개 | **완료(코드)** | 고객 하단 탭만 (사장님 제외) |

## 9-2. 완료 분 재검사

| 구분 | 내용 | 근거 | 영향 |
|---|---|---|---|
| 중복 | 2단 밑줄 규칙이 두 군데 — `.dibay-secondary-tab` section(`dibay-chrome-ssot.css:265`) 와 `.sam-tab--section`(`samarket-components.css:673`) | 코드 검색 | 한쪽만 고치면 모양이 다시 갈라짐 |
| 중복 | 선택 탭 자동 스크롤이 커뮤니티 주제 줄에서 두 번 — 공용 줄 훅 + `CommunityFeed` 자체 스크롤 로직 | `CommunityFeed.tsx` 기존 로직 + `DibaySecondaryTabRow` 훅 | 같은 위치로 두 번 스크롤(실기 흔들림 NOT_PROVEN) |
| 누락 | `lib/ui/mypage-oval-tabs.ts` 사용처 0 — T-10 죽은 파일 정리에서 빠짐 | `git grep` 사용처 0 | 없음(죽은 코드) |
| 누락 | 거래 채팅 헤더(56px·우측 20px) — H-05·H-R5 대상인데 단계 배정 안 됨 | 9-1 | 화면 규격 불일치 남음 |
| 누락 | 관리자 직접 `router.back()` 3곳 | 9-1 | 기록 없이 들어오면 빈 화면·앱 밖 이탈 가능(코드상) |
| 오류 위험 | S1 뒤로 위치를 화면마다 손으로 계산한 여백(`-ml-1`·`-ml-1.5`·`-ml-3`·`-ml-[18px]`) 9곳 | S1 커밋 | 그 화면 좌우 여백이 바뀌면 ‹ 위치가 다시 어긋남 |
| 오류 위험 | `:has()` 사용(4개 이하 균등 채움·원형 탭 높이 변수) | `dibay-chrome-ssot.css`·`app-bottom-nav.css` | 오래된 안드로이드 WebView 에서 미동작 시: 균등 채움 안 됨(잘림은 없음)·원형 탭 높이 여백 0 |
| 병목 | 자동 스크롤 훅이 탭 줄이 다시 그려질 때마다 선택 탭을 찾음(querySelector 1회) | `use-scroll-selected-tab-into-view.ts` | 측정 안 함 — NOT_PROVEN (계산량은 탭 몇 개) |
| 병목 | 카테고리 목록 제목 등록이 번역 함수(`t`)를 의존값으로 가짐 — 언어 공급자가 다시 그려질 때마다 등록 해제·재등록(헤더 2회 갱신) | `CategoryListLayout.tsx` · `AppLanguageProvider.tsx:217`(t 매번 새로 생성) | 측정 안 함 — NOT_PROVEN. 등록값 비교로 무한 반복은 없음 |
| 누수 | 이벤트 리스너·타이머 추가 없음. 자동 스크롤 훅이 마지막 선택 탭 요소를 기억 — 탭 줄이 사라져도 다음 선택 전까지 그 요소 1개를 붙잡음 | 코드 | 무시할 수준 |
| 배달·통화·사장님 | 제 커밋 전체 기준 해당 파일 **변경 0** (배달 레이아웃 파일은 `626e72bcf` 로 원래대로) | `git diff 77f965a79 origin/main` | 없음 |

## 9-3. 미적용 · 남은 항목 (계획 범위 안 · 설계에 있었던 것만)

| # | 항목 | 설계 근거 |
|---|---|---|
| 1 | 거래 채팅 헤더 52px·우측 아이콘 규격 | H-05·H-R4·H-R5 |
| 2 | 관리자 직접 `router.back()` 3곳 → 기록 없을 때 돌아갈 곳 지정 | H-07·H-R3 |
| 3 | 하단 탭 눌림 배경 골드 10% | B-R2 |
| 4 | 여백 토큰 1개로 합치기 (셸 76px/82px 포함) | B-R3 |
| 5 | 2단 밑줄 규칙 중복 1개로 합치기 · 커뮤니티 이중 자동 스크롤 정리 | 9-2 중복 |
| 6 | 죽은 파일 `mypage-oval-tabs.ts` 삭제 | T-10 누락 |

설계와 다르게 구현한 3건(뒤로 opt-in·밑줄 슬라이드·정본 컴포넌트 미신설)은 동작 결과가 설계 목표(크기·색·잘림 0)와 같아 되돌리지 않는다.
제외 유지: 배달·사장님·통화·메신저 방·메신저 pillar·로그인·시트 안 탭·하드웨어 뒤로·다크 모드·라이더.

## 9-4. 남은 6건 처리 결과 (2026-11-03)

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 거래 채팅 헤더 52px·우측 아이콘 | **제외 — §9 감사 오류 정정** | 이 헤더는 메신저 방과 같은 채팅방 헤더 상수(`MESSENGER_CHAT_HEADER_SECTOR_HEIGHT_CLASS` 56px, 아바타+2~3줄)를 씀 → §5 결정 5 「메신저 방 헤더 범위 제외」와 같은 계열. 「누락」으로 올린 것이 오류 |
| 2 | 관리자 직접 `router.back()` | 1곳 수정 · 2곳 **오탐 정정** | `OpsDocumentForm` 취소 → 기록 없으면 목록/문서로. `AdminOrderDetailModal`·`AdminMemberControlCenter` 는 이미 「기록 있을 때만 뒤로·없으면 목록」 처리 — 문자열만 보고 올린 감사 오류 |
| 3 | 하단 탭 눌림 배경 | 완료(코드) | 미선택 탭 눌림 = 골드 10%(hover 와 같음). 배달·사장님 셸(`--delivery`) 제외 |
| 4 | 여백 상수 단일화 | 완료(코드) · 값 변화 없음 | 토큰 `--app-bottom-nav-clearance` 1개 → 비배달 허브·메신저 목록·셸(+16/+22px) 상수 모두 이 토큰에서 계산. 시험 페이지 실측: 셸 76px = 예전 76px. 배달 허브 여백은 계약값이라 별도 유지 |
| 5 | 2단 밑줄 중복·이중 자동 스크롤 | 완료(코드) · 값 변화 없음 | 2단 값 토큰 `--dibay-tab2-*` 1곳 → 두 규칙이 같이 씀(실측 15px·여백 12px·밑줄 2px·안쪽 8px 동일). 커뮤니티 주제 줄 공용 자동 스크롤 끔(`autoScrollSelected={false}`) — 자체 로직 1개만 |
| 6 | 죽은 파일 | 완료(코드) | `lib/ui/mypage-oval-tabs.ts` 삭제 (사용처 0) |

검증: 관련 테스트 52개 파일 PASS (기존 실패 4파일 — 메신저 이미지 자동 저장·내정보 캐시 — 변경 없는 main 에서도 동일) · 타입 검사 2종 오류 0 · eslint 오류 0 · 디자인 시스템·하단 FAB 계약 검사 PASS. 운영 화면 확인 전.
**계획 범위 안 남은 항목: 없음.**

## 9-5. 운영 화면 확인 7가지 (Owner 승인 2026-11-03 · 브라우저 확인 — 실기기 아님)

조건: Production **`671f1f4fb`** (READY · S1~S4·자동 스크롤 4곳 포함, **`94294ce7c` 미포함**) · 데스크톱 앱 내장 브라우저 · 375px(메신저 상단 바만 1024px) · 2026-11-03 01:0x PHT · 로그인 쿠키 있음(계정 확인 못 함).

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| 1 | 뒤로 버튼 위치 | **PASS (일부)** | `/events` 정본: 48×48 · ‹ 글자 칸 화면 끝 15px. 태블릿 메신저 상단 바: 48×48 · 바 왼쪽 끝에서 15px · 제목 17px/600. 관리자 헤더·거래 채팅 방은 확인 못 함 |
| 2 | 그룹방·카테고리 헤더 1줄 | **PASS (일부)** | `/group-chat/r-check`(없는 방): 헤더 1줄 · 뒤로 1개 · 「그룹 채팅」. 실제 방 이름 표시는 확인 못 함(실제 방 없음). `/group-chat` 은 운영에서 메신저 그룹 목록으로 이동 — 예전 그룹채팅 목록 화면은 열리지 않음. `/features/*` 는 진입 링크 없음 — 실제 화면 확인 못 함 |
| 3 | 3단 칩 | **PASS** | 고객센터 공지·신고 내역: 32px · 4px · 13px · 선택 그린 바탕+밝은 글자 · 미선택 흰 바탕+테두리. 거래 주제 칩은 거래 시안(10-28)상 화면에 나오지 않음(카테고리 6개 모두 칩 줄 0) |
| 4 | 선택 탭 자동 스크롤 | **PASS (알림함)** | `/notifications` 탭 7개(줄 325 / 내용 598px) → 화면 밖 「고객센터」 선택 시 줄 273px 이동·탭 완전히 보임. 주문·거래 허브·모임은 확인 못 함 |
| 5 | 하단 탭 눌림 배경 | **확인 못 함** | `94294ce7c` 가 운영에 아직 없음 |
| 6 | 숨긴 하단 탭 잠금 | **PASS** | `/philife` 아래로 스크롤 → `--scroll-hidden` · inert true / 위로 → `--scroll-visible` · inert false |
| 7 | 커뮤니티 스크롤 1회 | **확인 못 함** | `94294ce7c` 가 운영에 아직 없음 |

측정 실수 1건(정정): 4번 첫 측정에서 화면이 다시 그려지기 전 요소를 재서 「이동 0」으로 나옴 → 현재 요소로 재측정해 PASS.
남은 확인: 5·7번(배포 후) · 1·2·4번 「확인 못 함」 부분 · Owner 휴대폰 실기 확인.

## 9-6. 5·7번 확인 (Production `94294ce7c` · 375px · 2026-11-03 01:1x PHT · 브라우저 — 실기기 아님)

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| 5 | 하단 탭 눌림 배경 | **규칙 적용 PASS · 눌린 순간 화면 확인 못 함** | 운영 CSS 에 `.app-bottom-nav-shell:not(--delivery) .app-bottom-nav-item[data-active="false"]:active { background: var(--app-bottom-nav-hover-bg) }` 있음 · 커뮤니티 하단 바는 배달 셸 아님 · 미선택 탭 4개 대상. 누르고 있는 순간은 브라우저 도구로 고정 불가 |
| 7 | 커뮤니티 스크롤 1회 | **FAIL — 제 변경이 만든 회귀** | 공용 자동 스크롤을 끈 뒤(`94294ce7c`) 「동네」·「유머」 선택 시 줄 이동 호출 0회, 선택 탭이 화면 밖(scrollLeft 0). 커뮤니티 자체 로직(`CommunityFeed.tsx` 1555~)은 탭 선택 때 이동하지 않음. → 끄기 한 줄 되돌림(이 커밋). 운영 재확인은 배포 후 |

## 9-7. 7번 재확인 (Production `87161c27b` · 375px · 2026-11-03 PHT · 브라우저 — 실기기 아님)

| 항목 | 판정 | 증거 |
|---|---|---|
| 커뮤니티 주제 줄 선택 탭 보임 | **PASS** | 「유머」(`?category=humor`)·「동네」(`?nav=local`)·「골프」(`?category=golf`) 차례 선택 → 3번 모두 선택 탭이 줄 안에 완전히 보임(scrollLeft 386) |

운영 화면(브라우저) 확인 남은 것: 1번 관리자 헤더·거래 채팅 방 뒤로 위치 · 2번 실제 그룹방 이름 · 4번 주문·거래 허브·모임 자동 스크롤 · 5번 눌린 순간 화면. Owner 휴대폰 실기 확인 전부 NOT_PROVEN.

## 9-8. 남은 브라우저 확인 4가지 (Production `87161c27b` · 2026-11-03 PHT · 브라우저 — 실기기 아님)

| 항목 | 판정 | 증거 |
|---|---|---|
| 관리자 헤더 뒤로 위치 | **PASS** | `/admin/ops-docs/create` 1280px(관리자는 1024px 이상만 열림): 48×48 · ‹ 가 본문 시작선(헤더 왼쪽)과 같음(글자 보정 −1px) |
| 거래 채팅 방 뒤로 위치 | **진입 경로 없음** | `/chats/[roomId]` 는 거래 방이면 항상 메신저 방으로 이동(`app/(main)/chats/[roomId]/page.tsx:72-78`) — `ChatDetailView` 거래 헤더는 운영에서 열리지 않음 |
| 실제 그룹방 이름 | **진입 경로 없음** | `/group-chat` → 메신저 그룹 목록으로 이동. 예전 그룹방 진입 링크 없음 |
| 주문 탭 | **PASS (스크롤 불필요)** | `/mypage/store-orders` 탭 4개가 줄에 다 들어감(343/343px) · 이름 잘림 0 |
| 내정보 거래 허브 탭 | **확인 못 함** | `/mypage/trade/favorites` 에 `TradeHubTopTabs` 가 나오지 않음 |
| 모임 탭 | **해당 없음** | `PhilifeMeetingHubClient` 사용처 0 (화면에 쓰이지 않는 파일) |
| 하단 탭 눌린 순간 화면 | **확인 못 함** | 브라우저 도구로 누르고 있는 상태를 고정할 수 없음 (규칙 적용은 §9-6 PASS) |

**제 작업 오버 (보고)**: 운영에서 열리지 않는 화면의 파일을 고쳤음 — `GroupChatHomePageClient`·`GroupChatRoomClient`(S1·S2, 그룹채팅이 메신저로 이동), `ChatDetailView` 거래 헤더 뒤로(S1, 거래 방은 메신저로 이동), `PhilifeMeetingHubClient`(S3·T-08, 사용처 0). 동작 영향 없음(화면 미노출). 감사 단계에서 「화면에 실제로 나오는지」를 확인하지 않은 것이 원인.
남은 확인: Owner 휴대폰 실기 확인 전부 NOT_PROVEN.

## 9-9. 화면 미노출 파일 변경 되돌림 (Owner 「되돌리고」 2026-11-03)

| 파일 | 되돌린 내용 | 방법 |
|---|---|---|
| `app/(main)/group-chat/GroupChatHomePageClient.tsx` | S1 뒤로 touch 클래스 | S1 이전 내용으로 복원(다른 변경 없음) |
| `components/group-chat/GroupChatRoomClient.tsx` | S1 뒤로·S2 자체 헤더 제거/전역 등록 | S1 이전 내용으로 복원(다른 변경 없음) |
| `components/chats/ChatDetailView.tsx` | S1 뒤로 touch 클래스 1줄 | 그 줄만 제거 — 팝업 작업 변경(`5491d1b10`·`ffc1e1094`·`671f1f4fb`)은 유지 |
| `components/meetings/PhilifeMeetingHubClient.tsx` | S3 밑줄 탭 전환·T-08 자동 스크롤 | S3 이전 내용으로 복원 + 팝업 작업의 확인창 제목 키 1줄(`popup_q_leave_meeting`)만 유지 |

계약 테스트에서 이 4파일 검사 항목 제거·되돌림 고정. 검증: 테스트 83개 파일 PASS · 타입 검사 2종 오류 0 · eslint 오류 0.
**실기 확인(Owner 휴대폰): 승인 대기** — Owner 승인 전 진행하지 않음.

## 9-10. 실기 확인 (Owner 「실기 승인」 2026-11-03 02:0x PHT)

조건: Production **`0f5950890`** (크롬 변경·되돌림 모두 포함) · 앱 **1.2.5 (32)** · USB 연결 실기 2대. 릴리스 앱이라 WebView 원격 디버깅 꺼짐 → 수치 측정 불가, **기기 화면 캡처로 눈으로 확인**. 캡처에 계정 정보가 있어 저장소에는 올리지 않음(작업자 로컬 보관).

| 기기 | 판정 |
|---|---|
| 샤오미 24076RP19G (태블릿 가로 1340×800) · 로그인 계정 zxzx11 | 아래 표 |
| 삼성 SM-M156S (1080×2340, 세로 폰) | **확인 못 함** — 사장님 「매장 관리」 화면에서 시작했고 사장님 화면 안에서만 이동돼, 쓰던 상태를 흐트러뜨리지 않으려고 중단 |

샤오미 결과:

| 항목 | 판정 | 확인 내용 |
|---|---|---|
| 메신저 2단 탭 | PASS | 밑줄형 · 선택 「대화」 그린 글자+밑줄 |
| 커뮤니티 주제 줄 | PASS | 밑줄형 글자 탭 · 「동네」 선택 = 그린 굵은 글자+밑줄 · 「최신순」 칩 흰 바탕+테두리 |
| 거래 상단 탭 | PASS | 밑줄형 4개 균등 · 선택 「둘러보기」 그린+밑줄 · 알약 바탕 없음 |
| 원형 탭 색 | PASS | 커뮤니티·거래·채팅 원형 진한 그린 |
| 하위 화면 헤더 1줄·‹ 위치 | PASS | 고객지원·고객센터 |
| 2단 탭 + 3단 칩 | PASS | 공지사항: 2단 밑줄 선택 그린 · 3단 칩 「전체」 그린 바탕 4px / 「안읽음」 흰 바탕+테두리 |
| 세로 폰 화면 | **확인 못 함** | 삼성 중단 |
| 하단 탭 눌린 순간 · 숨긴 탭 잠금 | 확인 못 함 | 캡처로 판별 불가 |

남은 실기: 세로 폰(삼성 등) 소비자 화면 확인.

## 9-11. 실기 확인 — 삼성 세로 폰 (2026-11-03 02:19~02:21 PHT)

조건: 삼성 SM-M156S (1080×2340 세로) · 앱 1.2.5 (32) · Production `0f5950890` · Owner 가 사장님 화면 → 소비자 배달 홈으로 전환한 뒤 진행 · 기기 화면 캡처로 확인(캡처는 계정 정보 포함이라 저장소 미보관). 이동은 하단 탭·주제 탭·「진행 거래」만 누름.

| 항목 | 판정 | 확인 내용 |
|---|---|---|
| 원형 탭 색 | PASS | 배달·커뮤니티·거래·채팅 원형 진한 그린 |
| 커뮤니티 주제 줄 스와이프 | PASS | 손가락으로 밀면 줄 끝(…골프·유머·동네)까지 이동 |
| 2단 탭 선택 표시 | PASS | 「유머」 선택 = 그린 굵은 글자+밑줄, 「최신순」 칩 흰 바탕+테두리 |
| 선택 탭 자동 스크롤 | PASS | 오른쪽 「일상생활」 선택 → 줄이 저절로 움직여 가운데 쪽 표시 |
| 거래 상단 탭 | PASS | 밑줄형 4개 한 줄 · 「둘러보기」 그린+밑줄 · 알약 바탕 없음 |
| 메신저 2단 탭 | PASS | 밑줄형 · 「대화」 그린 |
| 내정보 탭 줄 흰 띠 | PASS | 「진행중 거래」 탭 줄 배경 = 헤더 베이지 · 탭 5개 잘림 없음 · 「전체」 그린+밑줄 |
| 하위 화면 헤더 1줄·‹ | PASS | 「진행중 거래」 |
| 하단 탭 눌린 순간 · 숨긴 탭 잠금 | 확인 못 함 | 캡처로 판별 불가 |

참고(기록만): 줄 맨 오른쪽 가장자리(화면 끝 몇 px)를 누른 1회는 탭으로 인식되지 않음 — 탭 칸 밖 위치였음, 결함 판정 아님.

---

# 10. 완료 처리 · 최종 감사 (Owner 「완료로 잡아도 된다」 2026-11-03)

## 10-1. 처음 설계(§1-3·§2-3·§3-3) 대비 최종 상태

| 설계 | 최종 | 근거 |
|---|---|---|
| H-R1 상단 1행 정본 | 완료 (범위 안) | 이벤트·전체서비스 헤더 1줄 운영·실기 PASS. 거래 채팅·메신저 방 = 결정 5 제외, 그룹채팅 = 화면 미노출로 되돌림 |
| H-R2 뒤로 48×48·‹ 선 | 완료 (opt-in 방식) | 정본 바·관리자·태블릿 메신저 바 운영 PASS. 설계와 다른 구현: 기본값 변경 → 지정 화면만(배달 계약) |
| H-R3 직접 `router.back()` | 완료 (범위 안) | 상품 수정·글쓰기·주소·운영 문서 취소. 통화·메신저 pillar·로그인 = 계약 제외 |
| H-R4·H-R5 높이·우측 아이콘 | 해당 없음 | 남은 대상(거래 채팅 방)은 운영에서 메신저 방으로 이동 + 결정 5 제외 |
| H-R6 헤더 숨김 없음 | 현행 유지 | — |
| 2단 밑줄·잘림 0·스와이프 | **완료 (운영·실기 PASS)** | 커뮤니티·거래·메신저·내정보·알림·고객센터 |
| 3단 칩 4px | **완료 (운영·실기 PASS)** | 고객센터·신고 |
| 선택 탭 자동 스크롤 | **완료 (운영·실기 PASS)** | 알림함·커뮤니티 |
| 2단 밑줄 슬라이드 · 정본 컴포넌트 2개 · ARIA 강제 | 설계와 다름 (유지) | 결과(크기·색·잘림 0)는 같음 |
| B-R1 원형 탭 그린 | **완료 (운영·실기 PASS)** | |
| B-R2 눌림 배경 | 완료 (규칙 적용 PASS) | 눌린 순간 화면 확인 못 함 |
| B-R3 여백 토큰 | 완료 (값 동일) | 배달 여백은 계약값 별도 |
| B-R4 inert | 완료 (운영 PASS) | 실기 캡처로는 판별 불가 |
| B-R5 숨김 규칙표 | 완료 | 동작 변경 없음 |
| B-R6 배지 링 | 완료 | |

## 10-2. 최종 감사 — 누락 · 누수 · 중복 · 오류 · 병목

| 구분 | 내용 | 상태 |
|---|---|---|
| 누락 (노출 확인) | 운영 화면 노출을 확인 못 한 변경 3곳 — `CategoryListLayout`(`/features/*` 진입 링크 못 찾음, 전용 훅 `useRegisterMainTier1Header` 도 여기만 사용) · `MarketCategoryFeed` 거래 주제 칩(카테고리 6개 모두 칩 줄 0) · `TradeHubTopTabs`(확인한 화면에 미노출) | **그대로 유지** — Owner 「그대로 두기」 2026-11-03 |
| 중복 | 커뮤니티 주제 줄: 자체 스크롤 로직(`CommunityFeed.tsx:1558`)과 공용 자동 스크롤이 함께 있음 | 운영·실기에서 충돌 없음(선택 탭 항상 보임) — 유지 |
| 중복 | 2단 밑줄 규칙 2곳 | `--dibay-tab2-*` 토큰 1곳으로 값 일원화 완료 |
| 누수 | 이벤트 리스너·타이머 추가 0. 자동 스크롤 훅이 마지막 선택 탭 요소 1개 기억 | 무시할 수준 |
| 병목 | 자동 스크롤 훅 탭 줄 렌더마다 선택 탭 1회 탐색 · 카테고리 제목 재등록 | 측정 안 함 — NOT_PROVEN (계산량 작음) |
| 오류 | 배달·사장님·통화 파일 변경 0 (커밋 대조) · 테스트·타입 검사 PASS 상태 | — |
| 확인 못 함 | 하단 탭 눌린 순간 화면 · 실기에서 숨긴 탭 잠금 | 도구로 판별 불가 |

**상태: 완료** (노출 확인 못 한 3곳은 Owner 결정으로 그대로 유지, 2026-11-03).
