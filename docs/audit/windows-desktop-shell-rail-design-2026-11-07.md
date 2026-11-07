# DIBAY 데스크톱(Windows·PC) 셸 — 왼쪽 세로 내비·헤더 정렬 설계서 (2026-11-07 PHT)

> 상태: **설계만. 구현 0건.** Owner 승인 후 구현한다.
> 근거 = main `3a48eb6cd` 코드 직접 확인 + 운영 화면 측정(비로그인, Mac 내장 브라우저 1280×800, `docs/audit/windows-msstore-launch-audit-2026-11-07.md` §4).
> 확인 못 한 것은 NOT_PROVEN 으로 적는다.

## 0. Owner 지시 원문
- 「apk, ios, 윈도우로 나누는 구조로, 레거시 어플의 형태, 카톡, 텔레그램, 배민 형태를 원하는 부분이다」
- 「해당 부분의 디자인 ui ux cta 부분까지 감사 해서 수정안을 보고 해줘」
- 「잠금 해제·설계서 작성」 (2026-11-07) → `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md` 의 **「데스크톱 사이드 내비 금지」만 해제**한다.
- 다음 잠금은 그대로 유지한다:
  - FD1 기기 판정
  - FD2 창 크기 기준
  - FD3 회전
  - 휴대폰·태블릿 하단 탭
  - 도메인 폭(커뮤니티 767·메신저 768·거래 그리드·사장님 1024)

## 1. 현재 (직접 확인)
| 항목 | 현재 | 근거 |
|---|---|---|
| 기기 판정 | Windows → `DESKTOP_WINDOWS`, 기타 PC 브라우저 → `WEB_DESKTOP`, 셸 계열 `DESKTOP` | `lib/device/dibay-device-class.ts:140`, 운영 DOM `data-dibay-shell-family=DESKTOP` |
| 내비 | 모든 기기가 하단 탭(`EXISTING_MAIN_BOTTOM_NAV`). 1280 폭에서 5칸 × 252px | `lib/device/dibay-shell-resolver.ts`, 운영 측정 `nav 0,740 1280×60` |
| 예전 사이드 내비 | `components/layout/MainDesktopSideNav.tsx`(140줄)이 남아 있으나 마운트되지 않음. CSS `display:none !important`. 폭 상수 `MAIN_DESKTOP_SIDE_NAV_WIDTH_PX = 72` | `app/app-desktop-side-nav.css`, `lib/layout/main-desktop-side-nav-layout.ts` |
| 본문 폭 | 커뮤니티·거래 = `APP_MAIN_COLUMN_MAX_WIDTH_CLASS` (xl 66rem=1056px). 거래는 그 안에서 `lg:grid-cols-4`. 배달 = `max-w-[768px]` (배민 미러링 277b8ab95, 2026-10-30) | `lib/ui/app-content-layout.ts:12`, `lib/posts/trade-feed-layout-classes.ts:57`, `components/stores/browse/StoresBrowsePrimaryView.tsx:954` |
| 상단 헤더 | 1단 헤더 안쪽이 화면 전체 폭(`APP_TIER1_HEADER_BAR_CLASS = w-full max-w-full`) → 제목은 화면 왼쪽 끝, 본문은 가운데 1056 열 | `lib/layout/app-tier1-header.ts:25`, 운영 캡처 |
| 메신저 | 768px 이상에서 목록·방 2단(카톡형). 하단 탭이 왼쪽 목록 칸 아래에만 깔림 | `hooks/use-is-messenger-split-viewport.ts`, `ConditionalAppShell.tsx` `APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS` |
| 첫 그림 | 서버 HTML·첫 렌더는 `UNKNOWN_SAFE`(하단 탭). 클라이언트 `useLayoutEffect` 에서 기기 판정 | `lib/device/use-dibay-app-shell.ts` |

## 2. 목표 화면 (카톡 PC형)
```
┌──────┬──────────────────────────────────────────┐
│ 커뮤 │  [1단 헤더: 본문 열과 같은 폭으로 정렬]      │
│ 거래 │  ┌──────── 본문 열(기존 폭 토큰) ────────┐ │
│ 배달 │  │                                      │ │
│ 채팅 │  │                                      │ │
│ 내정 │  └──────────────────────────────────────┘ │
└──────┴──────────────────────────────────────────┘
 72px 세로 내비 (기존 상수)
```
- 채팅 탭: `내비 72 | 대화 목록 | 대화방` 3열이 된다. 메신저 2단(FD7)은 그대로 쓰고, 그 아래 깔리던 하단 탭만 없어진다.
- 휴대폰·태블릿(Android·iOS·iPad): **변화 없음.** 계속 하단 탭을 쓴다.

