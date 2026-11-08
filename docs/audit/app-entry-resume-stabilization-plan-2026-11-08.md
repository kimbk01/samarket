# DIBAY 앱 시작·복귀·인증·배포 안정화 — 재감사 결과 및 구현 계획 (2026-11-08)

- 지시: Owner 「시작·복귀·인증·배포 안정화 — Owner 결정 및 실행 지시」 (D1~D4, Phase 0~4)
- 성격: **조사·설계만**. 저장소 코드·DB·Vercel/Supabase 설정·배포·네이티브 빌드 변경 0.
- 기준: origin/main `9af664cc167f` (14:36 PHT) · Production `dpl_9t7WuZMRn4aifqtNajomuVWspQc2` = `f560347126b6` (13:40 PHT). 차이 = 다른 세션 i18n 커밋 12건(시작·인증 경로 무관). 조사는 origin/main 별도 checkout 에서 수행(로컬 작업 트리는 main 대비 318커밋 뒤·미커밋 259파일 — 섞지 않음).
- 표기: **C** = 코드 확인 · **O** = 운영 로그/DB/HTTP 실측 · **E** = 추정 모델 · **NP** = NOT_PROVEN
- 선행 문서(참고용, 본 문서가 대체): `app-entry-splash-resume-root-cause-2026-11-08.md`, `../dibay-app-entry-resume-hard-lock.md`

## 0. 작업자 정정 (선행 문서 대비)

| # | 선행 문서 내용 | 정정 |
|---|---|---|
| 1 | 「9곳 동시 갱신이 실패를 일으켰다」 | 오류 코드는 `refresh_token_not_found` = **세션 행이 이미 없음**. 갱신 충돌이면 `refresh_token_already_used` 가 나온다(Supabase 오류 목록). 충돌 원인설 **철회**. 최초 원인 NP |
| 2 | 「HTML 요청마다 proxy 인증 + 가입 게이트 DB」 | `/` 는 비로그인 공개 경로로 proxy 가 인증 없이 통과(C). 인증·가입 게이트는 비공개 경로 HTML·`/api` 에만 적용 |
| 3 | 「복귀 1회 8~12건」 | `/` 기준 약 7건(6~9), 메신저 홈 11~13, 채팅방 12~15 (C, 코드 집계) |
| 4 | 「요청당 인증·DB 고정비가 규모 병목」 | 게이트 DB 쿼리는 평균 0.05~1.3ms 로 DB 시간 비중 작음(O). **DB 실행 시간의 79.7% 는 Realtime WAL 폴링**(O) — 규모 1순위 병목은 Realtime |
| 5 | C4 「클라이언트 단독 갱신」 권고 | Supabase SSR 공식 계약(proxy 갱신+쿠키 기록)과 충돌 → **혼합 구조로 수정**(§7) |
| 6 | (하위 감사) 「Native Change Gate 문서 없음」 | 있음: `docs/dibay-chat-call-current-normal-hard-lock.md` §5 |

## 1. 확정 원인 (증거 있는 것만)

