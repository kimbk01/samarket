# Android R8 난독화 켜기 계획 (2026-11-15)

> 상태: **Owner 승인 2026-11-15 「승인, 다음 빌드에」** — 다음 네이티브 일괄 빌드 때 §5 순서로 구현 (그 전에는 손대지 않음). 첫 단계적 출시 비율은 계획 기본값 20%.
> (통화 변경 규정 3번 — 통화 네이티브 코드가 같은 빌드에 포함됨)
> 범위: `android/app/build.gradle` release 설정 + `android/app/proguard-rules.pro` 만. 웹·서버·iOS 변경 없음.

## 1. 왜 하는가 (증거)

Play Console 「테스트 및 출시 → 다음 출시 버전을 위한 발견 항목」 (11-15 PHT 직접 확인):

| 항목 | 값 |
|---|---|
| 제목 | DEX 코드 최적화가 기준점 미만입니다 |
| 카테고리 | **난독화(1%)** — 기준 25% |
| 영향 | 「비율이 25% 미만인 앱 카테고리가 있으면 Google Play에서 앱의 공개 상태와 게시 기능이 영향을 받을 수 있습니다」 |
| 대상 | 출시 54 (1.2.7) |
| 해결 기한 | **2027년 2월** |

원인 (코드 확인): `android/app/build.gradle` 107줄 release `minifyEnabled false` → R8 이 아예 돌지 않아 난독화·축소 0. 같은 이유로 Play 업로드 경고 「가독화(mapping) 파일 없음」도 계속 뜬다.

## 2. 무엇을 바꾸는가

| 파일 | 변경 |
|---|---|
| `android/app/build.gradle` | release: `minifyEnabled true`, `shrinkResources true`(선택 — §6 판단), 기본 규칙 `proguard-android.txt` → `proguard-android-optimize.txt` |
| `android/app/proguard-rules.pro` | 아래 §3 keep 규칙 추가, `-keepattributes SourceFile,LineNumberTable` (비정상 종료 줄 번호) |
| (빌드 산출) | `mapping.txt` 를 AAB 와 함께 Play 에 올림 → 「가독화 파일 없음」 경고도 해소 |

버전: 이 변경이 들어가는 다음 설치·배포용 빌드에서 `versionCode` 1회 증가(`native:prepare`). versionName 은 Owner 확인 전 변경하지 않음.

## 3. 깨질 수 있는 곳 — 조사 결과와 keep 규칙

R8 은 「이름으로 찾아 쓰는 코드」를 지우거나 이름을 바꾼다. 앱 네이티브 Java 142개 파일과 의존성을 조사했다 (11-15, main `857e167c4`).

### 3-1. 우리 코드 (직접 확인)

| 위치 | 이름으로 찾는 방식 | 안 지키면 생기는 결함 | 규칙 |
|---|---|---|---|
| `nativevoice/NativeVoiceCallRuntime.java:1296`, `nativevideo/NativeVideoCallRuntime.java:1276` | `Class.forName("com.dibay.app.MainActivity").getMethod("isAppVisibleForIncomingCall")` | **수신 통화 때 앱이 앞 화면인지 판정 실패** → 예외를 삼키면 조용히 틀린 값(수신 화면·알림 분기 오류). 컴파일·테스트로는 안 잡힘 | `-keep class com.dibay.app.MainActivity { public static boolean isAppVisibleForIncomingCall(); }` |
| `MainActivity.java` | `@JavascriptInterface` (웹 → 네이티브 호출) | 웹에서 부르는 메서드가 지워져 기능 무반응 | `-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }` (AGP 기본 규칙 포함 여부는 확인 안 함 — 명시해서 확정) |
| `@CapacitorPlugin` 19개 | 웹이 플러그인 이름·메서드 이름으로 호출 | 플러그인 호출 실패 | Capacitor 내장 규칙이 처리 (§3-2) — 추가 불필요 |
| `nativecall/NativeCallDebugHooks.java:23` | `android.os.SystemProperties` (OS 클래스) | 영향 없음 (OS 클래스는 R8 대상 아님) | 없음 |
| Activity·Service·Receiver | AndroidManifest 등록 | 없음 (AGP 가 매니페스트 클래스 자동 keep) | 없음 |

### 3-2. 라이브러리 내장 규칙 (consumer rules)

