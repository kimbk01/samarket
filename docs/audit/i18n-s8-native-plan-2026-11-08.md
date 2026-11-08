# S8 — 네이티브(통화·알림·권한) 문구 언어 계획 (2026-11-08)

> 언어 SSOT S8 · 설계 §3 D3 · 발견 목록 L3·L11. **계획만 — 구현은 Owner 승인 후.**
> 통화 변경 규정(AGENTS.md 「통화 변경 규정」) 적용: 근거는 코드·운영 DB 조회, 통화 변경은 **단계마다 단독 커밋·단독 main 반영**, 검증은 코드 PASS + **실기기 PASS** 둘 다.
> **지원 언어는 한국어·영어 둘뿐이다.** 아래의 「필리핀어 등」은 지원 언어가 아니라, 휴대폰 시스템 언어가 한국어·영어가 아닐 때(예: 필리핀어로 설정된 휴대폰) 계약대로 **영어**가 나오는지 보는 시험 조건이다.
> 조사 기준: main `6ab05d21c`, 운영 DB 읽기 전용(2026-11-08 16:1x PHT).

## 1. 현황 (증거)

### 1-1. iOS

| 위치 | 상태 |
|---|---|
| 권한 문구 (`Info.plist` + `en.lproj`·`ko.lproj/InfoPlist.strings`) | **ko·en 지역화 있음**. `CFBundleDevelopmentRegion = en` → ko·en 외 기기 언어는 영어(계약과 같음). iOS 권한 대화상자는 OS 가 **기기 언어**로 고름 — 앱 안 언어 선택을 따르게 할 수 없음(OS 제약, 예외로 문서화) |
| 통화 화면 Swift — 코드에 박힌 한국어 **55개** | `NativeVideoCallViewController` 15(수락·거절·카메라 전환·음소거·종료·통화 품질 「좋음·보통·나쁨」 등) · `NativeVideoCallUiPresenter` 8 · `NativeCallInAppNotice` 8(「상대방이 현재 통화중입니다」 등) · `IncomingCallCallerIdentity` 6(「수신 통화」, 「님의 전화」 접미사, 「영상통화/음성통화」 **판별용 토큰**) · `NativeVoiceCallViewController` 6 · `DibayVoiceMicrophonePermission` 6(권한 꺼짐 안내·「나중에」「설정」) · `NativeVoiceCallUiPresenter` 5 · `CallKitProvider` 1(「수신 통화」) |
| 영향 | 영어 사용자도 통화 화면·CallKit 수신 이름(「○○님의 전화」)·권한 꺼짐 안내가 **항상 한국어** |

### 1-2. Android

| 위치 | 상태 |
|---|---|
| `res/values/strings.xml` (기본) | 56개 중 **50개 한국어** |
| `res/values-en/strings.xml` | **11개뿐** → 영어 기기에서도 45개가 한국어(기본값으로 떨어짐). 한국어·영어가 아닌 기기 언어(예: 필리핀어 설정 휴대폰)는 기본값 = **한국어**(계약: ko 외 → en 과 다름) |
| Java 코드에 박힌 한국어 **59개 / 11파일** | `DibayNotificationChannelRegistry` 20(알림 채널 이름·설명) · `CallForegroundService` 13(통화 중 상시 알림) · `IncomingCallUiCopy` 10(수신 화면) · `MissedCallNotificationHelper` 3 · `IncomingCallNotificationBuilder` 3 · `DibayNotificationSoundChannelStore` 3 · `MainActivity` 2 · `IncomingCallActionCoordinator` 2 · `FcmPayloadResolver` 1 · `DibayNotificationPresentation` 1 · `DibayAppIconDeliveryAdapter` 1 |

### 1-3. 앱 언어 → 네이티브 전달

- **통로 없음** — 네이티브는 기기 언어(리소스) 또는 한국어 고정. 앱 안에서 고른 언어(계약 §2: 선택 → 없으면 기기 언어)를 네이티브가 모름.
- 앱이 꺼진 상태의 수신(VoIP/FCM → CallKit·Android 수신 화면)은 웹이 실행되지 않으므로, 언어를 쓰려면 **네이티브 저장소에 미리 저장된 값**이 있어야 함.

### 1-4. 웹 통화 코드 (L11)

S6 에서 통화 규정 때문에 제외한 **23파일**(`components/**/call*`·`call-v3`·`call-v4`·수신 배너·`lib/community-messenger/call*`·`lib/call/**`) — 대체 문구 95 · 인라인 표 10 · 언어 삼항 등 남음.

### 1-5. 설치된 앱 (운영 `user_devices`, 활성)

| 플랫폼 | 버전(빌드) | 기기 수 | 마지막 |
|---|---|---|---|
| Android | 1.2.5 (37) = 저장소 현재 | 16 | 11-08 |
| Android | 1.2.5 (24)·(20), 1.2.1 (4), 1.0.1, 1.0 | 9 | 06-19 ~ 11-03 |
| iOS | 1.2 (27) = 저장소 현재 · (23)·(22)·(21) | 12 | 11-07 ~ 11-08 |

## 1-6. 통화·알림 네이티브 문자열 역할 전수 (Owner 지적 반영 — 2026-11-08)

> 「통화 네이티브는 매우 민감 — 수정 목적·결과 모두 확인」(Owner). 통화·알림 경로 네이티브 코드의 한국어 문자열 **114개 전부**를 역할로 나눴다(부록 A).

| 역할 | 개수 | 처리 |
|---|---|---|
| 표시 문구 | 99 | 지역화 리소스로 옮김(문자열만, 분기·타이밍 무변경) |
| 표시 기본값(값이 없을 때 대체) | 4 | 표시 문구와 같게 리소스로 — 조건식은 그대로 |
| **동작 판정(조건 비교)** | **11** (코드 9줄) | **바꾸지 않는다** — 아래 |

동작 판정 9줄·문자열 11개 (문구를 바꾸면 통화 동작이 깨질 수 있는 곳):

