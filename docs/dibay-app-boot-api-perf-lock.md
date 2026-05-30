# DIBAY API PERF LOCK — 앱 부트 cold-path (1~4순위 완료)

> **목적**: PM2 로그 기반 **cold cache miss / DB RTT / 2nd DB query / 직렬 fetch** 병목 제거 결과를 고정한다.  
> **범위**: 구조 전체 리팩토링 **아님** — 아래 4 API의 cold-path만 국소 수정.  
> **연계**: [dibay-performance-lock.md](./dibay-performance-lock.md), [owner-dashboard-api-perf-lock.md](./owner-dashboard-api-perf-lock.md), [samarket-perf-change-protocol.mdc](../.cursor/rules/samarket-perf-change-protocol.mdc)

**완료일**: 2026-05-30

---

## 0. 공통 원칙 (LOCK — 역행 금지)

| 금지 | 유지 |
|------|------|
| response shape 변경 | 기존 JSON contract |
| UI 변경 | 화면·컴포넌트 동일 |
| i18n 변경 | catalog·출력 경로 동일 |
| auth/security 의미 변경 | session·registry 검증 동일 |
| unread semantics 변경 | badge·count 의미 동일 |
| notification semantics 변경 | segment·list filter 동일 |
| realtime / bootstrap / home-sync 변경 | 해당 도메인 lock 별도 |

**판정 (2026-05-30)**

- 앱 전체 구조 문제 **아님**
- compile / payload / realtime 병목 **아님**
- 원인: cold cache miss · DB RTT variance · 불필요 2nd DB query · 직렬 fetch
- 목표: 배민/당근/카톡 수준 **첫 진입 체감** — cold 대부분 **100~180ms**, warm 유지

---

## 1. `/api/me/profile?lite=1`

### 변경

- `SELECT_ME_PROFILE_LITE` 성공 시 **`mergeOptionalFields` 2번째 DB 왕복 생략**
- map-pin-only 사용자 주소는 `schedule-app-boot-background` full profile로 보강

### 파일

- `lib/profile/fetch-profile-row-safe.ts`

### 결과 (LOCK)

| 지표 | Before | After |
|------|--------|-------|
| total peak | **604ms** | cold avg **~218ms** |
| warm avg | — | **~36ms** |
| `profile_row_normalize_ms` | **341ms** | **0ms** |

### 되돌리면

- lite 성공 경로에서 `mergeOptionalFields` await 복귀 → 2nd RTT 재발

---

## 2. `/api/me/store-owner-hub-badge`

### 변경

- cm unread memory TTL **10s → 12s**
- aggregate **stale SWR** (serve stale ≤60s)
- revalidate / cold RPC **singleflight dedupe** (`runSingleFlight`)

### 파일

- `lib/community-messenger/cm-unread-room-count-memory-cache.ts`
- `lib/community-messenger/cm-unread-room-count-aggregate.ts`
- `lib/community-messenger/community-messenger-unread-total.ts`

### 결과 (LOCK)

| 지표 | Before | After |
|------|--------|-------|
| total peak | **362ms** | aggregate path **~41–46ms** |
| `cm_unread_ms` peak | **335ms** | aggregate hit 시 대폭 감소 |
| warm | — | **~47–65ms** |
| true first cold | — | 원격 RTT variance로 **~238ms** 가능 (infra 한계) |

### 되돌리면

- unread semantics·badge 숫자 의미 변경 없이 캐시/dedupe만 제거 시 cold 동시 RPC 재발

---

## 3. `/api/me/notifications`

### 변경

- segment partial index **2개** (RPC/cache/route **코드 변경 없음**)
- `consumer_no_chat` · `bottom_nav_no_chat` CASE predicate와 index WHERE **동일**

### 파일

- `supabase/migrations/20260830120000_notification_unread_segmented_badge_indexes.sql`
- `scripts/apply-notification-unread-segmented-indexes.mjs`
- `scripts/explain-notification-unread-segmented.mjs`

