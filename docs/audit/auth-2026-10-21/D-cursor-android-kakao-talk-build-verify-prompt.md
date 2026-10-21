# Cursor 프롬프트 D — Android 1.2.4(10) 빌드·설치 + 카카오 로그인 실기기 확인 (2026-10-22)

> 아래 전체를 Cursor 에 그대로 붙여 넣는다. Cursor 는 **빌드·설치·수집만** 한다. 코드·DB·콘솔 설정을 바꾸지 않는다.

## 역할·금지

- 코드 수정·커밋·푸시·DB 변경·카카오/구글/애플 콘솔 변경 금지.
- 비밀번호·토큰·`local.properties` 값·인가 코드는 보고에 쓰지 않는다.
- 단계 실패 시 **STOP** 하고 원문 오류만 보고. 추측·우회·재시도 루프 금지.
- 시간은 `HH:MM:SS PHT` (초 단위). 확인 못 한 항목은 `NOT_PROVEN`.

## 무엇이 바뀌었나 (Claude 반영 완료 · main)

- Android 카카오 = Native SDK (웹 OAuth 다중 화면 제거, PR #131).
- 카카오톡 설치 폰: **카카오톡 앱 동의만 → 바로 DIBAY 복귀** (아이디·비번 입력 없음).
  카카오톡 미설치·톡 로그인 실패: 카카오 계정 로그인 (기존 세션 있으면 재입력 없음). 톡에서 취소 → 취소 문구.
- 네이티브 변경 → Android `versionCode` **10** (iOS 변경 없음 — 1.2(7) 그대로, iOS 빌드 불필요).

## 0. 빌드 준비 (일반 터미널)

```bash
cd /Users/bkkim/projects/samarket
git checkout main
npm run native:prepare
```

- 출력의 빌드 SHA·목표 버전 보고. 목표가 `Android 1.2.4(10)` 이 아니면 STOP.

## 1. APK 빌드·설치 (두 폰)

```bash
cd android && ./gradlew assembleRelease
adb -s RFCY40PY2CA install -r app/build/outputs/apk/release/app-release.apk
adb -s 8b37179f7d94 install -r app/build/outputs/apk/release/app-release.apk
```

- 두 폰 앱 강제 종료 → 실행. 각 폰에 카카오톡 설치 여부(설치/미설치)를 적는다.

## 2. 로그 수집 준비 (각 시도마다)

```bash
adb -s <기기> logcat -c
# 시도 후
adb -s <기기> logcat -d | grep -E "DIBAY_Kakao|\[oauth\]" | tail -40
```

## 3. 매트릭스 (두 폰 각각, 시도 전 앱 강제 종료 → 실행)

| # | 시나리오 | 기대 결과 |
|---|---|---|
| K1 | 카카오 로그인 성공 | 카카오톡 동의(또는 계정 로그인) → DIBAY 「로그인 중」 잠깐 → 바로 앱 진입. 웹 페이지·DIBAY 로그인 폼 재등장 없음 |
| K2 | 카카오톡 화면에서 취소 | 로그인 화면 복귀 + "로그인이 취소되었습니다. 다시 시도해 주세요." + 버튼 다시 누를 수 있음 |
| K3 | K2 직후 재시도 성공 | K1 과 동일 |
| K4 | 로그아웃 → 다시 로그인 | "로그아웃되었습니다" 문구·이전 회원 데이터 잔존 없음, K1 과 동일 |
| G1 | 구글 로그인 성공 | K1 과 동일 |
| G2 | 구글 취소 | K2 와 동일 |

- 각 행: 시작 시각 PHT · `PASS/FAIL/NOT_PROVEN` · 로그 grep 결과(`kakao_native_talk_login` / `kakao_native_talk_fallback_account` / `kakao_native_account_login` / `kakao_native_success` / `kakao_native_cancelled` / `kakao_native_failed …`) · 실패 시 화면 사진.
- 샤오미에서 로그인 도중 앱이 재시작되면: 화면 문구 원문 + `adb -s 8b37179f7d94 shell dumpsys activity exit-info com.dibay.app | head -30`.

## 4. 보고 형식 (이것만)

```
[빌드] SHA=… · Android 1.2.4(10) 설치: 삼성 OK/FAIL · 샤오미 OK/FAIL · 카카오톡 설치: 삼성 Y/N · 샤오미 Y/N
[삼성] K1 … · K2 … · K3 … · K4 … · G1 … · G2 …   (각: 시각 PHT · 결과 · 로그 이벤트)
[샤오미] K1 … · K2 … · K3 … · K4 … · G1 … · G2 …
[샤오미 재시작] 없음 / 있음(문구·exit-info)
```

시각은 Claude 가 Supabase 인증 로그·DB 와 대조하는 데 쓴다.
