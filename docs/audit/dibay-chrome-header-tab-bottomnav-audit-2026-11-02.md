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
| `docs/audit/delivery-baemin-master-plan-2026-10-29.md` | Owner 승인 2026-10-29 · 구현 보고 `delivery-baemin-impl-report-2026-10-30.md` (실기 PASS 항목 포함) |
| `docs/audit/delivery-category-baemin-compare-design-2026-10-29.md` §2-4 (배민 실측) · §7 (동작 명세) | 위 계획서의 근거 문서 |
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
- 확인 필요 1건 (고치지 않음 · 보고만): browse 2단 탭 선택 글자색이 코드상 `#362415`(배민 미러 `delivery-baemin-mirror.ts:40-43`)로, compare §7 원문 「`--sam-fg` 굵게」와 표기가 다르다. 이후 승인 문서에서 바뀐 것인지 **확인 못 함**.

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
| H-08 | 우측 아이콘 크기 7종 | 남음 | 메신저 방(제외)·상품 상세·사장님(제외) 빼고 상품 상세 1곳만 대상 |
| H-09 | 헤더 간격 주석 모순 | 완료(코드) | `88e4ac9da` |
| H-11 | Android 하드웨어 뒤로 = ‹ 동작 일치 여부 | 결정 필요(증거) | 실기 재현 증거 없음 — 코드 수정 전 실기 로그 필요 |
| T-01·T-02·T-03(비배달) | 2단 밑줄·3단 칩 4px 정본, 선택색 브랜드 그린 | 완료(코드) | `0ca1179ae` |
| T-01(거래 상단 탭) | 거래 상단 2단 탭(판매·둘러보기·지역·카테고리)이 여전히 알약형(14px·옅은 그린 바탕) | **FAIL (운영 확인)** | `TradePrimaryTabs` 가 공용 탭 클래스를 쓰지 않아 S3 규격 미적용. S3 보고의 「거래 상단 탭 적용」은 **틀린 보고** — 순서 2에서 수정 |
| T-02·T-03(배달·사장님) | 배달 탭·사장님 탭 | 제외 | 배달 탭 계약 (§7-1) |
| ★ 2단 스와이프 | 2단 탭 이름 잘림 0·넘치면 가로 스와이프 (Owner 고정) | 완료(코드) | `08e42167a` |
| T-04~T-08 | 높이·글자·표시줄·눌림·ARIA·선택 탭 자동 스크롤 (비배달) | 완료(코드) | `0ca1179ae` |
| T-09 | 본문 안 `.sam-tabs` 상단 고정·흰 바탕 → 헤더 크롬으로 이동 | 남음 | 회귀 위험(스크롤 시 탭 사라짐) 때문에 S3 에서 미룸 |
| T-10 | 죽은 탭 파일 7개 | 완료(코드) | `0ca1179ae` |
| 시트 안 탭 | 거래 이력·친구 요청 시트 탭 | 제외 | 팝업 SSOT T3 규격 |
| 쿠폰·상품권 허브 탭 | `CustomerCommerceHub*` | 결정 필요(분류) | 배달 범위인지 확인 못 함 |
| B-01 | 원형 탭 선택 = 브랜드 그린 (결정 6) | 완료(코드) | `28d47d618` |
| B-02 | 비배달 허브 본문 여백 + 원형 탭 높이 | 완료(코드) | `28d47d618` |
| B-03 | 숨김 hook 단일화 | 완료(코드·변경 없음) | 고객용 hook 은 이미 1개 / 사장님용은 제외 |
| B-04 | 숨긴 하단 탭 inert | 완료(코드) | `28d47d618` |
| B-05 | 스크롤 숨김 규칙표 (결정 2) | 완료(코드) | `28d47d618` (동작 변경 없음) |
| B-06 | 다크 모드 하단 내비 | 결정 필요 | 다크 모드 실제 사용 여부 확인 못 함 |
| B-07 | 배지 링 색 1개 | 완료(코드) | `28d47d618` |
| B-08 | 사장님 하단 내비 | 제외 | 사장님(배달 사업자) 범위 |
| B-09 | `/rider` 고객 5탭 노출 | 결정 필요 | Owner 결정 4 |
| B-10 | 죽은 코드: 허브 탭 컴포넌트 2개 | 완료(코드) | `28d47d618` |
| B-10 | 죽은 코드: `compose*BottomNavDisplayTabs` 3개 | 남음 | 테스트만 사용 |
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
