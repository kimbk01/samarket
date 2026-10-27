# Cursor 지시 — Android Studio·Xcode Run 덮어 설치 확인 (2026-10-27 PHT)

## 목적

- Android Studio·Xcode 의 **Run 버튼**으로 USB 연결 기기에 앱을 **삭제 없이** 덮어 설치할 수 있는지만 확인한다.
- 코드·버전·서명·설정은 바꾸지 않는다. 커밋·푸시하지 않는다. 시험은 설치·실행 확인까지만 한다.

## 빌드 폴더

- 이 폴더만 쓴다: `/private/tmp/claude-501/-Users-bkkim-projects-samarket/973ed821-8ebe-4779-bf1e-1ad5c02a06dc/scratchpad/ios-main`
- 시작 전에 확인할 것:
  - `git -C <빌드 폴더> fetch origin && git -C <빌드 폴더> status -sb` 결과가 `## main...origin/main` 이어야 한다(앞서거나 뒤처짐 없음).
  - 그다음 `npm run native:prepare`(iOS 포함)를 실행해 **READY** 가 나와야 한다.
  - 둘 중 하나라도 다르면 멈추고 원문을 보고한다.
- `/Users/bkkim/projects/samarket` 은 다른 브랜치·미커밋 변경이 있으니 쓰지 않는다.

## 현재 설치본 (Claude 확인 11:31)

| 기기 | 설치 | 서명 |
|---|---|---|
| Samsung RFCY40PY2CA | 1.2.4 (13) | debug 키 |
| Xiaomi 8b37179f7d94 | 1.2.4 (13) | **DIBAY Play Upload(업로드 키)** |
| iPhone 00008120-000025C826F3C01E | 1.2 (15) | Apple Development: BONG KI KIM |

## 1. Android Studio

1. `<빌드 폴더>/android` 를 Android Studio 로 연다.
2. **Samsung:** Build Variants = `debug` → 기기 선택 → **Run**.
3. **Xiaomi:** Build Variants = `release` → 기기 선택 → **Run**.
   - release 는 `android/key.properties` 의 업로드 키로 서명된다. 이 파일이 없거나 서명 오류가 나면 멈추고 원문을 보고한다.
4. 각 기기에서 아래 명령의 결과를 보고한다.
   ```
   adb -s <기기> shell dumpsys package com.dibay.app | grep -E "versionCode|firstInstallTime|lastUpdateTime"
   ```
   - `firstInstallTime` 이 그대로이고 `lastUpdateTime` 이 방금 시각이어야 통과다.
5. 앱을 열어 로그인이 유지되는지 확인한다.
6. 「INSTALL_FAILED_UPDATE_INCOMPATIBLE」 등 서명 오류가 나면 **앱을 지우지 말고** 멈춘 뒤 원문을 보고한다.

## 2. Xcode

1. `open <빌드 폴더>/ios/App/App.xcodeproj`
2. iPhone 선택 → General 탭에서 Version `1.2` / Build `15` 를 확인한다.
3. **Product > Run** (Clean 은 하지 않는다).
4. 설치 후 앱을 열어 로그인이 유지되는지 확인한다(앱 삭제 금지).

## 금지

- 앱 삭제
- 코드·버전·서명·`capacitor.config` 변경
- 커밋·푸시
- 다른 폴더에서 빌드
- 스토어 업로드
- 운영 DB 변경

## 보고 (짧게)

- 빌드 폴더 `git status -sb` 첫 줄 · `native:prepare` 마지막 줄
- Samsung · Xiaomi: Run 결과(성공/오류 원문), `versionCode`·`firstInstallTime`·`lastUpdateTime`, 로그인 유지 여부
- iPhone: Run 결과, Version/Build, 로그인 유지 여부