| ID | 원인 | 증거 |
|---|---|---|
| R1 | OS 시작 화면 해제 권한이 웹 성공 신호 1개뿐 → 웹이 문서 수신 후 멈추면 무한 대기 | C: `MainActivity.java:1274`(keep), `:1957`(10초 제한 취소), `DibayRootBridgeViewController.swift:308-316` · 이력 C: `20a99b28e`(07-27 8초 안전 해제 삭제), `0f9241605`/`ba5857aed`(10-01 iOS 연장 화면) · **기존 테스트가 이 구조를 고정**: `lib/startup/__tests__/r17-os-native-visual.test.ts:42-46,77-93` |
| R1-a | 해제 대기(pending) 잠금 — 렌더러 사망 시 오류 화면 해제 요청까지 무시 | C: `MainActivity.java:1603-1604,1625,2234,1748-1750` |
| R1-b | 주 문서 401/403/429 를 실패로 안 봄 → 10초 제한 꺼짐 | C: `DibayBridgeWebViewClient.java:147` |
| R1-c | 하위 리소스 SSL 오류를 주 문서 실패로 처리 | C: `DibayBridgeWebViewClient.java:155-161` |
| R1-d | iOS 첫 탐색 실패 시 errorPath 없음 → 빈 화면·재시도 없음 | C: `capacitor.config.ts:46-53`, Capacitor `WebViewDelegationHandler.swift:149-152` |
| R1-e | 웹 해제 없는 경로: 루트 `not-found`, `global-error`, `/dev/**`, hydration 전 청크 실패 | C: `app/not-found.tsx`, `app/global-error.tsx`, `startup-metrics.ts:52-60`, `AppBootProvider.tsx:70-85` |
| R2 | 배포 스큐: 켜 둔 앱이 이전 배포 청크 요청 → 404 | O: 이전 배포 청크 3개 운영 주소 404 / 이전 배포 주소 200 · O: 운영 HTML `?dpl=` 0건 · O: Skew Protection **꺼짐**(Pro 요금제 포함 기능) · O: 11-07 19:00~11-08 13:41 PHT main 커밋 56·Production READY 41(중앙 간격 13.2분, 최소 1.3분) |
| R2-a | 청크 실패 시 자동 새로고침에 작업 보호 조건 없음 — **수신 통화 UI 청크 실패 시 새로고침** | C: `import-with-chunk-retry.ts:26-36`, `IncomingCallOverlayChunkBoundary.tsx:22-24`, `CommunityMessengerActiveCallHost.tsx:36`, `CallIncomingChrome.tsx:42`, `AppBootProvider.tsx:75-77` |
| R2-b | 「세션당 1회」 새로고침 보호가 마운트마다 지워짐 → 지속 실패 시 무한 새로고침 가능 | C: `AppBootProvider.tsx:59` `clearChunkReloadSessionFlag()` (지속 실패 조건 발생 여부 NP) |
| R2-c | RSC 이동 시 빌드 ID 불일치면 전체 문서 재로드 | C: `next/.../fetch-server-response.js:142` |
| R3 | `/api` 게이트가 만료 토큰을 갱신하고 결과를 버림 — 같은 토큰을 서버 여러 곳이 소비 | C: `enforce-api-member-mutation-policy.ts:91-94`(setAll 무동작) + `getClaims` 는 만료 90초 전부터 갱신 유발(C: auth-js `EXPIRY_MARGIN_MS = 3×30s`) · O: 11-07 16:29:55 UTC 갱신 시도 11건(기기 1 + 서버 10) |
| R3-a | RSC 서버 렌더에서 갱신되면 새 토큰이 브라우저에 전달 안 됨(쿠키 쓰기 예외 무시) | C: `supabase-server-route.ts:23-31`, `get-optional-authenticated-user-id.ts` |
| R3-b | 인스턴스 단위 single-flight 가 합류 요청의 갱신 쿠키를 리더 응답에만 기록 | C: `proxy.ts:217-224,269` |
| R4 | iOS WebContent 종료 → 재로드, 연장 화면 재설치 없음·감시 없음 | C: Capacitor `WebViewDelegationHandler.swift:158-161`, `DibayRootBridgeViewController.swift:323` |
| R5 | 진입 계측 없음 — 사용자 기기 1회 멈춤을 사후 증명할 수단 0 | C: `client-boot-request-journal.ts` 개발 전용·미전송, 수집 테이블 없음(O: information_schema) |
| R6 (신규) | 규모 1순위 병목 = Realtime postgres_changes | O: pg_stat_statements(10-22~): WAL 폴링 2,343,710회·평균 10.83ms·**전체 DB 시간 79.7%**, `realtime.authorize` 89,166회 · O: `realtime.subscription` 119행 / 활성 약 16명(1인 약 7) · 게시 테이블 33개 |

## 2. 미확정 원인 (추가 증거 필요)

| 항목 | 상태 | 필요한 증거 |
|---|---|---|
| Owner 기기 멈춤 회차가 R1 의 어느 경로였는지 | NP | C8 계측 |
| `refresh_token_not_found` 토큰이 사라진 이유 | NP. 해당 24h 창 내 logout·user 삭제 없음(O). 동일 IP 27.49.10.28 에 6계정 사용 → IP 상관분석 불가. 가설: 이전에 로그아웃된 세션을 쥔 WebView 가 깨어남 (NP) | C8 + 실패 시 세션 식별(토큰 원문 없이 session_id 해시) |
| 통화 중 새로고침이 실제 통화를 끊는지 | NP (통화는 네이티브 소유라 코드상 근거 없음) | 통화 규정 실기 행렬 |
| 메신저 입력창·주문 진행 화면의 새로고침 시 보존 | NP (거래 글쓰기는 beforeunload 임시저장 C) | 화면별 확인 |
| 장시간 실행 메모리 누수 | NP | C8 + 기기 메모리 추적 |
| Skew Protection 이 꺼진 시점·이유 | NP | Vercel 감사 로그 |
| Capacitor WebView 안 Skew Protection 실제 동작 | 쿼리·헤더 방식이라 동작해야 함(C, 문서), 실기 NP | 활성화 후 실측 |

## 3. Owner 결정 D1~D4 반영

