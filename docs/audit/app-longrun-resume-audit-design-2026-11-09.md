# 장시간 실행·앱 복귀·탭 지연·렌더러 복구 — 재감사·웹 개선·네이티브 복원 설계 (2026-11-09)

- 지시: Owner 「장시간 실행·앱 복귀·탭 지연·렌더러 복구 구조 개선 지시」 (조건부 승인 · 운영 반영 전 별도 승인)
- 기준: origin/main `398a39f31` · 작업 브랜치 `fix/app-resume-longrun` (worktree `samarket-resume`) · Next 16.1.7
- 표기: **C** 코드 확인 · **O** 운영 로그/측정 · **D** 설치본 Next 코드(공식 동작) · **E** 추정 · **NP** NOT_PROVEN
- 측정 시각: 17:30~17:50 PHT (운영 auth 로그 24h 창 2개, Vercel 런타임 로그 24h, Mac→운영 curl)

## 1. 1단계 재검증 (9항목)

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | Next 버전·라우터 캐시 | 16.1.7. `staleTimes {dynamic:300, static:600}`. 프리페치 항목 만료 = 서버 staleTime 또는 static 600s | C `next.config.js:62` · D `segment-cache/cache.js:946,1191` |
| 1 | 만료 후 재프리페치 | **안 함.** 보이는 Link 재프리페치(`pingVisibleLinks`)는 트리·Next-Url 변경·명시 무효화 때만. `router.prefetch(onInvalidate)` 도 무효화 때만 | D `links.js:263` · `cache.js:147-200` |
| 2 | 하단 탭 프리페치 | Link `prefetch={true}`(Full) 비활성 허브만 + APK `router.prefetch` 부팅 1회(sessionStorage 표시 `dibay:bottom-nav-boot-idle-prewarm:v1`) | C `BottomNav.tsx` · `bottom-nav-boot-idle-prewarm.ts:131` |
| 3 | 첫 탭 이동 소요 | 비로그인 RSC(Mac→sin1): prefetch 0.22~0.33s, 이동 0.22~0.34s(15회) | O curl |
| 3 | 로그인·기기·렌더링 구간 | **NP** — 실기기 측정 금지(Native Change Gate 전) | — |
| 4 | 렌더러 종료 vs 프로세스 종료 | 샤오미 17:37:04 `renderer_gone action=RECREATE_NOW` + `exit_info_reason=13 PeriodicCleaner(pressure)` / 프로세스 종료는 `DibayLaunchEpoch native_restore_hint=fresh` | O logcat(읽기만) |
| 5 | 60초 경로 보존 | 렌더러 종료 경로가 **푸시 목적지 보관소(ROUTE_PREFS)** 를 재사용, TTL 상수 `PENDING_ROUTE_TTL_MS=60s` 를 통화(CALL_ROUTE_PREFS)·푸시와 공유 | C `MainActivity.java:215,2241,2825-2845,895` |
| 6 | 복귀 핸들러 | 전역 13종 각자 구독, 중앙 조정자 없음. `/api` 는 3-2a 관문(만료 90초 이내면 SDK 갱신 대기)을 공통으로 지남 | C (감사 표) · `session-freshness-fetch-gate.client.ts` |
| 7 | 상한 없는 자료구조 | §3 C 표 | C |
| 8 | bootstrap 저장 빈도 | 실시간 이벤트 1건마다 목록 전체 `JSON.stringify`→sessionStorage 동기 저장 | C `bootstrap-cache.ts:224` · `bootstrap-cache-bus-writer.ts` |
| 8 | 메인 스레드 점유 ms·JSON 크기 | **NP** (로그인 기기 측정 필요) | — |
| 9 | 토큰 갱신 시간 | `/token refresh` p50 35.9ms · p95 110ms · max 265ms (n=306, 24h) | O auth_logs |
| 9 | 서버 측 갱신 비중 | 3-2a 반영 전 24h **64%**(293/460) → 반영 후 24h **32%**(98/307) | O auth_logs (referer 끝 `/` 유무) |
| 9 | 갱신 몰림 | 같은 사용자 10초 창 ≥2회: 24창, 최대 **16회**(서로 다른 서버 IP 11개) | O auth_logs |

