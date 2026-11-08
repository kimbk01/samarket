# 앱 진입·OS 녹색 로고 정지·장시간 복귀 불안정 — 전수 감사 · 원인 확정 · 대책 (2026-11-08)

- 작성: Claude (감사만 · 코드/DB/설정 변경 0)
- 기준: main `f560347126b6619b05ae90ead4908146c6e5d69d` (Production `dpl_9t7WuZMRn4aifqtNajomuVWspQc2`, 13:40 PHT 배포)
- 판정 표기: **확정(코드)** = 코드 경로를 줄 단위로 확인 · **확정(운영)** = 운영 로그/DB/HTTP 로 직접 확인 · **NOT_PROVEN** = 확인 못 함
- 하드락 초안: `docs/dibay-app-entry-resume-hard-lock.md` (Owner 승인 전 DRAFT)

## 0. 작업자 정정 (먼저)

직전 보고에서 「같은 토큰을 9곳이 동시에 갱신하다 모두 실패해 로그아웃됐다」고 썼다. **인과는 확인되지 않았다.** 운영 auth 로그의 오류 코드는 `refresh_token_not_found` (토큰이 이미 없음)이지 재사용 충돌이 아니다. 확정된 것은 「이미 죽은 토큰 1개가 기기 1 + Vercel 서버 6 인스턴스에서 1초 안에 9번 갱신 시도됐다(증폭)」까지다. 토큰이 왜 없었는지는 NOT_PROVEN (같은 기기 IP 에서 테스트 계정 4개 로그인·전환 기록 있음).

## 1. 결론 — 연쇄인가 · 땜빵인가 · 추측인가

| 질문 | 답 | 근거 |
|---|---|---|
| 연쇄인가 | **예.** 독립 결함 4개가 한 사슬로 이어진다 (§3) | 운영 배포 기록·HTTP 404 실측·auth 로그·코드 |
| 땜빵인가 | **예.** 시작 화면 장치는 2026-07~10 사이 13세대 이상 재구축·폐기됐고, 「OS 화면 멈춤」은 증상 단위로 5번 이상 고쳐졌다. 매번 해제 경로 1개만 보강하고 「해제 권한이 웹 신호 1개뿐」인 구조는 그대로 남았다 | §5 이력 |
| 추측인가 | 아래 원인 R1~R4 는 **코드·운영 증거로 확정**. 각 원인이 Owner 기기의 특정 1회 멈춤에서 실제로 발동했는지는 그 시점 기기 로그가 없어 NOT_PROVEN — 이 공백이 반복의 근본 이유이기도 하다(R5: 계측 부재) | §2 |

## 2. 확정 원인

### R1. OS 시작 화면 해제 권한이 「웹 성공 신호 1개」뿐 — 고장 시 영원히 멈춤 (확정(코드))