| 라이브러리 | 내장 규칙 | 확인 방법 |
|---|---|---|
| Capacitor core 8.4 | 있음 — `extends com.getcapacitor.Plugin { *; }`, `@CapacitorPlugin`·`@PluginMethod`·Cordova 플러그인 keep | `node_modules/@capacitor/android/capacitor/proguard-rules.pro` 원문 확인 |
| Capacitor 플러그인 6개 (app·browser·push-notifications·share·splash-screen·capawesome badge) | 자체 규칙 없음 — Capacitor core 규칙(`extends Plugin`)으로 보호 | 각 `android/build.gradle` 확인 |
| Agora full-sdk 4.6.3 (통화) | 있음 — `-keep class io.agora.**{*;}` (전부 보존) | aar 안 `proguard.txt` 원문 확인 |
| ShortcutBadger 1.1.22 | 있음 (aar 안 `proguard.txt`) | aar 목록 확인 |
| Kakao SDK 2.20.1, Firebase Messaging, Play 서비스 인증, Play App Update, OkHttp 4.12 | **이번 조사로 확정 못 함 (NOT_PROVEN)** | 구현 1단계에서 R8 빌드 경고(`Missing class`)·Kakao 공식 문서 ProGuard 절로 확정 후 필요한 규칙만 추가 |

## 4. 영향받는 경로 (통화 규정 3번 항목)

R8 은 **코드 동작을 바꾸지 않고 이름·미사용 코드만 정리**한다. 결함은 위 「이름으로 찾는 곳」을 놓쳤을 때만 생긴다. 그래서 검증은 그 경로를 모두 실제로 지나가게 한다.

- 통화: 발신 시작 · 세션 생성 · FCM 수신 · Android 수신 화면(IncomingCallActivity) · 앞/뒤 화면 판정(위 리플렉션) · 거절 · 벨 중 취소 · 종료 · 부재중 · 음성/영상 화면 · PiP · 진행 중 통화 알림 · 카메라·마이크·스피커 버튼
- 로그인: 카카오 · Google · (Android Apple 은 웹 흐름)
- 푸시: 일반 알림 수신 · 알림 탭 진입 · 배지 숫자(ShortcutBadger)
- 웹↔네이티브: `@JavascriptInterface` 호출 전부, Capacitor 플러그인 19개 + 공식 6개
- 앱 업데이트 안내(Play App Update), 공유, 브라우저 열기, 연락처
- **설치된 구 바이너리 호환**: 영향 없음. R8 은 새 빌드 안에서만 작동하고, 서버·웹 계약(API·플러그인 이름·메서드 이름)은 그대로다. 구 바이너리(현재 운영 `user_devices` 에 1.2.x 여러 빌드)와 새 바이너리가 같은 서버를 써도 차이 없음.

## 5. 구현 순서 (승인 후)

1. 작업 브랜치에서 §2·§3 반영 → `./gradlew bundleRelease` 로 R8 빌드. **경고·`Missing class` 0 될 때까지** 규칙 보완 (`-dontwarn` 은 원인 확인된 것만).
2. 산출물 점검: `mapping.txt` 생성 · `usage.txt`(지워진 코드)에서 `com.dibay.app` 지워진 항목 전수 확인 · 리플렉션 대상 `isAppVisibleForIncomingCall` 이 남아 있는지 `dexdump`/`apkanalyzer` 로 확인.
3. APK 로 Samsung 실기기 설치 → §7 행렬.
4. PASS 후 PR (통화 변경 규정 4번: 이 변경만 단독 PR) → 자동 병합. 네이티브라 웹 배포 영향 없음.
5. Play 업로드: AAB + mapping 파일. **처음은 단계적 출시 20%** 로 내고 Android vitals 비정상 종료 확인 후 100%.

## 6. 범위 판단

- `shrinkResources true`: 웹 화면은 서버에서 받아 오므로 앱 리소스가 적어 효과가 작다. 리소스를 이름으로 찾는 코드(`getIdentifier`)가 있으면 깨질 수 있어 **1차에서는 끈다** (기준 25% 는 코드 난독화 비율이라 R8 만으로 충족).
- Agora 는 내장 규칙이 전부 보존이라 크기 감소는 거의 없다. 목적은 크기가 아니라 Play 기준(난독화 비율)·mapping 업로드다.
- 발견 항목 나머지 2개(Android 15 넓은 화면, Android 16 방향 제한)는 **이 계획에 넣지 않는다** — 별도 항목.

## 7. 실기기 검증 행렬 (통화 규정 5번)

매 시험마다 Production SHA·설치 버전(`user_devices.app_version`)·발신/세션/FCM/수신 화면/연결/종료 시각 기록, 서버 시각은 운영 DB 대조.

| # | 시험 | 기기 |
|---|---|---|
| 1 | Android → iPhone 음성·영상 발신 | Samsung → iPhone 13 mini |
| 2 | iPhone → Android 음성·영상 수신 (앱 앞 화면 / 뒤 화면 / 꺼진 화면) — **리플렉션 경로** | iPhone → Samsung |
| 3 | 거절 · 벨 중 취소 · 취소 후 지연 푸시 재울림 없음 · busy · 무응답 · 종료 후 즉시 재발신 | 양방향 |
| 4 | 영상 카메라 끄기·마이크·스피커·PiP·진행 중 통화 알림 | Samsung |
| 5 | 카카오·Google 로그인 / 로그아웃 후 재로그인 | Samsung |
| 6 | 일반 푸시 수신·탭 진입·배지 숫자 | Samsung |
| 7 | 공유·브라우저·연락처·앱 업데이트 안내 | Samsung |

