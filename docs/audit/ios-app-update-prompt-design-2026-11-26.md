# iOS 앱 업데이트 안내 · 새 버전 감지 지연 — 설계 (2026-11-26)

상태: **설계 · Owner 승인 대기** (구현·배포 없음)

## 0. Owner 지시 원문

> 원하는 부분은 apk 처럼, 업데이트 시점에 업데이트 안내?? 또는 해당 부분으로 이동 되는 부분이 아니라, 직접 스토어 또는 디바이의 네정보 - 버젼 - 업제이트 해야 하는 부분이다, 아무 것도 하지 않으면,, 업데이트를 하지 않는다

> 일반 적으로 디바이를 위해 일반 적인 회원은 설정을 건딜지 않는다., 기본적으로 업데이트 되어야 하는 부분이다

> 설계 시작 (2026-11-26)

목표: iOS 회원이 아무 설정도 건드리지 않아도 **앱을 열면 새 버전 안내가 뜨고, 「업데이트」 한 번으로 App Store DIBAY 화면이 열린다**. Android 와 같은 체감.

## 1. 확인된 사실 (증거)

모든 시각 PHT. 운영 DB 는 읽기 전용으로 조회했다.

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| F1 | 연결된 iPhone 13 mini 1.2.7 (62), 14 Pro Max 1.2.7 (63) | FAIL (작업자 원인) | `devicectl device info apps`: `builtByDeveloper: true`. Xcode 로 직접 설치한 앱은 App Store 자동 업데이트 대상이 아니다. |
| F2 | App Store 설치로 보이는 기기 | FAIL | `user_devices`: 'BK Kim' 1.2.6 (58), APNs production, 1.2.7 출시 후 52시간 지난 11/26 07:26 에도 1.2.6. 'Ho youn Kim' 은 38시간. |
| F3 | App Store 출시 설정 | 정상 | 1.2.6·1.2.7·1.2.8 모두 「모든 사용자에게 즉시 업데이트」. 7일 점진적 출시를 끈 상태로 출시함(11/19·11/23·11/25 App Store Connect 화면에서 읽은 값). |
| F4 | 앱 열 때 업데이트 안내 | FAIL | `components/platform/AndroidPlayInAppUpdateHost.tsx` 는 `resolveCapacitorShellPlatform() !== "android"` 이면 아무것도 그리지 않는다. iOS 에는 같은 역할의 화면이 없다. iOS 안내는 내정보 › 버전 버튼(`VersionUpdateHistoryEntry.tsx`)과 종 알림 1건뿐이다. |
| F5 | 서버의 새 iOS 버전 감지 | FAIL — **원인 확정** | 아래 1-1 |

### 1-1. F5 원인: Apple 조회 결과가 최대 24시간 캐시됨

- `lib/app-releases/app-release-sources.ts` `collectAppStoreRelease()` 는 `https://itunes.apple.com/lookup?bundleId=com.dibay.ph&country=ph` 를 부른다.
- 이 주소의 응답은 Apple CDN(Akamai)에 `cache-control: max-age=86400`(24시간)으로 캐시된다.
- 07:41 PHT 에 같은 주소를 직접 불러 확인했다.

| 요청 | CDN | 받은 버전 |
|---|---|---|
| 원래 주소 | `TCP_MEM_HIT`, `max-age=31520` | **1.2.7** (옛 값) |
| 같은 주소 + `&_=<임의값>` (2회) | `TCP_MISS` | **1.2.8** (실제 값) |

- 운영 `app_releases` 에 새 버전이 들어온 시각도 이와 맞는다.
  - 1.2.5: 출시 21시간 후
  - 1.2.6: 출시 18시간 후
  - 1.2.7: 출시 22.5시간 후
  - 1.2.8: 07:37 현재 없음