| 결정 | 반영 | 남은 충돌 |
|---|---|---|
| D1 조건부 승인 | 고정 대기·최소 표시 타이머 없음. 정상 해제 = 웹 신호 유지. 고장 판정은 **문서 완료 후 JS 미시작(T_js)·JS 시작 후 미해제(T_release)** 에서만 발동 → 정상 시작 시간 영향 0. 오프라인/느린 망/HTTP/웹/렌더러 구분. 재시도 버튼 + 자동 재시도 상한. 8초 복원 아님. T_fail 은 후보값(T_js 8s·T_release 15s)으로 C8 실측 후 확정 | ① `r17-os-native-visual.test.ts` 가 「타이머 금지」 고정 → 계약 테스트 개정 필요 ② `DIBAY_APP_LIFECYCLE_SSOT.md` §7.2 「인트로 준비는 시간 제한·타이머 아님」 ↔ D1 「무한 대기 금지」 — Owner 확인 필요 |
| D2 조사·설계 승인, 설정 보류 | §8 조사 완료. 설정 변경 0 | 활성화는 별도 승인 |
| D3 원칙 승인, 구현은 재감사 후 | §7 단일 책임 구조 확정안. 최초 원인 단정 안 함 | 구현 승인 필요 |
| D4 설계·조사 승인, 빌드 금지 | §5·§6 설계. 빌드·설치·실기 0 | Native Change Gate 보고 = §11 Phase 4 |

## 4. C1~C8 수정·유지·철회 권장표