- Android: `MainActivity.java:1274` `setKeepOnScreenCondition(() -> !webSplashDismissRequested)`. 문서 수신 완료(`onPageFinished`, :1957) 순간 10초 제한이 꺼진다. 그 뒤 JS 실패·청크 실패·hydration 정지면 해제 수단 0.
- iOS: `DibayRootBridgeViewController.swift` 녹색 화면 연장은 웹 `dismissSplash` 또는 「`window.next` 없음」일 때만 제거. 번들이 시작만 하면 이후 정지는 영구.
- 변경 이력: 2026-07-27 `20a99b28e` 가 Android 8초 안전 해제(`SPLASH_MAX_KEEP_MS`) 삭제. 2026-10-01 `0f9241605`·`ba5857aed` 가 iOS 녹색 연장 화면 도입(이전에는 정지 시 연한 배경이 보였음).
- 하드락 충돌: `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §6 「무한 로딩 금지」 ↔ `MainActivity.java:189-191` 「DO NOT: 3/5/8s display timers」. 코드는 후자만 지킨다.

추가로 웹 신호가 **오지 않는** 경로 (모두 확정(코드)):

| # | 경로 | 증거 |
|---|---|---|
| R1-a | 루트 레이아웃 형제 컴포넌트(LifecycleRouteEffects·InitialSurfaceBootstrap 등) 오류 → `global-error.tsx` → 해제 없음 | `app/layout.tsx:107-122`, `app/global-error.tsx` |
| R1-b | 매칭 없는 주소 → 루트 `not-found.tsx` → 해제 없음 (복원 주소·관리자 초기 화면·푸시 경로로 진입 가능) | `app/not-found.tsx`, `lifecycle-route-effects.client.ts:76,87` |
| R1-c | hydration 전 청크 실패는 처리기 없음 (처리기는 hydration 후 등록) | `components/app/AppBootProvider.tsx:73-85` |
| R1-d | Android 문서 응답 401/403/429 는 실패로 안 봄 → 「완료」 처리 → 제한 꺼짐 → 영구 | `DibayBridgeWebViewClient.java:147` (500↑·404 만 실패) |
| R1-e | Android 하위 리소스 SSL 오류도 문서 실패로 처리 (오판) | `DibayBridgeWebViewClient.java:155-160` |
| R1-f | Android 해제 대기 중 렌더러가 죽으면 `webSplashDismissPending=true` 로 잠겨 오류 화면의 해제 요청까지 무시 (60초 내 재사망 시 SHOW_ERROR 경로) | `MainActivity.java:1603`, `DibayRendererRecoveryPolicy.java` |
| R1-g | iOS 첫 탐색 실패(오프라인) 시 `errorPath` 미설정 → 빈 화면·재시도 없음 | Capacitor `WebViewDelegationHandler.swift:149-152` |
| R1-h | 인트로 준비 단계 시간 상한·try/catch 없음 (현재 운영 `launch_intro_live.state=unpublished` → 지금 영향 0, 게시 시 재발. 10-01 `ae7ab81ba` 같은 증상 전례) | `LaunchIntroRoot.tsx:71-148` |

### R2. 잦은 운영 배포 + 구버전 청크 404 — 오래 켜 둔 앱이 깨지고 전체 재부팅 (확정(운영))

- 운영 배포: **2026-11-07 19:01 ~ 11-08 13:40 PHT (18.6시간) 동안 READY 41회** (Vercel `list_deployments`). 약 27분마다 1회.
- 실측: 이전 배포(`samarket-lkkzinz7u…`) 화면이 쓰던 청크 3개를 운영 주소로 요청 → **3개 모두 404** (이전 배포 주소에서는 200). 즉 배포마다 켜져 있던 앱의 지연 로드 화면·컴포넌트가 실패한다.
- 결과: `scheduleChunkReloadOnce` 로 전체 새로고침 = 콜드 부팅 재실행(=R1 위험 구간 재진입) 또는 화면 일부 실패. 「장시간 켜 두면 버벅·불안정」의 확정 원인 1.
- 배포 스큐 보호(Vercel Skew Protection) 설정 여부: NOT_PROVEN (프로젝트 API 응답에 항목 없음). `next.config.js` 에 `deploymentId` 없음 (확정(코드)).
- AGENTS.md 개발 프로세스 1번 「한 작업 = main 1회」 대비 실제 빈도가 높다(프로세스 위반 여부 판정은 Owner).

### R3. 복귀·부팅 요청 폭주 + 요청마다 인증 중복 + 세션 갱신 주체 다수 (확정(코드), 증폭은 확정(운영))

- 복귀 1회에 전역 리스너가 HTTP 8~12건 + Realtime 재연결을 동시에 낸다(배지·친구요청·가입상태·주소게이트·인트로 조회·통화 2회·presence·푸시 재등록 등). 조정자(coordinator) 없음.
- 콜드 부팅 계획 요청: 클라이언트 `getUser` + API 7개 (`run-app-boot.ts:188-197`) + 전역 호스트 추가분.
- 요청 1건당 서버 비용: proxy 인증 + `/api` 회원 상태 DB 읽기(`enforce-api-member-read-policy.ts:43-80`) + 핸들러 자체 인증(`get_user_ms` 24~140ms 실측, 네트워크 호출). HTML 은 + 가입 게이트 profiles 조회 + 루트 레이아웃 동의 버전 RPC(`app/layout.tsx:95`).
- 세션 갱신 주체: 클라이언트 + proxy(`/api` 게이트는 갱신 결과를 버림 `enforce-api-member-mutation-policy.ts:91-93`) + 각 핸들러. 동시 진입 합류는 인스턴스 1개 안에서만(`proxy.ts` single-flight, 12초 캐시 `proxy-auth-session-cache.ts:6`).
- 운영 증거: 11-08 00:29:55 PHT 갱신 시도 9건 동시(기기 1 + 서버 IP 6), API 6종 동시 실패(`/api/me/profile`·`settings`·`notification-settings`·`mandatory-address-gate`·`app-settings`·`app/main-bottom-nav`).
- 규모 영향(코드 기준 산식): 복귀 1회 ≈ 요청 10 × (인증 2 + DB 1~2) ≈ 인증 20·DB 15. 사용자 수에 정비례. 1,000명이 같은 시간대 복귀하면 인증 약 2만·DB 약 1.5만 호출 (산식 추정 — 부하 실측 아님).
- 현재 서버 자체는 빠름(확정(운영) 24h: Auth `/user` 평균 8ms, `/token` 평균 35ms, `/` TTFB 0.27~0.51s). **지금 느린 원인은 서버 용량이 아니라 요청 구조**이며, 이 구조가 사용자 증가 시 터지는 지점이다.
- 2초 통화 폴링(`call-v3-incoming-discovery.ts:17`)은 운영 환경변수 키 없음 → **운영 꺼짐** (확정(운영)). 켜면 앱 1개당 0.5 rps — 하드락에서 금지 대상.

### R4. iOS 백그라운드 WebContent 종료 → 전체 재로드 (확정(코드))

- Capacitor 기본 `webViewWebContentProcessDidTerminate` → `webView.reload()`. 앱 재정의 없음. 장시간 백그라운드 후 복귀 = 사실상 콜드 부팅(R1·R3 재진입). 녹색 연장 화면은 재설치 안 됨 → 사용자에게는 「멈춤/빈 화면 후 재로딩」으로 보임. 오프라인이면 R1-g 빈 화면.

### R5. 진입 계측 부재 — 그래서 매번 「추측」으로 고쳐 왔다 (확정(코드))

- 해제 사유·단계 시각(`__dibayBootMetrics`)은 기기 메모리·logcat 에만 있고 서버로 보내지 않는다. 사용자 기기에서 멈춘 1회를 사후에 증명할 수단이 없다. 이번 감사도 Owner 기기 멈춤 시점 로그가 없어 「그 1회가 R1 의 어느 경로였는지」는 NOT_PROVEN.

## 3. 연쇄 구조

```
잦은 배포(R2) ─▶ 켜 둔 앱 구버전 청크 404 ─▶ 화면 실패 / 전체 새로고침
iOS 장시간 백그라운드(R4) ─▶ WebContent 종료 ─▶ 전체 재로드          │
Android 프로세스 정리 ─▶ 콜드 시작 ───────────────────────────────┤
                                                                     ▼
                          콜드 부팅 = 해제 권한이 웹 신호 1개(R1) ─▶ 고장 시 녹색 로고 영구
                                                                     │
                          토큰 만료 상태 + 요청 10여 건 동시(R3) ─▶ 첫 화면 지연 · 죽은 토큰이면 9중 실패 → 로그아웃
                                                                     │
                          계측 없음(R5) ─▶ 원인 미확정 ─▶ 증상 땜빵 반복
