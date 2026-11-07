# DIBAY 메신저 PC 전체 폭(카톡 PC형) 설계서 (2026-11-07 PHT)

> 상태: **설계만. 구현 0건.** Owner 승인 후 구현한다.
> Owner 지시 원문: 「권장 사항을 따른다」 (2026-11-07). 앞선 권장 = 「PC 에서만 메신저를 목록 고정 폭 + 대화방이 나머지 전체 폭으로. 휴대폰·태블릿 메신저 무변화. 설계서 먼저」.
> 근거: main `8eef5d1bd` 코드 + Owner Mac 크롬 운영 화면(로그인, 1542×877, `WEB_DESKTOP`).

## 0. 작업자 잘못 (먼저)
- **M0 — D1 레일(8eef5d1bd) 회귀 가능성 (계산상 FAIL, 화면 NOT_PROVEN).**
- 메신저 홈 하단 시트 3종(친구 관리 등 `CommunityMessengerHome`·보관함 `MessengerArchiveScreen`·설정 `MessengerSettingsSheet`)은 `app/messenger-home-bottom-sheet.css` 에서 위치를 계산한다. 계산식은 `left = (100vw − 본문열)/2` 로, **화면 가운데 열 기준**이다.
- 레일이 생기면서 실제 목록 칸은 `72 + (100vw − 72 − 본문열)/2` 에서 시작한다. 그래서 PC 에서 시트가 목록 칸보다 **36px 왼쪽**에 뜬다(1542 폭: 시트 243 vs 목록 279).
- D1 때 이 파일을 영향 목록에서 빠뜨렸다. 이번 설계 M3 에서 함께 고친다.

## 1. 현재 (운영, Owner 크롬)
| 항목 | 값 |
|---|---|
| 레일 | 0~72 |
| 메신저 전체 | 본문 열 279~1335 (`APP_MAIN_COLUMN_CLASS`, xl 66rem=1056) |
| 좌우 빈 띠 | 72~279, 1335~1542 |
| 목록 칸 | `clamp(360px, 35vw, 470px)` (`MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS`) |
| 대화방 칸 | 목록 오른쪽 ~ 1335 |

원인: `ConditionalAppShell` 의 `mainInnerColumn` 이 모든 화면을 `APP_MAIN_COLUMN_CLASS` 열에 넣는다. 예외는 내정보 주소 흐름뿐이다. 메신저도 이 열에 갇힌다.

## 2. 목표
```
┌──────┬────────────────┬──────────────────────────────────┐
│ 레일 │ 대화 목록       │ 대화방 (나머지 전체)               │
│ 72px │ clamp(360,35vw,470) │                              │
└──────┴────────────────┴──────────────────────────────────┘
```
- PC(DESKTOP 계열 + 세로 레일)에서 `/community-messenger/**` 만 적용한다.
- 휴대폰·태블릿·iPad 메신저(2단 768 기준 포함)는 **무변화**다.

## 3. 결정
| # | 결정 | 근거 |
|---|---|---|
| M1 | `isDesktopSideRail && f.isCommunityMessengerSurface` 일 때 `mainInnerColumn` 을 `w-full min-w-0` 으로 둔다. 기존 내정보 주소 흐름 예외와 같은 방식이다. 요소 종류와 트리는 그대로라 리마운트가 없다 | `ConditionalAppShell.tsx:325` 기존 예외 패턴 |
| M2 | 목록 칸 폭·768 분할 기준·방 화면 계약은 **바꾸지 않는다**. 목록 칸과 상단바는 자기 칸 기준(absolute left-0)이라 열이 넓어지면 그대로 따라온다 | `MessengerSplitTopBar.tsx:46`, `messenger-split-pane-layout.ts` |
| M3 | 메신저 하단 시트 split-list 위치: 레일이 있으면 `left = 레일 폭 + safe-left` 로 바꾼다(M1 이 적용되면 목록 칸이 레일 바로 오른쪽에서 시작). 레일이 없는 태블릿·APK 는 기존 식 그대로 | `app/messenger-home-bottom-sheet.css` |
| M4 | 대화방 안의 시트·오버레이(그룹 초대·멤버·정보 `MESSENGER_GROUP_OVERLAY_SHEET_MAX_W_CLASS`, 가운데 팝업 `.messenger-home-center-sheet-panel`)는 이미 칸 또는 화면 가운데 기준이라 바꾸지 않는다 | 해당 클래스 |
| M5 | FD4 잠금 문서에 해제 범위를 기록한다: 「DESKTOP 계열 메신저 화면의 본문 열 폭 제한」만 해제. 「Messenger 768」(분할 기준)은 유지 | `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md` |

