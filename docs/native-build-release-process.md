# DIBAY 네이티브 빌드·배포 규정 (SSOT)

> 적용 대상: 모든 작업자(Owner·Claude 클라우드·Claude 로컬·Cursor). 작업 수가 늘어도 이 순서를 생략하지 않는다.
> 강제 장치: `npm run native:prepare`(로컬 빌드 준비 + 빌드 번호 가드) · CI `native-version-bump` 잡(분류·번호 역행 차단) · `user_devices.app_version`(설치 확인).

## 0. 왜 이 규정이 있는가 (2026-10-17 사고)

- 사진첩 저장 네이티브 코드(`saveImages`)는 10/15 main 에 들어갔지만, Owner 기기에는 **71커밋 뒤처지고 로컬 수정이 남은 Mac 폴더**로 빌드한 앱(iOS `1.0`, Android 저장소에 없는 `1.0.1`)이 설치되어 있었다.
- 웹은 Vercel 로 바로 바뀌었기 때문에 "코드는 고쳤는데 폰에서는 안 된다"가 반복되었고, 설치된 앱 버전을 먼저 확인하지 않아 웹 코드를 여러 번 잘못 수정했다.
- 네이티브 변경 3건(`2e159893`, `874ef731`, `84754c3d`)이 빌드 번호를 올리지 않아 설치본을 구분할 수 없었다.

## 1. 변경 분류 — 모든 작업에서 먼저 판정

DIBAY 앱은 Capacitor 셸이 `https://samarket.vercel.app` 을 불러오는 구조다(`capacitor.config.ts` `server.url`).

| 분류 | 경로 | 반영 방법 |
|---|---|---|
| **웹만** | `app/` `components/` `lib/` `hooks/` `messages/` `public/` `supabase/` 등 | main 반영 → Vercel Production 배포 → **앱 재시작만** |
| **네이티브** | `android/**` · `ios/**` · `capacitor.config.ts` · `package.json` 의 Capacitor 의존성(`@capacitor/*`, `@capawesome/*`, `*capacitor-*`) | 위 + **APK·iOS 재빌드·재설치** |

- `.md` 와 sync 생성 파일(`capacitor-www/**`, `ios/App/App/public/**`, `lib/build/generated-app-build-fingerprint.ts`, 지문 키만 바뀐 `Info.plist` 등)은 네이티브 변경이 아니다.
- 판정은 사람이 하지 않는다: `npm run verify:native-version-bump` 첫 줄이 `[배포 구분]` 을 출력한다(로직: `scripts/lib/native-release.mjs`).

## 2. 빌드 번호 = 설치·배포할 빌드를 만들 때 1회 증가 (빌드 시점 강제)

- 네이티브 변경 커밋마다 번호를 올리지 않는다. **설치·스토어용 빌드를 만들 때**, 마지막 번호 증가 이후 네이티브 변경이 있는 플랫폼만 올린다.
  - Android → `android/app/build.gradle` 의 `versionCode` +1
  - iOS → `ios/App/App.xcodeproj/project.pbxproj` 의 `CURRENT_PROJECT_VERSION` **4곳 모두** +1 (App·푸시 확장 × Debug·Release, 값 동일)
  - 공통(`capacitor.config.ts`, Capacitor 의존성) → 둘 다
- 번호 증가는 main 커밋으로 올린 뒤 빌드한다. 사용자에게 보이는 릴리스면 `versionName` / `MARKETING_VERSION` 도 올린다(선택). **로컬에서 버전을 임의로 바꿔 빌드하지 않는다**(예: 저장소에 없는 `1.0.1`).
- 강제: `npm run native:prepare` 가 `verify:native-version-bump --release` 로 확인 — 플랫폼별 마지막 번호 변경 커밋 이후 네이티브 변경이 있는데 번호가 그대로면 **빌드 전에 중단**(같은 번호로 다른 바이너리가 설치되는 것 방지). GitHub `Native build` 워크플로도 같은 검사를 한다 — 수동 실행(설치·배포용 산출물)은 미증가 시 실패, main push(컴파일 검증)는 경고만 하고 서명 Release APK 를 만들지 않는다.
- CI `native-version-bump` 잡(커밋 단위): `[배포 구분]` 출력 + 번호 역행·iOS 4곳 불일치만 실패. 네이티브 변경에 번호 증가가 없어도 실패하지 않는다.
- 빌드 시점: APK = 실기기 설치 검증이 필요할 때 · AAB = Google Play 새 버전 등록 때 · iOS = 실기기 검증·TestFlight·App Store 때만. 웹·DB 수정마다 빌드하지 않는다. 스토어 업로드 ≠ 출시 — 출시는 Owner 승인.

## 3. 보고 형식 — 모든 작업 보고의 첫 줄

```
[배포 구분] 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)
[배포 구분] 네이티브 — 재빌드·재설치 필요: Android 1.2 (versionCode 4) / iOS 1.2 (build 5)
```

`npm run verify:native-version-bump` 출력 첫 줄을 그대로 쓴다. 네이티브면 Owner 에게 §4 를 요청한다.