| 위치 | 하는 일 | 깨질 수 있는 것 |
|---|---|---|
| Android `IncomingCallUiCopy.containsVideoHint` (73·74) | 푸시 제목·본문에 「영상」 → 영상 통화로 판정 (**`callType` 값이 없을 때만**) | 서버 푸시 문구가 영어가 되면 `callType` 없는 푸시에서 영상 통화가 음성으로 표시 |
| Android `IncomingCallUiCopy.resolveCallerDisplayName` (80) | 서버 본문 「○○님의 전화」에서 「님의 전화」를 떼어 발신자 이름 추출 | 서버 본문이 영어(「○○ is calling」)가 되면 **설치된 구 앱에서 발신자 이름이 문장 통째로** 표시 |
| Android `IncomingCallUiCopy.isCallKindLabel` (92~95) | 「음성 통화」「영상 통화」「DiBay 음성/영상 통화」를 이름이 아닌 통화 종류로 판정 | 같은 값이 이름으로 오인됨 |
| iOS `IncomingCallCallerIdentity` (75·76) | 「영상통화/음성통화」(띄어쓰기 두 형태)를 일반 이름으로 판정 → CallKit 이름 대체 | 같은 값이 CallKit 이름으로 그대로 표시 |

**원칙 (S8 전 단계 공통, 승인 조건)**
1. 동작 판정 문자열은 **수정·번역하지 않는다**. 필요하면 영어 토큰을 **추가만** 한다(구 서버·구 데이터 인식 유지).
2. **서버의 통화 푸시(VoIP/FCM) 제목·본문 형식은 바꾸지 않는다** — 설치된 구 앱(Android 37 등)이 위 판정에 의존. 통화 수신 화면의 언어는 **네이티브가 자기 리소스로** 정한다(서버 문구 아님).
3. 표시 문구 변경은 **문자열만** — 같은 파일의 분기·타이머·식별자·채널 id 는 diff 에 나오면 안 된다(리뷰 기준).

## 2. 목표 (계약 §2 를 네이티브까지)

1. 네이티브 문구 언어 = **앱 언어**(선택값, 없으면 기기 언어; ko 포함 → ko, 그 외 → en). 앱이 꺼진 상태는 **마지막으로 저장된 앱 언어**, 저장값이 없으면 기기 언어.
2. 예외(OS 제약): iOS 권한 대화상자·Android 시스템 권한 화면 = 기기 언어.
3. 문구 원본: iOS `ko.lproj`·`en.lproj/Localizable.strings`, Android `values`(**기본 = 영어**)·`values-ko`. 코드에 화면 문구 0.
4. **판별용 토큰은 문구가 아님** — 예: iOS 「영상통화/음성통화」 일반 이름 판별은 구 서버·구 데이터 호환을 위해 ko·en 토큰 목록으로 유지(표시 문구와 분리).

## 3. 단계 (각 단계 = 단독 커밋·단독 main 반영, 통화 단계는 통화만)

| 단계 | 내용 | 통화 규정 | 바이너리 |
|---|---|---|---|
| **S8-1 언어 저장 통로** | 네이티브 플러그인 `DibayAppLanguage.set({ language: "ko" \| "en" \| null })` — iOS `UserDefaults`·Android `SharedPreferences` 에 저장. 웹 `AppLanguageProvider` 가 언어 결정이 바뀔 때·앱 시작 때 호출(`null` = 기기 언어 따름). **구 바이너리는 플러그인이 없으므로 호출 실패를 조용히 무시**(웹 동작 변화 0) | 통화 코드 아님(문구만 영향) | 새 빌드 필요 |
| **S8-2 Android 기본 리소스 영어화** | `values/strings.xml` = 영어 56/56, `values-ko/strings.xml` = 한국어 56/56 (키 동일). 앱 이름 등 비통화 문구 | 알림 채널 문구 포함 시 알림 규정(원본 규칙 전수 대조·기기 로그 판정) | 새 빌드 |
| **S8-3 통화 화면 문구 (통화 단독)** | iOS Swift 55·Android `IncomingCallUiCopy`·`CallForegroundService`·`IncomingCallNotificationBuilder`·`MissedCallNotificationHelper`·`IncomingCallActionCoordinator` 문구 → 지역화 리소스. 언어 = S8-1 저장값 → 없으면 기기 언어. ~~CallKit 수신 이름 「○○님의 전화」 → en 「○○ is calling」~~ → **§13-0 정정: CallKit 은 이름만 표시, 「님의 전화」는 판정용 — 번역 대상 아님**. 상세 = §13 | **적용** | 새 빌드 |
| **S8-4 알림 채널·부재중 (알림 단독)** | `DibayNotificationChannelRegistry` 20·`DibayNotificationSoundChannelStore` 3·`DibayNotificationPresentation`·`FcmPayloadResolver` — 채널 이름·설명. Android 는 같은 채널 id 로 이름만 다시 등록하면 갱신됨(소리·중요도 설정은 사용자 값 유지 — 새 채널을 만들지 않음) | 알림 규정 적용 | 새 빌드 |
| **S8-5 웹 통화 23파일 (통화 단독, L11)** | S6 와 같은 방법(화면 값이 바뀌지 않는 변환만) — 대체 문구 삭제·`translateBy`·`catalogPair` | **적용** | 웹만 |
| **S8-6 서버 푸시 문구 언어 (L3, Owner 결정)** | 안: `user_devices.app_language` 열 추가(S8-1 이 기기별로 기록) → 서버가 **통화가 아닌** 알림 문구를 기기별 앱 언어로 작성. 없으면 계정 설정 → 없으면 en. **통화 푸시 제목·본문은 제외**(§1-6 원칙 2 — 구 앱 판정 의존) | 통화 발송 경로 포함 시 적용 | DB + 웹·서버 |

## 4. 영향 경로 (S8-3·S8-4·S8-5 공통 점검표)

발신 시작 · 세션 생성 · VoIP/FCM 발송 · iOS CallKit 수신 표시(이름) · Android 수신 화면/전체화면 알림 · 수락/거절/취소/종료/부재중 · 통화 중 상시 알림(Android) · 상태 폴링 · CallKit 종료 신호 · 통화 기록 · 인앱 알림(통화중·거절됨·연결 실패·재연결·네트워크) · 마이크/카메라 권한 꺼짐 안내.
**문구만 바뀌고 분기·타이밍·식별자는 바뀌지 않게** 한다 — 문구 문자열을 조건 비교에 쓰는 곳(예: `IncomingCallCallerIdentity` 토큰)은 표시 문구와 분리해 그대로 둔다.

## 4-1. 수정 목적·결과 확인 (단계별)

