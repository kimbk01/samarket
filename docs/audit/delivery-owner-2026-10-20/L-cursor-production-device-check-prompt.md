# 문서 L — Cursor 실행 프롬프트: Production 배포 확인 + 샤오미 실기기 확인 (배달 오너 종료)

> 사용법: Cursor 에서 `git pull origin main` 후 아래 「프롬프트」 블록 전체를 그대로 붙여 넣는다.
> 기준: main `b1d822127` (배달 오너 감사 종료, 문서 K). 이 작업은 **확인만** 한다 — 코드 수정·설계·DB 쓰기 없음.

---

## 프롬프트

```
너는 DIBAY 배달 오너 감사 종료 확인 담당이다. AGENTS.md 의 절대 금지·개발 프로세스를 따른다.
목표는 (A) Production 배포 확인, (B) 앱 빌드 필요 여부 판정, (C) USB 연결 샤오미(매장 오너 계정 로그인 상태) 실기기 확인이다.
범위 밖 수정·설계·감사 확대 금지. 운영 DB 쓰기 금지(SELECT 만). 운영 매장 데이터를 바꾸는 조작 금지(아래 C-0).
결과는 마지막에 한 번만 보고한다: 항목별 PASS / FAIL / NOT_PROVEN + FAIL 은 스크린샷 경로와 화면 문구.

### A. Production 배포 확인 (기준 SHA b1d822127 — 이후 커밋이 있으면 그 커밋이 b1d822127 를 포함하는지)
A-1. `git fetch origin main && git log --oneline -1 origin/main` 그리고 `git merge-base --is-ancestor b1d822127 origin/main && echo CONTAINS`.
A-2. Vercel Production 배포: `vercel ls samarket --prod` (로그인된 CLI) 또는 Vercel 대시보드 → 최신 Production 배포의 Git SHA 와 상태가 READY 인지. SHA 가 b1d822127 이거나 그 이후(포함)여야 PASS.
     (`*.md`·`docs/` 만 바뀐 커밋은 빌드가 생략되므로, 마지막 코드 커밋 SHA 기준으로 판단한다.)
A-3. 운영 DB 읽기 전용(Supabase SQL 편집기 또는 MCP execute_sql, SELECT 만):
     select job_key, last_run_at at time zone 'Asia/Manila', detail from delivery_operation_job_heartbeats;
     → `sla_scan` 행이 있고 detail.source = 'vercel_cron' 이면, 새 코드가 운영에서 실행 중이라는 증거(SLA 크론 5분 주기). 행이 없으면 A-2 결과와 함께 NOT_PROVEN.
A-4. 관리자 계정으로 PC 브라우저 로그인 가능하면 `/api/admin/deploy/status` 의 runtime SHA 를 기록(선택).

### B. 앱 빌드 판정 (빌드하지 않는다 — 판정만)
B-1. `npm run verify:native-version-bump` 첫 줄 [배포 구분] 을 기록. 배달 오너 종료 작업(main b1d822127 까지)은 웹 전용 → 앱 재시작만으로 반영.
B-2. 저장소 버전: android/app/build.gradle versionCode·versionName, iOS CURRENT_PROJECT_VERSION·MARKETING_VERSION.
     (2026-10-21 기준 Android 1.2.4 (9), iOS 1.2 (7). Android (9) 는 다른 세션의 기기 판정 E1 네이티브 수정 — 배달 오너 작업과 무관.)
B-3. 설치 버전: `adb shell dumpsys package com.dibay.app | grep -E "versionCode|versionName"` 와
     운영 DB `select platform, app_version, max(last_seen_at) from user_devices where last_seen_at > now() - interval '1 day' group by 1,2;`
B-4. 판정: 샤오미 설치본이 1.2.4 (9) 미만이면 → 배달 오너 확인(C)은 웹 변경만이라 **앱 재시작으로 진행 가능**, 단 E1 네이티브 수정 확인이 필요하면 docs/native-build-release-process.md §4 절차(`npm run native:prepare` 후)로 APK 재빌드가 별도로 필요하다고 보고만. iOS 는 저장소 1.2 (7) = 설치 1.2 (7) 이면 재빌드 불필요.

### C. 샤오미 실기기 확인 (매장 오너 계정 로그인 상태)
C-0. 안전 규칙(운영 데이터 보호):
     - 노출 OFF·영업 OFF·주문 거절/취소·쿠폰 일시정지/종료/재발행·상품 삭제·카테고리 삭제·리뷰 답글 삭제는 **확인창이 뜨는 것까지만** 보고 「취소」를 누른다. 확정 버튼을 누르지 않는다.
     - 실제 주문 거절 사유 전달(J-1) 확인은 Owner 가 지정한 테스트 주문이 있을 때만. 없으면 NOT_PROVEN.
     - 입력 폼은 저장하지 않는다(이탈 가드 확인 시 「계속 편집」 선택).
C-1. 준비: `adb devices` 1대 확인 → 앱 재시작(`adb shell am force-stop com.dibay.app && adb shell monkey -p com.dibay.app 1`).
     WebView 자동 조작이 필요하면 `scripts/device-check/address-android.mjs` 와 같은 방식(Playwright `_android`, debug APK·WebView 디버깅 가능 빌드)으로
     새 스크립트 `scripts/device-check/owner-delivery-android.mjs` 를 만들어 아래 항목을 읽기 전용으로 점검하고 결과를 `/tmp/dibay-check/owner/result.md`·스크린샷으로 남긴다.
     WebView 디버깅이 불가한 릴리스 빌드면 `adb exec-out screencap -p > shot.png` + `adb shell input tap/swipe` 로 수동 순회하며 스크린샷 판정.
C-2. 점검 항목(문서 K §11 오너 행) — 각 항목 PASS 조건:
     1) IA-09·10·11·21: 드로어 12그룹 메뉴, 현재 화면 메뉴 강조, 화면 제목 = 메뉴 라벨, 하위 화면(상품 수정·광고 하위·Finance section)에서 상위 메뉴 강조, 뒤로가기 = 상위 화면(storeId 유지).
     2) IA-20: 드로어 열고 Android 뒤로가기/ESC 대응으로 닫힘·포커스 복귀(폰은 사이드바 없음 = 정상).
     3) IA-07·08: 예전 주소 딥링크 `adb shell am start -a android.intent.action.VIEW -d "<운영origin>/my/business/menu?storeId=<id>&x=1"` → 새 주소로 이동하며 쿼리 유지. storeId 없는 `/stores/owner/orders` 진입 → storeId 자동 보정.
     4) IA-12·17·OPS-04: 헤더·운영상태 화면은 상태 칩 + 「매장 관리에서 변경」 링크만, 토글은 `/settings` 에만. 노출 OFF/영업 OFF 누르면 확인창 표시(→ 취소). 홈 영업 카드가 실효 영업 상태 표시.
     5) IA-13: 정산 화면 제목 「수수료·캐시 원장」, Finance 에 orders 탭 없음, 「Coin 환전」 용어, 「주문별 정산」「지급 현황」 문구 없음.
     6) IA-14: 알림 설정 제목 「내 계정 알림 설정(전체 매장 공통)」, UUID·「진동」 문구 없음.
     7) IA-15·16: 리뷰 화면 주문번호(order_no) 표시·삭제 확인창(→ 취소), 문의 화면 정상 로드(재로드 시 깜박임 없음).
     8) IA-23·J-1: 주문 카드 단계 버튼 → 확인 다이얼로그 표시(→ 취소). 접수 전 주문이 있으면 「거절」 → 사유 선택 시트 표시(→ 닫기). 메신저 주문 채팅 오너 액션바도 같은 사유 시트.
     9) IA-06: 쿠폰 화면 로드·일시정지/종료 확인창(→ 취소).
     10) PRD-12·13: 상품 허브 순서 = 구매자 메뉴 순서(같은 매장 구매자 화면과 비교), 카테고리 삭제 → 이동 대상 선택 화면(→ 취소).
     11) LOC-007·IA-01·IA-02: 기본정보 화면 정상, (승인 매장이면) 심사 가드 띠 없음. 위치 1km 초과 이동 확인창은 저장이 필요하므로 NOT_PROVEN 으로 남겨도 됨.
     12) IA-19: 오너 화면 색·모서리(카드 4px), 다크모드 전환 시 깨짐 없음.
C-3. 관리자 항목(ACC-04·J-3·X-1·X-4·LOC-011·DLV-01)은 샤오미 오너 계정으로 확인 불가 → 관리자 계정 PC 브라우저가 있으면 확인(읽기만: 주문 상세 「주문 당시 판정」 표시, 운영 콘솔 배달 운영 상태 표시). 복구 실행·쿠폰 강제 회수·배달 실패 처리는 운영 데이터 변경이므로 Owner 지시 없이는 실행하지 않고 NOT_PROVEN.
C-4. 주문자 항목(GFT-04 상품권 소멸 고지)은 주문자 계정이 있을 때만, 결제 직전 화면까지(결제하지 않음).

### 보고 형식 (1회)
첫 줄: `npm run verify:native-version-bump` 의 [배포 구분].
A: origin/main SHA · Production 배포 SHA·상태 · 하트비트 결과 → PASS/NOT_PROVEN
B: 저장소 버전 · 설치 버전(샤오미·iOS) · 재빌드 필요 여부(배달 오너 기준 / E1 기준 분리)
C: 항목 1~12 표 (PASS / FAIL / NOT_PROVEN, FAIL 은 스크린샷 경로·화면 문구·재현 단계)
PASS 로 바뀐 항목만 문서 K 의 해당 행을 「해결」로 갱신하는 커밋을 제안(문서만, main 직접 푸시는 Owner 지시 시).
```

---

## 참고 (작성 시점 사실, 2026-10-21 20:45 PHT)

- main `b1d822127` 푸시 완료. Production 배포 SHA 는 이 세션에서 확인 불가(Vercel 권한 403·운영 주소 차단) → A 로 확인.
- 운영 DB 하트비트: 20:39 PHT 조회 시 행 없음(푸시 2분 후 — 배포·크론 주기 전).
- 운영 `user_devices` 최근 1일: Android 1.2.4 (7)·(8), 1.2.1 (4) 다수, iOS 1.2 (7). 저장소 Android 1.2.4 (9) 는 아직 설치 기록 없음.
- 운영 크론 실증: 기준 시각(2026-10-20 20:30 UTC) 이후 생성 주문 0건 → 자동 취소·자동 구매확정은 대상이 없어 실행 기록으로 증명 불가. SLA 스캔은 하트비트로 판정.
- IA-20 재검증 2026-10-21 21:35 PHT: PASS (문서 M).