### 결정적 상관 (O)
복귀 새로고침(`update_reload`, C3) 발생 시각 = 갱신 몰림 시각: 23:15:05(16회) · 19:50:45(14) · 11:30:48(11) · 11:59:22(6) · 18:21:23(4) · 06:54:45(4) UTC.
23:15 사례(iOS build 30): 78분 숨김 → `update_reload` → 23:15:06 콜드 문서 → **23:15:09 다시 콜드 문서(새 launch epoch)** — 3초 안에 문서 2개, 각 문서가 `/api/me/profile`·`devices/register`×2·badge·session 등을 다시 호출.
- 두 번째 문서가 왜 새 launch epoch 로 시작했는지(iOS 프로세스 재시작 여부) **NP**.
- 24h `update_reload` 11건(iOS 7·Android 2·web 2). 배포 빈도(18.6h 41회)상 30분 이상 숨김 후 허브 화면 복귀는 대부분 새로고침된다 (E).

## 2. 확정 원인 (Owner 증상별)

| 증상 | 원인 | 등급 |
|---|---|---|
| 방치 후 하단 탭 첫 이동 느림, 한 번 다녀오면 빠름 | ① 탭 프리페치 만료 후 Next 가 다시 받지 않음 + 재준비 장치 없음 | C·D |
| 〃 (30분 이상) | ② 복귀 새로고침(C3)이 문서를 새로 띄움 → 라우터 캐시·메모리 캐시 전부 초기화 | C·O |
| 방치 후 OS 시작 화면 | Android: 렌더러가 메모리 압박으로 종료 → Activity 재생성(스플래시) · iOS: C3 직후 새 launch epoch(원인 NP) | O(Android)·NP(iOS) |
| 재생성 후 보던 화면 잃음 | 렌더러 경로 보존 60초 TTL(푸시 보관소 공유) | C |
| 장시간 실행 시 느려짐 | 상한 없는 Set·버퍼 증가 · 이벤트마다 목록 직렬화 · 리스너 누적 | C (증가량 실측 NP) |

## 3. 2단계 웹 구현 (브랜치, main 미반영)

### A. 하단 탭 복귀 재준비
- `lib/main-menu/bottom-nav-resume-rewarm.ts` · 호스트 `components/layout/BottomNavBootIdlePrewarmHost.tsx`.
- 조건: 숨김 ≥ 300s(`lib/performance/router-cache-policy.ts` — `next.config.js` 와 같은 값, 테스트로 일치 강제).
- 대상: Link 가 시작 때 받는 탭과 **같은 집합**(`main-bottom-nav-link-prefetch-eligibility.ts` 로 단일화) — 새 부하 없음, 시작 직후 상태 복원. 현재 탭·비회원 회원전용 탭 제외.
- 전략 `full`(Link 와 같은 캐시 항목). 간격 상수 없음 — Next 스케줄러가 기본 동시 4개, 사용자 탭(Intent)은 우선. 신선한 항목은 캐시에서 종료(중복·무한 없음).
- 부팅 경로 불변(세션당 1회 그대로) → 시작 폭주 재발 없음.

### B. 복귀 조정자
- `lib/app-resume/app-resume-coordinator.ts`(순수 코어) · `.client.ts`(DOM·Capacitor 연결).
- 신호 3종(visibility·pageshow persisted·appStateChange) → 복귀 1회. 숨김 시간 측정.
- 레인: `auth`(세션 신선도 대기 후 병렬) · `background`(+idle, 통화 중 생략). 세션 대기는 3-2a 관문과 **같은 단일 비행**을 쓰는 `waitForSessionFreshnessIfNeeded` 추가(export 만, 동작 불변) — RSC 프리페치가 만료 토큰으로 나가 프록시가 갱신하는 것을 막는다.
- 취소: 다시 숨김 · SIGNED_OUT · 사용자 ID 변경. 오프라인이면 online 까지 대기.
- **기존 13 핸들러 미이관** — §5 충돌 2.