| 단계 | 수정 목적 | 바뀌면 안 되는 것 | 결과 확인 (판정 근거) |
|---|---|---|---|
| S8-1 | 앱 언어를 네이티브가 알게 함 | 웹 언어 동작, 구 앱(플러그인 없음) | 단위 테스트(플러그인 없을 때 조용히 생략) · 실기기에서 언어 바꾼 뒤 네이티브 저장값 로그(iOS Console·Android logcat) |
| S8-2 | 영어·기타 언어 기기에서 앱 네이티브 문구가 영어 | 한국어 기기 표시(56/56 그대로) | 리소스 키 ko·en 대칭 검사 · 기기 언어 한국어·영어·그 외(→ 영어) 3조건 화면 캡처 |
| S8-3 | 통화 화면·CallKit·통화 중 알림·인앱 통화 안내가 앱 언어 | **통화 행렬 전체 동작**(연결·종료·거절·취소·재울림 없음·busy·무응답), 발신자 이름, 영상/음성 판정, 통화 기록 | diff 리뷰(문자열 외 변경 0) · 통화 행렬 × 언어 4조건 실기기 — 각 테스트 SHA·설치 버전·발신/세션/VoIP·FCM 발송/표시/연결/종료 시각 기록, 서버 시각은 운영 DB 대조 · 화면 캡처 |
| S8-4 | 알림 채널 이름·설명이 앱 언어 | 채널 id·소리·중요도·사용자가 바꾼 채널 설정 | 기기 시스템 로그로 채널 재등록 결과 확인(같은 id, 설정 유지) · 알림 설정 화면 캡처 |
| S8-5 | 웹 통화 23파일 문구 원본을 카탈로그로 | 화면 값(대체 문구 증명 조건 동일) | S6 와 같은 자동 증명 + 통화 행렬 웹 화면 확인 |
| S8-6 | 통화 아닌 푸시가 기기 앱 언어 | 통화 푸시 형식(제외), 구 앱 알림 | 운영 `notification_deliveries` 대조 · 언어 조건별 수신 캡처 |

어느 단계든 **실기기 FAIL 이면 즉시 중단**하고 통화 정상화를 먼저 한다(통화 규정 6).

## 5. 구 바이너리 호환

- 웹(S8-1 Provider 호출·S8-5)은 구 바이너리에서도 동작해야 함: 플러그인 없음 → 호출 생략. 구 바이너리 네이티브 문구는 지금처럼 한국어로 남음(회귀 아님).
- S8-6 서버: `app_language` 가 없는 기기(구 바이너리) → 계정 설정 → en. **구 바이너리 사용자에게 지금보다 나빠지는 문구가 없도록** 지금 값(profiles/설정)과 같은 순서로 대체.
- 판별 토큰(「영상통화/음성통화」)은 서버가 바뀌어도 구 바이너리가 계속 인식하도록 서버 쪽 값은 바꾸지 않음.

## 6. 회귀 위험

| 위험 | 대응 |
|---|---|
| 수신 화면 문구 리소스 누락 → 빈 문구·키 노출 | 리소스 키 ko·en 대칭 검사(빌드 전 스크립트), 기본값 영어 |
| CallKit 이름 형식 변경으로 연락처 매칭·통화 기록 표시 변화 | 이름(상대 표시명)은 그대로, 접미사 문장만 지역화. 실기기에서 통화 기록 확인 |
| 알림 채널 이름 재등록이 사용자 채널 설정 초기화 | 같은 id 로 이름만 갱신(소리·중요도 미변경) — 기기에서 설정 유지 확인 |
| 앱 꺼짐 상태 언어 = 마지막 저장값이 오래됨(계정 전환 등) | 로그인·로그아웃·언어 변경 때마다 저장. 저장값 없으면 기기 언어 |
| Android 기본 리소스 영어화로 한국어 기기에서 영어가 보임 | `values-ko` 56/56 대칭 — 한국어 기기는 그대로 한국어 |

## 7. 롤백

- 웹(S8-1 호출·S8-5): main 되돌리기 커밋 1개.
- 네이티브(S8-2~4): 이전 빌드 재설치(현재 Android 37·iOS 27). 빌드 번호는 각 플랫폼 1회 증가(네이티브 규정).
- S8-6: 서버는 `app_language` 를 무시하는 이전 순서로 되돌리기(열은 남겨도 무해).

## 8. 실기기 검증 (통화 규정 §5 행렬 × 언어)

**언어 조건 4종**: ① 기기 ko·앱 선택 없음 ② 기기 en·앱 선택 없음 ③ 기기 en·앱 한국어 선택 ④ 기기 언어가 한국어·영어가 아님(예: 필리핀어 설정)·앱 선택 없음(→ 영어).
**통화 행렬**: Android↔iPhone 음성·영상 발신·수신 · 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · 통화 중(busy) · 무응답 타임아웃 · 정상 종료 후 즉시 재발신 — **앱 꺼짐·백그라운드·앞 화면** 각각.
각 테스트: Production SHA·설치 버전(`user_devices.app_version`)·발신 시각·세션 생성·VoIP/FCM 발송(`notification_deliveries`)·수신 화면 표시 문구·연결·종료 시각을 기록(PHT, 서버 시각은 운영 DB 대조).
판정: 코드 PASS / Production 반영 / 실기기 PASS 구분, 측정 안 한 것 NOT_PROVEN.

## 9. Owner 결정 필요

1. **S8 단계 순서·범위 승인** (권장: S8-1 → S8-2 → S8-5(웹, 바이너리 불필요) → S8-3 → S8-4 → S8-6).
2. **S8-6 푸시 언어 기준(L3)** — 기기별 앱 언어 기록 방식 채택 여부.
3. **빌드 시점** — S8-1~4 는 새 바이너리 필요. 네이티브 빌드는 Owner 가 한 번에(일괄) 진행하는 방식 유지 여부.

## 10. S8-1 결과 (언어 저장 통로, 2026-11-08 — Owner 「S8-1 진행」)

