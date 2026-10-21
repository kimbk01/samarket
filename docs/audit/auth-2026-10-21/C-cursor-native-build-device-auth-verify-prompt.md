# Cursor 프롬프트 C — main 기준 APK·iOS 빌드 + 실기기 AUTH 증거 수집 (2026-10-21)

> 아래 전체를 Cursor 에 그대로 붙여 넣는다. Cursor 는 **수집·보고만** 한다. 코드·DB·콘솔 설정을 바꾸지 않는다.

---

## 역할·금지

- 너는 Mac 에서 **빌드·설치·증거 수집**만 한다. 코드 수정·커밋·푸시·DB 변경·Kakao/Apple/Google 콘솔 변경을 하지 않는다.
- 비밀번호·토큰·OAuth secret·`local.properties` 값·인가 코드(`code=`)는 보고서에 절대 쓰지 않는다. 키 해시(공개값)와 SHA-1 지문은 써도 된다.
- 단계가 실패하면 **STOP** 하고 원문 오류를 그대로 보고한다. 추측·우회·재시도 루프 금지.
- 시간은 모두 **PHT(Asia/Manila)** 로 `HH:MM:SS PHT` 형식으로 적는다.
- 로그·결과에 없는 것은 `NOT_PROVEN` 으로 적는다. PASS 로 추정하지 않는다.

## 기준 정보 (Claude 확인 완료)

- 기준: `origin/main` = `f627573ff` (PR #129 — 공통 로그인 상태 SSOT) 이후 최신.
- 빌드 번호 가드: `RELEASE READY · Android 1.2.4(9) · iOS 1.2(7)` — 마지막 번호 변경 이후 네이티브 변경 0건이므로 **번호를 올리지 않는다**. 같은 번호로 재설치하면 된다.
- 기기: 삼성 `RFCY40PY2CA`, 샤오미 `8b37179f7d94`, iPhone 1대.
- Kakao 앱 ID 1617382. Kakao 콘솔 Android 키 해시 3개: `+pZo9nA4aLrSFi4jAdMBw97eKBs=` / `LcQiYJgEJm+j2wPhPC9ckJimdPI=` / 디버그 1개(콘솔 화면에서 그대로 복사).

---

## 0. 빌드 준비 (일반 터미널 — Cursor 샌드박스 아님)

```bash
cd /Users/bkkim/projects/samarket
git checkout main
npm run native:prepare
```

- 출력의 **빌드 SHA·목표 버전**을 그대로 보고한다. 실패하면 STOP.
- `android/local.properties` 에 `KAKAO_NATIVE_APP_KEY` 가 **새 앱(1617382)의 네이티브 앱 키**로 들어 있는지 확인만 한다 (값은 보고하지 말고 `있음/없음` 만).

## 1. Android APK 빌드·설치 (두 폰)

```bash
cd android && ./gradlew assembleRelease
adb -s RFCY40PY2CA install -r app/build/outputs/apk/release/app-release.apk
adb -s 8b37179f7d94 install -r app/build/outputs/apk/release/app-release.apk
```

- 설치 후 두 폰 모두 앱을 **강제 종료 → 다시 실행**.
- 보고: 빌드 성공 여부, 설치 성공 여부(폰별).

## 2. 삼성 keyHash 원인 확정

설치된 APK 의 실제 서명으로 비교한다 (빌드 산출물이 아니라 **폰에 설치된 것**).

```bash
APK=$(adb -s RFCY40PY2CA shell pm path com.dibay.app | head -1 | sed 's/package://' | tr -d '\r')
adb -s RFCY40PY2CA pull "$APK" /tmp/samsung-installed.apk
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs /tmp/samsung-installed.apk | grep -E "SHA-1|DN"
# SHA-1 hex → Kakao 키 해시(base64)
echo -n "<SHA-1 hex, 콜론 제거>" | xxd -r -p | base64
```

- 보고: 서명 DN(`CN=...`), SHA-1, 변환한 키 해시, 그리고 콘솔 3개 값 중 **일치하는 것 / 없음**.
- 샤오미도 같은 명령(`-s 8b37179f7d94`)으로 키 해시 1줄만 추가 보고.

## 3. 샤오미 프로세스 종료 원인 확정

로그인 시도(4번) 직후에 실행한다.

```bash
adb -s 8b37179f7d94 shell dumpsys activity exit-info com.dibay.app | head -80
adb -s 8b37179f7d94 logcat -b crash -d | tail -100
```

- 보고: 최근 종료 항목의 `reason` / `status` / `description` / 시각 원문.
- `reason` 이 CRASH(크래시)면 crash 로그의 예외명·첫 스택 10줄. LOW_MEMORY·OTHER·USER_REQUESTED 등이면 그 값 그대로.

## 4. Android 실기기 로그인 매트릭스 (두 폰 각각)

각 시도 전에 앱 강제 종료 → 실행. 각 행마다 **시작 시각(PHT)**, 결과, 화면 흐름을 적는다.

| # | 공급자 | 시나리오 | 기대 결과 |
|---|---|---|---|
| A1 | 카카오 | 성공 (실계정) | 로그인 중 화면 유지 → 바로 앱 진입. 로그인 폼이 다시 보이면 FAIL |
| A2 | 카카오 | 취소 (카카오 화면에서 닫기/뒤로) | 로그인 화면 복귀 + "로그인이 취소되었습니다" + 버튼 다시 누를 수 있음 |
| A3 | 카카오 | 재시도 (A2 직후 다시 성공) | A1 과 동일 |
| A4 | 카카오 | 실패 (동의 화면에서 거부 등) | 오류 문구 + 버튼 복구 |
| A5 | 구글 | 성공 | A1 과 동일 |
| A6 | 구글 | 취소 | A2 와 동일 |
| A7 | 구글 | 재시도 | A1 과 동일 |

- 각 행: `PASS / FAIL / NOT_PROVEN` + 실패면 화면 사진 1장과 오류 문구 원문.
- "로그인 중" 화면이 12초 이상 이어지면 지연 안내·「다시 시도」 버튼이 보이는지도 적는다.
- 로그아웃 후 다시 로그인했을 때 "로그아웃되었습니다" 문구·이전 회원 데이터가 남는지 1회 확인.

## 5. iOS 빌드·설치·매트릭스

```bash
open ios/App/App.xcodeproj
```

- iPhone 선택 → Product > Clean Build Folder → Run. General 탭 Version/Build 가 `1.2 (7)` 인지 확인해 보고.
- 매트릭스: 카카오 성공·취소·재시도·실패, 애플 성공·취소·재시도·실패 (4번 표와 같은 기대 결과).

## 6. 보고 형식 (이것만)

```
[빌드] SHA=… · Android 1.2.4(9) 설치: 삼성 OK/FAIL · 샤오미 OK/FAIL · iOS 1.2(7) 설치 OK/FAIL
[삼성 keyHash] DN=… SHA-1=… keyHash=… → 콘솔 일치: (값 | 없음)
[샤오미 keyHash] keyHash=… → 콘솔 일치: (값 | 없음)
[샤오미 종료] reason=… status=… description=… (crash 면 예외·스택)
[Android 매트릭스] 폰별 A1~A7: 시각 PHT · PASS/FAIL/NOT_PROVEN · 비고
[iOS 매트릭스] 카카오 4건 · 애플 4건: 시각 PHT · PASS/FAIL/NOT_PROVEN · 비고
[로그아웃 잔존] 있음/없음 (있으면 무엇)
```

- 시각(PHT)은 Claude 가 Supabase 인증 로그·DB 와 대조하는 데 쓰므로 **초 단위까지** 정확히 적는다.