| ID | 권장 | 현재 위치·호출 | 결함(C/O) vs 위험(NP) | 수정 후 계약 | 변경 파일·도메인 | 충돌 가능성 | 대체 설계 비교 | 실패·롤백 | 자동 테스트 | Production 검증 | 네이티브 빌드 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **C8 계측** | **유지·최우선** | 없음(개발 전용 journal) | R5 C | 실행 1회당 이벤트 ≤3, 해제 후 idle 에 sendBeacon, 실패해도 무시 | 웹: 계측 송신 모듈·수집 API(게이트 제외·IP/run 제한) · 저장: Vercel 로그 1줄(전량) + 실패만 Supabase 표(DB 변경 승인 필요) | 시작 경로에 await 0 → 충돌 없음 | 전량 DB 저장(5 writes/s @1만명) 대비 로그+실패만 표 = DB 부하 최소 | 송신 모듈 플래그 off / 1커밋 revert | vitest: 스키마·PII 없음·중복 제거·송신 실패 무해 | 배포 SHA 기준 이벤트 수신·`deployment_id` 별 집계 | 아니오 (네이티브 단계 시각은 기존 `__dibayBootMetrics` 주입 사용) |
| **C2 웹 해제** | **유지(범위 축소 명시)** | `startup-metrics.ts` 해제 함수, `ConditionalAppShell`, `app/error.tsx`, auth 폴백 접두 | R1-e C. **JS 미실행(오프라인·5xx 평문·번들 404)은 웹으로 불가 → C1 필수** | JS 가 도는 모든 문서는 해제. 경로별 해제 주체 표(순수 함수) · 루트 `<head>` 초기 가드(hydration 전 청크/스크립트 오류 → 1회 새로고침 → 실패면 정적 오류+해제) · not-found/global-error 해제(공급자 없이 직접 브리지) | `app/layout.tsx`, `app/not-found.tsx`(`NotFoundClient`), `app/global-error.tsx`, `lib/startup/*` | 이중 해제(네이티브 멱등 C) · 재로드 루프(세션 키 공유·R2-b 함께 수정) · 첫 그림 전 해제(rAF×2 후) | next/script beforeInteractive 대비 raw script(선례 `layout.tsx:106`, CSP 없음 C) | 상수 1개 revert | vitest: 모든 최상위 세그먼트 해제 주체 0 누락, 가드 jsdom(1회 새로고침→오류 DOM), not-found/global-error 해제 | 계측의 `release_reason` 분포 | 아니오 (구 바이너리 호환: 기존 브리지 이름만 사용) |
| **C1 Android 고장 판정** | **유지(D1 반영 재설계)** | `MainActivity` keep/`requestWebSplashDismiss`/load timer, `DibayBridgeWebViewClient` | R1·R1-a~c C | 순수 정책 클래스 상태기계 WAITING_DOC→DOC_LOADING→DOC_LOADED→JS_RUNNING→RELEASED, FAULT_{OFFLINE,NETWORK,HTTP,WEB,RENDERER}. T_doc(기존 10초 유지)·T_js(문서 완료 후)·T_release. 오류 경로는 화면 대기 없이 즉시 해제. pending 잠금 해제. 주 문서 4xx/5xx 는 T_js 결과로 판정(앱 HTML 401 화면 가리지 않음). SSL 은 주 문서만. 자동 재시도: 일시 오류 기존 3회 사다리, FAULT_WEB 문서당 1회, 이후 수동만 | `MainActivity.java`, `DibayBridgeWebViewClient.java`, 신규 `DibayStartupFaultPolicy.java`, 오류 레이아웃·문자열 | V4 수락 handoff(문서마다 정책 초기화, 통화 코드 무수정) · 통화 Activity 표시 중·`!appVisible` 이면 판정 보류 · 푸시 pending route 유지 · OAuth 코드 유실 위험(JS 사망 시, NP) · Play 즉시 업데이트 중 일시정지 · 렌더러 정책 위임 | 단순 8초 복원(거절됨) / 웹 신호만(현행, 결함) / 고장 판정(채택) | 정책 `ENABLED` 상수 + 이전 바이너리 | JVM: 정상 시작 무발동·느린 망 미발동·오프라인 구분·4xx·SSL·재시도 상한·pending 강제 해제·비가시 보류. 계약 테스트 개정 | 실기 행렬(Owner 별도 승인) + 계측 `FAULT_*` 비율 | **예** |
| **C7 iOS** | **유지(재설계)** | `DibayRootBridgeViewController`, Capacitor 기본 delegate | R1·R1-d·R4 C | `capacitorDidLoad` 에서 navigationDelegate 프록시(원 handler 강참조 위임) — provisional 실패·WebContent 종료 선처리: 연장 화면 재설치, 60초 반복 정책, 오류 화면, 같은 상태기계(Swift enum). 백그라운드 종료는 foreground 복귀 시 1회 reload | `DibayRootBridgeViewController.swift`, 신규 프록시·정책 Swift | `loadView` 가 `final`(C)이라 handler 교체 불가 → 프록시 방식 유지보수 위험(Capacitor 업그레이드 시 재확인) · CallKit/PushKit 은 별도 VC·네이티브 소유(C) — reload 가 통화 끊는 근거 없음(실기 NP) | errorPath 정적 페이지만(재시도 품질 낮음) 대비 프록시(채택) | 이전 바이너리 | iOS 테스트 target 없음(C) → Swift 순수 enum + 소스 계약 vitest, 실기 필수 | 실기 + 계측 | **예** |
| **C3 배포 보호** | **수정(3중 구성)** | Vercel 설정, `import-with-chunk-retry.ts`, 청크 경계 3곳 | R2·R2-a~c C/O | ① Skew Protection 활성(최대 보호 7~30일, 보관 30일 이내) ② 복귀 시 버전 확인(no-store 엔드포인트의 배포 SHA vs 번들 `NEXT_PUBLIC_WEB_DEPLOY_SHA`) → 「새 버전 대기」만 표시, 안전 시점(통화 없음·작성 중 없음·결제 아님·막 복귀)에만 1회 새로고침 ③ 자동 새로고침 3곳에 같은 안전 조건 + R2-b 루프 수정 ④ 배포 창(일 2회 등) 정책 | Vercel 설정(승인), `lib/next/*`, `AppBootProvider`, 통화 청크 경계 2곳(**통화 코드 → 통화 규정 별도 계획**) | Skew 만으로 남는 것: 보호 기간 초과 앱·문서 이동·`/api` 계약 변경 | `assetPrefix=VERCEL_URL`(교차 출처·보호 켜면 깨짐) / 외부 CDN 보관(복잡) — Pro 포함 기능이 최저비용 | 설정 off·코드 revert | vitest: 안전 조건 판정·루프 방지·버전 비교 | 활성화 후 이전 배포 청크 `?dpl=` 200 실측, 계측 `chunk` 실패 0 | 아니오 |
| **C4 세션 갱신 소유** | **수정(혼합 구조)** | proxy HTML(갱신+쿠키 기록), `/api` 게이트(갱신 후 폐기), 핸들러·RSC(갱신 가능, RSC 는 기록 실패), 브라우저 singleton(autoRefresh) | R3·R3-a·R3-b C/O | §7 | `proxy.ts`, `enforce-api-member-{read,mutation}-policy.ts`, `get-optional-authenticated-user-id.ts`, `server-guards.ts`, `supabase-server-route.ts`, `dibay-session-manager.ts` · 인증 도메인(`auth-hard-lock`) | SSR 페이지(proxy 가 계속 갱신하므로 유지) · RSC 이동 · OAuth 콜백(자체 세션 생성, 무관) · 다중 탭(SDK 락+BroadcastChannel) | 클라 단독(SSR 깨짐) / 서버 단독(API 병렬 갱신 그대로) / 혼합(Supabase 공식, 채택) | 1커밋 revert (DB 변경 없음) | vitest: 게이트·핸들러가 갱신을 유발하지 않음(만료 토큰 → 401 `token_expired`), 클라 401 → 1회 갱신 1회 재시도, 무효 세션 → 1회 종료 | auth 로그 `/token` 서버 IP 비율·`not_found` 군집 크기 | 아니오 |
| **C5 복귀 조정자** | **수정(목표치 조정)** | 전역 복귀 리스너 13종 각자 fetch | 결함 아님(구조 비효율) C | 단일 복귀 소유자(single-flight·최소 30초 간격): ① 세션 신선 대기 ② `GET /api/me/resume-snapshot`(배지·사장님 배지·가입 상태·주소 게이트·친구요청 수·수신 통화 확인) ③ 화면 자체 따라잡기 1건(presence 동봉). 나머지 지연 | 신규 API 1, 리스너 이관 | 수신 통화 확인은 **통화 코드** → 통화 규정 별도 계획(네이티브 CallKit/FCM 이 권위 유지) · 배치 단일 실패점 → 도메인별 대체 엔드포인트 유지 · presence·읽음 누락 금지 | 현행 유지 / 묶음(채택) | 조정자 플래그 off | vitest: 복귀 1회 HTTP 수, 30초 내 재복귀 무동작 | 계측 `req_count` | 아니오 |
| **C6 고정비** | **축소 수정** | 게이트 캐시 전부 인스턴스 메모리 | O: 게이트 DB 시간 비중 작음 → **보안 위험 대비 이득 작음** | 공유 캐시 도입 **보류**. 대신 ① `/api` 게이트 갱신 제거(C4) ② 가입 완료 판정을 검증된 `sub` 키로 캐시 ③ 이후 규모 단계에서 공유 캐시는 `sub` 키·판정값만·TTL≤5s·제재/탈퇴 시 epoch 증가로 설계 | `proxy-signup-gate.ts`, 게이트 캐시 | 제재·탈퇴 반영 지연(TTL) · 키를 쿠키로 하면 교차 혼합 위험 → 금지 | KV 공유 캐시(비용·보안) / 현행(채택+소폭) | revert | vitest: 키=sub, 제재 즉시 반영 | pg_stat_statements 호출 수 | 아니오 |