| 항목 | 내용 |
|---|---|
| 네이티브 | `DibayAppLanguage.set({ language })` · `get()` — iOS `UserDefaults["dibay_app_language"]`, Android `SharedPreferences("dibay_app_language").language`. 값은 "ko"·"en" 만, 그 외·null = 지움(기기 언어 따름). 정적 읽기 `storedLanguage()` 는 S8-3·S8-4 용 — **이 단계는 저장만, 어떤 화면·통화 동작도 읽지 않음** |
| 등록 | iOS `DibayRootBridgeViewController.makeAppTargetPlugins()` + Xcode 프로젝트 4곳 + 계약 목록(`scripts/ios-app-target-plugins.mjs`), Android `MainActivity.registerPlugin` |
| 웹 | `lib/i18n/native-app-language.ts` — 웹·구 앱(플러그인 없음)은 호출하지 않음, 오류는 삼킴. `AppLanguageProvider` 가 화면 언어 쿠키와 **같은 값**(`displayLanguageCookieValue`)을 바뀔 때만 보냄(동적 import — S1 과 같은 이유) |
| 통화 코드 | 변경 0 (통화 플러그인 등록 계약 `verify:ios-call-package-classlist-contract` PASS) |
| 검증 | 웹 typecheck 2종·eslint·관련 vitest 224·전체 vitest · iOS 시뮬레이터 빌드 **BUILD SUCCEEDED**(새 파일 컴파일) · Android `compileDebugJavaWithJavac` PASS · Android 단위 테스트 2/2 · iOS 등록 계약 PASS(12개) |
| 실기기 | **NOT_PROVEN** — 새 바이너리(Android 38·iOS 28 예정) 설치 후: 언어 바꾸기 → `get()` 또는 기기 로그로 저장값 확인, 로그아웃·계정 전환 시 값 확인. 빌드는 Owner 일괄 빌드 때 |

## 11. S8-2 결과 (Android 기본 리소스, 2026-11-08 — Owner 「S8-2 진행」)

`values/strings.xml` 56개를 사용처로 분류한 결과 **통화 화면 46 · 알림 2 · 번역 안 하는 값 4 · 통화·알림 아님 5**. 기본값을 통째로 영어로 바꾸면 영어 기기의 통화 화면이 바로 바뀌므로(통화 규정 대상), **S8-2 는 통화·알림이 아닌 5개만** 옮겼다. 통화 46 → S8-3, 알림 2(앱 아이콘 요약) → S8-4.

| 항목 | 내용 |
|---|---|
| 바꾼 것 | 웹 화면 연결 실패·화면 다시 불러오기 오류 화면 5개(`dibay_webview_*`) — 기본 `values` = 영어, 새 `values-ko` = 한국어(기존 문구 그대로). 한국어 기기 = 한국어(변화 없음), 그 외 모든 기기 언어 = 영어 |
| 언어 기준 | 이 화면은 웹이 뜨기 전 네이티브 화면이라 **기기 언어**(리소스)를 따른다. 앱 언어(S8-1 저장값)를 따르게 하는 것은 S8-3 방식과 함께 |
| 계약 검사 | `lib/i18n/__tests__/android-strings-locale.test.ts` — values-ko 키는 기본에 있고 기본값은 한글 없음, 기본 values 한글 문자열 45개(통화 44 + 알림 1)는 줄기만 |
| 검증 | Android 리소스 처리·컴파일 PASS, 합쳐진 리소스 확인(기본 영어·values-ko 한국어) |
| 실기기 | **NOT_PROVEN** — 연결된 실기기 2대는 출시 빌드(37)가 설치돼 있어 확인용 설치 시 앱 데이터가 지워지고, 다른 세션이 쓰는 중일 수 있어 쓰지 않음. 에뮬레이터 없음. Owner 일괄 빌드 후 기기 언어 한국어·영어·그 외(→ 영어)에서 비행기 모드로 오류 화면 확인 |

## 12. S8-5 결과 (웹 통화 코드 문구, 2026-11-08 — Owner 「다음으로 이어 가라 · 원하는 부분은 정확히 나오게」)

| 항목 | 내용 |
|---|---|
| 대상 | 통화 웹 파일 31개(수신 배너·통화 화면·통화 기록·인앱 통화 안내·발신 확인·권한 안내 등) |
| 바꾼 것 | 쓰이지 않던 대체 문구 74건 삭제(키가 카탈로그에 있어 **원래 카탈로그 값이 보이던 것** — 증명 조건 S6 와 같음), 인앱 통화 안내 표 10개 → `catalogPair`(값 글자 그대로 새 키 10개, `copy-messenger`) |
| 바뀌지 않은 것 | 분기·타이머·식별자·통화 동작 — 변경 줄 전수 검토(문구·대체 문구·import 외 0). 인앱 통화 안내 모듈은 원래 번역 모듈을 가져오고 있어 새 의존 없음 |
| 화면 문구 | **변화 없음**(이미 카탈로그 값이 보이던 자리). 참고: 지워진 대체 문구 중 카탈로그와 글자가 달랐던 것(예: 「통화 종료」↔화면 「종료」, 「카메라 끄기」↔화면 「카메라 꺼짐」, 「휴대전화」↔화면 「수신 전화」)은 원래도 화면에 나오지 않던 값 |
| 남은 것 | 통화 파일 대체 문구 95 → **21**(변수 키 — 키가 없으면 실제로 쓰여 정적 증명 불가), 인라인 표 10 → **0** |
| 테스트 | 통화 뷰모델 테스트의 가짜 `safeT`(대체 문구 반환) → 실제 카탈로그 번역(기대값 「연결 중」「통화 중」 = 카탈로그 값과 같음) |
| 검증 | typecheck 2종·eslint(오류 0)·`check:i18n`·통화 보호 검사 3종(`call-log-no-hard-delete`·`call-messenger-restore-hard-lock`·`ios-call-package-classlist-contract`)·vitest 전체 |
| 실기기 | **NOT_PROVEN** — 통화 행렬(§8)은 Production 반영 뒤 실기기로. 화면 문구가 바뀌지 않는 변경이라 확인 기준은 「통화 동작·문구가 반영 전과 같음」 |

## 13. S8-3 상세 계획 (통화 화면 문구, 2026-11-08 — Owner 「S8-3 계획 보고」) · **계획만, 구현은 승인 후**

> 조사 기준: main `d7a455e1b`. 근거 = 코드 전수 조사(아래 줄 번호). 통화 변경 규정 §3 문서.

### 13-0. 앞 계획의 잘못 (정정)