## 3. 결정 (규정·기존 설계로 정한 것)
| # | 결정 | 근거 |
|---|---|---|
| R1 | 세로 내비는 `shellFamily === "DESKTOP"` 일 때만 쓴다. 창 폭으로 판단하지 않는다 → Windows 창을 500px로 줄여도 세로 내비 유지 (카톡 PC 와 같음) | FD4 「DeviceClass 가 셸 정체성, 폭으로 Phone/Desktop 를 바꾸지 않는다」(유지 조항) |
| R2 | 표시 조건은 하단 탭과 **완전히 같다**. `shouldRenderMainBottomNav` 와 모든 숨김 신호(통화·지원 모달·사장님)를 그대로 쓴다. 하단 탭이 없는 화면(관리자·사장님 운영·상세)에는 세로 내비도 없다 | `ConditionalAppShell.tsx` `showBottomNavMounted` |
| R3 | 폭은 72px (기존 상수 `MAIN_DESKTOP_SIDE_NAV_WIDTH_PX`). 새 값을 만들지 않는다 | `lib/layout/main-desktop-side-nav-layout.ts` |
| R4 | 탭 목록·선택·배지·이동 로직은 하단 탭과 **같은 함수**를 쓴다. 복제하지 않는다 (`composeMainBottomNavDisplayTabs`·`isMainBottomNavDisplayTabActive`·`resolveMainBottomNavTabTapHref`·`commitBottomNavTabRoute`·`useMainBottomNavTabs`). 예전 `MainDesktopSideNav` 를 크롬 S4 규칙(선택 = 브랜드 그린, 숨김 규칙표, 배지 링, `aria-current`)에 맞춰 되살린다 | 공통 코드 복제 금지 · 크롬 S4 (7acd866c2) |
| R5 | 세로 내비는 `position: fixed` 로 왼쪽에 붙이고, 셸 루트는 `[data-dibay-nav-presentation=DESKTOP_SIDE_RAIL]` CSS 로 왼쪽 여백 72px 만 준다. **본문 트리 구조·요소 종류는 바꾸지 않는다** → 페이지 리마운트 0 | FD4 「DeviceClass 변화로 페이지 트리 리마운트 금지」(유지 조항) |
| R6 | 세로 내비일 때 하단 탭은 마운트하지 않는다. 하단 여백 SSOT(`BottomNavScrollChromeProvider occupiesClearance`)는 `false` → 본문 아래 빈 공간이 없어진다 | `ConditionalAppShell.tsx` 하단 여백 SSOT |
| R7 | 헤더 정렬: 데스크톱일 때만 1단 헤더 **안쪽 내용**에 본문과 같은 `APP_MAIN_COLUMN_MAX_WIDTH_CLASS` + `mx-auto` 를 준다(배경 띠는 전체 폭 유지). 휴대폰은 화면이 42rem 보다 좁아 영향이 없고, 태블릿도 바뀌지 않도록 `DESKTOP` 셀렉터로만 적용 | `lib/ui/app-content-layout.ts` 기존 토큰 |
| R8 | 배달 탭 768 폭은 **바꾸지 않는다**(배민 미러 계약). 세로 내비가 생기면 남는 폭이 줄어 「탭마다 폭이 다르다」 체감이 줄어든다. 768을 데스크톱에서 넓힐지는 **Owner 결정 필요**(이번 범위 밖) | 계약에 없는 값 금지 |
| R9 | 키보드 숨김·스크롤 숨김은 세로 내비에 적용하지 않는다 (PC 에는 화면 키보드·하단 가림이 없음) | 해당 기능은 하단 탭 전용 |

## 4. 바뀌는 파일
| 파일 | 변경 |
|---|---|
| `lib/device/dibay-shell-resolver.ts` | `navigationPresentation` 에 `DESKTOP_SIDE_RAIL` 추가. `DESKTOP` → `DESKTOP_SIDE_RAIL`, 그 외 → 기존 `EXISTING_MAIN_BOTTOM_NAV` |
| `components/layout/ConditionalAppShell.tsx` | `showBottomNavMounted` 를 그대로 쓰되, 레일이면 `<MainDesktopSideNav>`, 아니면 `<BottomNav>`. `occupiesClearance` 는 레일일 때 false. 메신저 목록 칸 하단 탭 클래스는 하단 탭일 때만 |
| `components/layout/MainDesktopSideNav.tsx` | S4 규칙·배지·접근성 정렬. 로직은 공통 함수만 |
| `app/app-desktop-side-nav.css` | `display:none !important` 제거. 레일 모양(72px, 고정, 선택 색 = `--sam-primary`), 셸 왼쪽 여백 규칙 |
| `components/layout/AppStickyHeader.tsx` 또는 `lib/layout/app-tier1-header.ts` | 데스크톱 헤더 안쪽 정렬(R7) |
| `components/layout/MainBottomNavFabSector.tsx`·`HomeTradeHubFloatingBar` | 레일일 때 위치: 기존 상수 `MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_BOTTOM_CLASS`·`…LEFT_CLASS` 재사용 (구현 때 실제 위치 측정 후 확정) |
| `hooks/use-is-desktop-shell-viewport.ts` | 항상 false stub → 셸 판정 결과 반환 (호출처 전수 확인 후) |
| `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md` | 해제 기록 (이번 커밋에서 반영) |