```

## 4. 대책 (원인별 · 같은 단계에서 영향 처리 포함)

| ID | 원인 | 대책 | 바뀌는 곳 / 영향 처리 | 구분 |
|---|---|---|---|---|
| C1 | R1 | **진입 해제 계약 2원화**: 해제 = ① 웹 성공 신호 또는 ② 네이티브 고장 판정. 고장 판정 = 문서 완료 후 T_fail 안에 웹 진행 표시(`reactMounted`)가 없거나, 해제 대기 중 WebView 사망/오류. 판정 시 시작 화면 해제 + 기존 재시도 화면(`dibay_webview_load_error_overlay`) + 사유 기록. 정상 경로 표시 시간 영향 0 (표시 타이머 아님) | Android `MainActivity`(keep 조건·`requestWebSplashDismiss` pending 잠금 해제·오류 경로는 화면 대기 없이 즉시 해제), `DibayBridgeWebViewClient`(문서 4xx 실패 처리·SSL 은 주 문서만), iOS `DibayRootBridgeViewController`(동일 판정·오프라인 재시도 화면) | 네이티브 (재빌드) |
| C2 | R1-a~c,h | **JS 가 도는 모든 문서는 반드시 해제**: 루트 `not-found`·`global-error` 해제, `(main)` 밖 경로 해제 주체 단일 표(가입·관리자·/dev 포함), 루트 `<head>` 인라인 초기 가드(hydration 전 오류·청크 실패 → 1회 새로고침 → 그래도 실패면 해제+오류), 인트로 준비 상한·try/catch | `app/not-found.tsx`, `app/global-error.tsx`, `app/layout.tsx`, `lib/startup/startup-metrics.ts`, `components/launch-intro/LaunchIntroRoot.tsx` | 웹 |
| C3 | R2 | **배포 스큐 제거**: ① Vercel Skew Protection 사용(설정 변경·요금제 확인 필요 → Owner 승인) 또는 동등 수단, ② 복귀 시 빌드 ID 비교 → 바뀌었으면 입력 없는 순간에 통제된 1회 새로고침(무작위 청크 실패 대신), ③ 운영 배포 빈도 규정 준수 | Vercel 프로젝트 설정, `next.config.js`, 복귀 조정자(C5) | 설정+웹 |
| C4 | R3 | **세션 갱신 주체 1개(클라이언트)**: 복귀 시 클라이언트가 세션 갱신을 먼저 끝낸 뒤 요청 시작. 서버(proxy·핸들러)는 검증만(갱신 금지), 만료면 401 `token_expired` → 클라이언트 1회 갱신 후 1회 재시도. `docs/auth-hard-lock.md` 대조 필수 | `proxy.ts`, `lib/auth/*` 서버 게이트, `lib/supabase/supabase-server-route.ts`, `lib/auth/dibay-session-manager.ts` | 웹 (인증 — Owner 승인) |
| C5 | R3 | **복귀 조정자 1개**: 전역 `visibilitychange`/`resume` 리스너 직접 사용 금지 → 조정자가 ① 세션 신선 ② 빌드 확인 ③ 우선순위 묶음 요청(1~3건)·나머지는 지연·중복 제거 순서로 실행 | 복귀 리스너 13종(감사 목록) 일괄 이관 | 웹 |
| C6 | R3 | **요청당 서버 고정비 제거**: 신원은 JWT 로컬 검증(네트워크 0), 회원 상태 판정은 인스턴스 간 공유되는 짧은 캐시 또는 토큰 클레임, 루트 레이아웃 동의 버전은 요청마다 DB 대신 캐시 태그 무효화 | `proxy.ts`, `enforce-api-member-*`, `app/layout.tsx`, `resolve-required-consent-versions.ts` | 웹+DB(필요 시) |
| C7 | R4 | iOS WebContent 종료 처리 재정의: 재로드 동안 녹색 연장 화면 재설치(C1 판정 적용), 오프라인이면 재시도 화면 | iOS `DibayRootBridgeViewController` | 네이티브 |
| C8 | R5 | **진입 계측(서버 수집)**: 단계 시각(문서·JS 시작·해제)·해제 사유(정상/고장판정 종류)·플랫폼·빌드·복귀/콜드 구분을 해제 후 1회 전송. 고장 판정 해제는 경보. 이것이 이후 판정의 유일한 증거원 | 웹 1회 전송 + 수집 API + 관리자 조회 | 웹+DB |

순서(의존): C8 → C2 → C1·C7(네이티브 1회 빌드) → C3 → C4·C5·C6. C8 을 먼저 넣어야 C1~C7 효과를 운영 수치로 PASS/FAIL 판정할 수 있다.

## 5. 땜빵 이력 (증상 단위 수정)

- 2026-07-01 이후 시작·인트로·생명주기 경로 커밋 114건, 재구축·폐기 13세대 이상 (07-27 Local Runtime 도입·철회 `4c09b10b6`/`9c34439a5`, 09-28 구 인트로 제거 `62e7483c7`, 09-30 12차 폐기 `e0231ab28`, 09-30 R15 `97b27a239` → 10-01 철회 `885f73d49`, 10-01 R16 전체 되돌림 `7b11865ff` → R17-OS `0f9241605` → 현 인트로 `1e302808a`).
- 「OS 화면 멈춤」 반복 수정: `ae7ab81ba`, `ba5857aed`, `4bcbc4e1f`, `e582c4fab`, `ee2abc543`.
- 「인트로·첫 화면 뒤 빈 화면」 반복 수정: `702a92821`, `9959aadd7`, `f390c9150`, `6c6e76329`, `6fb35dfc9`.
- 공통점: 매번 「웹 신호가 안 온 경로 1개」를 고치고, 「신호가 안 오면 아무도 풀지 않는다」는 구조(R1)와 증거 수집(R5)은 손대지 않았다.

## 6. 확인 못 한 것 (NOT_PROVEN)

- Owner 기기에서 멈춘 특정 회차가 R1 의 어느 경로였는지 (해당 시점 기기 로그 없음 — C8 로 해소).
- 장시간 실행 시 메모리 누수 여부 (Xiaomi 앱 14h49m·렌더러 RSS 약 220MB, Samsung 10h26m·155MB·스왑 93MB 관측 — 기준값 없음).
- Vercel Skew Protection 설정·요금제 가용 여부.
- `refresh_token_not_found` 토큰이 사라진 이유.
- 부하 실측(1,000명 동시 복귀)은 하지 않았다 — §2 R3 수치는 코드 기준 산식.

## 7. Owner 결정 필요

1. 하드락 충돌 해소: 「표시 타이머 금지」는 유지하고 「고장 판정 해제」를 허용할지, T_fail 값.
2. Vercel 설정 변경(Skew Protection) 승인.
3. 인증 구조 변경(C4·C6) 승인 — `auth-hard-lock` 범위.
4. 네이티브 C1·C7 반영 빌드 시점 (메모리 규정: 네이티브 빌드는 Owner 일괄).
