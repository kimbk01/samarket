# 문서 N — Cursor 실행 프롬프트: 배포 확인 + APK·iOS 빌드 확인·진행 (배달 오너 최종 마무리)

> 사용법: Mac(`/Users/bkkim/projects/samarket`) Cursor 에서 아래 「프롬프트」 블록 전체를 붙여 넣는다.
> 빌드 명령(`npm run native:prepare`, gradle, Xcode)은 **Cursor 샌드박스가 아닌 일반 터미널**에서 실행한다(`docs/native-build-release-process.md` §4 — 샌드박스 `npm ci` 금지).

## 작성 시점 사실 (2026-10-21 PHT, 클라우드 세션 확인)

- 웹 Production: READY `863e09eac` (IA-20 포함). 이후 커밋은 문서만(빌드 생략 정상).
- `verify:native-version-bump --release`: **RELEASE READY · Android 1.2.4 (9) · iOS 1.2 (7)** — 마지막 번호 변경 이후 네이티브 변경 0건(번호 추가 증가 불필요).
- Android: 저장소 1.2.4 (9)(E1 기기 판정 등 네이티브 수정 `09b425200` 포함) ↔ 샤오미 설치 1.2.4 (7) → **APK 빌드·설치 필요**.
- iOS: 저장소 1.2 (7) ↔ 운영 `user_devices` iOS 1.2 (7) 기록 있음 → **재빌드 불필요**(설치본 = 저장소).
- Cursor 로컬에 문서 K·L IA-20 PASS 갱신 커밋 `3cbb35075` 가 origin 미반영(ahead 1).

---

## 프롬프트