## 5. 영향받는 화면·호출처와 같은 단계에서 처리할 것
| 영향 | 깨질 수 있는 것 | 처리 |
|---|---|---|
| 커뮤니티·거래·배달·채팅·내정보 허브 (DESKTOP) | 하단 여백이 남거나 콘텐츠가 레일 아래로 깔림 | R5·R6. 5개 허브 각각 1280·900·500 폭 캡처 |
| 메신저 2단 | 목록 칸 폭 계산이 화면 왼쪽 0 기준이면 레일과 겹침 | `messenger-split-pane-layout` 폭 기준 확인 → 셸 여백 기준으로 맞춤. 3열 캡처 |
| 글쓰기 FAB·거래 플로팅 바 | 하단 탭 위치 기준이라 엉뚱한 곳에 뜸 | 기존 데스크톱 상수 재사용 + 측정 |
| 바텀시트·팝업·통화 화면 (fixed 전체 화면) | 레일 위를 덮음 | 의도된 동작(오버레이가 위). 통화 중에는 기존 숨김 신호로 레일도 숨김(R2) |
| 첫 그림 (콜드 스타트) | 서버 HTML 은 `UNKNOWN_SAFE` → 하단 탭이 잠깐 보였다가 레일로 바뀔 수 있음 | FD1 은 잠금 유지라 서버 판정을 추가하지 않는다. 구현 후 Windows 에서 콜드 스타트 영상으로 측정. 보이면 「서버 힌트(Sec-CH-UA-Platform)」를 **별도 승인**으로 제안 |
| 기존 테스트 | `lib/device/tests/dibay-shell-authority-structure.test.ts`(「MainDesktopSideNav 없음」 단언), `dibay-shell-resolver.test.ts`(데스크톱도 하단 탭), `scripts/qa/fd4-shell-runtime-evidence.mjs`(레일 없음 기대) | 새 계약으로 갱신. **휴대폰·태블릿은 하단 탭이라는 단언은 유지·강화** |
| Android APK·iOS·iPad | 셸 계열이 PHONE/TABLET 이라 레일 코드 경로에 들어가지 않음 | 리졸버 단위 테스트로 PHONE/TABLET/UNKNOWN → 하단 탭 고정 단언. 실기기 확인은 Cursor 실기 항목 (NOT_PROVEN 전까지) |
| PC 웹 브라우저 사용자 (Mac·Windows Chrome/Edge) | **이들도 레일이 된다** (`WEB_DESKTOP` = DESKTOP 계열) | 의도된 동작. Windows 앱과 PC 웹이 같은 화면 |

## 6. 단계 (각 단계 끝에 화면이 깨져 있지 않게)
- **D1 (한 번에 반영)**: 리졸버 + 레일 + 셸 여백 + 하단 여백 + FAB 위치 + 메신저 3열 + 테스트 갱신. 레일만 넣고 여백을 나중에 하면 화면이 깨지므로 나누지 않는다.
- **D2**: 헤더 정렬(R7). D1 과 독립적이고 되돌리기 쉽다.
- 웹만 바뀐다 → main 반영 후 앱 재시작. APK·iOS 재빌드 없음.

## 7. 검증
- 코드: `typecheck:build`·`typecheck:test`(이번 CI 회귀 재발 방지 — 반드시 둘 다)·변경 파일 eslint·`lib/device/tests`·`lib/layout` 관련 vitest.
- 화면 (작업자, 내장 브라우저): DESKTOP 1280×800·900×700·500×700 에서 5개 허브 + 메신저 3열 + 비로그인/로그인 구분 기록. 휴대폰 에뮬레이션 390 에서 하단 탭 그대로인지.
- Windows 노트북 (Owner 화면 기준): Edge 설치 앱으로 같은 항목 + 콜드 스타트 깜빡임. **확인 전까지 NOT_PROVEN.**
- Android·iPhone 실기: 하단 탭·채팅·FAB 무변화 (Cursor 실기 프롬프트).

## 8. 롤백
- 리졸버에서 `DESKTOP_SIDE_RAIL` 반환을 끄면 즉시 하단 탭으로 돌아간다(1줄). CSS·컴포넌트는 남아도 마운트되지 않는다.

## 9. 이번 설계 범위 밖 (보고만)
- U-4 앱 이름 표기 통일 — Owner 표기 결정 필요, Capacitor `appName` 은 네이티브 변경.
- U-5 「Windows 앱 받기」 — Store 주소 발급 후.
- U-6 알림 켜기 버튼 — Windows 알림 방식(셸 WNS 또는 운영 Web Push) 결정 후, 알림 규정 절차.
- 배달 768 폭의 데스크톱 확장 — Owner 결정 필요(R8).