- 예약 작업 `/api/cron/app-releases-sync` 은 설정대로 6시간마다 돌지만(`vercel.json` `0 */6 * * *`, 11/04 이후 변경 없음), 매번 캐시된 옛 응답을 받아 새 버전을 보지 못한 것이다.
- 영향:
  - 내정보 › 버전의 iOS 버튼이 새 버전 출시 후 최대 하루 동안 「최신 버전」으로 나온다.
  - iOS 업데이트 안내 종 알림도 최대 하루 늦게 나간다.

### 1-2. Apple 규칙 (우리가 바꿀 수 없는 것)

- iOS 는 앱이 스스로 업데이트를 내려받거나 설치할 방법을 주지 않는다. Android Play In-App Update 같은 기능이 없다.
- 자동 업데이트는 기본으로 켜져 있다. 하지만 설치 시점은 iPhone 이 정하고, Apple 은 그 시간을 공개하지 않는다(F2 실측: 2일 넘게 안 된 기기 있음).
- 그래서 우리가 할 수 있는 최선은 다음과 같다.
  1. 앱을 열 때 새 버전을 정확히 알아챈다.
  2. 안내를 띄운다.
  3. 「업데이트」를 누르면 App Store DIBAY 화면을 연다. App Store 화면에서 「업데이트」를 한 번 더 누르는 것은 Apple 화면이다.

## 2. 설계

### S1. 서버 감지 지연 수정 (F5)

- 파일: `lib/app-releases/app-release-sources.ts` `collectAppStoreRelease()`
- 변경: 조회 주소에 매번 다른 값 `&_=${Date.now()}` 를 붙여 CDN 캐시를 거치지 않게 한다(1-1 실측으로 효과 확인).
- 그대로 두는 것: 국가 순서(ph→us→kr), 반환 형식, 예약 주기 6시간, 알림 규칙.
- 영향받는 호출처:
  - 예약 작업 `app/api/cron/app-releases-sync`
  - 관리자 수동 동기화 `app/api/admin/app-releases/sync`
  - 기기 보고 `recordStoreConfirmedVersion`
  - 세 곳 모두 같은 함수를 쓰므로 함께 고쳐진다.
- 결과: 출시 후 다음 예약 작업(최대 6시간) 안에 `app_releases` 에 들어간다.
  - 내정보 › 버전 버튼과 종 알림이 정상이 된다.
  - 기기 보고 경로에서는 더 빨리 들어갈 수 있다.
- 운영 Supabase 요청: 늘지 않는다. Apple 호출만 캐시를 거치지 않을 뿐 횟수는 같다.
- 테스트: `lib/app-releases/__tests__/app-release-sources-ios-bundle.test.ts` 에 「주소에 캐시 무효 값이 붙는다」 1건을 추가한다.

### S2. iOS 앱 열 때 업데이트 안내 (F4)

**새 파일**
- `components/platform/IosAppStoreUpdateHost.tsx` (client)
- `lib/platform/ios-app-store-update-policy.ts` (순수 함수)
- 테스트 1개

**마운트**
- `components/layout/MainAppProviderTree.tsx` 에서 `AndroidPlayInAppUpdateHostLazy` 바로 옆에 같은 `dynamic()` 방식으로 넣는다.
- iOS 네이티브가 아니면 즉시 `null` 을 그린다. 웹과 Android 는 바뀌지 않는다.

**새 버전 확인 방법**
- 기기가 Apple 공개 조회를 직접 부른다: `https://itunes.apple.com/lookup?bundleId=com.dibay.ph&country=ph&_=<now>`.
- `access-control-allow-origin: *` 를 확인했으므로 앱 WebView 에서 부를 수 있다.
- 이 방식을 고른 이유: **운영 Supabase 요청 0건**. 서버 API(`/api/me/app-releases`)를 쓰면 앱을 열 때마다 DB 조회가 생겨 요청 예산(`docs/request-budget-ssot.md`)을 늘린다.
- 설치 버전은 기존 `getCapacitorAppInstalledVersion()` 으로 읽는다.
- 비교는 기존 `compareVersionNames`(`lib/app-releases/app-release-version.ts`, 서버 전용 import 없음)로 한다. 조회 버전이 더 높을 때만 안내한다.
- 조회 실패, 시간 초과(5초), 결과 없음은 안내하지 않는다. 「최신」으로 꾸미지 않고 조용히 넘어간다. 다음 실행 때 다시 확인한다.