추가 신규 항목(규모 대비, R6): **C9 Realtime 구독 구조 감사** — 1인 약 7구독·게시 테이블 33개·WAL 폴링이 DB 시간 80%. 이번 지시 범위(시작·복귀)를 넘는 메신저 Realtime 계약 영역이라 **보고만**, 별도 지시 필요.

## 5. 정상 시작·복귀 상태 전이도 (제안)

```
[콜드 시작]
OS 화면 ─문서 시작→ DOC_LOADING ─문서 완료→ DOC_LOADED ─JS 시작 확인→ JS_RUNNING ─웹 해제 신호→ RELEASED(홈)
  DOC_LOADING ─네트워크 없음→ FAULT_OFFLINE(오류 화면) ─연결 복구 1회 자동/버튼→ DOC_LOADING
  DOC_LOADING ─연결 오류·T_doc→ FAULT_NETWORK ─자동 ≤3 / 버튼→ DOC_LOADING
  DOC_LOADED ─T_js 경과·JS 없음→ FAULT_WEB ─문서당 자동 1회→ DOC_LOADING ─재실패→ 오류 화면(버튼만)
  JS_RUNNING ─T_release 경과→ FAULT_WEB(해제+오류 화면)
  (웹) hydration 전 청크 실패 → 1회 새로고침 → 재실패 → 정적 오류 + 해제

[웜 복귀 — 프로세스·WebView 생존]
RELEASED 유지(마지막 화면·채팅 위치·입력 보존) → 복귀 조정자: 세션 신선 → resume-snapshot 1건 → 화면 따라잡기 1건
  버전 변경 감지 → 「새 버전」 대기 → 안전 시점(통화·작성·결제 없음)에만 1회 새로고침

[렌더러/WebContent 종료]
→ FAULT_RENDERER → 앞: 즉시 재생성 / 뒤: 복귀 시 재생성 / 60초 내 반복: 오류 화면 → 재생성 후 [콜드 시작] (iOS 연장 화면 재설치)

[프로세스 종료 후 복원] = [콜드 시작] + 복원 힌트(LIFECYCLE_SSOT §5)
[푸시·딥링크 실행] = [콜드 시작] + pending route(재시도해도 유지, RELEASED 후 재생)
[통화 수락] 통화 화면(네이티브) 먼저 → 메인 비가시 동안 고장 판정 보류 → 표시 시 판정
```

## 6. 웹·서버·DB·네이티브 영향도

| 계층 | 변경 | 영향 화면·호출처 | 같은 단계 처리 |
|---|---|---|---|
| 웹 | C2·C3(코드)·C5·C8 송신 | 전 화면 시작 경로, 통화 청크 경계(통화 규정), 복귀 리스너 13종 | 해제 주체 표 테스트로 누락 0 보장 |
| 서버 | C4·C6·C8 수집 API·resume-snapshot | 모든 `/api` 게이트, RSC 페이지 인증 헬퍼 | 401 `token_expired` 를 클라 처리와 같은 단계 배포 |
| DB | C8 실패 표(신규 테이블·RLS·보존 cron) | 없음(쓰기 전용) | Owner 승인 후 적용 |
| 네이티브 | C1·C7 | Android MainActivity·WebViewClient / iOS RootBridge | Native Change Gate·빌드 1회 일괄 |
| 설정 | Skew Protection, 배포 창 | 전 사용자 | Owner 승인 |

## 7. 인증·세션 갱신 최종 단일 책임 구조 (혼합 — Supabase 공식 SSR 계약 기준)

