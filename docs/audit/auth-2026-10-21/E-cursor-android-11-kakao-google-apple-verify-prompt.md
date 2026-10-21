# Cursor 프롬프트 E — Android 1.2.4(11) 빌드·설치 + 카카오·Google·Apple 전체 확인 (2026-10-22)

> 프롬프트 D 대신 이것을 쓴다. 아래 전체를 Cursor 에 그대로 붙여 넣는다. Cursor 는 **빌드·설치·수집만** 한다.

## 역할·금지

- 코드 수정·커밋·푸시·DB 변경·카카오/구글/애플 콘솔 변경 금지.
- 비밀번호·토큰·`local.properties` 값은 보고에 쓰지 않는다.
- 단계 실패 시 **STOP** 하고 원문 오류만 보고. 재시도 루프 금지.
- 시간은 `HH:MM:SS PHT` (초 단위). 확인 못 한 항목은 `NOT_PROVEN`.

## 무엇이 바뀌었나 (main 반영 완료)

- Google 플러그인: 결과가 끝내 오지 않은 이전 로그인 호출이 남아 있으면 새 로그인 때 정리하고 진행 (앱 재시작 전까지 Google 로그인이 막히던 잠금 제거).
- Google 복구: 이미 로그인된 상태(카카오·애플 등)에서는 남은 Google 대기 상태를 폐기 — 앱 복귀 때 다른 계정으로 바뀌지 않음.
- 카카오: 톡 우선 → 계정 전환 (PR #132, 유지). 재시작 안내 표식은 카카오에만.
- 오류 문구에서 "앱을 최신 버전으로 업데이트" 제거 — 실제 단계별 문구로 교체.
- Android `versionCode` **11** (iOS 변경 없음).

## 0. 빌드 준비 (일반 터미널)

```bash
cd /Users/bkkim/projects/samarket
git checkout main
npm run native:prepare
```

- 목표가 `Android 1.2.4(11)` 이 아니면 STOP.

## 1. APK 빌드·설치 (두 폰)

```bash
cd android && ./gradlew assembleRelease
adb -s RFCY40PY2CA install -r app/build/outputs/apk/release/app-release.apk
adb -s 8b37179f7d94 install -r app/build/outputs/apk/release/app-release.apk
```

- 두 폰 앱 강제 종료 → 실행.

## 2. 매 시도 로그 (필수)

```bash
adb -s <기기> logcat -c
# 시도 직후
adb -s <기기> logcat -d | grep -E "DIBAY_Google|DIBAY_Kakao|\[oauth\]" | tail -60
```

## 2-1. Google 원인 확정 (설치 직후 1회 · 필수)

앱 실행 → Google 로그인 1회 시도 → 즉시:

```bash
adb -s <기기> logcat -d | grep DIBAY_Google | tail -30
```

- 아래 줄을 **원문 그대로** 보고:
  - `google_native_app_sha1=…` (설치 APK 서명 SHA-1)
  - `google_native_client_prefix=…` 또는 `google_native_config_missing …`
  - `google_native_intent_parse_failed <숫자> …` (있으면)
- 판정 기준 (Claude 가 판정):
  - `intent_parse_failed 10` → Google Cloud Android OAuth 클라이언트에 위 SHA-1 미등록 (콘솔 등록 필요)
  - `config_missing` → 빌드에 `google-services.json`/`GOOGLE_WEB_CLIENT_ID` 없음 (Mac 빌드 환경)

## 3. 매트릭스 — 두 폰 각각, **아래 순서 그대로** (공급자 교차 확인)

각 행 전에 로그아웃 상태에서 시작. 성공 행 뒤에는 로그아웃.

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 카카오 성공 | 카카오톡 동의 → 「로그인 중」 잠깐 → 앱 진입 |
| 2 | (로그아웃 후) Google 성공 | 계정 선택 → 「로그인 중」 잠깐 → 앱 진입. "업데이트" 문구 없음 |
| 3 | (로그아웃 후) Apple 성공 | Apple 웹 로그인 → 앱 진입 |
| 4 | (로그아웃 후) 카카오 성공 | 1 과 동일 (Google·Apple 뒤에도 정상) |
| 5 | (로그아웃 후) Google 계정 선택 화면에서 뒤로 | "로그인이 취소되었습니다" + 버튼 복구 |
| 6 | 5 직후 Google 재시도 성공 | 2 와 동일 |
| 7 | (로그아웃 후) 카카오톡 화면에서 취소 | "로그인이 취소되었습니다" + 버튼 복구 |
| 8 | 7 직후 카카오 재시도 성공 | 1 과 동일 |
| 9 | 카카오 로그인 상태에서 홈 → 앱 다시 열기 2회 | 계정이 Google 등으로 바뀌지 않음 (마이페이지 계정 확인) |

- 각 행: 시작 시각 PHT · `PASS/FAIL/NOT_PROVEN` · 로그 grep 결과 · 실패 시 화면 사진과 문구 원문.

## 3-1. iOS (아이폰 1.2(7) · 재빌드 없음)

로그아웃 상태에서 각 1회: 카카오 성공 · 카카오 취소 · Apple 성공 · Apple 취소 · Google 성공 · Google 취소.
기대: 성공은 「로그인 중」 잠깐 → 앱 진입 (로그인 폼 재등장 없음), 취소는 "로그인이 취소되었습니다" + 버튼 복구.
각 시각(PHT)·결과만 기록.

## 4. 보고 형식 (이것만)

```
[빌드] SHA=… · Android 1.2.4(11) 설치: 삼성 OK/FAIL · 샤오미 OK/FAIL
[삼성] 1…9: 시각 PHT · 결과 · 로그 이벤트
[샤오미] 1…9: 시각 PHT · 결과 · 로그 이벤트
[iOS] 카카오 성공/취소 · Apple 성공/취소 · Google 성공/취소: 시각 PHT · 결과
```

시각은 Claude 가 Supabase 인증 로그·DB 와 대조하는 데 쓴다.