**언제 확인하나**
- Android 규칙을 그대로 쓴다(`lib/platform/android-play-in-app-update-orchestrator.ts`).
  - 앱을 처음 열 때: 8초 뒤
  - 다시 앞으로 올 때: 30분에 1번까지(`COOLDOWN_MS`)
  - 한 번 실행에 자동 안내 최대 2번(`MAX_AUTO_PROMPTS_PER_SESSION`)

**언제 띄우지 않나 (기존 안전 규칙 재사용)**
- `lib/platform/android-play-update-prompt-gate.ts` 의 `readUpdatePromptSafetyInput` / `resolveUpdatePromptSafety` 를 그대로 쓴다.
  - 시작 인트로 중
  - 채팅방·통화·결제·글쓰기 화면
  - 다른 팝업이 열려 있을 때
  - 글자 입력 중
  - 앱이 뒤에 있을 때
- 통화 중 판정: `lib/call/active-call-session.ts` `getActiveCallSessionCallId()` 를 **읽기만** 한다. 통화 코드는 바꾸지 않는다(통화 변경 규정 1번 적용 대상 아님. 읽기 전용 import 1줄 — §4 에 명시).
- 안전하지 않으면 안내를 버리지 않고 대기했다가 안전해질 때 띄운다. Android Host 와 같은 동작이다.

**화면**
- Android 업데이트 화면(`AndroidPlayUpdateScreen`)의 「안내」 단계와 같은 모양을 쓴다.
  - 로고, 「새 버전이 있습니다」 제목, 설명, 현재 버전 → 새 버전
  - 버튼은 「업데이트」·「나중에」 2개
- Android 화면 파일은 고치지 않는다(Android 업데이트 hard-lock). 새 iOS Host 안에서 같은 문구 키(`settings_update_screen_title`·`settings_update_screen_desc`·`settings_version_current_label`·`settings_version_new_build_label`·`settings_version_install_later`)와 같은 클래스를 쓴다.
  - 진행률·크기 표시는 넣지 않는다. iOS 는 다운로드를 App Store 가 한다.
- 문구: 기존 키를 우선 쓴다. 「업데이트」 버튼은 기존 `app_updates_update_now` 를 쓴다. 새 키가 필요하면 `lib/i18n/catalog/*` 에 ko·en 을 함께 넣는다(i18n SSOT).

**버튼 동작**
- 「업데이트」: `https://apps.apple.com/ph/app/id6831952401` 을 `window.open(url, "_system")` 으로 연다. 내정보 › 버전 iOS 버튼과 같은 방식이다. 안내는 닫는다.
- 「나중에」: 같은 버전은 24시간 동안 자동 안내하지 않는다. Android `DEFERRAL_SUPPRESS_MS` 와 같고, localStorage 를 쓰며 읽기·쓰기 실패는 무시한다.
- 강제 업데이트(「나중에」 없음)는 이번 범위에 넣지 않는다 → **Owner 결정 필요** (§5).

### S3. 내정보 › 버전 화면

- 코드 변경 없음. S1 로 서버 값이 정확해지면 기존 버튼이 맞게 나온다.

## 3. 바뀌지 않는 것

- Android 업데이트 화면·Host·정책 파일. hard-lock 이라 import 만 한다.
- 통화·메신저·알림 발송 규칙
- 네이티브(`ios/**`·`android/**`)
- 앱 빌드 번호와 스토어 심사. **웹만 바꾼다.** 배포 후 앱을 다시 열면 바로 적용된다.