```
너는 DIBAY 배달 오너 최종 마무리 담당이다. AGENTS.md 절대 금지·개발 프로세스, docs/native-build-release-process.md 를 따른다.
목표: (0) 미푸시 문서 커밋 반영 → (1) 웹 Production 배포 확인 → (2) Android APK 1.2.4 (9) 빌드·샤오미 설치·확인 → (3) iOS 빌드 필요 여부 확인(필요할 때만 진행) → 1회 보고.
제한: 코드·네이티브 소스 수정 금지(빌드만). 버전 번호를 로컬에서 임의 변경 금지. 스토어 업로드(Play AAB·TestFlight·App Store)·출시는 하지 않는다(Owner 별도 승인).
운영 DB 쓰기 금지(SELECT 만). 확인 못 한 것은 PASS 가 아니라 NOT_PROVEN.

(0) 미푸시 문서 커밋
- `git status -sb` 로 ahead 확인 → `git fetch origin main && git rebase origin/main` → `git push origin HEAD:main`
  (AGENTS.md 개발 프로세스 1번 상시 허가. 문서만이라 Vercel 빌드 생략이 정상.)
- 거부되면 우회하지 말고 원문 보고.

(1) 웹 Production 배포 확인
- `git log --oneline -1 origin/main` · `git merge-base --is-ancestor 863e09eac origin/main && echo CONTAINS`
- `vercel ls samarket --prod`: 최신 READY Production 의 SHA 가 863e09eac 또는 그 이후 코드 커밋이면 PASS.
- 운영 DB(SELECT): select job_key, last_run_at at time zone 'Asia/Manila', detail from delivery_operation_job_heartbeats;
  → sla_scan 이 최근 10분 이내면 운영 크론·새 코드 실행 중.

(2) Android APK — 빌드·설치·확인 (일반 터미널)
- `npm run verify:native-version-bump` 첫 줄 [배포 구분] 기록.
- `npm run native:prepare` — main·미커밋 없음·origin/main 일치·npm ci·Production server.url cap sync. 출력의 빌드 SHA·목표 버전이
  Android 1.2.4 (9) 인지 확인. 실패하면 STOP 하고 원문 보고(우회 금지).
- `cd android && ./gradlew assembleRelease` → `adb -d install -r app/build/outputs/apk/release/app-release.apk`
  (서명 설정이 없어 release 빌드가 실패하면 원문 보고. debug 로 바꾸지 말고 STOP — 판단은 Owner.)
- 설치 확인: `adb shell dumpsys package com.dibay.app | grep -E "versionCode|versionName"` → versionCode=9, versionName=1.2.4.
- 앱 실행: `adb shell am force-stop com.dibay.app && adb shell monkey -p com.dibay.app -c android.intent.category.LAUNCHER 1`
  → 로그인 유지·오너 화면 로드 확인(스크린샷 `/tmp/dibay-check/apk9/launch.png`).
- 운영 DB(SELECT, §5): select platform, app_version, last_seen_at from public.user_devices
  where last_seen_at > now() - interval '2 hours' order by last_seen_at desc;  → android `1.2.4 (9)` 행이 보이면 설치 PASS.
- 회귀 최소 확인(이 빌드에서만, 1회): 오너 운영 메뉴 열고 `adb shell input keyevent KEYCODE_BACK` → 메뉴만 닫힘(IA-20).
  E1(기기 판정) 은 이 기기에서 앱이 정상 방향·레이아웃으로 열리는지만 기록(별도 작업 소관 — 판정만, 수정 금지).

(3) iOS — 필요할 때만
- 저장소 `ios/App/App.xcodeproj/project.pbxproj` CURRENT_PROJECT_VERSION(4곳 모두 7)·MARKETING_VERSION 1.2 확인.
- 운영 DB(SELECT): select app_version, max(last_seen_at) from user_devices where platform='ios' group by 1 order by 2 desc;
  → 최신 iOS 기록이 `1.2 (7)` 이면 **재빌드 불필요(PASS)** — 빌드하지 않는다.
- 최신 기록이 `1.2 (7)` 보다 낮거나 없고, iPhone 이 Mac 에 연결돼 있으면: (2) 의 native:prepare 결과 그대로
  `open ios/App/App.xcodeproj` → iPhone 선택 → Product > Clean Build Folder → Run (General 의 Version 1.2 / Build 7 확인)
  → 앱 실행 후 user_devices 에 `1.2 (7)` 확인. iPhone 이 없으면 NOT_PROVEN 으로 보고(TestFlight 업로드는 하지 않음).

최종 보고 (1회, 이 순서)
첫 줄: `npm run verify:native-version-bump` 의 [배포 구분]
0. 문서 커밋 푸시 — origin/main SHA
1. 웹 Production — READY SHA · 863e09eac 포함 · 하트비트 시각
2. Android — native:prepare 빌드 SHA·목표 버전 · APK 경로 · 샤오미 versionCode · user_devices `1.2.4 (9)` · IA-20 재확인 · 앱 실행 스크린샷
3. iOS — 저장소 1.2 (7) · 설치 기록 · 빌드 여부(불필요/진행/NOT_PROVEN)
4. 남은 것 — 스토어 업로드·출시(Owner 승인 사항)만, 그 외 없음이면 「배달 오너 작업 종료」
```

## 결과 (2026-10-21 23:36 PHT)

- 웹 Production: READY `863e09eac` · 하트비트 `sla_scan` 23:15 PHT `vercel_cron` — PASS.
- Android: `native:prepare` READY(origin/main `38a41fb84`, 1.2.4 (9)) → `assembleRelease` BUILD SUCCESSFUL → 샤오미(`8b37179f7d94`) 기존 debug 서명 설치본(`CN=Android Debug`) 삭제 후 정식 서명(`CN=DIBAY Play Upload`) APK 설치 `versionCode=9` → 운영 `user_devices` `android 1.2.4 (9)` 23:35:58 PHT — PASS.
- iOS: 저장소 1.2 (7) = 운영 설치 기록 1.2 (7) — 재빌드 불필요(PASS).
- 남은 것: 스토어 업로드·출시(Owner 승인 사항)만.