## 4. 바뀌는 파일
| 파일 | 변경 |
|---|---|
| `components/layout/ConditionalAppShell.tsx` | M1 — `mainInnerColumn` 폭 분기 1곳 |
| `app/app-desktop-side-nav.css` | M3 — `html:has(.app-bottom-nav-shell--side-rail)` 아래에서 메신저 시트 split-list 의 `left` 를 레일 폭으로 덮어씀. 기존 파일의 `!important` 미디어 규칙보다 뒤·같은 특이도 + `!important` |
| `lib/layout/__tests__/desktop-side-rail-contract.test.ts` | M1·M3 단언 추가. 휴대폰·태블릿 경로 무변화 단언 |
| `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md` | M5 기록 |

## 5. 영향 화면·호출처
| 화면 | 바뀌는 것 | 깨질 수 있는 것 / 처리 |
|---|---|---|
| 메신저 홈(친구·통화·대화·보관함 탭) | 목록 칸이 레일 바로 오른쪽, 대화방 칸이 창 오른쪽 끝까지 | 대화방 미선택 빈 화면이 넓어진다 — 기존 빈 화면 그대로 |
| 대화방(분할 오른쪽) | 폭이 넓어진다 (1542 창: 약 1000px) | 말풍선 최대폭은 기존 말풍선 클래스가 정한다 → 측정 항목. 입력창은 칸 폭을 따른다 |
| 통화 기록·통화 상세(분할 오른쪽) | 폭 확장 | 같은 칸 구조라 처리 없음, 캡처 확인 |
| 메신저 하단 시트 3종 | M3 로 목록 칸과 정렬 (M0 해소) | 1280·1542 에서 위치 측정 |
| 통화 화면(전체 화면 fixed) | 무변화 | 통화 규정 대상 아님 (위치 CSS 무변경). 통화 코드·서버 무변경 |
| 휴대폰·태블릿·APK·iOS | **무변화** — `isDesktopSideRail` 이 false | 리졸버 테스트 + 계약 테스트 |
| 다른 탭(커뮤니티·거래·배달·내정보) | 무변화 | M1 조건이 메신저 경로만 |

## 6. 검증
- 코드: `typecheck:build`, `typecheck:test`, 변경 파일 eslint, **변경 파일을 참조하는 테스트 전체**(D1 때와 같은 방식).
- 화면 (Owner Mac 크롬, 로그인, 읽기만):
  - 1542·1280 폭에서 메신저 홈, 대화방 1개 열기(**보기만**, 전송 없음), 통화 기록
  - 친구 관리 시트를 열어 위치를 측정하고, 닫기만 한다
- 휴대폰 무변화: 에뮬레이션 375 에서 메신저 하단 탭·전폭 목록.
- NOT_PROVEN 으로 남을 것: Windows 실기, Android·iPhone 실기, 태블릿 가로.

## 7. 롤백
- M1 조건 1줄과 M3 CSS 블록을 되돌리면 현재 상태로 돌아간다.

## 8. 범위 밖 (보고만)
- 배달 탭 768 폭 — Owner 결정 필요 (권장 없음, 배민 미러 계약).
- 커뮤니티·거래 본문 1056 열 — 현행 유지 (읽기 폭 계약).