### Index (SQL Editor 적용 — 잠금 전 확인)

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'idx_notifications_user_unread_consumer_no_chat_count',
  'idx_notifications_user_unread_bottom_nav_no_chat_count'
);
-- 2행 → ANALYZE public.notifications; 1회 권장
```

### 결과 (LOCK)

| 지표 | Before peak | After cold | After warm |
|------|-------------|------------|------------|
| `notification_count_ms` | **480ms** | **91–120ms** | **7–12ms** |
| total | **493ms** | **98–133ms** | cache path |

### 되돌리면

- index drop만으로 RPC 의미는 유지되나 cold **480ms급** 재발 가능
- RPC/cache TTL/route 재작성 **별도 승인**

---

## 4. `/api/auth/session`

### 변경

- `validateActiveSessionLight` cold path: **profile `active_session_id` SELECT** + **registry validate** → `Promise.all` 병렬
- 판정 분기(session-replaced / 401 / 404) **동일**
- `auth_validate_ms`: sum → **max(profile, registry)** (병렬 wall time)

### 파일

- `lib/auth/server-guards.ts`

### 보안 (LOCK — 불변)

- `active_session_id` 검증 유지
- `user_sessions` registry validate 유지
- session-replaced / 401 / 404 분기 동일
- cookie / refresh token / response shape 변경 없음

### 결과 (LOCK)

| 지표 | Before | After |
|------|--------|-------|
| `auth_total_ms` (cold) | **204–246ms** | **104–135ms** |
| `auth_validate_ms` | **203–245ms** (sum) | **103–134ms** (max) |
| warm route `total_ms` | — | **10–15ms** |

### TTL

- `auth-session-validate-cache.ts` (5s) · `auth-light-session-snapshot-cache.ts` (10s) — **1차 작업에서 미변경**
- auth/session TTL 변경은 **보안 영향** → **별도 승인 필요**

### 되돌리면

- profile → registry **직렬 await** 복귀 → `auth_validate_ms` sum ~200ms+ 재발

---

## 5. 향후 규칙

1. **같은 API 재수정** 시 위 semantics·shape **깨지 말 것**
2. **warm path** 느려지면 **즉시 회귀**로 판단
3. **cold path** 목표 **100~180ms** 유지 (true first cold linked RTT variance는 infra 한계)
4. **TTL 조정** — 별도 승인 없이 하지 말 것 (auth/session TTL은 보안 검토 필수)
5. **notifications index** — SQL Editor 존재 확인 후 잠금; drop 시 changelog + 사유
6. **신규 성능 이슈** — PM2 로그 기준 **API별 국소 분석** 후 처리 (전역 리팩토링 금지)

---

## 6. 검증 명령

```bash
pm2 logs dibay-dev | grep -E "warn|baseline exceeded|owner-dashboard-perf-v2|route-perf|auth-hot-path-deep|notification_count_ms|cm_unread|profile_row_normalize_ms"
```

| API | cold 측정 | warm 목표 |
|-----|-----------|-----------|
| profile `?lite=1` | bypass / cold miss | **30–40ms** |
| hub badge | `hubBadgeBypass=1` / aggregate | **30–65ms** |
| notifications | `ownerNotificationsBypass=1` | **7–12ms** |
| auth/session | cache TTL(5s/10s) 경과 | **10–15ms** |

---

## 7. 최종 성공 기준 (회귀 FAIL)

| API | warm | cold (대부분) | peak 재발 |
|-----|------|---------------|-----------|
| profile lite | 30–40ms | 100–180ms | **600ms급** 금지 |
| hub badge | 30–65ms | 100–180ms | **362ms급** cm_unread 단독 금지 |
| notifications | 7–12ms | 100–180ms | **480–493ms급** 금지 |
| auth/session | 10–15ms | 100–180ms | **410ms급** auth_total 금지 |

---

## 8. 전체 1~4순위 요약

| # | API | 핵심 변경 | Before worst | After cold | After warm |
|---|-----|-----------|--------------|------------|------------|
| 1 | `/api/me/profile?lite=1` | lite merge skip | 604ms | ~218ms | ~36ms |
| 2 | `/api/me/store-owner-hub-badge` | cm unread cache/SWR/dedupe | 362ms | ~41ms (agg) / ~238ms (1st) | 47–65ms |
| 3 | `/api/me/notifications` | partial index ×2 | 493ms | 98–133ms | 7–12ms |
| 4 | `/api/auth/session` | profile+registry parallel | 264–410ms | 104–135ms auth | 10–15ms |

**다음 작업**: 위 4 API **회귀 guard**만 — 신규 cold 병목은 PM2 로그로 **5순위 이후** 별도 트랙.
