# 스테이징 · 개발용 앱(DIBAY 개발) 설계 (Owner 2026-11-10)

Owner 지시: 「3단계 진행」(개발 서버·운영 서버 구분) → 「푸시 끄고 진행」(개발용 앱은 푸시·통화 등록 없이).
단일 배포 규칙: `AGENTS.md` 「개발 프로세스」 2번 (main 반영 = 스테이징, Promote = 운영).

## 1. 용어

| 이름 | 주소 | 누가 보나 |
|---|---|---|
| 운영(Production) | `https://samarket.vercel.app` | 회원 전체 — 스토어 APK·iOS·Windows 앱, 웹 |
| 스테이징(Staging) | `https://samarket-git-main-kimbk01s-projects.vercel.app` (최신 main) · 배포 고유 주소 | Vercel 팀원 로그인(브라우저) · USB 설치 「DIBAY 개발」 앱 |

스테이징 화면은 주황 테두리 + 상단 「스테이징 · 회원 미공개 · SHA」(`components/platform/StagingDeployMarker.tsx`).

## 1-1. 스테이징 빌드 = 요청할 때만 (2026-11-10)

main 에 올려도 스테이징은 자동으로 바뀌지 않는다. 「DIBAY 개발」에 최신 main 을 보이려면 Vercel 화면 버튼(Deployments → Create Deployment · main)으로 빌드한다(`AGENTS.md` 「개발 프로세스」 2번). git `[vercel build]` 요청은 폐지(Owner 2026-11-10).

## 2. 푸시·통화 영향 (통화 변경 규정 3번 — 영향 분석)

- 스테이징·개발용 앱도 **운영 DB·운영 환경변수**를 쓴다.
- 기존 동작: 앱·웹이 열리면 `/api/me/devices/register`(FCM·APNs·VoIP 토큰) · `/api/me/push/subscribe`(웹 푸시)로 운영 `user_devices`·웹 푸시 구독에 저장 → 같은 계정의 통화·알림 발송 대상이 됨.
  - iOS 개발용 앱(`com.dibay.ph.dev`)은 서버 APNs topic(`APNS_TOPIC` = `com.dibay.ph`)과 달라 발송 실패 → 실제 통화 발송 기록에 오류가 섞임.
  - Android 개발용 앱은 같은 Firebase 프로젝트라 통화 벨이 개발용 폰에도 울림.
- **변경**: 두 등록 경로가 인증 직후 요청 주소(host)를 보고, 스테이징이면 저장 없이 `{ ok: true, skipped: "staging_host" }` 반환 (`lib/push/device-register/staging-host-push-register-skip.ts`).
  - 운영 주소·로컬: 코드 경로 무변경(검사만 추가, `null` 반환 후 기존 그대로).
  - 발송(dispatch)·통화 세션·VoIP·CallKit·수신 화면·취소/거절/종료·상태 폴링: **무변경**.
  - 설치된 구 바이너리: 운영 주소로만 등록하므로 영향 없음.
- 롤백: 이 커밋 되돌리기(두 route 의 3줄 + 도우미 파일).
- 검증: 단위 테스트(주소별 판정·두 route 호출 위치) + Promote 후 운영 앱의 `user_devices.last_seen_at` 갱신 계속되는지(운영 DB 조회).
- 남는 한계: 개발용 앱·스테이징에서는 알림·통화 수신을 시험할 수 없다 → 통화·푸시 실기는 Promote 후 스토어 앱으로 한다.

## 3. 개발용 앱 식별자

| | 운영 앱 | 개발용 앱 |
|---|---|---|
| Android | `com.dibay.app` | `com.dibay.app.dev` (build type `staging`) |
| iOS | `com.dibay.ph` | `com.dibay.ph.dev` |
| 이름 | DIBAY | DIBAY 개발 |
| 서버 주소 | `samarket.vercel.app` | 스테이징 주소(최신 main) |
| 설치 | 스토어 | USB(Android Studio·Xcode)만 |

## 4. Android 「DIBAY 개발」 만들기·설치 (2026-11-10 구현)

```
cd android && ./gradlew assembleStaging
adb -d install -r app/build/outputs/apk/staging/app-staging.apk
```

- build type `staging` (`android/app/build.gradle`): `com.dibay.app.dev` · 이름 「DIBAY 개발」(`src/staging/res`) · 디버그 키 서명.
- `generateDibayStagingCapacitorConfig`: cap sync 결과 `capacitor.config.json` 을 복사해 `server.url` = 스테이징 주소(+ Vercel 보호 우회 값), `allowNavigation` 에 vercel.com 추가. 운영 assets 무변경(`mergeReleaseAssets` 결과 url = samarket.vercel.app 확인).
- Vercel 보호 우회 값: `android/local.properties` 의 `DIBAY_STAGING_BYPASS_SECRET`(Git 금지 · Owner 허용 2026-11-10). 없으면 앱이 Vercel 로그인 화면에서 막힌다.
- 콘솔 등록(운영 설정은 그대로, 개발용만 추가): Firebase `com.dibay.app.dev` · 카카오 네이티브 앱 키 「DIBAY 개발 (USB 설치 전용)」 · Google OAuth Android 클라이언트 「DIBAY 개발 (USB 설치 전용)」(디버그 키 SHA-1).
- 한계: 푸시·통화 수신 없음(§2). 앱 내부 네이티브 HTTP(통화·알림음 설정 등)는 쓰지 않는 전제.

## 5. iOS 「DIBAY 개발」 만들기·설치 (2026-11-10 구현)

```
bash scripts/ios-staging-dev-build.sh device      # USB 로 연결된 iPhone (개발자 모드 켜기 필요)
bash scripts/ios-staging-dev-build.sh simulator   # 켜진 시뮬레이터
```

- 운영 iOS 프로젝트(`ios/App`)는 바꾸지 않는다. 스크립트가 최신 origin/main 을 임시 폴더에 꺼내 **사본에서만** 앱 ID `com.dibay.ph.dev`(푸시 확장 `com.dibay.ph.dev.DibayPushServiceExtension`) · 이름 「DIBAY 개발」 · 카카오 개발용 키 · 서버 주소(스테이징 + 보호 우회)를 바꿔 Debug 로 빌드·설치한 뒤 사본을 지운다.
- Capacitor iOS 는 server.url 전체(우회 값 포함)로 시작하는 주소만 앱 주소로 본다 → 스테이징 주소를 `allowNavigation` 에 넣어야 Vercel 이 우회 쿠키를 심고 `/` 로 보낼 때 Safari 로 새지 않는다.
- 앱 ID·프로비저닝은 `-allowProvisioningUpdates`(자동 서명, 팀 ATB959PF9V)가 처음 실기 빌드 때 만든다.
- 실기: 시뮬레이터(iPhone 17 Pro) PASS 10:43 PHT. 실제 iPhone 은 기기 「설정 → 개인정보 보호 및 보안 → 개발자 모드」 켜기가 필요하다.