| 경로 | 역할 | 갱신 | 근거 |
|---|---|---|---|
| proxy — 화면 문서·RSC 이동 | **서버 측 유일 갱신자** | 예, request+response 쿠키 기록(현행 유지). 만료 90초 이내면 캐시 적중이어도 갱신 생략 금지 | Supabase SSR 가이드, `proxy.ts:217-224` |
| proxy — `/api` 게이트 | 검증만 | **아니오** — 토큰 명시 `getClaims(jwt)`(비대칭 키 로컬 검증, C: JWKS 473회/24h) 만료면 401 `token_expired` | 현재 갱신 후 폐기(R3) 제거 |
| Route Handler·RSC 헬퍼 | 검증만 | **아니오** — 리더 클라이언트 공유 제거 | R3-a·R3-b 제거 |
| 브라우저 singleton | **API 트래픽의 유일 갱신자** | 예(autoRefresh + 401 시 1회 갱신 후 1회 재시도, 탭 간 락) | `client.ts`, `dibay-session-manager.ts` |

오류 분류(구현 계약): 만료 → 클라 1회 갱신·재시도 / `refresh_token_not_found`·`already_used`(무효) → 1회 로그아웃 처리, 재시도 금지 / 네트워크·5xx(일시) → 세션 유지·백오프, 로그아웃 금지. 캐시 키는 검증된 `sub` 만(쿠키 해시 키는 신원 판정에만, 권한 데이터 공유 금지).

## 8. Vercel 배포 보호·비용

- 요금제 **Pro**(O). Skew Protection **Pro 포함·추가 요금 없음**(Vercel pricing·docs). 최대 보호 기간 기본 1일, 배포 보관 기간(이 프로젝트 30일, O)까지 연장 가능.
- 적용 범위(C, docs+Next 소스): 지연 청크·CSS·이미지(`?dpl=`), RSC·prefetch(`x-deployment-id`). 비적용: `/api`, 문서 새로고침. Server Action 은 이 앱에 없음(C).
- 비용(O, Vercel billing 10-31~11-07): 함수 $2.60(호출 약 69만/주 E), **빌드 $41.44 — 최대 항목**. 배포 빈도 자체가 비용 1순위 → 배포 창 정책이 비용·안정성 동시 개선.
- Git→Production(C/O): main 만 배포, `ignoreCommand` 가 문서·네이티브·테스트만 바뀐 푸시 생략. 50건 중 48 푸시 유발·2 수동.
- 권장(승인 필요): Skew Protection 7~30일 + 배포 창(예: 12:00·22:00 PHT, 긴급 예외) + 복귀 버전 확인·안전 새로고침(C3②③). 구 네이티브 앱은 모두 운영 주소 원격 로드라 웹 변경만으로 적용(C).

## 9. 사용자 증가 대비 용량 (E = 모델, O = 실측 기준값)

기준값(O): 24h 활성 기기 약 16·전체 142명 · 콜드 시작 1회 우리 서버 요청 약 27(웹 21) + Supabase 직접 2~3 + Realtime 채널 4 (C) · 복귀 `/` 7건 · 대기 시간당: 홈 1~6, 메신저 홈 약 300(presence 12초 C), 채팅방 약 540(거래 presence 15초·숨김 탭 검사 없음 C) · DB max_connections 60·사용 22 · 응답 wall 평균 profile 144ms·home-sync 140ms·hub-badge 53ms (n=60).

모델 가정(E): 사용자-시간당 시작 1 + 복귀 4 + 체류 60% 홈·30% 메신저·10% 채팅방.

| 동시 사용자 | 요청/시 | 요청/초 | Auth 호출/시 | PostgREST/초 | 비고 |
|---|---|---|---|---|---|
| 100 | 약 2만 | 5.6 | 약 600 | 약 11 | 현 구조로 수용 |
| 1,000 | 약 20만 | 56 | 약 6천 | 약 107 | presence 가 요청의 약 45% |
| 10,000 | 약 200만 | 561 | 약 6만 | 약 1,070 | **Realtime 구독 4~7만 → WAL 폴링·authorize 가 1차 한계(R6)** |

재시도 폭주 경로(C): ① 청크 새로고침 무한 반복(R2-b, 회당 약 27요청) ② 수신 통화 상태 래치 2.5초 HTTP(실동작 NP, 통화 영역) ③ `AuthSessionBoundary` 1초 세션 확인(비회원·계정 화면) ④ 401 처리 최소 간격 없음 ⑤ Realtime 재구독 시 배지·presence 재동기화. 부하 실측은 하지 않음(운영 DB 부하 테스트 금지 준수) — 표 전체 E.

## 10. 검증 시나리오·자동 테스트 결과

