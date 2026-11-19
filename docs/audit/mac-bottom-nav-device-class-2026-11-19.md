# 맥·태블릿에서 세로 메뉴 대신 하단 메뉴가 나오는 결함 — 확인 결과·설계 (2026-11-19 · 승인 대기 · 미구현)

## 1. 증상 (Owner 캡처, 2026-11-19 오전)
- 맥 DIBAY 앱 telRING 화면: 왼쪽 세로 메뉴가 없고 창 아래에 하단 메뉴(HOME·LOUNGE·DIPICK·telRING·MY).
- 설계 v3(2026-11-16)·v6(2026-11-17): 맥·윈도우 = 창 모양과 무관하게 **항상 왼쪽 세로 메뉴**. → **FAIL**.

## 2. 확인한 사실
| # | 사실 | 근거 |
|---|---|---|
| F1 | 오늘(11-19) 메뉴 위치 판정 코드를 바꾼 커밋 없음. 마지막 변경은 11-16 v3·v4, 11-17 v6 | `git log origin/main -- lib/device components/layout/BottomNav.tsx app/app-bottom-nav.css app/app-desktop-side-nav.css components/layout/ConditionalAppShell.tsx` · 오늘 병합 PR 11건 파일 목록 |
| F2 | 11:2x PHT 맥 앱을 새로 실행하면 홈·telRING 모두 왼쪽 세로 메뉴 정상 — Owner 캡처 상태 재현 안 됨 | 맥 앱 화면 캡처 2장 (운영 sha `06d8378`) |
| F3 | iOS·Android 네이티브는 기기 종류를 문서 시작 때 넣어 주지 않는다(`__DIBAY_DEVICE_CLASS__` 를 넣는 코드 없음). 웹은 항상 네이티브 호출로만 판정 | `git grep __DIBAY_DEVICE_CLASS__ -- ios android` 결과 0건 · `lib/device/dibay-device-class-hydrate.ts` `readDibayDeviceClassSync` |
| F4 | 네이티브 호출 전 Capacitor 다리 준비를 **최대 3.5초** 기다리고, 못 받거나 호출이 실패하면 `null` → 기기 = `UNKNOWN` | `lib/device/dibay-device-class-native.ts` `readNativeDibayDeviceClass` · `lib/device/dibay-device-class.ts:211` |
| F5 | `UNKNOWN` 결과도 그 실행(문서) 동안 **고정**된다(`sessionResolved` 에 저장, 다시 묻지 않음). 반대로 첫 그림 단계(`seedDibayDeviceClassSession`)는 `UNKNOWN` 고정을 막고 있어 규칙이 서로 다르다 | `lib/device/dibay-device-class.ts:192-208` |
| F6 | `UNKNOWN` 의 메뉴 = 하단 메뉴. 셸은 판정 결과를 한 번 받으면 다시 묻지 않는다 | `lib/device/dibay-device-profile.ts` UNKNOWN 프로필 · `lib/device/use-dibay-app-shell.ts:29-41` |
| F7 | 같은 고정 값을 관리자 가로 고정(`use-dibay-admin-landscape-route-mode.ts`)·인트로 대상(`LaunchIntroRoot.tsx:119`)·피드(`CommunityFeed.tsx:1468`)도 쓴다 | `git grep resolveDibayDeviceClass\|useDibayAppShellAuthority` |
| F8 | 앱 진입 계측(`/api/telemetry/entry`, `[dibay-entry]`)에는 기기 종류·메뉴 형태가 없다 → Owner 캡처 때 어떤 판정이었는지 **기록으로 확인할 수 없음** | `lib/telemetry/entry-telemetry-contract.ts` |

## 3. 원인 판정
- F4+F5+F6 경로(시작 3.5초 안에 네이티브 판정 실패 → `UNKNOWN` 고정 → 앱을 다시 켤 때까지 하단 메뉴)는 **코드로 확인한 결함**이다(재시도·회복 없음).
- 이 경로가 Owner 캡처의 원인인지는 기록(F8)이 없어 **NOT_PROVEN**. 같은 증상을 내는 다른 경로(맥 창 폭 메타·배율로 창 폭이 최소 폭 아래로 측정되는 경우)도 기록 없이는 배제하지 못한다.

## 4. 설계 (웹만 · 설치된 앱 그대로 적용 · 네이티브·통화 무변경)
| # | 바꿀 것 | 파일 | 바뀌는 동작 |
|---|---|---|---|
| D1 | `UNKNOWN` 을 실행 동안 고정하지 않는다 — `resolveDibayDeviceClass` 는 `UNKNOWN` 이 아닌 결과만 저장(첫 그림 규칙과 같게) | `lib/device/dibay-device-class.ts` | 다음 호출 때 다시 판정 |
| D2 | 판정 실패 시 정해진 횟수만 다시 판정: 1초·2초·4초 뒤 3회 + 앱이 앞으로 돌아올 때 1회. 성공하면 셸이 새 결과를 받아 세로 메뉴로 바꾼다(기존 v5 메뉴 전환 움직임 그대로). 무한 반복 없음 | `lib/device/dibay-device-class.ts` · `lib/device/use-dibay-app-shell.ts` | 하단 메뉴로 굳지 않고 몇 초 안에 세로 메뉴로 회복 |
| D3 | 앱 진입 계측 기존 이벤트(`shellReady`)에 `deviceClass`·`deviceClassSource`·메뉴 형태(`rail`/`bottom`)·창 폭 3개 필드를 더한다 — **새 요청 0건**(같은 이벤트에 필드만) | `lib/telemetry/entry-telemetry-contract.ts` · 셸 계측 송신 지점 | 다음에 하단 메뉴가 나오면 어떤 판정·폭이었는지 운영 로그로 확정 가능 |

### 영향 (같은 단계에서 확인할 것)
- 태블릿(가로=세로 메뉴·세로=하단 탭, v4)·휴대폰(항상 하단)·웹 데스크톱: 판정이 성공하는 지금 동작은 그대로.
- 관리자 가로 고정·인트로 대상·피드: 실패 뒤 재판정으로 늦게 값이 바뀔 수 있음 — 인트로는 이미 시작 판단이 끝난 뒤라 다시 판단하지 않음(현재 동작 유지), 관리자 가로 고정은 성공 시 그때 요청.
- Supabase 요청: 증가 0 (D3 는 기존 계측 1건에 필드 추가).

### 하지 않는 것 (별도 승인 필요)
- 네이티브가 문서 시작 때 기기 종류를 넣어 주기(F3) — 첫 그림부터 정확해지는 근본 개선이지만 iOS·Android 새 빌드가 필요하다.

## 5. 검증
- 코드: 시험 — 네이티브 실패 → `UNKNOWN` 미고정 · 재시도 성공 시 `DESKTOP_MAC` → 세로 메뉴 · 재시도 횟수 3+1 상한 · 판정 성공 기기 동작 불변.
- 실기: 맥 앱 실행 3회(정상 판정) 세로 메뉴 확인 + 운영 로그 `[dibay-entry]` 에 `deviceClass=DESKTOP_MAC`·`rail` 기록 확인. 실패 경로는 실기에서 일부러 만들 수 없어 시험으로만 확인(실기 NOT_PROVEN 로 보고).
