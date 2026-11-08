# DIBAY 앱 진입·복귀 하드락 (DRAFT — Owner 승인 전 효력 없음)

- 근거 감사: `docs/audit/app-entry-splash-resume-root-cause-2026-11-08.md`
- 적용 범위: Android `MainActivity`·`DibayBridgeWebViewClient`, iOS `DibayRootBridgeViewController`·`AppDelegate`, 웹 `app/layout.tsx`·`app/not-found.tsx`·`app/global-error.tsx`·`lib/startup/**`·`components/launch-intro/**`·`lib/lifecycle/**`, 전역 복귀 리스너, `proxy.ts`·서버 인증 게이트, 배포 설정.
- 승인 시 `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §6·`MainActivity.java:189-191` 주석과의 충돌은 이 문서가 우선한다.

## H1. OS 시작 화면 해제
1. 해제 권한은 **2개뿐**: ① 웹 성공 신호(`dismissSplash`) ② 네이티브 고장 판정. 제3 경로 추가 금지.
2. 표시 시간을 정하는 타이머(최소·최대 표시) 금지 — 유지. 고장 판정 타이머는 ① 첫 문서 대기(T_doc, 문서 요청 후 미도착 — 로드는 끊지 않고 오류 화면, 늦게 도착하면 걷는다) ② 문서 완료 후 JS 미시작(T_js) ③ JS 시작 후 미해제(T_release) 세 가지에만 두며 정상 시작에서 발동하지 않는다. T_doc 는 두 플랫폼 10초(Android `WEBVIEW_LOAD_TIMEOUT_MS` · iOS `startupDocWaitTimeoutMs`), 통화 경로 제외 (Owner 승인 2026-11-08 · `docs/audit/ios-startup-document-wait-cap-design-2026-11-08.md`). 값은 계측 실측 후 확정(후보 T_js 8s·T_release 15s). 단순 고정 타이머 복원(구 8초) 금지 (Owner D1).
2-1. 자동 재시도 상한: 일시 오류 3회, 웹 고장 문서당 1회, 이후 수동 버튼만. 무한 자동 재시도 금지.
3. 고장 판정 해제는 반드시 재시도 화면을 함께 띄우고 사유를 기록한다. 빈 화면·녹색 화면으로 남기는 종료 상태 금지.
4. 해제 대기 상태(pending)는 WebView 사망·오류 경로에서 반드시 풀린다. 오류 경로 해제는 화면 그리기 대기를 하지 않는다.
5. Android 주 문서 HTTP 응답은 200~399 외 전부 실패로 처리한다. 하위 리소스 오류를 주 문서 실패로 보지 않는다.

## H2. 웹 해제 책임
1. JS 가 실행되는 **모든 문서**(루트 not-found·global-error·(main) 밖 경로 포함)는 해제 신호를 낸다. 경로별 해제 주체는 단일 표로 관리하고 신규 최상위 경로는 표에 먼저 등록한다.
2. hydration 이전 오류·청크 실패는 루트 `<head>` 초기 가드가 처리한다(1회 새로고침 → 실패 시 해제+오류).
3. 시작 경로(인트로 준비 포함)의 모든 비동기 대기는 상한·예외 처리를 가진다. 상한 없는 `await` 금지.

## H3. 배포 스큐
1. 켜져 있는 앱이 구버전 자산 404 로 깨지는 상태를 허용하지 않는다(스큐 보호 또는 동등 수단 필수).
2. 빌드 변경 감지는 복귀 조정자가 하고, 새로고침은 통제된 시점 1회만 한다.

## H4. 세션 갱신 (2026-11-08 재감사로 수정 — Supabase 공식 SSR 계약 기준 혼합 구조)
1. 서버 측 유일 갱신자 = proxy 의 화면 문서·RSC 이동 경로(request+response 쿠키 기록). 만료 90초 이내 토큰은 캐시 적중이어도 갱신을 건너뛰지 않는다.
2. API 트래픽의 유일 갱신자 = 브라우저 singleton 클라이언트. proxy `/api` 게이트·Route Handler·RSC 헬퍼는 검증만 하고 갱신을 유발하지 않는다.
3. 만료 토큰 서버 응답은 401 `token_expired` 로 통일, 클라이언트는 1회 갱신 후 1회 재시도.
4. 무효(`refresh_token_not_found`·`already_used`)는 1회 종료 처리·재시도 금지. 일시 오류(네트워크·5xx)는 세션 유지·로그아웃 금지.
5. 권한·회원 상태 캐시 키는 검증된 `sub` 만. 쿠키 해시 키에 권한 데이터를 싣지 않는다.

## H5. 복귀·부팅 요청
1. 전역 `visibilitychange`·`focus`·`online`·Capacitor `resume` 직접 구독 금지 — 복귀 조정자만 구독한다.
2. 복귀 1회 HTTP 는 조정자 묶음 3건 이하(세션·빌드·동기화). 나머지는 지연·중복 제거.
3. 화면 비가시·전역 상시 폴링 금지(예: 2초 통화 폴링 운영 활성화 금지).
4. 요청 1건당 서버 인증 네트워크 호출 0~1회, 공통 게이트 DB 읽기는 공유 캐시 경유.

## H6. 증거
1. 진입 계측(단계 시각·해제 사유·플랫폼·빌드·콜드/복귀)을 서버로 수집한다. 진입 관련 PASS/FAIL 판정은 이 수집값 + 기기 로그로만 한다.
2. 고장 판정 해제 발생은 경보 대상이다.

## 변경 이력
- 2026-11-08 DRAFT 작성 (Claude, 감사 근거).
- 2026-11-08 재감사 반영 (`docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md`): H1-2 고장 판정 정의·재시도 상한, H4 혼합 구조로 수정. 여전히 DRAFT.
- 2026-11-08 H1-2 개정 (Owner 「승인, 구현해」): 고장 판정에 T_doc(첫 문서 대기 10초) 추가 — iOS build 28 실기 FAIL(녹색 로고 20.5초) 근거. 여전히 DRAFT.
- 2026-11-08 구현 대조: H1(Android C1·iOS C7 코드)·H2(C2)·H3(C3·Skew 7일)·H4(Amendment (6)(7))·H6(C8) 반영 — §13 표. H5(복귀 요청 묶기)는 보류. Owner 승인 전 DRAFT 유지.
