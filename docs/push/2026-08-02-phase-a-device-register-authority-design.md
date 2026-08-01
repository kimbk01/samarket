# Phase A — Device Register Authority Design

**Status:** APPROVED for RPC implementation (2026-08-02)  
**Date:** 2026-08-02  
**Scope:** Login / Logout / Account switch / Token rotate / Multi-device / Cap — `user_devices` register authority  
**Out of scope (this phase):** Identity session leak, Badge isolation, Campaign schema (Phase B), Call Native Runtime

**Implementation fixed requirements (must ship with Phase A code):**

1. DB `pg_advisory_xact_lock` on token key then device key (ordered) for concurrent register serialization  
2. RPC authority user is server-session only — never trust client/body `user_id`  
3. RPC returns final `device_row_id`, `user_id`, `is_active`, `last_seen_at` for route verification  
4. No `user_devices` physical DELETE on register/cap; revoke authenticated DELETE RLS; contract forbid other app paths

---

## A. Phase A 목표

레거시 앱 수준의 **명확한 device↔user binding 권위**를 만든다.

```text
Logout
  → 현재 user의 해당 device(또는 scope) is_active=false
  → row 물리 삭제 없음

Login / Account switch / Token rotate
  → 현재 token을 현재 user에 원자적으로 bind
  → is_active=true, last_seen=now (activate 정책 통과 시)
  → 동일 token의 다른 user active ownership 제거
  → 동일 device의 stale token inactive
  → 다른 device_id의 기존 active는 유지 (multi-device)

Register 실패
  → 기존 정상 binding 유지
  → 부분 deactivate / 반쪽 이전 없음

Register 성공
  → Campaign FK / UNIQUE가 register를 막지 않음
  → 물리 DELETE 없음
```

**고정 불변조건 (Phase A):**

| ID | Invariant |
|----|-----------|
| I1 | 동일 `(push_provider, push_token, environment)` row는 한 시점에 한 `user_id`만 `is_active=true`일 수 없다 → 사실상 token ownership은 upsert 키가 단일 row이므로 한 user |
| I2 | 한 `user_id`는 서로 다른 `device_id`에 대해 동시에 active 가능 (multi-device) |
| I3 | Register 경로에 `user_devices` **물리 DELETE 없음** (wipe·cap 포함) |
| I4 | Register 실패 시 이 요청으로 인한 부분 inactive 잔존 없음 |
| I5 | Campaign / delivery 테이블은 register 성공을 차단하지 않음 |
| I6 | Identity·Badge 로직 변경 없음 |

---

## B. 현재 구조의 실패 계약

현재 `POST /api/me/devices/register` 순서:

```text
1. other-user deactivate (device_id)
2. old-token deactivate (same user/device/provider)
3. DELETE wipe (provider, token, environment)     ← 23505 / Campaign FK
4. active count
5. optional DELETE oldest (cap)                   ← 동일 FK 위험
6. activate policy
7. upsert
```

| 실패 모드 | 결과 |
|-----------|------|
| Step 3 wipe `23505` | HTTP 500, upsert 미실행, active 미복구 → Call `targets_found=0` |
| Step 1–2 성공 후 Step 3/7 실패 | **부분 deactivate** 가능 (실패 시 보존 계약 위반) |
| Step 5 cap DELETE | Campaign FK와 동일 충돌 가능 |
| SSOT LOCK §4.1 Token recycle=DELETE | Campaign `ON DELETE SET NULL` + COALESCE UNIQUE와 구조적 비양립 |

감사로 확정된 사실: Samsung/Xiaomi 모두 wipe에서 23505 → register 500.

---

## C. 안 1 — DB RPC 단일 트랜잭션

### C.1 개요

Postgres 함수 하나(예: `register_user_device(...)`)가 **한 트랜잭션**에서 binding을 완료한다.  
HTTP route는 auth·validate·`activateRow` 계산 후 RPC만 호출한다.

### C.2 실행 순서 (트랜잭션 내부)