- **실행한 자동 테스트**(origin/main `9af664cc1` checkout, 14:42 PHT): `vitest run lib/startup lib/launch-intro lib/lifecycle lib/app-boot components/app components/launch-intro lib/next lib/auth lib/supabase` → **190 파일·1089 테스트 전부 PASS**. = 현행 코드 PASS 기준선(변경 전). 결함을 잡는 테스트는 0 — 오히려 `r17-os-native-visual.test.ts` 가 결함 구조(타이머 금지)를 고정.
- 시나리오(구현 단계 기준, 각 계측·자동 테스트·실기로 판정):
  1. 정상 콜드(로그인/비로그인, Android/iOS) — 해제 시각 기존 대비 증가 0
  2. 느린 망(문서 지연) — 고장 판정 미발동
  3. 오프라인 콜드 — 오류 화면·연결 복구 1회 자동
  4. 문서 5xx·429·401(앱 HTML/평문 구분)
  5. JS 번들 404·hydration 전 청크 실패 — 1회 새로고침 후 오류
  6. 렌더러/WebContent 종료(앞·뒤·60초 반복)
  7. 장시간 백그라운드 후 복귀(토큰 만료) — 서버 갱신 0·클라 1회·로그아웃 0
  8. 무효 세션 — 1회 종료·재시도 없음
  9. 배포 후 켜 둔 앱 — 청크 404 0(Skew), 새 버전은 안전 시점 1회
  10. 통화 중·작성 중·결제 중 배포 — 새로고침 0
  11. 푸시·딥링크 콜드 — pending route 재생
- 실기·Production 검증: 전부 NP (이번 단계 미승인).

## 11. 단계별 구현·배포·롤백 계획

| Phase | 내용 | 배포 | 진입 조건 | 롤백 |
|---|---|---|---|---|
| 1 | C8 계측(송신 모듈 + 로그 1줄 수집 API). 실패 표는 승인 시 | main 1회(웹) | 이 보고 승인 | 플래그 off / revert |
| 2a | C2 웹 해제 표·초기 가드·not-found/global-error, R2-b 루프 수정 | main 1회(웹) | Phase 1 수집 확인(Production SHA 명시) | revert |
| 2b | C3: Skew Protection 활성(설정) + 버전 확인·안전 새로고침. 통화 청크 경계 2곳은 **통화 규정 문서·승인 후 통화 단독 커밋** | 설정 1회 + main 1회 | Owner 설정 승인 | 설정 off / revert |
| 3 | C4·C6 인증(게이트·핸들러 검증 전용, 401 계약) → C5 조정자 | main 1회씩(인증 단독) | `auth-hard-lock` 대조·Owner 승인 | revert (DB 무변경) |
| 4 | C1·C7 네이티브 + 계약 테스트 개정 + Native Change Gate 보고 | 커밋만 → Owner 일괄 빌드 → 실기 행렬 | Owner 별도 승인 | 이전 바이너리 |

배포 규칙: 각 Phase 는 main 1회, 통화·인증은 단독 커밋, 검증 PASS 전 배포 금지, 검증 시 Production SHA 명시. 롤백 조건(공통): 계측의 해제 지연 p95 악화·로그아웃 증가·오류 화면 비율 증가·통화 이상 1건.

## 12. Owner 추가 승인 필요

1. 이 계획(Phase 순서·C1~C8 권장) 승인
2. 계약 충돌 해소: `r17-os-native-visual.test.ts` 「타이머 금지」 개정, `DIBAY_APP_LIFECYCLE_SSOT.md` §7.2 인트로 준비 무제한 ↔ D1
3. C8 실패 표 신규(DB 변경)
4. Vercel Skew Protection 활성·최대 보호 기간·배포 창 정책
5. 인증 구조(§7) 구현 — `auth-hard-lock` 범위
6. 통화 청크 경계 새로고침 조건·수신 통화 확인 묶음 이관 — 통화 규정(계획 문서·실기 행렬)
7. 네이티브 C1·C7 구현·빌드·실기 (Native Change Gate)
8. 범위 밖 보고: C9 Realtime 구독 구조(규모 1순위 병목), 거래 presence 숨김 탭 미검사, `AuthSessionBoundary` 1초 확인, iOS 발신 준비 상태 웹 사망 시 미정리(통화 영역)

## 13. 실행 상태 대조 (2026-11-08 17:30 PHT 재감사)

