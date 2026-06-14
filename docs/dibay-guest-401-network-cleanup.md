# DIBAY 비로그인 401 네트워크 정리 — PASS 마감 (2026-06-14)

> **상태:** **PASS** (2026-06-14 마감)  
> **범위:** guest 세션 없음·401 backoff 시 **인증 필요 API** 네트워크 낭비 제거. UI·toast 변경 없음.  
> **연계 changelog:** [trade-perf-hot-path-changelog.md](./trade-perf-hot-path-changelog.md) (이력 표 1행)

---

## 수정 요약 (런타임 — 마감 후 추가 수정 금지)

| 모듈 | 동작 |
|------|------|
| `lib/auth/resolve-client-authenticated-user-id-for-fetch.ts` | fetch 전 Supabase session/user id 확인 |
| `lib/community-messenger/messenger-call-sound-config-client.ts` | 세션 없음 → 기본 config · 401 retry 제거 · `unauthorizedUntil` 30s · `force` 도 backoff 중 차단 |
| `lib/me/fetch-me-notifications-deduped.ts` | 세션 없음 → empty 401 로컬 반환 · `authExitPaused` / `unauthorizedUntil` · logout 시 pause |
| 호출부 (최소) | `PhilifeHeaderNotificationInbox` prefetch session 가드 · `MyNotificationsView` poll 401 후 중단 |

**단위 테스트:** `lib/community-messenger/__tests__/messenger-call-sound-config-client.test.ts` · `lib/me/__tests__/fetch-me-notifications-deduped.test.ts`

---

## 마감 기준 · 판정

| # | 기준 | 판정 |
|---|------|------|
| 1 | `GET /api/app/messenger-call-sound-config` — guest `/stores`·poll/tap 시도 **request 0** · login **200 1회+** | **PASS** |
| 2 | `GET /api/me/notifications` (list deduped) — guest `/stores`·poll/tap 시도 **request 0** · login **200 1회+** | **PASS** |
| 3 | `GET /api/me/notifications?unread_count_only=1…` — **이번 수정 범위 밖** · guest **401 반복 없음** · 200 다회는 badge surface/poll **별도 추적** | **PASS** (401 0) / badge 200 다회 **별도 TODO** |
| 4 | 하단 탭 5왕복 Playwright — **INCOMPLETE** (headless guest DOM/URL timeout) · **대상 API guest 합산은 PASS** | **PASS** (API 지표) / **INCOMPLETE** (탭 UI 자동화) |
| 5 | 잔류 Console 401 (`me_profile_full`, `/api/auth/session` 등) — **별도 TODO** | **범위 밖** |

---

## 브라우저 실측 (Playwright headless)

**일시:** 2026-06-14 09:40 KST 전후  
**origin:** `http://localhost:3000`  
**방법:** guest / login **별도 browser context** · 쿠키·storage 초기화(guest) · login = `aaaa@manual.local` Supabase cookie  
**스크립트:** 일회성 `dibay-401-browser-verify-v2.mjs` (repo 미커밋)

### 1. Guest — `/stores` 직접 진입 (진입 후 5s)

| API | request | HTTP | 기대 |
|-----|--------:|------|------|
| `/api/app/messenger-call-sound-config` | **0** | — | 0 |
| `/api/me/notifications` (list deduped) | **0** | — | 0 |
| `/api/me/notifications?unread_count_only=1…` | 1 | 200 | ≤1 (401 허용) |

### 2. Guest — 탭 시도 + 82s poll

| 구간 | sound-config | list deduped | badge unread | HTTP 401 (대상 3종) |
|------|-------------:|-------------:|-------------:|----------------------:|
| 탭 시도 구간 (partial — `market` URL timeout) | 0 | 0 | 3 (200) | 0 |
| 82s poll | 0 | 0 | 1 (200) | 0 |
| **guest 합산** | **0** | **0** | 5 (200) | **0** |

**하단 탭 5왕복:** headless guest에서 `market` 클릭 후 URL 전환 timeout · locator 보조 시 `a.app-bottom-nav-item` 미검출 → **INCOMPLETE**. API 지표는 탭 시도·82s poll 포함 **합산 기준 PASS**.

### 3. Login — cold context + cookie (`/stores` 8s → `/mypage/notifications` 6s)

| API | `/stores` 구간 | 전체 | HTTP |
|-----|---------------:|-----:|------|
| messenger-call-sound-config | 1 | 2 | 200 |
| me/notifications (list) | 1 | 3 | 200 |
| badge unread | 1 | 1 | 200 |

**backoff/pause 해제:** login cold context에서 sound·list **정상 fetch** 확인 (401 0).

### 4. 401 반복 · Console

| 구간 | 대상 API Network 401 | Console 401 |
|------|---------------------|-------------|
| Guest 전체 | **0회** | **잔류** — `me_profile_full`, `/api/auth/session`, `auth_refresh_fail`, `oauth callback_listener_attach_exhausted` 등 |
| 82s poll | **0회** | — |
| Login 직후 | **0회** (대상 API) | transient 1줄 (비대상) |

---

## 검증 (마감 시점)

| 명령 | 결과 |
|------|------|
| `npx tsc --noEmit` | PASS |
| `vitest run lib/community-messenger/__tests__/messenger-call-sound-config-client.test.ts lib/me/__tests__/fetch-me-notifications-deduped.test.ts` | PASS (10/10) |

---

## TODO — 범위 밖 (후속 트랙)

이번 PASS **이후** 별도 작업. **런타임 로직 변경 없이** 추적만 분리.

| ID | 대상 | 관측 | 후속 방향 (미착수) |
|----|------|------|-------------------|
| **401-TODO-1** | `me_profile_full` | guest Console 401 다수 · `[auth_refresh_fail] Auth session missing!` | profile full fetch 전 session gate · 401 backoff (list/sound 와 동일 패턴 검토) |
| **401-TODO-2** | `GET /api/auth/session` | `fetchAuthSessionNoStore` · `[fetch_client] auth_401` | 비로그인 bootstrap 경로에서 session probe 호출 축소 또는 guest negative cache |
| **401-TODO-3** | `auth_refresh_fail` | 세션 없음 상태 refresh 시도 | refresh single-flight + guest early exit |
| **401-TODO-4** | `[oauth] callback_listener_attach_exhausted` | dev 40회 attach | OAuth listener lifecycle · dev-only 완화 |
| **401-TODO-5** | `GET /api/me/notifications?unread_count_only=1…` | guest **200×5** (401 0) · surface 전환·82s poll 각 1회급 | badge store session gate · surface당 TTL (이번 list/sound 수정 **범위 밖**) |
| **401-TODO-6** | 하단 탭 Playwright 5왕복 | headless guest tab DOM/URL timeout | logged-in E2E 또는 headed manual — **API PASS와 독립** |

---

## 되돌림 시

- `messenger-call-sound-config-client` 401 **180ms retry** 복구 → guest 앱 로드마다 **2×401** 재발
- `fetch-me-notifications-deduped` 에서 session gate 제거 → Tier1 prefetch·`/mypage/notifications` **75s poll** 비로그인 401 재발
- changelog 본 문서·`trade-perf-hot-path-changelog.md` 이력 행 **함께** 갱신