```text
BEGIN

-- 0) 입력: auth_user_id, device_id, platform, push_token, push_provider,
--         environment, app_version, activate_row, now, max_devices

-- 1) UPSERT ownership (물리 DELETE 없음)
INSERT INTO user_devices (
  user_id, platform, device_id, push_token, push_provider,
  environment, app_version, is_active, last_seen_at, updated_at
) VALUES (...)
ON CONFLICT (push_provider, push_token, environment)
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  platform = EXCLUDED.platform,
  device_id = EXCLUDED.device_id,
  app_version = EXCLUDED.app_version,
  is_active = EXCLUDED.is_active,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = EXCLUDED.updated_at
RETURNING id INTO v_row_id;

-- 2) 동일 token은 이미 단일 row — 추가 조치 없음

-- 3) Cross-user same physical device → inactive
UPDATE user_devices
SET is_active = false, updated_at = now
WHERE device_id = $device_id
  AND environment = $environment
  AND user_id <> $auth_user_id
  AND is_active = true;

-- 4) Same user + device + provider, other tokens → inactive
UPDATE user_devices
SET is_active = false, updated_at = now
WHERE user_id = $auth_user_id
  AND device_id = $device_id
  AND push_provider = $push_provider
  AND environment = $environment
  AND push_token <> $push_token
  AND is_active = true;

-- 5) Cap: active count for user+environment > max
--    → oldest by last_seen_at among active rows EXCEPT v_row_id → inactive (NOT DELETE)
WHILE active_count(user, env) > max_devices LOOP
  UPDATE ... SET is_active=false
  WHERE id = (oldest active id ≠ v_row_id);
END LOOP;

COMMIT
RETURN v_row_id;
```

`activate_row=false`(legacy dibay 가드)인 경우: step 1에서 `is_active=false`로 upsert하되, step 3–4는 동일하게 적용할지 정책을 고정한다.  
**권장:** step 3(cross-user device)는 항상 수행; step 4는 provider 토큰 회전 정리로 항상 수행; 본 row만 inactive로 기록.

### C.3 실패 지점 · 실패 시 DB 최종 상태

| 실패 지점 | DB 최종 상태 |
|-----------|--------------|
| BEGIN 전 (auth/validate) | 변경 없음 |
| 트랜잭션 중 임의 오류 | **전체 ROLLBACK** → 요청 전 binding 유지 |
| COMMIT 후 | I1–I5 만족 상태 |

부분 deactivate 잔존: **없음** (트랜잭션 보장).

### C.4 동시성

| 시나리오 | 동작 |
|----------|------|
| 동일 token에 A·B 동시 register | `ON CONFLICT` row lock → 마지막 커밋 user가 owner. 한 row만 active. |
| 동일 device에 A logout / B login 경쟁 | B 트랜잭션의 step 1+3이 A device row를 inactive. 짧은 레이스는 row lock으로 직렬화. |
| 같은 user 두 device 동시 register | 서로 다른 token row → 둘 다 active 가능 (I2). |

### C.5 케이스 매핑

| 케이스 | 처리 |
|--------|------|
| Token ownership 이전 | Upsert가 `user_id` 갱신 (DELETE 없음 → Campaign FK 안전) |
| Device token 교체 | Step 4로 옛 token inactive; 새 token row upsert |
| Multi-device | 다른 `device_id` active 유지 |
| Cap | inactive only |
| Idempotency | 동일 body 재호출 = 같은 conflict row 갱신 + last_seen 갱신 |

### C.6 Migration / rollback / 테스트

| 항목 | 내용 |
|------|------|
| Migration | **필요** — `register_user_device` SECURITY DEFINER RPC + grants |
| 기존 데이터 | 읽기 호환. inactive·active 혼재 row는 다음 성공 register로 수렴 |
| Rollback | RPC drop + route를 구버전으로 되돌리면 됨. **데이터 destructive migration 없음** |
| 테스트 | SQL 단위(트랜잭션 rollback 시뮬레이션) + route mock RPC + 계약 vitest |

### C.7 장단점

| 장점 | 단점 |
|------|------|
| I4(실패 시 보존) 가장 강함 | migration·RPC 리뷰 필요 |
| App 다단계 await 레이스 축소 | 로컬/CI에 DB 함수 배포 절차 |
| DELETE 제거와 원자성을 동시에 만족 | route와 SQL 이중 유지 포인트 |
| Campaign FK 완전 우회 | — |

---

## D. 안 2 — Application upsert-first + 후속 deactivate

### D.1 개요

Route에서 순서를 바꾸고 wipe/cap DELETE를 제거한다.  
트랜잭션은 Supabase JS 기본으로 **문장 단위**이며, 다문을 하나의 DB 트랜잭션으로 묶지 않는다(별도 RPC 없으면).