| 계획 | 결함(R) | 상태 | 커밋 / 근거 |
|---|---|---|---|
| Phase 1 C8 계측 | R5 | **반영** · iOS·Android 수신 확인 | `1481629b7` |
| Phase 2a C2 웹 해제 | R1-e | **반영** | `9a488885d` |
| Phase 2b C3 배포 스큐 | R2·R2-c | **반영** · Skew Protection 7일 · 이전 배포 청크 `?dpl=` 200 실측 | `94c563a80` |
| R2-b 무한 새로고침 | R2-b | **이번 반영 (비통화 경로)** — 루트 오류·최상위 오류·전역 미처리 거부는 빌드당 1회. 통화 경계 3곳은 통화 규정상 기존 함수 그대로 | 이번 커밋 |
| Phase 3-1 `/api` 게이트 무갱신 검증 | R3·R3-a | **반영** | `f1b30dfe5` |
| Phase 3-2a 세션 신선도 관문 | R3 | **반영** | `a4d44372b` |
| **Phase 4 C1 Android** | R1·R1-a·R1-b·R1-c | **이번 반영 (코드)** — 고장 판정(T_js 8s·T_release 15s, 앱이 보일 때만, 자동 재로드 1회, 통화 경로 자동 재로드 금지)·오류 화면 즉시 해제(pending 잠금 해소)·화면 커밋 콜백 보조 해제·주 문서 4xx 상태 기록·SSL 주 문서만·오프라인/웹 고장 문구 | 이번 커밋 · **빌드 대기(Owner 일괄)** |
| **Phase 4 C7 iOS** | R1·R1-d·R4 | **이번 반영 (코드)** — navigation delegate 프록시(Capacitor handler 전달 유지)·고장 판정(Android 와 같은 값)·탐색 실패·「앱 없이 로드 멈춤」은 빈 화면 대신 오류 안내+재시도·WebContent 종료 시 시작 화면 재설치 | 이번 커밋 · **빌드 대기(Owner 일괄)** |
| 3-2b 복귀 요청 묶기 | (효율) | 보류 — 결함 아님. 서버 갱신 문제는 3-2a 로 처리. 내일 측정 후 재판단 | — |
| 3-3 IP 전달 | (조건부) | 내일 측정에서 서버 갱신이 남을 때만 | 예약 측정 2026-11-09 16:45 PHT |
| C6 공유 캐시 | — | 보류(이득 작음) | phase3 설계 §3 |
| C9 Realtime 구조 | R6 | 범위 밖 보고 | §4 |
| 통화 청크 경계 반복 새로고침 | R2-b(통화) | 통화 규정 — 별도 계획·승인·실기 | — |
| 배포 빈도 정책 | R2 | Owner 결정 | §8 |

## 14. Phase 4 Native Change Gate (`docs/dibay-chat-call-current-normal-hard-lock.md` §5 형식)

```text
WHY NATIVE CHANGE REQUIRED  JS 가 실행되지 않거나 실행 후 멈추면 웹 코드는 아무것도 할 수 없다(오프라인·평문 5xx·번들 실패·hydration 정지).
                            OS 시작 화면의 해제 권한이 네이티브에 있으므로 고장 판정도 네이티브만 할 수 있다.
FIRST DIVERGENCE            Android MainActivity setKeepOnScreenCondition 이 웹 신호에만 묶임 + onPageFinished 에서 10초 제한 해제 /
                            iOS 연장 화면이 window.next 존재 시 영구 유지 (R1). 운영 계측: Android 콜드 해제 2.5s·8.2s (정상 분포 기준값).
WHY WEB/SERVER FIX INSUFFICIENT  Phase 2a 초기 가드는 HTML 이 도착하고 JS 가 실행될 때만 동작.
EXACT NATIVE OWNER          Android: MainActivity(시작 화면 해제·오류 화면), DibayBridgeWebViewClient(HTTP·SSL 분류), 신규 DibayStartupFaultPolicy.
                            iOS: DibayRootBridgeViewController(연장 화면·고장 판정·오류 화면), DibayNavigationDelegateProxy(같은 파일).
VOICE IMPACT / VIDEO IMPACT 없음 — 통화 Activity·Service·Runtime·CallKit·PushKit·Agora 파일 무수정. 고장 판정은 앱이 보일 때만 세고,
                            통화 경로(call 포함) 문서는 자동 재로드하지 않는다. V4 수락 handoff 코드 무수정.
ANDROID IMPACT              시작 화면이 풀리지 않던 고장에서 오류 화면(다시 시도)으로 전환. 정상 시작 해제 시각 무변화(웹 신호가 먼저 옴).
IOS IMPACT                  같음 + WebContent 종료 후 재로드 중 빈 화면 대신 시작 화면. 탐색 실패 시 빈 화면 대신 오류 안내.
CALLKIT/PUSHKIT IMPACT      없음 (파일 무수정, 통화 UI 는 별도 VC).
RTC IMPACT                  없음.
SERVER SESSION IMPACT       없음.
CHAT PROJECTION IMPACT      없음.
REQUIRED TEST               Android JUnit DibayStartupFaultPolicyTest(8) · DibayRendererRecoveryPolicyTest · :app:compileDebugJavaWithJavac /
                            iOS xcodebuild(시뮬레이터, 서명 없음) BUILD SUCCEEDED / vitest r17-os-native-visual(계약 개정).
REQUIRED DEVICE MATRIX      (Owner 일괄 빌드 후) Android·iOS 각각: 정상 콜드(해제 시각 무변화) · 비행기 모드 콜드(오프라인 안내→연결 후 다시 시도) ·
                            느린 망 콜드(오탐 없음) · 장시간 백그라운드 복귀 · iOS WebContent 종료 후 복귀 · 푸시 콜드 진입 · 통화 수신·수락(무변화).
ROLLBACK BOUNDARY           이번 네이티브 커밋 revert 후 재빌드 (웹은 독립). 구 바이너리(Android 1.2.5(37)·iOS 21~27)는 재설치 전까지 기존 동작.
```