### C. 메모리·저장
| 항목 | 생성·증가 | 사용 | 변경 |
|---|---|---|---|
| `processedEventIds` | 실시간 이벤트마다 add, 사용자 변경 때만 clear | 중복 이벤트 무시 | 최근 2,000 |
| bootstrap full sessionStorage | 이벤트마다 전체 직렬화 | 같은 문서 새로고침 복원 | 메모리 즉시 · 저장은 첫 1회 즉시 + 1초 창당 마지막 1회 · 서버 확인 값 즉시 · 숨김/pagehide 최종 저장 · 로그아웃 시 대기 쓰기 취소 |
| `__storesPerfLongTasks` | 매장 홈 1회 방문 후 영구 관찰 push | 성능 QA 콘솔 | 최근 200 |
| `performance.mark` 6곳 | 화면마다 누적 | 마지막 항목만 읽음 | 같은 이름 지우고 찍기 · measure 도 마지막 1개 |
| 썸네일 `loadedUrls` | 본 URL 전부 | pulse 생략 | 1,000 |
| 상품 연출 `lastListById`·`warmedMediaUrls` | 상세 진입마다 | 돌아오기 연출 | 100 · 300 |
| 히어로 `done` · 아바타 실패 · 거래 미리보기 | URL·글마다 | 재요청 생략 | 300 · 200 · 300 |
| `NativeBadgeSync` appStateChange | 배지 숫자 변경마다 재등록, 정리 경합으로 누적 | 백그라운드 배지 재확인 | 정리 뒤 도착 핸들 즉시 제거 |

보고만(미수정): `AuthSessionBoundary` 1초 폴링(인증 하드락) · `call-flow-log emittedSteps`(통화 규정) · `cm-bootstrap-scheduling` 운영 console.log(방 진입마다) · `devices/register` 콜드 문서당 2~4회 · 거래 미리보기 만료 없음(가격 변경 반영).

## 4. 3단계 네이티브 복원 설계 (구현 금지 — Native Change Gate 전)

### 4-1. Android 렌더러 종료 복원
- 문제: `onWebViewRenderProcessGone` → `persistPendingRoute`(푸시 보관소) → 60초 TTL. 백그라운드 종료 + 60초 후 복귀 = 홈.
- 설계: **전용 보관소 `RENDERER_RESTORE_PREFS`** 신설(푸시·통화 보관소와 분리, 상수 분리).
  - 키: 경로 · 저장 시각 · **프로세스 시작 ID**(launch epoch) · 웹이 마지막으로 알린 사용자 ID 해시.
  - 유효: 같은 프로세스의 다음 `recreate()` 1회 소비(시간 TTL 아님). 프로세스가 죽으면 무효(프로세스 종료 복원은 4-3).
  - 복원 허용 경로: 허브·목록·상세 읽기 화면만. 작성·결제·주문 제출·통화·인증 경로는 **부모 목록으로 강등**(제출 재실행 없음).
  - 웹 쪽 검증: 복원 경로를 받으면 현재 세션 사용자 해시와 비교, 다르면 버리고 홈(다른 계정 화면 노출 방지).
  - 통화 60초 규칙: `CALL_ROUTE_PREFS`·`PENDING_ROUTE_TTL_MS` 무변경. 렌더러 경로는 통화 경로를 덮지 않는다(통화 보관소 우선).
  - 뒤로가기·작업 스택: `recreate()` 는 같은 task 유지 — 스택 무변화. 복원 화면의 뒤로가기는 웹 히스토리 1단(이전 히스토리 없음) → 허브로.
- 스크롤·탭·작성 데이터: 스크롤/탭은 웹 `sessionStorage` 가 렌더러와 함께 사라지므로 **복원 불가**(E). 거래 작성은 기존 localStorage 임시저장(`trade-write-draft-continuity`)이 이미 보존 — 경로 복원 시 이어쓰기 진입은 Owner 결정 필요.