### D.2 실행 순서

```text
1) UPSERT (provider, token, env) → bind current user, activate_row, last_seen
   — 실패 시 return 5xx; 여기까지 DB 변경 없음(해당 요청 기준)
2) Cross-user device deactivate
3) Same user/device/provider old-token deactivate
4) Cap: oldest active (≠ upserted id) → is_active=false (NOT DELETE)
5) Return 200
```

### D.3 실패 지점 · 실패 시 DB 최종 상태

| 실패 지점 | DB 최종 상태 |
|-----------|--------------|
| Step 1 upsert 실패 | **변경 없음** → 기존 binding 유지 ✅ |
| Step 1 성공, Step 2 실패 | Token은 이미 새 user ownership. 이전 user의 **같은 device_id** 다른 row가 여전히 active일 수 있음 → **부분 정리 실패** |
| Step 1–2 성공, Step 3 실패 | 새 token active + 같은 device 옛 token이 여전히 active 가능 |
| Step 4 실패 | active 수가 cap 초과로 남을 수 있음 (dispatch는 필터로 완화 가능) |

“Register 실패 → 기존 보존”은 **Step 1 실패에만** 완벽히 성립.  
Step 1 성공 후 후속 실패는 HTTP 500을 주더라도 **이미 ownership이 이전된 상태**라 “전체 실패=무변경”이 아니다.

보강 없이는 I4를 **완전 만족하지 못함**.

### D.4 동시성

| 시나리오 | 동작 |
|----------|------|
| 동시 upsert 동일 token | DB unique + conflict로 직렬화 — OK |
| Upsert 성공 후 deactivate 레이스 | 다른 요청이 다시 active로 올릴 수 있음 → **일시적 이중 active device(다른 token)** 가능 |
| 보상 트랜잭션 없음 | App 재시도에 의존 |

### D.5 케이스 매핑

| 케이스 | 처리 |
|--------|------|
| Token 이전 | Upsert — OK, Campaign 안전 |
| Token 교체 | Step 3 — 실패 시 stale active 잔존 가능 |
| Multi-device | OK |
| Cap | inactive — DELETE 없음 |
| Idempotency | Upsert 재호출 OK; 후속 deactivate 재시도 필요 |

### D.6 Migration / rollback / 테스트

| 항목 | 내용 |
|------|------|
| Migration | **불필요** (route only) |
| 기존 데이터 | 호환 |
| Rollback | route revert만 |
| 테스트 | vitest로 순서·에러 분기 mock; DB 원자성은 통합 테스트 없이는 약함 |

### D.7 장단점

| 장점 | 단점 |
|------|------|
| 배포 단순, migration 0 | I4·부분 deactivate를 RPC만큼 보장 못함 |
| 구현 빠름 | 후속 실패 시 HTTP/DB 의미 불일치 |
| DELETE 제거로 23505 핫패스 해소 | “구조 완료” 선언에는 부족 |

### D.8 보강안 (여전히 App 수준)

- Step 2–4 실패 시: **보상 없음**, 대신 `202`/`200` + async repair job — Phase A 불변조건과 어긋남.  
- Supabase interactive transaction(가능 시)으로 route에서 다중 문을 한 Tx에 — 사실상 **안 1의 약화 복제**. 가능하면 RPC로 명확히 하는 편이 낫다.

---

## E. 동시성·원자성 비교

| 판정 조건 | RPC | Upsert-first App |
|-----------|-----|------------------|
| Register 성공 → 현재 user active | ✅ | ✅ (step1) |
| Register 실패 → 기존 binding 유지 | ✅ (full rollback) | ⚠️ step1만 |
| 부분 deactivate 상태 없음 | ✅ | ❌ 후속 실패 시 가능 |
| 중복 active token ownership 없음 | ✅ (단일 row) | ✅ (단일 row) |
| 물리 DELETE 없음 | ✅ | ✅ (설계상) |
| Campaign FK 영향 없음 | ✅ | ✅ |
| 계정 전환 경쟁 | row lock으로 강함 | 약함 |
| multi-device | ✅ | ✅ |

**하드 조건 6개 중 App 단독은 “부분 deactivate 없음”을 만족하지 못한다.**

---

## F. 기존 데이터 영향

