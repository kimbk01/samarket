# CM R2 Perceived Latency — Prod-like 검증 (로컬 `npm run start`)

| 항목 | 값 |
|------|-----|
| 캡처 시각 | 2026-05-27T23:21:59Z |
| 환경 | `npm run build` → `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` · `NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1` 빌드 후 `npm run start` |
| 서버 trace | `SAMARKET_MESSENGER_TRACE_LOG=1` · `SAMARKET_LOG_HOME_SYNC_DEEP_TRACE=1` |
| Origin | `http://127.0.0.1:3000` |
| 계정 | `aaaa` / `1234` (UI 로그인, 채팅 10행·배달 unread 4행) |
| 실행기 | `node scripts/perf/cm-r2-perceived-prod-validate.mjs` (3회) |
| Raw JSON | [cm-r2-perceived-latency-prod-validation.json](./cm-r2-perceived-latency-prod-validation.json) |

**사전 검증:** `npx tsc --noEmit` PASS · `npm run build` PASS (trace env 포함).

---

## 1. 실측표 (3회 평균)

### 1.1 Cold home — `/community-messenger?section=chats`

캐시 키 삭제 후 reload, `data-cm-home-frame` list-ready 대기.

| 지표 | Run1 | Run2 | Run3 | **평균** | 판정 기준 | 판정 |
|------|------|------|------|----------|-----------|------|
| 첫 list-ready (ms) | 1280 | 976 | 957 | **1071** | 빈 skeleton 없이 1s대 | **PASS** (blankFlash=false ×3) |
| DOM 행 수 | 10 | 10 | 10 | 10 | 0행 blank 아님 | **PASS** |
| `data-cm-home-state` | list-ready | list-ready | list-ready | list-ready | skeleton 지속 없음 | **PASS** |
| `[cm-bootstrap-v2-client]` critical_response_ms | — | 242 | 217 | **230** | — | 관측 OK |
| room_list_visible_ms | — | 247 | 222 | **235** | — | 관측 OK |
| used_cached_snapshot | — | false | false | 0/3 cold | cold는 false 기대 | **PASS** |
| `[cm-list-owner]` bootstrap_full_seed | 0→24 rooms | 0→24 | 0→24 | merge seed | empty clear 없음 | **PASS** |
| silent refresh (누적*) | 4 | 4 | 4 | — | — | 라운드 간 누적 |

\*Playwright 세션 내 `refreshInvocationSilent` 누적값(라운드 간 비교용 아님).

**Cold home blank flash:** 3/3에서 `skel=false`, `rows≥10`, `state=list-ready` → **제거됨으로 판정**.

### 1.2 Delivery inbox — `/community-messenger/delivery-chats?filter=unread`

| 지표 | Run1 | Run2 | Run3 | **평균** |
|------|------|------|------|----------|
| unread 행 | 4 | 4 | 4 | **4** |
| unread badge | 4 | 4 | 4 | **4** |
| home-sync fetch (누적) | 2 | 2 | 1 | — |

### 1.3 Delivery room (unread) — **미완**

| Run | 결과 |
|-----|------|
| 1–3 | `skipped: no_rows` — delivery-chats URL에서 `[data-messenger-chat-row]` 탭 실패(인박스 4행은 있으나 자동화 클릭 경로 불일치) |

**대체 관측 없음** — 수동 또는 홈 목록 unread 행 탭으로 재측정 필요.

### 1.4 Visibility 복귀 (합성 `visibilitychange` + `pageshow`)

| 지표 | Run1 | Run2 | Run3 | **평균** | 판정 |
|------|------|------|------|----------|------|
| Δ silent refresh | 1 | 0 | 1 | **0.7** | 2/3에서 +1 (**부분 PASS**) |
| Δ home-sync network | 1 | 0 | 1 | **0.7** | 동일 |
| 복귀 후 list patch (list_owner) | 24-room home_sync ×2~3 | 일부 0 delta run2 | 24-room ×3 | — | Run2만 **완전 억제** |

### 1.5 Realtime burst

**미실행** (다탭/대량 INSERT 재현 없음). 구조상 ingest chunk는 코드 경로만 존재, 이번 prod-like 런에서 **콘솔 증거 없음**.

### 1.6 Trace / 로그 가용성 (`npm run start` = production)

| 로그 | 브라우저 콘솔 | 서버 터미널 | 이번 런 |
|------|----------------|-------------|---------|
| `[cm-bootstrap-v2-client]` | 3줄 | — | **OK** (run2–3 cold + delivery run1) |
| `[home-sync-deep-trace]` | — | 11+ 요청 | **OK** (예: `home_sync_total_ms: 218`) |
| `[cm-longtask]` | 0 | — | **N/A** — `cmEventLoopDiagnosticsEnabled()` 가 `NODE_ENV!==development` 에서 false ([cm-event-loop-dev.ts](../../lib/community-messenger/dev/cm-event-loop-dev.ts)) |
| `frame_budget` | 0 (POST `/api/.../monitoring/events` 로만 적재) | — | **미집계** — DevTools Performance 또는 monitoring API 필요 |
| `list_bootstrap_align` | list_owner 간접 (동기 merge) | — | before=after=24 다수 → **skip 효과 간접 확인** |
| home-sync identical skip | 전용 로그 없음 | — | visibility Run2 Δ0 + list_owner no-op 패치로 **간접 PASS** |
| rAF chunk split | 전용 로그 없음 | — | **미확인** (프레임 분할은 코드만) |

