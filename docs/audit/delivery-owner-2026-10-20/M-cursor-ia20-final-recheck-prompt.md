# 문서 M — Cursor 실행 프롬프트: IA-20 샤오미 실기기 최종 재검증 (배달 오너 종료)

> 사용법: Cursor 에서 `git pull origin main` 후 아래 「프롬프트」 블록 전체를 그대로 붙여 넣는다.
> 기준: main `863e09eac` (IA-20 수정 코드 커밋). 이 문서 커밋은 문서만이라 Production 빌드가 생략된다 — 코드 기준 SHA 는 `863e09eac`.

---

## 프롬프트

```
너는 DIBAY 배달 오너 IA-20 최종 재검증 담당이다. AGENTS.md 의 절대 금지·개발 프로세스를 따른다.
대상은 IA-20 하나다: 오너 운영 메뉴 드로어가 열린 상태에서 안드로이드 하드웨어 뒤로가기를 누르면 드로어만 닫히고 현재 화면은 유지돼야 한다.

제한(반드시 지킴):
- IA-20 외 기능 수정 금지. 새 감사·설계·테스트 확대 금지. 기존 PASS 13건 재검증 금지.
- 네이티브(android/**·ios/**·capacitor.config.ts·Capacitor 의존성) 수정 금지, APK·iOS 재빌드 금지.
- 운영 DB 쓰기 금지(SELECT 만). 운영 매장 데이터를 바꾸는 조작 금지.
- 실기기에서 직접 확인하지 못한 것은 PASS 로 보고하지 말고 NOT_PROVEN.

1) Production 반영 확인
   - `git fetch origin main && git merge-base --is-ancestor 863e09eac origin/main && echo CONTAINS`
   - `vercel ls samarket --prod`(또는 대시보드): 최신 READY Production 배포의 Git SHA 가 863e09eac 이거나 그것을 포함하는 이후 코드 커밋이면 PASS.
     (문서만 바뀐 커밋은 Canceled(빌드 생략)이 정상 — 마지막 READY 코드 배포 SHA 로 판단.)
   - READY 가 아니면 여기서 멈추고 「Production 미반영 — IA-20 NOT_PROVEN」으로 보고. 기다리며 반복 조회하지 않는다.

2) 샤오미 앱 완전 종료 후 재실행 (매장 오너 계정 로그인 상태 유지)
   - `adb devices` 로 1대 확인.
   - `adb shell am force-stop com.dibay.app` → `adb shell monkey -p com.dibay.app -c android.intent.category.LAUNCHER 1`
   - 설치 버전 기록: `adb shell dumpsys package com.dibay.app | grep -E "versionCode|versionName"` (재빌드하지 않는다).

3) 재현 절차 (오너 화면, 예: 주문 관리 `/stores/owner/orders?storeId=…`)
   - 오너 화면이 뜰 때까지 대기 → 스크린샷 S1: `adb exec-out screencap -p > /tmp/dibay-check/ia20/S1-before.png`
   - 상단 햄버거(운영 메뉴) 탭 → 드로어 열림 확인 → 스크린샷 S2-open.png
   - 하드웨어 뒤로가기: `adb shell input keyevent KEYCODE_BACK` → 1초 대기 → 스크린샷 S3-after-back.png
   - (가능하면 기존 `scripts/device-check/owner-delivery-android.mjs` 또는 address-android.mjs 방식의 Playwright `_android` WebView 접속으로
     뒤로가기 전후 `location.href` 와 드로어 `[data-open]` 값을 기록. WebView 접속이 안 되면 스크린샷만으로 판정.)

4) 판정
   - PASS: S3 에서 드로어가 닫혔고, 화면이 S1 과 같은 화면(같은 URL·같은 제목)이며 앱이 종료되지 않음.
   - FAIL: 드로어가 그대로 열려 있음 / 이전 화면으로 이동함 / 앱이 종료됨.
   - 추가 확인(같은 기기, 1회): 드로어가 닫힌 상태에서 뒤로가기 1회 → 기존 동작(이전 화면 이동)이 유지되는지 기록만.

5) FAIL 이면 원인 확인 후 IA-20 만 수정
   - 수정 위치는 `components/business/owner/OwnerMobileOpsMenuDrawer.tsx` 의 `useOverlayHardwareBack(open && mounted, closeDrawer)` 등록과
     `lib/ui/overlay-back-stack.ts`(INAPP-07, 단일 네이티브 리스너 계약) 사용 범위 안에서만.
   - 먼저 진단: 같은 기기에서 다른 오버레이(예: 주소 편집 화면의 이탈 확인 시트, 공용 팝업)가 뒤로가기로 닫히는지 1회 확인.
     · 다른 오버레이도 안 닫히면 → 설치본에 `@capacitor/app` backButton 이 동작하지 않는 네이티브 원인 → 웹 수정으로 해결 불가.
       네이티브 수정·재빌드는 금지이므로 수정하지 말고 「원인: 설치 바이너리(버전 기록) — IA-20 FAIL(네이티브)」로 보고하고 멈춘다.
     · 다른 오버레이는 닫히는데 드로어만 안 닫히면 → 드로어 등록 조건(open·mounted 타이밍) 문제 → 웹만 최소 수정.
   - 수정했다면: 관련 테스트 `components/business/owner/__tests__/owner-mobile-ops-menu-drawer-a11y.test.tsx` 실행,
     `rm -rf .tsbuild && npm run typecheck:build && npm run typecheck:test`, 변경 파일 eslint → `git commit --no-verify` → main 푸시
     (AGENTS.md 개발 프로세스 1~4) → Production READY 1회 확인 → 2)~4) 재실행. 반복은 이 1회까지만.

6) PASS 이면 문서 갱신 후 종료
   - `docs/audit/delivery-owner-2026-10-20/K-final-defect-reconciliation.md`
     · IA-20 행: 상태 「미증명」→「해결」, 근거에 「실기기 PASS <날짜·PHT> 샤오미 <버전> · Production <SHA> · 스크린샷 경로」 추가, 남은 층 「—」.
     · §1 집계: P3 해결 +1 / 미증명 −1, 감사 결함 소계·전체 합계 동일하게 갱신(→ 해결 112 · 미증명 15 · 제외 2 · 미해결 0 · 합계 129).
     · 「미증명 16건」 문단의 「IA-20 재실측 1」 제거, 건수 15 로.
   - `docs/audit/delivery-owner-2026-10-20/L-cursor-production-device-check-prompt.md` 맨 아래 「참고」에 한 줄 추가:
     「IA-20 재검증 <날짜·PHT>: PASS (문서 M)」.
   - 문서만 커밋 → main 푸시(문서만이라 Production 빌드 생략). 그 외 작업 없이 종료.

최종 보고(1회, 이 순서):
첫 줄 `npm run verify:native-version-bump` 의 [배포 구분]
1. Production 반영 여부 — origin/main SHA · READY Production SHA · 863e09eac 포함 여부
2. 샤오미 실기기 결과 — 설치 버전 · S1/S2/S3 스크린샷 경로 · 뒤로가기 후 화면·URL
3. 추가 수정 여부 — 없음 / 있음(원인·수정 파일·커밋 SHA·재검증 결과)
4. IA-20 최종 — PASS / FAIL / NOT_PROVEN (+ 문서 K·L 갱신 커밋 SHA)
나머지 미증명 항목은 기존 문서 그대로 둔다.
```