| # | 앞 계획 | 사실 (코드 확인) | 정정 |
|---|---|---|---|
| 1 | 부록 A: Android `IncomingCallUiCopy.java:81`, iOS `IncomingCallCallerIdentity.swift:84` 「님의 전화」 = **표시** | 둘 다 서버 본문 「○○님의 전화」에서 **이름을 떼어 내는 판정**(접미사 비교·길이 계산). 화면에 나오지 않음 | **동작 판정 — 바꾸지 않음**. 동작 판정 = 13개 / 11줄 (앞: 11개 / 9줄) |
| 2 | §3: CallKit 수신 이름 「○○님의 전화」 → en 「○○ is calling」 | iOS CallKit 에 넘기는 값은 **이름만**(`displayName`). 「님의 전화」는 화면에 나오지 않음. CallKit 화면의 「DIBAY 오디오…」 등은 OS 가 기기 언어로 표시 | **바꿀 것 없음** — 항목 삭제 |
| 3 | §3: S8-3 에 `IncomingCallNotificationBuilder`·`MissedCallNotificationHelper`·`CallForegroundService` 전부 | 이 파일들의 **알림 채널 이름·설명 6개**(수신 통화·부재중 통화·통화 진행)는 채널 등록 값 | **S8-4(알림 채널)로** — 채널 규정(같은 id·설정 유지)과 함께 한 번에 |
| 4 | §1-2: `MainActivity` 2개를 통화·알림 목록에 | 「연결에 실패했습니다…」는 웹 화면 넘김 덮개(`showHandoffCoverLoadError`) — **통화 아님** | 통화 커밋에 섞지 않고 **S8-2b**(비통화, S8-2 와 같은 방식)로 따로 |

### 13-1. 목적·완료 기준

- **목적**: 통화 화면(수신·음성·영상·작은 창·통화 중 알림·부재중 알림·인앱 통화 안내·권한 꺼짐 안내) 문구가 **앱 언어**로 나온다 — 앱에서 고른 언어(S8-1 저장값) → 없으면 기기 언어(한국어 → 한국어, 그 외 → 영어).
- **완료 기준**: ① 한국어 조건에서 모든 통화 문구가 **지금과 글자 하나까지 같음** ② 영어 조건에서 아래 13-3 의 영어 ③ 통화 동작(연결·종료·거절·취소·재울림 없음·busy·무응답·발신자 이름·영상/음성 판정·통화 기록) 변화 0 ④ §8 실기기 행렬 PASS.

### 13-2. 대상 (전수)

