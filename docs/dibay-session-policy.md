# DIBAY 세션·로그아웃 정책

카카오톡/배민/당근형: **사용자가 명시적으로 로그아웃하지 않는 한** refresh 가능한 세션을 유지한다.

코드 단일 정의: [`lib/auth/dibay-session-policy.ts`](../lib/auth/dibay-session-policy.ts)  
클라이언트 진입점: [`lib/auth/dibay-session-manager.ts`](../lib/auth/dibay-session-manager.ts)

## A. 로그아웃해야 하는 경우

- 사용자가 로그아웃 버튼 클릭 (`logoutCurrentDevice`)
- 관리자/보안: 계정 정지·탈퇴·강제 revoke
- refresh token 실제 무효/폐기 (`forceClearCorruptSession`)
- `user_sessions` 에서 `invalidation_reason` 이 terminal (`user_logout`, `admin_revoke`, `global_signout`, …)
- 비밀번호/인증 변경 후 사용자가 **모든 기기 로그아웃** 선택 (`logoutAllDevices`)

## B. 로그아웃하면 안 되는 경우

- access token 만료 (auto refresh)
- 새로고침·앱 재접속·네트워크 일시 장애
- Supabase/API 401 1회
- 다중 탭·Vercel 재배포·프로필 fetch 일시 실패·admin 장시간 방치

→ `refreshSession` 1회 → `getUser` 1회 → 재시도 후 **terminal 확인 시에만** 만료 안내.

## C. 로그인 시 유지

- Supabase refreshable session (쿠키)
- `dibay:client_instance_id` (device_id)
- `samarket_app_language` / 기기 언어 seed
- 같은 user id 일 때만 URL/스크롤 복원 허용
- admin role 은 서버 재검증 — 검증 실패 전 UI 강제 로그아웃 금지

## D. 로그아웃 시 삭제

- profile / currentUser 캐시, messenger·cart·unread·room selection, user-specific localStorage (`dibay:{userId}:*`)
- Realtime·BroadcastChannel·pending timer
- **유지**: `samarket_app_language`, `dibay:client_instance_id`, device UI seed

## E. 같은 기기 · 다른 아이디

- user id 변경 시 이전 `dibay:{oldUserId}:*` 전체 삭제 + in-memory wipe
- 이전 사용자 deep link 복원 금지 → role별 홈
- 타 사용자 room/order 접근: 403/404, auto logout 금지

## F. 같은 아이디 · 다른 기기

- **기본 허용** — 새 기기 로그인이 기존 기기를 끊지 않음
- `SESSION_REPLACED` / `profiles.active_session_id` mismatch 강제 종료 **사용 안 함**
- `logoutAllDevices` 만 global revoke

## G. 중복 접속

| 조합 | 정책 |
|------|------|
| same user + same device_id + multi tab | 허용, 단일 Supabase 세션 |
| same user + different device_id | 허용 |
| different user + same device_id | 새 로그인 시 이전 user cache 완전 삭제 |

## Logout API

| 함수 | Supabase | 서버 |
|------|----------|------|
| `logoutCurrentDevice` | `signOut({ scope: "local" })` | `POST /api/auth/logout` — current session registry only |
| `logoutAllDevices` | `signOut({ scope: "global" })` | `POST /api/auth/logout-all` |
| `forceClearCorruptSession` | local signOut + wipe | (없음) |

## Storage key 규칙

- 공용: `dibay:client_instance_id`, `samarket_app_language`, …
- 사용자: `dibay:{userId}:{suffix}`

## Account switch 청소 도메인

`DIBAY_ACCOUNT_SWITCH_WIPE_DOMAINS` — profile_cache, app_boot, messenger_bootstrap, room_snapshots, commerce_cart, trade_drafts, unread_badges, last_route_restore, owner_admin_selection, pending_auth_actions, login_bootstrap, address_defaults, user_settings