## 4. 영향·위험·대응

| 위험 | 대응 |
|---|---|
| 출시 직후 Apple 조회는 새 버전인데 그 기기 App Store 에는 아직 「열기」로 보일 수 있다(Apple 반영 시차, 확인 못 함) | 실기 검증 항목 V4 로 확인한다. 시차가 실제로 있으면 「조회 버전이 처음 보인 뒤 N시간 지나서 안내」를 추가 설계로 올린다. 지금은 추측으로 넣지 않는다. |
| 앱을 열 때 화면 위에 팝업이 하나 더 생긴다 | 기존 안전 규칙으로 인트로·채팅·통화·다른 팝업과 겹치지 않게 한다. |
| Apple 조회 차단·지연 | 5초 시간 초과, 실패 시 아무것도 하지 않는다. |
| 통화 상태 읽기 | 읽기 전용 getter 1개만 import 하고 통화 파일은 바꾸지 않는다. 그래도 통화 쪽 영향이 걱정되면 통화 중 판정을 빼고 「통화 화면 경로」 판정만 쓸 수 있다 → 기본은 getter 사용. |
| 운영 Supabase 요청 | 늘지 않는다. S1 과 S2 모두 Apple 호출만 한다. |

**롤백**
- S2: `MainAppProviderTree` 의 마운트 1줄을 되돌린다. 급하면 Instant Rollback.
- S1: 캐시 무효 값 1줄을 되돌린다.

## 5. Owner 결정 필요

1. **강제 업데이트**(「나중에」 없이 꼭 업데이트해야 쓰게 하기)를 iOS 에도 둘지. 기본안은 두지 않고, Android 와 같은 일반 안내만 한다.

## 6. 검증 계획

**코드 검사**
- `typecheck:build`
- 관련 vitest
  - 정책 순수 함수: 버전 비교, 대기·24시간 미룸, 실패 시 안내 없음
  - S1 주소 테스트
- 변경 파일 eslint
- `check:i18n-quality`

**실기 검증** (App Store 설치본 iPhone 필요 — 연결된 2대는 Xcode 설치본이라 먼저 지우고 App Store 에서 다시 설치해야 함)

| # | 확인 | 조건 |
|---|---|---|
| V1 | 구버전 설치본에서 앱을 열면 8초 뒤 안내가 뜬다 | App Store 구버전 설치. 시험용으로 실제 구버전을 받기 어려우면 다음 출시 때 확인한다. |
| V2 | 「업데이트」를 누르면 App Store DIBAY 화면이 열리고, 거기서 「업데이트」가 보인다 | 같은 기기 |
| V3 | 「나중에」 후 24시간 동안 다시 뜨지 않는다 | 같은 기기 |
| V4 | 출시 직후 App Store 반영 시차 | 다음 iOS 출시 당일 |
| V5 | 최신 설치본에서는 뜨지 않는다 | 1.2.8 (64) App Store 설치본 |
| V6 | 채팅방·통화 중에는 뜨지 않고, 나온 뒤에 뜬다 | 같은 기기 |
| S1 | 다음 iOS 출시 후 6시간 안에 운영 `app_releases` 에 새 버전 행이 생긴다 | 운영 DB 읽기 조회 |

- 앱 실행 횟수는 실기기 상한(10회)을 지키고, 결과 보고에 적는다.
- 현재 상태에서 바로 확인할 수 있는 것은 V5·V6 이다. V1·V2 는 구버전 App Store 설치본이 있어야 한다.
  - 'BK Kim' 폰(1.2.6, App Store 설치로 보임)이 있으면 V1·V2 를 지금 확인할 수 있다.

## 7. PR 구성

- 웹 PR 1개: S1 + S2 + 테스트 + 이 문서
- 도메인: 앱 업데이트(통화·메신저 혼합 없음)
- 배포 구분: **웹** — 배포 후 앱 재시작