| 플랫폼 | 위치 | 개수 | 처리 |
|---|---|---|---|
| Android | `values/strings.xml` 통화 키 45개 (수신 화면 xml 3·음성/영상 화면·작은 창·통화 안내 9 등 — 사용처 18파일) | 45 | 한국어 그대로 `values-ko` 로, `values` = 영어 (S8-2 와 같은 구조). 사용처 없는 4개(`voice_call_calling`·`voice_call_cancel`·`voice_speaker_on/off`)도 대칭 유지 |
| Android | `CallForegroundService` 299·322·323·333·334·385·404·405·412 | 11 | 리소스 키로 (「%1$s 진행 중 · 탭하여 복귀」처럼 이어 붙이던 문장은 자리표시 포함 한 문장) |
| Android | `IncomingCallNotificationBuilder:722`(DIBAY 통화) · `MissedCallNotificationHelper:47` · `IncomingCallActionCoordinator:290·291`(「○○님의 부재중 통화」) · `FcmPayloadResolver:94`(이름 없을 때 「수신 통화」) | 5 | 리소스 키로 |
| Android | `IncomingCallUiCopy:67·69` (context 가 없을 때만 쓰는 대체값, 판정 토큰과 같은 값) | 2 | **바꾸지 않음** — context 없이는 리소스를 못 읽고, 판정 토큰과 같아야 함 |
| iOS | `NativeVoiceCallUiPresenter` 5 · `NativeVoiceCallViewController` 5 · `NativeVideoCallUiPresenter` 8 · `NativeVideoCallViewController` 13 · `NativeCallInAppNotice` 8 · `DibayVoiceMicrophonePermission` 6 · `CallKitProvider:113` 1 · `IncomingCallCallerIdentity:13` 1 | 47 | 새 `ko.lproj`·`en.lproj/Localizable.strings` 로 |
| 둘 다 | 동작 판정 13개(§1-6 표 + 13-0 #1) | 13 | **바꾸지 않음** |

### 13-3. 언어를 고르는 방식 (새 코드 — 문자열 외 변경은 이것뿐)

| | Android | iOS |
|---|---|---|
| 새 파일 | `DibayNativeLocale.java` — `localized(Context)`: S8-1 저장값(`DibayAppLanguagePlugin.storedLanguage`)이 `ko`/`en` 이면 그 언어로 만든 `createConfigurationContext`, 없으면 받은 Context 그대로(기기 언어 → 기본 영어·`values-ko`) | `DibayNativeCopy.swift` — `text(_ key)`: UserDefaults `dibay_app_language` → 없으면 `Locale.preferredLanguages` 가 `ko` 로 시작하면 ko, 그 외 en → 해당 `.lproj` 번들에서 읽음. 키가 없으면 en 값(빈 문구·키 노출 없음) |
| 바뀌는 호출 | 통화 Activity 3개(`IncomingCallActivity`·`NativeVoiceCallActivity`·`NativeVideoCallActivity`)에 `attachBaseContext` 1줄씩(xml 화면 문구용) · 나머지 `getString` 은 `DibayNativeLocale.localized(ctx).getString(...)` 로 Context 만 바꿈 | 각 문자열 자리를 `DibayNativeCopy.text("key")` 로 |
| 읽는 시점 | **표시할 때마다** 저장값을 읽음(캐시 없음) → 앱 언어를 바꾸면 다음 통화부터 반영. 앱이 꺼진 상태 수신도 마지막 저장값 | 같음 |
| 쓰지 않는 방식 | Android 13 앱별 언어(`AppCompatDelegate.setApplicationLocales`) — 앱 전체 언어를 바꿔 **메인 화면이 다시 만들어져 웹뷰가 새로 고쳐지고**, 웹 언어 계약과 겹침 → 채택 안 함 | 앱 전체 `AppleLanguages` 덮어쓰기 — 재시작 전 반영 안 되고 권한 대화상자 언어까지 바뀜 → 채택 안 함 |
| 프로젝트 파일 | 없음(리소스 폴더 자동) | `project.pbxproj` 에 새 Swift 1개·`Localizable.strings`(ko·en) 등록 (S8-1 과 같은 방식) |

바뀌지 않는 것: 분기·타이머·채널 id·알림 id·Intent·CallKit 보고 순서·판정 토큰. **diff 리뷰 기준**: 문자열 자리 교체 + 위 표의 줄 외에는 0줄.

### 13-4. 영어 문구 (한국어는 지금 값 그대로)

| 한국어 (지금) | 영어 |
|---|---|
| 수락 / 거절 | Accept / Decline |
| DiBay 음성 통화 / DiBay 영상 통화 | DiBay voice call / DiBay video call |
| 음성 통화 수신 / 영상 통화 수신 | Incoming voice call / Incoming video call |
| 음성 통화 수신 중 / 영상 통화 수신 중 (통화 중 알림) | Incoming voice call / Incoming video call |
| 전화 거는 중 … | Calling… |
| 연결 중… | Connecting… |
| 통화 중 / 통화 종료 중 | In call / Ending call… |
| 종료 / 취소 | End / Cancel |
| 스피커 / 영상 | Speaker / Video |
| 스피커 켬 / 스피커 끔 | Speaker on / Speaker off |
| 음소거 / 음소거 해제 | Mute / Unmute |
| 카메라 전환 / 카메라 켬 / 카메라 끔 | Flip camera / Camera on / Camera off |
| 좋음 / 보통 / 나쁨 / 매우 나쁨 (통화 품질) | Good / Fair / Poor / Very poor |
| 통화로 돌아가기 / 통화 화면 줄이기 | Return to call / Minimize call |
| DIBAY 통화 | DIBAY call |
| ○○ · 통화 서비스 유지 중 | ○○ · Keeping the call active |
| ○○ 진행 중 · 탭하여 복귀 | ○○ in progress · Tap to return |
| 음성 통화 / 영상 통화 (통화 중 알림 이름) | Voice call / Video call |
| 부재중 통화 / ○○님의 부재중 통화 | Missed call / Missed call from ○○ |
| 수신 통화 (이름이 없을 때) | Incoming call |
| 인앱 통화 안내 9개 | Android `values-en` 에 이미 있는 영어 그대로(웹 카탈로그와 같은 값) |
| 마이크 권한이 꺼져 있어요 / 카메라 권한이 꺼져 있어요 | Microphone access is off / Camera access is off |
| 음성·영상 통화를 하려면 설정 > DiBaY에서 마이크를 켜 주세요. | To make calls, turn on Microphone in Settings > DIBAY. |
| 영상 통화를 하려면 설정 > DiBaY에서 카메라를 켜 주세요. | To make video calls, turn on Camera in Settings > DIBAY. |
| 나중에 / 설정 | Not now / Settings |

- 한국어 문구 「설정 > **DiBaY**」는 실제 설정 앱 이름(**DIBAY**, `CFBundleDisplayName`)과 다르다 → 이번 단계는 한국어 글자를 바꾸지 않는 원칙이라 **발견 목록 L18** 로 적고 계획 완료 후 처리.

### 13-5. 영향 경로 (통화 규정 §3)

| 경로 | 이 단계의 영향 |
|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송·서버 푸시 문구 | **없음** (서버·웹 코드 무변경) |
| iOS CallKit 수신 | 이름이 없는 수신의 대체 이름만 「수신 통화」→ 영어 조건 「Incoming call」. 이 값은 상대 id 가 하나도 없을 때 CallKit 연락처 값(`remoteHandle`)으로도 쓰임 — 서버는 `callerId` 를 항상 보냄(`fcm-data-payload-contract.ts:274·322`)이라 실제 영향 없음, 실기기에서 통화 기록으로 확인 |
| Android 수신 화면·전체화면 알림·통화 중 알림 | 문구만. 알림 id·채널·Intent·버튼 동작 무변경 |
| 수락·거절·취소·종료·부재중 | 버튼 이름만. 부재중 알림 본문 문장 |
| 통화 화면(음성·영상·작은 창) | 문구·접근성 이름만. Android Activity 3개의 Context 가 언어 Context 로 바뀜(글꼴 크기·다크 등 나머지 설정은 원래 값 복사) |
| 인앱 통화 안내 | 문구만 |
| 통화 기록·상태 폴링·CallKit 종료 신호 | 없음 |
| **설치된 구 앱** (Android 37·iOS 27 이하) | 영향 없음 — 새 빌드를 설치해야 바뀜. 구 앱은 지금처럼 한국어 |

### 13-6. 회귀 위험·대응

| 위험 | 대응 |
|---|---|
| 리소스 키 빠짐 → 빈 문구·키 노출 | 검사 테스트 추가: Android `values`·`values-ko` 통화 키 대칭, iOS ko·en `Localizable.strings` 대칭, 코드가 부르는 키가 모두 있음, 영어 값에 한글 0 |
| 한국어 문구가 지금과 달라짐 | 검사: 새 `values-ko`·`ko.lproj` 값 = 지금 코드·리소스 값 전수 일치(조사표를 테스트 기대값으로) |
| 판정 토큰을 실수로 번역 | 검사: 통화 코드의 한글 리터럴은 판정 토큰 13개 + 대체값 2개 + S8-4 채널 이름 6개만 허용(이 목록 외 0) |
| `attachBaseContext` 변경으로 화면이 안 뜸·잠금 화면 수신 실패 | Activity 3개는 Context 만 감싸고 창 플래그·잠금 화면 설정 코드는 그대로. 실기기 잠금 화면 수신·앱 꺼짐 수신 필수 확인 |
| iOS 번들 읽기 실패 | 실패 시 en 값 → 그래도 없으면 키가 아닌 한국어 기본(지금 값)을 내장 — 빈 화면 없음 |

### 13-7. 롤백

이전 빌드 재설치(Android 1.2.5 (37)·iOS 1.2 (27)). 서버·웹 변경이 없어 서버 되돌리기 불필요. 저장소는 되돌리기 커밋 1개.

### 13-8. 반영·검증 순서

1. **S8-2b** (비통화, 먼저): `MainActivity` 화면 넘김 덮개 문구 2개 → 리소스(기본 영어·`values-ko`). 단독 커밋.
2. **S8-3** (통화 단독 커밋·단독 main 반영): 13-2 ~ 13-4 + 검사 테스트. 로컬 검증 = Android 단위 테스트·`assembleDebug`·iOS 시뮬레이터 빌드·vitest·통화 보호 검사 3종.
3. 빌드 = **Owner 일괄 빌드 때**(네이티브 버전 증가는 그때 1회). 그 전까지 실기기 NOT_PROVEN.
4. 실기기: §8 행렬 × 언어 4조건, 각 테스트 Production SHA·설치 버전·시각·화면 캡처. **FAIL 이면 즉시 중단**하고 통화 정상화 먼저.

### 13-9. Owner 승인 필요

1. 13-0 정정(판정 13개·CallKit 항목 삭제·채널 이름 S8-4·MainActivity S8-2b) 승인.
2. 13-3 언어 고르는 방식(통화 문구만 앱 언어, 앱 전체 언어 변경 방식은 쓰지 않음) 승인.
3. 13-4 영어 문구 승인.

## 14. S8-2b·S8-3 결과 (2026-11-08 — Owner 「승인, S8-2b·S8-3 진행」)

### 14-1. S8-2b (비통화, 단독 커밋 `3ec3edeed`)
`MainActivity.showHandoffCoverLoadError` 문구 2개 → `dibay_handoff_error`·`dibay_handoff_error_with_reason`(기본 영어 · `values-ko` = 이전 코드 글자 그대로). 분기 무변경.

### 14-2. S8-3 (통화 단독 커밋)

| 항목 | 결과 |
|---|---|
| **계획과 다르게 한 것 (먼저 보고)** | ① `FcmPayloadResolver:94`「수신 통화」는 **바꾸지 않음** — 이 값은 화면 문구가 아니라 수신 데이터(`IncomingCallPayload.callerName`)에 들어가 36곳에서 쓰이고, 이 함수에는 Context 가 없어 바꾸려면 함수 형태를 바꿔야 함 → 통화 동작 위험이 문구 이득보다 큼. 서버가 이름을 안 보낼 때만 쓰이는 값. ② iOS 문구 파일 읽기 실패 대비를 「코드 안 한국어 기본값」 대신 **앱 언어 → 영어 → 한국어 문구 파일 순서**로 함(코드에 한국어를 다시 넣지 않기 위함. 키 대칭은 테스트가 보장) |
| Android | 리소스 통화 키 44개: 기본 = 영어, `values-ko` = 이전 값 그대로. 코드에서 옮긴 문구 9키(통화 중 알림·부재중·「DIBAY 통화」). `values-en` 의 인앱 통화 안내 9개는 기본 영어와 같아 삭제(앱 아이콘 2개만 남음 — S8-4). 새 `DibayNativeLocale`(저장값이 기기 언어로 고른 리소스와 다를 때만 그 언어 Context, 같으면 받은 Context 그대로) — 통화 Activity 3개 `attachBaseContext`, 나머지 문구 읽기 21곳은 Context 만 교체 |
| iOS | 새 `ko.lproj`·`en.lproj/Localizable.strings` 37키, 새 `DibayNativeCopy`(저장값 → 없으면 OS 가 고른 지역화 ko/en). Swift 47줄 교체(`static let` → 읽을 때마다 계산하는 `static var`) · `project.pbxproj` 등록(Swift 1·문구 파일 1) |
| 한국어 글자 대조 | iOS: 바뀐 47줄을 키 → 한국어 값으로 되돌려 이전 줄과 **47/47 같음**(스크립트 대조). Android: `values-ko` 44키 = 이전 기본 값(테스트 고정표), 코드에서 옮긴 9키 = 이전 코드 글자(테스트 고정표) |
| 바뀌지 않은 것 | 판정 토큰 13개·대체값 2개(`IncomingCallUiCopy:67·69`)·`FcmPayloadResolver:94`·알림 채널 이름 6개(S8-4) — 테스트 `native-call-copy-locale` 이 허용 목록 외 한글 0 을 강제 |
| 검증 (코드 PASS) | Android 단위 테스트 181개 중 178 PASS + 새 `DibayNativeLocaleTest` 4건 PASS · `assembleDebug` PASS · iOS 시뮬레이터 빌드 PASS(앱 안에 `ko.lproj`·`en.lproj/Localizable.strings` 들어감 확인) · vitest i18n 103 PASS · typecheck:test · eslint · 통화 검사 `call-log-no-hard-delete`·`call-messenger-restore-hard-lock`·`ios-call-package-classlist-contract`·`ios-callkit-caller-identity-contract`·`incoming-call-push-delivery-contract`·`call-v4-structure-lock`·`call-v4-incoming-fsi-fallback-boundary`·`active-call-lifecycle-contract` PASS |
| 이전부터 실패 (이 변경 무관, 발견 목록 L19) | Android `IncomingCallNotificationOwnerPolicyTest` 3건 — S8-2b 이전 코드에서도 같은 3건 실패. `verify:cm-call-lifecycle-contract`·`call-authority-contract`·`cm-call-engine-lockdown`·`native-voice-runtime-contract`·`native-video-runtime-contract`·`android-device-permissions-contract` — 변경 전 트리에서 같은 실패 내용(대조 결과 동일, lockdown 은 빌드 산출물 `.tsbuild` 1줄만 추가) |
| 배포 | 네이티브 — 새 빌드 설치 전까지 사용자 화면 변화 없음. 빌드 = Owner 일괄 빌드 때 |
| 실기기 | **NOT_PROVEN** — §8 행렬 × 언어 4조건(특히 잠금 화면 수신·앱 꺼짐 수신·Activity 3개 화면 표시) |

## 부록 A — 통화·알림 네이티브 한국어 문자열 114개 (역할)

| 위치 | 문자열 | 역할 |
|---|---|---|
| `android:DibayAppIconDeliveryAdapter.java:224` | 읽지 않은 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:32` | 채팅 메시지 | 표시 |
| `android:DibayNotificationChannelRegistry.java:32` | 채팅·메신저 메시지 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:33` | 거래 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:33` | 거래 채팅·거래 상태 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:34` | 주문 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:34` | 스토어·주문 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:35` | 배달 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:35` | 배달·매장 주문 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:36` | 커뮤니티 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:36` | 커뮤니티 활동 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:37` | 공지 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:37` | 공지·마케팅 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:38` | 무음 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:38` | 알림음·진동을 끈 상태의 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:39` | 진동 없는 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:39` | 진동을 끈 상태의 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:41` | 채팅 메시지 | 표시 |
| `android:DibayNotificationChannelRegistry.java:41` | 채팅 메시지 알림 (legacy) | 표시 |
| `android:DibayNotificationChannelRegistry.java:147` | DIBAY 알림 | 표시 |
| `android:DibayNotificationChannelRegistry.java:148` | 메시지 알림 | 표시 |
| `android:DibayNotificationPresentation.java:122` | 나 | 표시 |
| `android:DibayNotificationSoundChannelStore.java:443` | DIBAY 알림 | 표시 기본값(값 없을 때) |
| `android:DibayNotificationSoundChannelStore.java:444` |  · 진동 없음 | 표시 |
| `android:DibayNotificationSoundChannelStore.java:446` |  · DIBAY 알림음 | 표시 |
| `android:FcmPayloadResolver.java:94` | 수신 통화 | 표시 기본값(값 없을 때) |
| `android:IncomingCallActionCoordinator.java:290` | 부재중 통화 | 표시 |
| `android:IncomingCallActionCoordinator.java:291` | 님의 부재중 통화 | 표시 기본값(값 없을 때) |
| `android:IncomingCallNotificationBuilder.java:62` | 수신 통화 | 표시 |
| `android:IncomingCallNotificationBuilder.java:63` | 수신 통화 — UI only (ring via RingOwner, alias  | 표시 |
| `android:IncomingCallNotificationBuilder.java:722` | DIBAY 통화 | 표시 |
| `android:IncomingCallUiCopy.java:67` | DiBay 영상 통화 | 표시 |
| `android:IncomingCallUiCopy.java:69` | DiBay 음성 통화 | 표시 |
| `android:IncomingCallUiCopy.java:73` | 영상 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:74` | 영상 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:80` | 님의 전화 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:81` | 님의 전화 | **동작 판정 — 바꾸지 않음** (§13-0 정정: 이름을 떼는 길이 계산) |
| `android:IncomingCallUiCopy.java:92` | 음성 통화 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:93` | 영상 통화 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:94` | DiBay 음성 통화 | **동작 판정 — 바꾸지 않음** |
| `android:IncomingCallUiCopy.java:95` | DiBay 영상 통화 | **동작 판정 — 바꾸지 않음** |
| `android:MainActivity.java:1738` | 연결에 실패했습니다.  | 표시 |
| `android:MainActivity.java:1739` | 연결에 실패했습니다. 다시 시도해 주세요. | 표시 |
| `android:MissedCallNotificationHelper.java:47` | 부재중 통화 | 표시 기본값(값 없을 때) |
| `android:MissedCallNotificationHelper.java:75` | 부재중 통화 | 표시 |
| `android:MissedCallNotificationHelper.java:76` | 부재중 통화 알림 | 표시 |
| `android:call/CallForegroundService.java:299` | 영상 통화 수신 중 | 표시 |
| `android:call/CallForegroundService.java:299` | 음성 통화 수신 중 | 표시 |
| `android:call/CallForegroundService.java:322` | DIBAY 통화 | 표시 |
| `android:call/CallForegroundService.java:323` |  · 통화 서비스 유지 중 | 표시 |
| `android:call/CallForegroundService.java:333` | 수락 | 표시 |
| `android:call/CallForegroundService.java:334` | 거절 | 표시 |
| `android:call/CallForegroundService.java:385` | 영상 통화 | 표시 |
| `android:call/CallForegroundService.java:385` | 음성 통화 | 표시 |
| `android:call/CallForegroundService.java:404` | DIBAY 통화 | 표시 |
| `android:call/CallForegroundService.java:405` |  진행 중 · 탭하여 복귀 | 표시 |
| `android:call/CallForegroundService.java:412` | 종료 | 표시 |
| `android:call/CallForegroundService.java:642` | 통화 진행 | 표시 |
| `android:call/CallForegroundService.java:643` | 활성 통화 foreground service | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:145` | 마이크 권한이 꺼져 있어요 | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:146` | 음성·영상 통화를 하려면 설정 > DiBaY에서 마이크를 켜 주세요. | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:148` | 카메라 권한이 꺼져 있어요 | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:149` | 영상 통화를 하려면 설정 > DiBaY에서 카메라를 켜 주세요. | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:155` | 나중에 | 표시 |
| `ios:Call/DibayVoiceMicrophonePermission.swift:156` | 설정 | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:135` | 상대방이 현재 통화중입니다. | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:137` | 상대방이 통화를 거절했습니다 | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:139` | 통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요. | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:141` | 통화가 종료되었습니다 | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:143` | 부재중 알림 | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:145` | 다시 연결하는 중… | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:147` | 네트워크 상태를 확인해 주세요. | 표시 |
| `ios:Call/NativeCallInAppNotice.swift:149` | 마이크 권한이 필요합니다 | 표시 |
| `ios:Call/NativeVoiceCallUiPresenter.swift:96` | 음성 통화 수신 | 표시 |
| `ios:Call/NativeVoiceCallUiPresenter.swift:97` | 전화 거는 중 … | 표시 |
| `ios:Call/NativeVoiceCallUiPresenter.swift:98` | 연결 중… | 표시 |
| `ios:Call/NativeVoiceCallUiPresenter.swift:99` | 통화 중 | 표시 |
| `ios:Call/NativeVoiceCallUiPresenter.swift:100` | 통화 종료 중 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:96` | 스피커 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:100` | 영상 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:115` | 음소거 해제 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:115` | 음소거 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:120` | 종료 | 표시 |
| `ios:Call/NativeVoiceCallViewController.swift:223` | 통화 화면 줄이기 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:114` | 영상 통화 수신 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:115` | 연결 중… | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:116` | 통화 중 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:117` | 통화 종료 중 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:118` | 종료 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:119` | 취소 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:120` | 카메라 켬 | 표시 |
| `ios:Call/Video/NativeVideoCallUiPresenter.swift:121` | 카메라 끔 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1029` | 수락 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1030` | 거절 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1035` | 카메라 전환 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1042` | 카메라 켬 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1049` | 음소거 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1056` | 종료 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1199` | 통화 화면 줄이기 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1324` | 카메라 끔 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1324` | 카메라 켬 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1326` | 음소거 해제 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1326` | 음소거 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1699` | 보통 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1703` | 나쁨 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1707` | 매우 나쁨 | 표시 |
| `ios:Call/Video/NativeVideoCallViewController.swift:1711` | 좋음 | 표시 |
| `ios:Push/CallKitProvider.swift:113` | 수신 통화 | 표시 |
| `ios:Push/IncomingCallCallerIdentity.swift:13` | 수신 통화 | 표시 |
| `ios:Push/IncomingCallCallerIdentity.swift:75` | 영상통화 | **동작 판정 — 바꾸지 않음** |
| `ios:Push/IncomingCallCallerIdentity.swift:75` | 음성통화 | **동작 판정 — 바꾸지 않음** |
| `ios:Push/IncomingCallCallerIdentity.swift:76` | 영상 통화 | **동작 판정 — 바꾸지 않음** |
| `ios:Push/IncomingCallCallerIdentity.swift:76` | 음성 통화 | **동작 판정 — 바꾸지 않음** |
| `ios:Push/IncomingCallCallerIdentity.swift:84` | 님의 전화 | **동작 판정 — 바꾸지 않음** (§13-0 정정: 서버 본문에서 이름을 떼는 접미사) |