하나라도 FAIL → 즉시 중단, 원인 규칙 보완 후 같은 행렬 재시험.

## 8. 롤백

- 코드: `minifyEnabled false` 로 되돌린 커밋 → 새 versionCode 빌드.
- Play: 단계적 출시 중이면 「출시 중지」 후 이전 버전 유지. 100% 뒤라면 새 빌드로만 교체 가능(바이너리는 되돌릴 수 없음) — 그래서 §5-5 단계적 출시.

## 9. 일정

해결 기한 2027년 2월. **다음 네이티브 일괄 빌드 때 함께** 넣는다 (네이티브 빌드는 일괄 — Owner 방침). 단독으로 급히 빌드할 이유 없음.

## 10. Owner 결정 필요

- 이 계획 승인 여부 (통화 네이티브 빌드에 포함되므로 통화 규정상 승인 필수)
- 첫 출시 단계적 출시 비율 (계획 기본값 20%)

## 11. 구현·실기 결과 (2026-11-16)

구현 브랜치 `perf/android-r8-minify` · versionCode 63 · Samsung SM-M156S 에 release APK 직접 설치(`user_devices.app_version` = `1.2.7 (63)` 확인).

### 계획과 달라진 점 (실측으로 확정)

| # | 실측 | 조치 |
|---|---|---|
| 1 | §3 규칙만으로 빌드하면 **시작 직후 종료** — `Unable to create call adapter` (Kakao `AppLifecycleObserver` → Retrofit) | Kakao 공식 문서 「Optional: ProGuard rules」 규칙(모델 필드·Retrofit full mode·OkHttp dontwarn)과 Gson 규칙 추가 |
| 2 | 1 을 고친 뒤에도 **시작 직후 종료** — `Plugin.getPermissionStates` NPE (`getPluginAnnotation()` = null). R8 full mode(AGP 기본)가 `@CapacitorPlugin` 어노테이션을 지움 | `android.enableR8.fullMode=false`(호환 모드) + 어노테이션 보존 규칙 |
| 3 | §5-1 「경고·Missing class 0」 | R8 경고 0 (빌드 로그) |

### 산출물 점검

- `mapping.txt` 생성 · 클래스 5,301개 중 3,853개(72%) 이름 변경 (기존 0%)
- 보존 확인(mapping): `MainActivity.isAppVisibleForIncomingCall` 이름 유지 · `@JavascriptInterface` 9개 메서드 이름 유지 · `@CapacitorPlugin` 19개 클래스 이름 유지

### 실기 행렬 (Samsung R8 빌드, 상대 Xiaomi 1.2.7(61)·iPhone 13 mini 1.2.3(46), 운영 DB 대조)

| # | 시험 | 결과 | 증거 |
|---|---|---|---|
| 1 | Samsung → iPhone 음성 발신·연결·발신자 종료 | PASS | 세션 da3cf4ca: 생성 11:59:08 · 연결 11:59:21 · 종료 11:59:30 `ended_by_caller` |
| 2a | Xiaomi → Samsung 음성 수신 — **앱 앞 화면** (리플렉션 경로) | PASS | 로그 `visibility=foreground owner=native_activity` · 수락 12:03:37 · 연결 12:03:39 · 스피커 켜짐 화면 · 종료 12:03:58 `ended_by_callee` |
| 2b | Xiaomi → Samsung 음성 수신 — **화면 꺼짐** | PASS | 로그 `visibility=locked owner=native_fsi` · 화면 켜지며 수신 화면 · 거절 12:04:48 `declined` · 양쪽 「음성 통화 · 거절」 기록 |
| 2c | Xiaomi → Samsung 영상 수신 — **잠금 화면** | PASS | 로그 `native_video_runtime_incoming visibility=locked` · 연결 12:06:30 · 양쪽 영상 표시 · 종료 12:07:11 `ended_by_callee` |
| 3 | 시작·홈 표시(로그인 상태) | PASS | 캡처 · 종료(FATAL) 0건 |
| — | 앱 뒤 화면(켜진 화면) 수신 · busy · 무응답 · 취소 후 지연 푸시 · PiP · 카메라 끄기 | NOT_PROVEN | 미시험 |
| — | 카카오·Google 로그인/재로그인 · 일반 푸시·배지 · 공유·연락처·업데이트 안내 | NOT_PROVEN | 미시험 (로그아웃 필요 항목은 Owner 계정 상태 보호로 하지 않음) |