| 데이터 | 영향 |
|--------|------|
| 기존 `user_devices` | destructive 변경 없음. 다음 성공 register로 active 수렴 |
| `is_active=false` + stale `last_seen` (현재 장애 상태) | Phase A 성공 register 후 복구 가능 |
| `notification_campaign_deliveries` | Phase A에서 스키마 변경 없음. DELETE 제거로 **더 이상 register를 막지 않음** |
| 이미 SET NULL된 null sibling | Phase B 대상. Phase A 비범위 |
| environment 컬럼 | 유지. conflict key에 `environment` 포함 (현행과 동일) |

---

## G. SSOT LOCK 변경안 (제안 diff)

대상: `docs/push/push-device-identity-ssot-lock.md`

### G.1 §2 Upsert unique key (현행 코드와 문서 정합)

```diff
-| Upsert unique key | `(push_provider, push_token)` — **not** `(user_id, device_id)` |
-| Active FCM invariant | **At most one** row per `user_id` where `push_provider = 'fcm'` AND `is_active = true` |
+| Upsert unique key | `(push_provider, push_token, environment)` — **not** `(user_id, device_id)` |
+| Token ownership invariant | At most one row per `(push_provider, push_token, environment)`; that row’s `user_id` is the sole owner |
+| Multi-device invariant | One `user_id` MAY have multiple active rows for different `device_id` values (call fan-out). Chat dispatch may still apply `single_fcm` filter at read time. |
```

### G.2 §3.1 Server invariant (multi-device와 정합)

```diff
-After any **successful** FCM register where `activateRow === true`:
-
-COUNT(*) FROM user_devices
- WHERE user_id = <auth user>
-   AND push_provider = 'fcm'
-   AND is_active = true
-== 1
-
-The surviving row is the upserted row (`device_id` + `push_token` from the current register POST).
+After any **successful** FCM register where `activateRow === true`:
+
+1) The upserted `(push_provider, push_token, environment)` row has
+   `user_id = auth` AND `is_active = true` AND fresh `last_seen_at`.
+2) No other row shares that token key.
+3) Other users’ rows for the same physical `device_id` + `environment` are `is_active = false`.
+4) Same user + device + provider rows with a different `push_token` are `is_active = false`.
+5) Other `device_id` rows for the same user may remain active (multi-device).
```

### G.3 §4.1 Pre-upsert → Register authority (핵심)

```diff
-### 4.1 Pre-upsert (unchanged baseline)
-
-| Step | Rule |
-|------|------|
-| Cross-user device | `device_id` match + `user_id ≠ auth` → `is_active = false` (all providers on that device for prior user) |
-| Same device, new token | same `user_id` + `device_id` + **same `push_provider`** + different `push_token` → old token row `is_active = false`. **Do not** deactivate `apns` when registering `voip_apns` (or the reverse). |
-| Token recycle | `DELETE` row with same `(push_provider, push_token, environment)` before upsert (global token uniqueness) |
+### 4.1 Register authority (Phase A — no physical DELETE)
+
+**Authority order (single DB transaction via RPC — required):**
+
+| Step | Rule |
+|------|------|
+| Token bind | `UPSERT` on `(push_provider, push_token, environment)` setting `user_id=auth`, `device_id`, `is_active=activateRow`, `last_seen_at=now`. **Do not DELETE** token rows for recycle; ownership moves in place. |
+| Cross-user device | After bind: `device_id` + `environment` + `user_id ≠ auth` → `is_active = false` (all providers on that device for prior users). |
+| Same device, new token | After bind: same `user_id` + `device_id` + **same `push_provider`** + different `push_token` → old token row `is_active = false`. **Do not** deactivate `apns` when registering `voip_apns` (or the reverse). |
+| Cap | If active row count for `user_id`+`environment` exceeds max: set oldest active rows `is_active=false` (**never DELETE**). |
+| Failure | Any error before COMMIT → full rollback; prior bindings unchanged. |
+| Campaign | Register MUST NOT depend on deleting `user_devices` rows referenced by `notification_campaign_deliveries`. |
```

### G.4 §4.3 Post-upsert stale sweep

현 LOCK의 “동일 user 다른 FCM 전부 inactive”는 **multi-device call LOCK과 충돌**한다. Phase A에서는:

```diff
-When `push_provider === 'fcm'` AND `activateRow === true` AND upsert succeeded:
-  UPDATE ... SET is_active=false WHERE user_id=auth AND push_provider=fcm AND id≠upserted
+Do **not** deactivate other `device_id` FCM rows for the same user after register.
+Stale cleanup is limited to:
+  - other users on the same physical `device_id`, and
+  - same user + same `device_id` + same `push_provider` with a different `push_token`.
```

