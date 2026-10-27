# 기존 앱 업데이트 방식 확인 — Samsung·Xiaomi·iPhone (2026-10-27 11:20~11:31 PHT)

> 지시: 새 업데이트 시스템 없이 기존 방식(웹 = 앱 종료·재실행, 네이티브 = Android Studio·Xcode Build·Run 덮어 설치) 확인.
> 앱 삭제 없음. 코드 변경 없음.

## 기기·설치본 (직접 확인)

| 기기 | 설치 | 서명 |
|---|---|---|
| Samsung SM-M156S | 1.2.4 (13), debug 빌드 | 이 Mac 의 debug 키(`b8584fc4`) |
| Xiaomi 24076RP19G (태블릿) | 1.2.4 (11) → (13) | **「CN=DIBAY Play Upload」 업로드 키**(SHA-256 `5f4db94e…`) — `android/key.properties` 의 `dibay-play-upload.jks` |
| iPhone | 1.2 (15) | Apple Development: BONG KI KIM (Xcode 개발 서명) |

## ① 웹 수정 → 앱 종료·재실행

| 기기 | 결과 | 근거 |
|---|---|---|
| Samsung | 통과 | 오늘 배포 7회(FR-D1~LIST-V1)마다 앱 강제 종료·재실행 후 새 동작 확인 |
| iPhone | 통과 | 오늘 A-10·친구 시험에서 Owner 앱 재시작 후 새 동작 확인(Production SHA 대조) |
| Xiaomi | 통과 | 재실행 전 버전 화면 「웹 배포 c4b7a50」(10:10 배포 — 그 뒤 앱이 계속 떠 있었음) → 앱 종료·재실행 후 **「웹 배포 ae0d0e9」 = 현재 Production**. 최근 앱 화면에서 카드를 밀어 닫으면 프로세스가 실제로 사라짐(`pidof` 빈 값) |

- **Xiaomi 「반영 안 됨」 원인(확인 범위):** 앱 프로세스가 살아 있는 동안은 처음 불러온 웹을 계속 쓴다. 홈 버튼 등으로 나갔다 들어오면 반영되지 않고, 앱을 완전히 닫아야 반영된다.
- 완전히 닫은 뒤에도 반영되지 않는 경우는 재현되지 않았다(NOT_PROVEN).

## ② 네이티브 수정 → Build·Run 덮어 설치

| 기기 | 결과 | 근거 |
|---|---|---|
| Samsung | 통과 | 10-27 08:23 debug 빌드 `adb install -r` 12 → 13, 앱 유지(로그인·데이터 그대로) |
| Xiaomi | 통과 | 11:30 `native:prepare` READY(`62412ec13`, Android 1.2.4 (13)) → `assembleRelease`(업로드 키) → `adb install -r` **Success** · `firstInstallTime 10-21 23:33:50` 유지(삭제 없음) · `lastUpdateTime 11:30:21` · 로그인 유지 · 운영 DB `user_devices` 1.2.4 (13) 11:30:29 |
| iPhone | 통과(10-26) | 10-26 9단계 Xcode Build·Run 으로 1.2 (14) → (15) 덮어 설치, 오늘 설치본 1.2 (15)·Apple Development 서명 확인. 오늘 새 Xcode Run 은 하지 않음 |

- **Xiaomi 서명 불일치 원인:**
  - Xiaomi 앱은 처음에 **release(업로드 키)** 로 설치됐다.
  - Android Studio 기본 Run 은 **debug 키**로 서명해 서명이 달라 덮어쓰기가 거부된다.
- **방법(새 시스템 없음):** 기기마다 설치된 서명과 같은 빌드 종류로 Run 한다.
  - Xiaomi: Android Studio Build Variants → `release`(또는 `./gradlew assembleRelease` → `adb install -r`).
  - Samsung: `debug`.
  - 한 가지 서명으로 통일하려면 한 기기는 앱을 지우고 다시 설치해야 하므로 하지 않았다.
- Android Studio 화면에서 직접 Run 한 것은 아니다(같은 Gradle 작업을 명령으로 실행) — Studio 버튼 자체는 NOT_PROVEN.