### 4-2. iOS
- 앱 코드에 `webViewWebContentProcessDidTerminate` 없음 → Capacitor 기본 `bridge.reset(); webView.reload()`(같은 URL 전체 다시 불러오기). 경로는 유지되나 상태 초기화.
- 설계: 종료 시 마지막 경로·사용자 해시를 기록하고 같은 복원 규칙(강등·사용자 검증) 적용. 23:15 사례의 새 launch epoch 원인 규명이 선행(NP).

### 4-3. 프로세스 종료(OS) 복원 — 양 플랫폼 공통 계약
- 현재: `appRestoredResult` 0건, `savedInstanceState` 는 힌트만 → 항상 홈.
- 설계: 마지막 안전 경로를 웹이 주기적으로가 아니라 **이동 확정 시** 네이티브 보관소에 기록(브리지 1회), 다음 콜드 시작 때 `native_restore_hint=restore` 이고 N시간 이내·같은 사용자면 그 목록 화면으로. N 은 Owner 결정 필요(기존 앱 기준값 없음).

## 5. 충돌·Owner 결정 필요 (규정 7 — 임의 선택 안 함)
1. **C3 복귀 새로고침(H3, 승인됨) vs 이번 지시 「화면 전체 강제 새로고침 금지」** — C3 는 Skew Protection 을 끈 상태(2026-11-09)에서 구버전 청크 404 를 막는 장치라 끄면 화면 깨짐 위험. 운영 로그상 새로고침이 갱신 몰림·콜드 문서 2회·라우터 캐시 초기화의 출발점. 이번 브랜치는 C3 를 바꾸지 않았다.
2. **기존 복귀 핸들러 13종 이관** — 하드락 H5·phase3 §7 3-2b 가 「도메인별 하드락 승인 후 하나씩」으로 정함(배지·메신저·인증·푸시·주소·통화 도메인). 조정자만 만들고 이관은 하지 않았다.
3. 프로세스 종료 복원 유효 시간 N, 작성 화면 복원 여부.

## 6. 회귀 검증 계획 (실기기 = 전부 NP)
| # | 시나리오 | 이번 상태 |
|---|---|---|
| 1 | 실행 직후 첫 탭 이동 | 부팅 경로 무변경(코드) · 실기 NP |
| 2 | 5·10·30분·2시간 방치 후 복귀 | 단위 테스트(숨김 기준·1회) PASS · 실기 NP |
| 3 | 같은 탭 반복 | Next 캐시 dedupe(D) · 실기 NP |
| 4 | 복귀 + 토큰 갱신 동시 | 세션 대기 후 프리페치(테스트 PASS) · 운영 서버 갱신 비중 NP |
| 5 | 느림·단절·복구 | online 대기·취소(테스트 PASS) · 실기 NP |
| 6~8 | 메신저 대화·통화·배달 주문 중 복귀 | 통화 중 background 생략(테스트) · 실기 NP |
| 9 | 거래 작성 중단 | 무변경 · NP |
| 10 | 로그아웃·계정 변경 | 조정자 취소·목록 대기 쓰기 취소(테스트 PASS) · 실기 NP |
| 11~12 | 렌더러·프로세스 종료 복원 | 네이티브 미구현 |
| 13 | 장시간 메모리·리스너·요청량 | 상한 테스트 PASS · 실측 NP |

## 7. 성능 판정
- 수정 전 기준값: 운영 서버 갱신 비중 32%·몰림 최대 16회/10초(O), 비로그인 RSC 0.22~0.33s(O). **기기 첫 탭 p50/p95·복귀 후 첫 조작 응답·WebView 메모리·longtask 기준값 없음 → 개선 성공 판정 불가.**
- 반영 후 측정 방법(승인 시): 같은 기기·같은 계정·Production SHA 고정, 방치 시간별 n≥10 — 진입 계측(C8 `resume` hiddenMs + 탭 이동 RSC 시각) · auth 로그 서버 갱신 비중 · Vercel 경로별 요청 수.

## 변경 이력
- 2026-11-09 작성 (Claude) — 재감사·웹 구현(브랜치)·네이티브 설계.