## 4. 로컬(Mac) 빌드 절차 — 이 외의 방법으로 빌드하지 않는다

```
cd /Users/bkkim/projects/samarket
npm run native:prepare
```

한 플랫폼만 빌드할 때: `npm run native:prepare -- --ios-only` (iOS 빌드 번호 가드만) · `-- --android-only` (Android 가드만·iOS sync 생략). 해당 준비로는 그 플랫폼만 빌드한다 — 다른 플랫폼은 자기 옵션으로 다시 준비.

`native:prepare` 가 하는 일 (실패하면 STOP 하고 원문 보고):
1. 브랜치가 `main` 인지, 사람이 만든 미커밋 변경·`android/`·`ios/` 아래 미추적 파일이 없는지 확인
2. `origin/main` 과 정확히 같게 맞춤(뒤처지면 fast-forward, 앞서거나 갈라지면 중단)
3. `npm ci` → Production `server.url` 로 `cap sync`(Android + macOS 면 iOS)
4. 빌드 SHA 와 목표 버전 출력

그다음:
- iOS: `open ios/App/App.xcodeproj` → iPhone 선택 → Product > Clean Build Folder → Run (General 탭 Version/Build 가 출력과 같은지)
- Android: `cd android && ./gradlew assembleRelease && adb -d install -r app/build/outputs/apk/release/app-release.apk`

금지: 오래된 폴더/다른 브랜치/미커밋 변경 상태에서 Run, 로컬에서 버전 임의 수정, Cursor 샌드박스에서 `npm ci`(권한 문제 — 일반 터미널 사용).
iOS Run 차단 (2026-10-30~, iOS build 18~): App 타깃 첫 빌드 단계 「DIBAY Build Source Guard」(`ios/scripts/verify-build-source.sh`)가 매 빌드마다 `origin/main` 을 받아, 이 폴더 HEAD 에 `origin/main` 의 마지막 iOS 네이티브 변경(`ios/`·`capacitor.config.ts`)이 없으면 빌드를 실패시킨다(설치 안 됨). 원인 사고: 10-30 07:49 PHT 기본 체크아웃(구 브랜치·빌드 11) Xcode 창에서 Run → 설치된 1.2 (17) 위에 1.2 (11) 덮어씀. 이 단계가 없는 옛 브랜치·옛 폴더는 막지 못하므로 기본 체크아웃은 항상 `main` 에 둔다.
로컬 변경이 필요하면 main 에 커밋·푸시(`AGENTS.md` 「개발 프로세스」) 후 다시 §4.
Mac 에서 Claude 가 직접 수행해야 하면 Owner 가 `claude remote-control` 을 켠다(그 세션이 §4 를 실행).

## 5. 설치 확인 — Owner 에게 "빌드했나요?" 묻지 않는다

- 앱이 열리면 기기 등록으로 `public.user_devices.app_version` 에 **`버전 (빌드)`** 가 기록된다(예: `1.2 (4)`; 이 규정 이전 기록은 버전만).
- 작업자가 직접 조회한다:
  ```sql
  select platform, push_provider, app_version, last_seen_at
  from public.user_devices
  where last_seen_at > now() - interval '2 hours'
  order by last_seen_at desc;
  ```
- 목표 버전·빌드가 보이면 설치 완료. 안 보이면 설치 단계에서 막힌 것 — 그 단계의 화면만 요청한다.

## 6. 실기기 이슈 진단의 첫 단계

"폰에서 안 된다" 보고를 받으면 코드를 고치기 전에 **반드시**:
1. §5 쿼리로 해당 기기의 설치 버전·빌드 확인
2. main 의 목표 버전(`npm run verify:native-version-bump` 의 head 값)과 비교
3. 다르면 원인은 "구 바이너리" — 코드 수정 금지, §4 설치 후 재확인
4. 같을 때만 웹·네이티브 코드 원인 분석으로 넘어간다

## 7. PASS 기준

- 웹 변경: Production 배포 완료 + 기능 확인
- 네이티브 변경: `native:prepare`(빌드 번호 가드 포함)·Native build 통과 + §5 에서 목표 빌드 설치 확인 + 실기기 기능 확인
- 하나라도 없으면 `NOT_PROVEN`.

## 변경 이력

- 2026-10-17: 최초 제정(사진 저장 사고). `native:prepare`, CI `native-version-bump`, `app_version` 에 빌드 번호 기록.
- 2026-10-20: 브랜치·PR 전제 제거 — main 직접 반영(`AGENTS.md` 「개발 프로세스」), 빌드 번호 작업당 1회, 빌드 시점(APK·AAB·iOS) 명시.
- 2026-10-20 (Owner 승인): 빌드 번호 증가를 커밋 단위 CI 강제 → 빌드 시점(`native:prepare` → `--release`) 강제로 이동. CI 잡은 분류·역행·불일치만 검사.
- 2026-10-26 (Owner 승인): `--ios-only` 추가 — iOS 만 빌드할 때 Android 빌드 번호 가드를 함께 요구하지 않음(`--android-only` 와 대칭). 각 플랫폼 가드 자체는 유지.
