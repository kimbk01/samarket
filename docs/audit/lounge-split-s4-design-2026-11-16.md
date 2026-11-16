# S4 — 넓은 창 두 칸(LOUNGE 먼저) · 태블릿 회전 · 하단 탭 목록 칸 아래 — 설계서 (2026-11-16 PHT)

- 상태: **설계 확정(권장안 그대로 — Owner 「권장 사항을 제시하면 따른다」).** 구현은 이 설계서 순서대로.
- 기준 코드: `origin/main` `3742221ea` (S1 #390 · S2 #391 · S3 #393 포함)
- 상위 문서: `docs/audit/mac-ipad-iphone-device-layout-audit-2026-11-16.md` §7, 시안 `docs/audit/device-shell-mockup-2026-11-16/` (profiles.js · R1~R7)

## 0. 지시 원문

- 「S4 진행」 (2026-11-16)
- 「테블릿 및 아이패드는 가로 회전, 세로 회전도 감안 해서 구현… 정확한 ssot」
- 「오너 결정 부분은 권장 사항을 제시하면 따르는 부분으로 하자」

## 1. 지금 구조 (코드 확인 — 두 칸을 막는 것)

| # | 사실 | 근거 |
|---|---|---|
| A1 | `/philife` 목록과 `/philife/[postId]` 상세는 **서로 다른 페이지**다. 목록은 `CommunityHomeSurface`, 상세는 `Detail`. 상세로 가면 목록은 화면에서 빠진다 | `app/(main)/philife/page.tsx`, `[postId]/page.tsx` |
| A2 | 목록 위 1단 머리글(「정보 공유 · 전체」·검색·알림)은 **페이지가 아니라 셸**이 그린다(`hubScrollColumn` 일 때 `AppStickyHeader`). 상세 경로는 `hubScrollColumn=false` 라 셸 머리글이 없고 상세가 자기 머리글(뒤로·공유)을 그린다 | `ConditionalAppShell.tsx:351,398-405` |
| A3 | 목록은 셸의 **허브 본문 스크롤 하나**(`main[data-main-hub-scroll-body]`)로 스크롤한다. 하단 탭 스크롤 숨김·스크롤 기억이 이 요소를 본다 | `MainHubScrollColumn.tsx`, `lib/layout/subscribe-app-shell-scroll.ts`, `lib/navigation/app-scroll-memory` |
| A4 | **허브 화면 보관대(`HubRetentionStack`, D1)** 가 `/philife` 허브 화면을 `Activity hidden` 으로 보관한다 — 상세로 가도 목록 React 트리·데이터·스크롤이 살아 있다. 숨긴 허브에는 떠나기 직전의 라우터 문맥을 다시 공급한다(`FrozenRouterContexts`) | `HubRetentionStack.tsx:49-60,154-166` |
| A5 | 머리글을 다른 주소로 그리게 하는 문맥 대체가 이미 있다(`BottomNavShowingRouteContexts`) | `components/layout/BottomNavShowingRouteContexts.tsx` |
| A6 | 메신저 두 칸은 메신저 레이아웃 안의 `MessengerResponsiveShell` 이 한다. 768 기준은 CSS 미디어(`useIsMessengerSplitViewport`), 방은 같은 key 슬롯이라 768 경계에서 다시 마운트되지 않음(SPL-01), 하단 탭은 경로 기준 클래스 `app-bottom-nav-shell--messenger-split-list` + CSS `@media (min-width:768px)` | `MessengerResponsiveShell.tsx`, `ConditionalAppShell.tsx:518-531`, `app/app-bottom-nav.css:90-113` |
| A7 | 기기 프로필 표에는 아직 두 칸 항목이 없다(S1~S3 는 형태·메뉴·회전·배율·최소 창) | `lib/device/dibay-device-profile.ts` |

## 2. 권장안 (확정)

| # | 결정 | 근거 |
|---|---|---|
| D1 | **두 칸 여부 = 기기 프로필 `listDetailSplit` × 창 CSS 폭 ≥ 768.** 휴대폰 false, 태블릿·데스크톱 true. 판정 함수 하나(`resolveDibayListDetailLayout`) | 시안 profiles.js · 메신저 768 계약 그대로 |
| D2 | **목록 칸 = 허브 화면 보관대의 `/philife` 화면을 「보이게」 놓는다.** 새 목록을 하나 더 그리지 않는다 → 회전·상세 이동에도 목록 다시 그림 0, 스크롤·데이터 유지(R4) | A4 — 이미 보관 중인 트리 재사용, 복제 없음 |
| D3 | **상세 칸 = 지금 경로의 `children`(상세 페이지)** 를 같은 key 슬롯에 둔다 — 한 화면↔두 칸 전환에 상세 다시 그림 0 (메신저 SPL-01 과 같은 방식) | A6 |
| D4 | **목록 칸 머리글** = 셸 `AppStickyHeader` 를 `/philife` 주소 문맥으로 목록 칸 위에만. 상세 칸 머리글 = 상세 자체 머리글, 두 칸일 때 뒤로 버튼 숨김(목록이 옆에 있음) | A2·A5 |
| D5 | **스크롤** — 두 칸일 때 목록 칸·상세 칸이 각자 스크롤. 셸 허브 본문 스크롤은 잠금(메신저 `main-hub-scroll-body--child-scroll-lock` 과 같은 방식). 목록 칸 스크롤 요소를 스크롤 기억 대상으로 등록 | A3 |
| D6 | **하단 탭(태블릿)** — 두 칸일 때 목록 칸 아래(`messenger-split-list` 클래스를 라운지 경로에도). 데스크톱은 세로 메뉴라 해당 없음. 한 화면일 때 창 전체(R5) | A6 · 권장안 C2 |
| D7 | **빈 상세 칸**(`/philife` 에서 아무 글도 안 엶) = 배경만, 문구·버튼 없음 | 메신저 빈 상세 규칙 2026-07-30b · R6 |
| D8 | **회전 R1~R7** — 회전은 창 폭만 바꾼다. 같은 판정 함수로 다시 계산. 열린 상세 유지(한 화면→두 칸: 목록+같은 글, 두 칸→한 화면: 글 전체 화면, 뒤로=목록) | 시안 ROTATION_RULES |
| D9 | **글쓰기 버튼** = 목록 칸 안 오른쪽 아래(상세 칸 위에 뜨지 않게) | 시안 |
| D10 | **보관대가 비어 있을 때**(상세 주소로 바로 들어옴·새로고침) — 목록 칸에 `/philife` 화면을 새로 마운트하고 이후 보관대가 이어받는다(첫 1회만 그림) | A4 의 보관 시작 조건 |
| D11 | **첫 그림** — 서버 HTML 은 기기 종류를 모른다(지금도 세로 메뉴가 하이드레이션 후 붙음). 두 칸도 하이드레이션 직후 결정. 깜박임은 실측 후 별도 조치(추측으로 막지 않음) | FD4 R5 와 같은 조건 |

## 3. 바뀌는 파일 (구현 단위)

| 단계 | 파일 | 변경 |
|---|---|---|
| S4-1 | `lib/device/dibay-device-profile.ts` | `listDetailSplit` 항목(휴대폰 false·태블릿/데스크톱 true), `DIBAY_LIST_DETAIL_SPLIT_MIN_CSS = APP_MESSENGER_SPLIT_MIN_PX`(같은 상수), `resolveDibayListDetailLayout({deviceClass, widthCss})` |
| S4-1 | `lib/device/use-dibay-list-detail-layout.ts` (새) | 기기 종류(`useDibayAppShellAuthority`) + `matchMedia(min-width:768px)` 구독 → `SPLIT`/`STACK`. 회전·창 크기 변경 즉시 반영 |
| S4-2 | `components/layout/HubRetentionStack.tsx` | 두 칸 대상 경로(라운지 상세)에서 보관 중 `community` 허브를 `visible` 로 목록 칸 슬롯에 그림. 그 밖의 동작(숨김·계정 비움·채팅 미보관) 그대로 |
| S4-2 | `components/layout/ListDetailSplitFrame.tsx` (새) | 목록 칸(머리글+보관 허브) \| 상세 칸(children) 틀. 칸 폭 `--cm-split-list-pane-width` 재사용. 같은 key 슬롯 |
| S4-2 | `lib/layout/conditional-app-shell-flags.ts`·`ConditionalAppShell.tsx` | 두 칸일 때 라운지 경로(`/philife`·`/philife/[uuid]`) 허브 본문 스크롤 잠금, 하단 탭 `messenger-split-list` 조건에 라운지 경로 추가(메신저 판정과 같은 경로 기준 + CSS 미디어) |
| S4-2 | 상세(`components/community/Detail` 머리글) | 두 칸일 때 뒤로 버튼 숨김 |
| S4-2 | 글쓰기 FAB(`PhilifeComposeFab`) | 두 칸일 때 목록 칸 기준 위치 |
| S4-3 | 시험 | 판정 함수 7기기×폭 표, R1~R7 계약(회전 전후 상세 key 동일·하단 탭 클래스·빈 상세), 구조 시험(목록 복제 마운트 금지) |

## 4. 영향받는 화면·호출처와 같은 단계 처리

| 영향 | 깨질 수 있는 것 | 처리 |
|---|---|---|
| 휴대폰(Android·iPhone) | 없음 — `listDetailSplit=false` | 판정 표 시험으로 고정 |
| 태블릿 세로(768 미만: Xiaomi 601·iPad mini 744) | 없음 — 한 화면(지금 그대로) | 같은 판정 |
| 라운지 마켓·모임 하위 탭(같은 `/philife` 허브 안 칩) | 목록 칸 안에서 그대로 동작해야 함 | 목록 칸은 같은 허브 트리라 변화 없음 — 실기로 확인 |
| 하단 탭 스크롤 숨김 | 두 칸에선 셸 스크롤 잠금 → 숨김 안 됨 | 태블릿·데스크톱은 숨김이 필요 없음(메신저와 같음) |
| 스크롤 기억 | 목록 칸 스크롤이 셸 키로 기억되지 않음 | 목록 칸 요소 등록(S4-2) |
| 다른 허브(HOME·DIPICK·MY) | 없음 — 대상 경로만 | 경로 표로 한정 |
| 통화·알림·관리자 | 없음 | 경로 밖 |
| 거래 목록 불변조건(`/market`) | 없음 — 이번은 `/philife` 만 | MARKET 은 별도 단계 |

## 5. 검증 행렬 (반영 후 작업자 직접)

- Xiaomi 태블릿(Owner 계정): 세로(한 화면) → 글 열기 → 가로 회전(목록+같은 글, 하단 탭 목록 칸 아래) → 다른 글 → 세로 회전(글 전체 화면, 뒤로=목록)
- Mac 시험 빌드(S3 포함): 창 1612·900·700pt — 세로 메뉴 + 두 칸 / 700 미만 한 화면
- PC 브라우저(Windows 와 같은 셸): 1600·1024·760 폭
- Samsung 폰: 변화 없음
- iPad: 시뮬 세로 820·가로 1180·mini 744 (실기 없으면 NOT_PROVEN)

## 6. 남은 위험

- `HubRetentionStack` 은 D1 운영 계약이 걸린 부분이다(숨긴 허브에 고정 라우터 문맥). 목록 칸으로 「보이게」 하는 경로가 새로 생기므로 S4-2 는 보관대 계약 시험을 먼저 늘린 뒤 바꾼다.
- 첫 그림 깜박임(D11)은 실측 전 판단하지 않는다.

## 7. 구현·측정 결과 (2026-11-16 22:xx PHT)

### 설계와 달라진 점
- D10: 상세 주소로 바로 들어오면(보관 허브 없음) 목록 칸은 비우고 **상세가 창 전체**. 목록 화면(`CommunityHomeSurface`)은 「다른 곳에서 다시 만들지 말 것」 계약이라 새로 마운트하지 않는다. 목록으로 한 번 가면 그 뒤부터 두 칸.
- 머리글 부가값(`MainTier1ExtrasContext`): 두 칸에서는 머리글이 둘(목록 칸·상세 칸) 동시에 보이는데, 기존 공급자는 「마지막 등록 1개」뿐이었다. 측정으로 결함 2건 확인 후 구조 수정:
  1. 목록 칸 머리글에 상세의 「공유」가 섞임 → 경로를 밝힌 등록은 경로별로도 보관(해제 때 지움), 머리글 부품은 `useHeaderScopedMainTier1Extras(경로)` 로 읽음(마지막 등록이 이 경로 것이면 지금과 같음), 목록 칸 머리글은 허브 범위(`MainTier1ExtrasHubScope`)로 허브 값만.
  2. 두 칸→한 화면 전환 때 상세 제목이 「정보 공유」로 바뀜 → 숨겨지는 허브가 공용 값 전체를 지움. 해제에 「내 등록일 때만」(`setMainTier1Extras(null, 내등록)`) — 허브 머리글(`MySubpageHeader`)·라운지 상세 머리글(`CommunityPostDetailHeader`, 등록 경로도 밝힘).

### 측정 (로컬 운영 빌드 `next build`(Turbopack) + `next start`, 이 브랜치, PC 브라우저 = Windows 와 같은 데스크톱 셸, 비로그인, Playwright)
`lounge-split-s4-2026-11-16-evidence/rotate-result.json`, 캡처 `s4-a~d-*.png`

| 상태 | 결과 |
|---|---|
| A 1280 목록 | 두 칸 · 목록 칸 448(=35vw) · 목록 머리글 「정보 공유 · 전체」[검색·알림] · 빈 상세 · 글쓰기 버튼 목록 칸 안 |
| B 1280 글 열림 | 두 칸 · 목록 유지(20건) · 상세 머리글 「필리핀 뉴스」[공유·알림, 뒤로 숨김] · 슬라이드 없음 |
| C 700 (세로 회전과 같은 폭 변화) | 한 화면 · **같은 상세 요소(다시 그림 0)** · 머리글 「필리핀 뉴스」[뒤로·공유·알림] |
| D 1280 (다시 넓힘) | 두 칸 · 같은 상세 요소 · 목록 머리글·상세 머리글 모두 정상 |
| 다른 화면 1280·390 | `/home`·`/stores`·`/mypage`·`/community-messenger` 틀 비활성(지금과 같음), 390 `/philife` 한 화면. 메신저 1280 비로그인 머리글 0 은 지금 운영과 같음 |

### 측정 중 확인한 것 (보고만 — 고치지 않음)
- `HubRetentionStack` 의 `FrozenRouterContexts` 는 주석에 「개발 모드 `NavigationPromisesContext` 를 null 로 공급」이라 적혀 있으나 코드에는 없다(import 만 있음). 그래서 **개발 서버에서만** 숨긴 허브가 지금 주소를 읽는다. 공급을 넣어 보니 개발 서버에서 `use()` 오류로 피드가 깨져 되돌렸다. 운영 빌드는 해당 없음(위 D 측정).
- 내장 브라우저 화면 크기 흉내는 미디어 조건 변경 이벤트를 보내지 않는다(이벤트 0건) — 회전 측정은 Playwright 로만.

### NOT_PROVEN
- 태블릿 실기(Xiaomi 세로↔가로, 하단 탭 목록 칸 아래) — 기기 종류가 태블릿이어야 해서 브라우저로 못 잼. 계약 시험만(클래스 조건). 반영 후 작업자 실기.
- Mac 앱(S2·S3 빌드 필요) · iPad · 로그인 상태 화면.