---

## 2. Before vs After (실측 After)

| 체감 항목 | Before (2라운드 전 문제) | After (이번 실측) |
|-----------|-------------------------|-------------------|
| Cold home blank | listAwaiting 중 빈 목록 | **1071ms에 10행 list-ready**, skeleton blank 없음 |
| Room empty→fill | 타임라인 비었다 채워짐 | **측정 불가** (delivery room 자동화 실패) |
| Visibility full refresh | 복귀 시 list 흔들림 | **평균 Δsilent 0.7** — 완전 차단은 아님 (1/3 run은 0) |
| Frame budget ≤16ms | 대형 patch frame drop | **콘솔 미검증** (prod 모니터링 큐) |
| list_bootstrap_align | — | home_sync patch **24→24** no-op 다수 (≤30ms 목표는 별도 계측 필요) |
| unread / ordering / mark-read | — | 배달 unread badge 4 유지, bootstrap seed **0→24** (clear 없음) |

**서버 home-sync (참고 1건):** `home_sync_total_ms: 218`, `route_bundle_await_ms: 215`, tier `critical`.

---

## 3. 실패·불안정 항목

1. **첫 캡처 실패** — `storageState` 만으로는 prod `start` 에서 `/login` 리다이렉트 → UI 로그인으로 재실행.
2. **Delivery room 0/3** — 자동화 셀렉터; 제품 버그 아님.
3. **`[cm-longtask]` / `frame_budget`** — prod `start` 에서 클라 longtask observer 비활성; frame_budget은 API 적재.
4. **`[home-sync-deep-trace]`** — 브라우저가 아닌 **서버 stdout** 에만 출력.
5. **Visibility** — 2/3 run에서 silent home-sync +24 room `home_sync` list_owner patch 잔존.
6. **Realtime burst** — 시나리오 미수행.

---

## 4. 회귀 체크리스트 (이번 계정·로컬 prod-like)

| 항목 | 결과 |
|------|------|
| unread semantics | 배달 filter=unread badge 4/4 유지 |
| ordering | — (미검증) |
| realtime | — (burst 미검증) |
| optimistic mark-read | — (미검증) |
| room hydration | room 시나리오 스킵 |
| silent refresh | 동작함; visibility 에서 평균 +0.7회 |
| delivery unread badge | **PASS** (4) |
| bootstrap v2 trace | **PASS** (3 lines) |
| home-sync-deep-trace | **PASS** (server) |

---

## 5. 추가 수정 필요 여부

| 결론 | 내용 |
|------|------|
| **부분 PASS** | Cold home perceived blank — **실측 PASS**. Visibility·room·frame_budget·burst — **증거 부족 또는 부분**. |
| **코드 수정** | 이번 라운드 **필수 아님**; 다만 prod 서명(sign-off) 전 아래 1건 권장. |
| **재측정** | `E2E_TEST_*` 계정(채팅·배달 방 보유) + delivery room 클릭 경로 수정 후 동일 스크립트 3회. |

---

## 6. 다음 라운드 단일 병목 (1개)

**Visibility 복귀 직후 silent `home-sync` 가 여전히 24-room `home_sync` list patch 를 발생** (Run1·3: list_owner `incomingPatchRooms: 24`, Δsilent=1).  
Run2 만 Δ0 → quiet window·identical fingerprint skip 이 **완전히 안정하지 않음**.

**다음 라운드 후보:** visibility/pageshow 직후 **동일 fingerprint home-sync 1회 차단율 3/3** + list_owner `incomingPatchRooms: 0` 을 prod-like 3회로 고정 검증. (room·burst는 별도 트랙.)

---

## 재현 명령

```bash
# 빌드 시 trace 인라인 필수
set NEXT_PUBLIC_MESSENGER_PERF_TRACE=1
set NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1
npm run build
npx tsc --noEmit

set SAMARKET_MESSENGER_TRACE_LOG=1
set SAMARKET_LOG_HOME_SYNC_DEEP_TRACE=1
npm run start

# 다른 터미널
node scripts/perf/cm-r2-perceived-prod-validate.mjs
# optional: set E2E_TEST_USERNAME=... & E2E_TEST_PASSWORD=...
```

DIBAY prod URL 검증: `PLAYWRIGHT_BASE_URL=https://dibay.vercel.app` + 동일 스크립트 (계정·OPS1 env 필요).