### G.5 §6.4 Token rotation

```diff
-  → pre-upsert: deactivate old token for same device_id (§4.1)
-  → upsert on (push_provider, push_token)
-  → post-upsert: deactivate other active FCM rows (§4.3)
+  → RPC register authority (§4.1): upsert new token bind, then deactivate
+    same-device previous tokens only (not other devices)
```

---

## H. 계약 테스트 목록

구현 승인 후 `vitest` / SQL fixtures (구현 전 목록만):

1. **RPC atomic success** — bind + cross-user inactive + old-token inactive in one commit.  
2. **RPC abort** — forced error after staged updates → DB unchanged (savepoint/rollback test).  
3. **Token ownership transfer** — row id preserved; `user_id` A→B; no DELETE.  
4. **Token rotate same device** — old token inactive; new active; other device of user still active.  
5. **Multi-device** — user keeps device1 active when registering device2.  
6. **Cap** — oldest becomes inactive; no DELETE; row still selectable.  
7. **Idempotent re-register** — same payload twice → one row, last_seen advances.  
8. **activateRow=false** — row stored inactive; does not steal slot incorrectly per `shouldActivateFcmDeviceRegister`.  
9. **Provider isolation** — voip register does not inactive apns on same device.  
10. **Environment isolation** — production token does not collide with preview.  
11. **No wipe DELETE in route/RPC source contract** — static string forbid `delete()` on token wipe/cap paths.  
12. **Campaign FK simulation** — user_devices row referenced by campaign delivery; register still succeeds.

---

## I. 실기기 검증 목록

Phase A 구현·Production 배포 후 (Identity/Badge 제외):

### Login / Logout / Switch (각 3회)

1. A 로그인 → A active FCM · `last_seen` 갱신 · register 200  
2. A 로그아웃 → A 해당 device inactive  
3. B 로그인 (같은 기기) → B active · A inactive · token row ownership B  
4. 중복 active token 없음  
5. A 기기1 + 기기2 (가능 시) 동시 active  

### Push / Call

6. `targets_found > 0`  
7. iOS→Xiaomi / Samsung→Xiaomi / Xiaomi→Samsung 음성·영상  
8. FCM callback → Native ring → accept → Agora → terminal  

### 부정

9. Register 강제 실패(테스트 빌드/fault inject 가능 시) 후 이전 binding 유지  
10. Campaign 이력이 있는 user_devices row에서도 register 200  

---

## J. 권장안과 근거

### 권장: **안 1 — DB RPC 단일 트랜잭션**

하드 조건 재평가:

| 조건 | RPC | Upsert-first |
|------|-----|--------------|
| Register 성공 → 현재 user active | ✅ | ✅ |
| Register 실패 → 기존 정상 binding 유지 | ✅ | ⚠️ |
| 부분 deactivate 상태 없음 | ✅ | ❌ |
| 중복 active ownership 없음 | ✅ | ✅ |
| 물리 DELETE 없음 | ✅ | ✅ |
| Campaign FK 영향 없음 | ✅ | ✅ |

**근거:** Phase A 목표는 응급 500 제거가 아니라 **실패 시 보존·부분 상태 금지**다.  
App upsert-first는 구현이 쉽지만 I4를 깨는 구멍이 남는다.  
RPC는 migration이 필요하나 destructive가 아니고, rollback은 함수 제거+route revert로 가능하다.

**Phase B:** Campaign COALESCE UNIQUE 교정은 A 실측 후 별도 승인·별도 커밋.

**명시적 비권장:** “DELETE 한 줄 삭제”만 하는 응급 패치.

---

## K. 구현 여부

```text
구현 여부: 대기
제품 코드 / migration / DB 데이터 / rollback: 금지
다음 게이트: 본 설계서 사용자 승인
```

승인 시 구현 커밋 분리 제안:

1. `docs(push): phase A register authority lock` — LOCK diff  
2. `feat(push): register_user_device RPC` — migration  
3. `feat(push): route uses register RPC; remove wipe/cap DELETE` — app  
4. 계약 테스트  

(원하면 2+3을 한 커밋으로 묶을 수 있으나 LOCK 문서와 코드는 같은 승인 묶음으로 맞출 것.)
