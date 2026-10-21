# DIBAY AUTH 전체 감사 · 통합 SSOT 설계안 (2026-10-21)

**모드:** 감사 → 결함 확정 → 설계안 제출까지. **코드·DB·인증 설정 변경 0 · 배포 0.**
**기준:** HEAD `045831e8` · 운영 DB `ckdosyydvgzqwpbwuhon` **읽기 전용 카탈로그/집계 조회만** (회원 PII 미조회, 테스트 DB 미접근).
**선행 문서(재사용, 재감사 안 함):** `docs/auth-hard-lock.md` · `docs/dibay-member-auth-account-hard-lock-contract.md` · `docs/dibay-member-auth-phase-h0-audit.md` · `docs/dibay-first-entry-legal-consent-ssot.md` · `docs/auth-account-linking-policy.md` · `docs/dibay-session-policy.md` · `docs/auth/web-oauth-owner-rebind-contract.md`.

### 증거 등급

| 표기 | 의미 |
|---|---|
| **CODE** | 현재 코드에서 경로 확인 |
| **LIVE** | 운영 DB 카탈로그·집계 읽기로 확인 |
| **TEST** | 로컬 자동 테스트 PASS |
| **NOT_PROVEN** | 실행·기기·외부 설정 증거 없음 |

이 작업 환경에서는 실기기·Preview·Production 런타임에 접근할 수 없다 (Vercel env 403 · 외부 HTTP 차단). 그래서 **실기기 PASS 항목은 0건**이다.

### 로컬 자동 테스트

- 명령: `npx vitest run lib/auth lib/admin-users app/api/admin lib/admin/__tests__ lib/profile`
- 결과: **311 files / 2119 tests PASS** (TEST)
- 범위: 기존 계약 테스트 범위만. 아래 결함 대부분은 **현행 테스트가 다루지 않는 경로**다.

---

## 1. 현재 구조에서 확인된 사실 (A. 현행 인증 아키텍처)

### 1.1 회원 식별

```text
Person  = auth.users.id ≡ profiles.id                       (CODE·LIVE: profiles 고아 0건)
Identity = user_auth_identities(provider, provider_user_id) UNIQUE, (user_id, provider) UNIQUE   (CODE)
DIBAY ID = profiles.dibay_id (lower unique) — 서버 RPC assign_auto_dibay_id (service_role 전용)
Admin   = admin_memberships(status='active')  ← 앱 가드·SQL is_platform_admin 모두 membership 전용 (CODE)
Store   = stores.owner_user_id
```

운영 DB 집계 (LIVE):

| 항목 | 값 | 비고 |
|---|---|---|
| 동일 `(provider, provider_user_id)` 가 2명 이상에 연결 | 0건 | |
| 같은 이메일을 쓰는 profiles 묶음 | 1건 | 진단 대상 · 자동 병합 금지 정책 유지 |
| profile 없는 auth.users | 7건 | email 6, landing pad 1 |
| `profiles.role ∈ (admin, super_admin)` | **0명** | |
| active `admin_memberships` | **4명** | |
| 약관 미동의 회원 | 14명 | |
| `member_status` 분포 | active 69 · pending 38 · verified_member 12 · sns_member 4 | |

Identity 연결 수 (LIVE):

| Provider | `user_auth_identities` | `auth.identities` |
|---|---|---|
| Kakao | 8 | 1 |
| Google | 53 | 31 |
| Apple | 1 | 1 |

Kakao·Google 회원 다수는 **네이티브 exchange 가 만든 synthetic email(`kakao.<id>@…`) 계정**이다. Supabase identity 와 1:1 이 아니다.

### 1.2 공급자 활성 상태 (LIVE `auth_providers` / `auth_login_settings`)

| Provider | `auth_providers` | `auth_login_settings` |
|---|---|---|
| Google | ON | ON |
| Kakao | ON | ON |
| Apple | ON | ON |
| Naver | OFF | OFF |
| Facebook | OFF | OFF |
| 아이디(password) | — | **ON** (고객 로그인 화면 노출) |

공급자 OFF 는 **버튼만 숨긴다**. start / callback / native exchange 라우트는 이 설정을 확인하지 않는다 (CODE, OA-14).

### 1.3 인증 흐름 (요약)

```text
[Web OAuth: Google/Kakao/Apple(Android·Web)/Google(iOS)]
  /api/auth/oauth/start → Supabase PKCE → /auth/callback
    → exchangeCodeForSession → enforceWebOAuthProviderPolicy(resolveProviderLogin)
    → (parallel user면 owner rebind: Google만 지원)
    → ensureAuthProfileForLogin + persistOAuthProviderIdentity
    → resolveCommonAuthDestination

[Native exchange: Google(Android) · Kakao(Android) · Apple(iOS)]
  SDK token → POST /api/auth/native/exchange → *-token-verify
    → resolveNativeProviderSessionPrelude → admin create/update(파생 비밀번호)
    → signInWithPassword → 쿠키 → finishClientAuthLogin

[Naver] /api/auth/naver/start(state 쿠키) → callback → **email 로 auth.users 재사용** → 파생 비밀번호 로그인

[내부(password)] 클라이언트 signInWithPassword (resolve-password-login-identifier 로 alias→email)

[관리자] 같은 세션 + app/admin/layout.tsx 서버 체크 + /api/admin/* 전 라우트 서버 가드(473개, 410 8개 외 전부 가드)
```

공통 출구:
- Destination = `resolveCommonAuthDestination` 1곳.
- 가입 완료 = **약관·개인정보 동의 1조건** (`deriveDibaySignupStatus`).
- DIBAY ID·프로필·전화 = 기능 게이트.

### 1.4 세션

- 사용자 판별은 `getRouteUserId` → `getClaims()` 1경로다. Cookie→user 캐시는 모두 **토큰/전체 쿠키 sha256 키**에 TTL 3~12s 이며, 익명 요청은 캐시하지 않는다 (CODE).
- 로그아웃 순서:
  1. native/web push 해제
  2. 서버 logout (registry 비활성)
  3. `signOut(local)`
  4. **localStorage 전체 sweep(언어·instance id 등 4키 제외)** · sessionStorage clear · IndexedDB 삭제 · CacheStorage 삭제 · in-memory store reset · `removeAllChannels`
  5. `location.replace` 하드 리로드 (CODE)
- B 로그인 시 기기 토큰 소유권 이전은 `register_user_device` RPC 가 같은 `device_id` 의 타 사용자 row 를 비활성화한다 (CODE).

---

## 2. 정상 동작으로 확인된 부분 (수정 대상 아님)

| # | 항목 | 증거 |
|---|---|---|
| N1 | public 스키마 **모든 테이블 RLS 활성** | LIVE (RLS off 테이블 0) |
| N2 | SECURITY DEFINER 함수 385개 중 anon/authenticated 실행 가능 **0개** (SV-01 의심 **반증**) | LIVE |
| N3 | `notification_targets` RLS on + 정책 없음 = 클라이언트 접근 거부 (SV-02 의심 **반증**) | LIVE |
| N4 | `test_users.password` 컬럼은 anon/authenticated 에 SELECT 권한 없음 | LIVE |
| N5 | `auth_providers`(client_secret 보관)는 RLS on + 정책 없음 → 클라이언트 읽기 불가 | LIVE |
| N6 | profiles 가드 트리거: role/status/provider/phone_verified*/dibay_id/deleted_at/member_status 등 회원 자기 수정 차단 · `points` 차단 | LIVE (`guard_profiles_self_update`) |
| N7 | H-0 감사의 **게이트 skew 해소**: `isRouteAdmin`·`requireAdmin*`·SQL `is_platform_admin`/`is_admin_user` 모두 membership 전용 | CODE |
| N8 | `/api/admin/*` 473 라우트: 무가드·클라이언트 전용 가드 0 (410 8개 제외) · 감사 로그 actor 는 서버 세션 | CODE |
| N9 | 관리자 회수·권한 변경은 다음 요청부터 반영 (membership·permission 무캐시) · 마지막 super_admin revoke 차단 | CODE |
| N10 | 탈퇴 회원은 모든 로그인 경로(web callback·native·Naver)에서 차단 · blocked 는 Supabase ban + session 종료 | CODE |
| N11 | Web PKCE: verifier 가 WebView 쿠키에 있어 심어진 `dibay://auth/callback?code=` 로 교환 불가 · native return bridge origin 고정 | CODE |
| N12 | Google/Apple 토큰 검증: iss·aud·exp (Apple: JWKS 서명·bundle aud) | CODE |
| N13 | Web rebind owner 는 SSOT identity row 로만 결정 · profile 있는 임시 principal 거부 · fail-closed | CODE |
| N14 | 이메일만으로 소셜 계정 병합 없음 (Naver 제외) · Apple relay 이메일 매칭 제외 · Kakao 이메일 비신뢰 | CODE |
| N15 | 동의 버전 SSOT: 모든 서버 지점이 같은 CMS 필수 버전 · PATCH 409 stale · 중앙 API 동의 게이트 fail-closed | CODE·TEST |
| N16 | 단일 탭 로그아웃 → B 로그인: 세션·쿠키·로컬 저장소·IndexedDB·Realtime·푸시 바인딩 분리, B 화면에 A 데이터 없음 | CODE (런타임 NOT_PROVEN) |
| N17 | 푸시 표시 안전망: payload `targetUserId` 불일치 시 Android/iOS 네이티브가 표시 안 함 | CODE |
| N18 | OAuth 중복 탭 방지 `tryBeginOAuthFlow` · 비밀번호 폼·동의 폼 in-flight 잠금 | CODE |
| N19 | 주문·주소·알림·정산·주문채팅·메신저 API 는 service-role 사용 전 세션 user 소유권 필터 | CODE (샘플) |
| N20 | 서버 클라이언트 제공 userId 신뢰 없음 (devices/register 불일치 거부) | CODE |
| N21 | Realtime 채널 전부 `private: true` · room bump 서버 발행 전용 | CODE |
| N22 | 클라이언트 auth i18n ko/en 키 194=194 일치 | CODE |

---

## 3. 실제 결함과 원인 (F. 확정 결함 목록)

중복 원인은 하나로 묶었다. 원래 감사 ID(OA/SG/SW/AD/SV/UX)를 괄호로 남긴다.

### P0 — 타인 데이터 노출 · 계정 혼합 · 인증 우회

| ID | 결함 | 증거 |
|---|---|---|
| **P0-1** | **Naver 로그인 = 이메일만으로 기존 계정 세션 발급 + 그 계정 식별 컬럼 덮어쓰기** (OA-01, OA-14) | CODE · 도달 가능성 NOT_PROVEN |
| **P0-2** | **웹 다중 탭: A 로그아웃 → B 로그인 시 다른 탭에 A 의 메신저·피드 메모리 상태·Realtime 채널·sessionStorage 거래 초안 잔존** (SW-01) | CODE · 런타임 NOT_PROVEN |
| P0-? | 관리자 페이지 RSC 레이아웃 생략 요청으로 서버 렌더 데이터 노출 가능성 (AD-01) | NOT_PROVEN |

**P0-1 — Naver 이메일 기반 계정 재사용**
- **증상:** Google/Apple-web/아이디 회원과 같은 이메일의 Naver 계정으로 로그인하면, 그 회원의 비밀번호를 파생값으로 재설정하고 그 회원으로 로그인된다. 기존 회원의 `profiles.provider/auth_provider/provider_user_id/auth_login_email` 은 Naver 값으로 바뀐다.
- **원인:** `app/api/auth/naver/callback/route.ts:81-124,155-164` (`findAuthUserByEmail`). email_verified 확인·`user_auth_identities` 조회·provider 활성 확인이 모두 없다.
- **도달 조건:** `auth_providers.naver=OFF`(LIVE) 지만 라우트는 이 설정을 보지 않는다. Production 에 `NAVER_OAUTH_CLIENT_ID` 가 있으면 `/api/auth/naver/start` 직접 호출로 도달한다. **Production env 존재 여부 NOT_PROVEN** (Vercel 접근 403).
- **정책 충돌:** `auth-account-linking-policy.md` 는 이를 "승인 필요 예외"로 두었고 식별 컬럼 덮어쓰기는 문서에 없다.
- **재현:** 동일 이메일 Naver 계정 → `/api/auth/naver/start`.

**P0-2 — 웹 다중 탭 계정 전환 잔존**
- **재현:** 탭1 `/community-messenger`, 탭2 `/write` → 탭1 로그아웃 → 탭1 B 로그인 → 탭2 확인.
- **원인 1:** 다른 탭은 cross-tab SIGNED_OUT 에서 `syncSignedOutClientCaches()` 만 실행한다 (`components/.../SupabaseAuthSync.tsx:126-134`, `lib/auth/client-session-wipe.ts:200-212`). in-memory store reset·channel 제거·sessionStorage clear·리로드가 없다.
- **원인 2:** B SIGNED_IN 시점에는 bound user id 가 이미 비어 있어 `detectAuthUserMismatch` 가 false 다 (`lib/auth/client-instance-id.ts:71-77`). 그래서 계정 전환 wipe 가 실행되지 않는다.
- **원인 3:** 거래 초안 sessionStorage 읽기에 소유자 확인이 없다 (`lib/posts/trade-write-form-session-draft.ts`).
- **영향:** 웹 브라우저(데스크톱·모바일). Android/iOS WebView 는 단일 탭이라 해당 없음.
- **정책 충돌:** `dibay-session-policy.md` §E·§G.

**P0-? (NOT_PROVEN) — AD-01**
- **위험 경로:** `app/admin/community/reports/page.tsx`, `community/topics`, `delivery`, `messenger`, `philife/meeting-reports` 는 페이지 자체 가드 없이 service-role 로 데이터를 읽고, 보호는 `app/admin/layout.tsx` 에만 의존한다.
- **확정 조건:** 조작된 RSC 요청(`Next-Router-State-Tree`)으로 레이아웃 재실행을 건너뛸 수 있는지는 미검증이다. 성공하면 일반 회원에게 신고 데이터가 노출되어 P0 가 된다.
- **처리:** 수정 설계는 P1-11 과 동일한 1회 수정에 포함한다.

### P1 — 가입·로그인 불가 · 계정 중복 · 세션 오류 · 필수 게이트 우회

| ID | 결함 | 증거 |
|---|---|---|
| **P1-1** | **전화 OTP 인증이 정지(suspended) 회원을 active 로 되돌림** (SG-03) | CODE · OTP 기능 **ON(LIVE)** |
| **P1-2** | Kakao native 토큰의 `app_id` 미검증 → 타 앱 발급 토큰 수용 (OA-02) | CODE · 악용 범위 NOT_PROVEN |
| **P1-3** | 비로그인 `POST /api/auth/provider/conflict-check` 가 이메일/공급자 ID 로 **기존 회원 userId·연결 공급자** 반환 · native conflict 응답에도 `existingUserId` (OA-03) | CODE |
| **P1-4** | 연결 stash 토큰이 계정·세션에 묶이지 않음 · URL 로 주입 가능 · link/complete 가 검증 실패 시 stash 로 fallback → 공격자 provider 를 피해자 계정에 연결할 수 있는 경로 (OA-05) | CODE · 전체 체인 NOT_PROVEN |
| **P1-5** | **교차 플랫폼 로그인 불가**: Android 네이티브로 가입한 Kakao 회원이 iOS/웹 Kakao 로 로그인하면 `oauth_rebind_failed`. iOS Apple 네이티브 회원의 Android/웹 Apple 로그인도 동일 (OA-04) | CODE · LIVE 정황 |
| **P1-6** | Supabase 이메일 자동 identity 연결로 웹 email-conflict 정책 우회: 웹 Google 회원이 같은 이메일로 웹 Apple 로그인 → 기존 계정 진입 · Apple SSOT row 없음 · iOS 네이티브 Apple 은 conflict 로 차단 (불일치) (OA-06) | CODE · Supabase 설정 NOT_PROVEN |
| **P1-7** | 네이티브 로그인마다 기존 owner 의 `auth.users.email` 을 synthetic 으로, 비밀번호를 파생값으로 덮어씀 · `profiles.provider*` 매 로그인 덮어씀 · Kakao 는 탈퇴 확인 **전에** 갱신 (OA-07) | CODE |
| **P1-8** | Google native orphan reconcile 이 auth user 를 **hard delete** · orphan 판정이 넓음 (provider=google profile / Gmail 일치 profile 포함) (OA-09) | CODE · 발동 NOT_PROVEN |
| **P1-9** | **아이디(password) 로그인은 최초 약관 화면을 건너뜀** (SG-01) | CODE |
| **P1-10** | **PostgREST 직접 쓰기로 동의·생애주기 게이트 우회** (SG-02, SV-06) | LIVE |
| **P1-11** | 관리자 SSR 페이지의 권한 키(reports/boards 등)는 **클라이언트 게이트만** → 키 없는 운영자에게 서버가 데이터 렌더 (AD-02, AD-01 포함) | CODE |
| **P1-12** | **profiles 자기 수정 가드 누락 컬럼**: `phone`(인증 후 번호 변경해도 `phone_verified` 유지), `terms_*`/`privacy_*`(화면 없이 동의 기록 위조·소급) (SG-07 + 본 감사) | LIVE |
| **P1-13** | 관리자 SQL 잔존 `profiles.role` 판정 (AD-03) | LIVE |
| **P1-14** | iOS 에 Apple 버튼 노출이 코드로 보장되지 않음 (App Store 4.8 심사 위험) · 경로 없는 버튼 노출(`native_blocked`) (UX-03, UX-04) | CODE |
| **P1-15** | 이메일 충돌 다이얼로그 "기존 방법으로 로그인" 이 네이티브에서 완료 처리 없음 · 기존 provider 가 email/naver 면 오동작 (UX-05) | CODE |
| **P1-16** | Google 버튼 단색 G 로고(다크모드 흰 버튼에 흰 G 가능) · Kakao 색·심볼·문구 브랜드 규정 불일치 (UX-01, UX-02) | CODE · 렌더 NOT_PROVEN |

결함별 세부:

- **P1-1 원인:** `lib/auth/phone-otp-service.ts:353-368` 가 무조건 `status:"verified_user", member_status:"active"` 를 기록한다. 이 라우트는 생애주기 예외 목록에 있고 설명은 "does not clear suspend" 다 (`lib/auth/member-action-policy.ts:53-61`). 계약과 구현이 충돌한다. **실제 제재 무력화.**
- **P1-5 원인:** `lib/auth/provider-identity/web-oauth-owner-rebind.server.ts:96-98` 는 Google 외 provider 를 거부한다. rebind 계약의 magiclink 주경로는 미구현이다.
- **P1-5 LIVE 정황:** Kakao `user_auth_identities` 8 vs `auth.identities` 1 → Kakao 회원 대부분이 synthetic 계정이다.
- **P1-9 원인:** `finishClientAuthLogin` 은 handoff 플래그가 있을 때만 terms 로 보낸다 (`lib/auth/finish-client-auth-login.client.ts:58-62`). 이후 `/mypage` 는 public-browse 라 proxy·DibaySignupGate 를 모두 통과한다. 쓰기 API 는 403 이 유지된다(데이터 게이트 정상, **UI 게이트 우회**).
- **P1-10 근거:** authenticated 에 INSERT/UPDATE 권한과 "본인" 정책이 살아 있고 정책에 동의·상태 조건이 없다. 대상 테이블은 `comments`, `post_comments`, `price_offers`, `favorites`, `community_friend_requests`, `product_chats`/`product_chat_messages`, `transaction_reviews`, `chat_rooms`. 미동의·정지 회원이 anon key + 본인 JWT 로 직접 쓸 수 있다. 앱이 실제로 브라우저에서 직접 쓰는 곳은 `markRoomAsRead` 1곳뿐(읽음 = 예외 범주)이다.
- **P1-13 근거:** LIVE 에서 role 관리자는 0명, membership 관리자는 4명이다. 그 결과:
  - `admin_delivery_operation_recovery_execute` 가 모든 관리자에게 `not_platform_admin` 을 반환한다 (`supabase/migrations/20270605100500…:28-33`).
  - 배달 자동조치 알림 수신자가 0명이다 (`20260514150000_delivery_auto_actions_safety.sql`).
  - 대시보드 관리자 수가 0으로 집계된다.

### P2 — UI/UX/CTA · 오류 복구 · 기기별 사용성 · 보안 위생

| ID | 내용 |
|---|---|
| P2-1 (SG-05, SG-09) | OAuth 후 약관 화면에서 앱 종료/이탈 시 재실행이 public 화면 진입(로그인됨·미동의) · `signup_incomplete` 403 클라이언트 복구 경로 없음 · profile row 누락 시 503 으로 표시 |
| P2-2 (SG-06) | 미동의 사용자가 메신저 액션에서 전화 OTP(개인정보 입력·SMS) 를 동의보다 먼저 진행 |
| P2-3 (SG-04) | 동의 미기록 관리자: Destination 은 terms, 서버 동의 권위는 "완료" — 표면 간 판정 불일치 (루프 없음) |
| P2-4 (SG-08, SV-05) | 중앙 API 게이트가 일시적 auth 오류 시 fail-open |
| P2-5 (SV-03) | logout-all 후 탈취 access token + 새 active-session 쿠키 UUID 로 registry 자동 재등록 (JWT 서명 방식 NOT_PROVEN) |
| P2-6 (SV-04) | blocked/withdrawn 의 GET 은 access token 만료까지 허용 |
| P2-7 (SV-07) | 메신저 멤버십 캐시 45s · 매장 소유 캐시 30s 인스턴스 간 stale |
| P2-8 (SV-08) | `store_orders` 등에 anon/authenticated DML grant 잔존 (SELECT 정책만 보호) |
| P2-9 (SW-02) | 메신저 first-paint sessionStorage 캐시에 viewer id 없음 (로그아웃 5s 대기 중 늦은 응답 재기록 가능, NOT_PROVEN) |
| P2-10 (SW-04, SW-05) | 비명시적 SIGNED_OUT 시 로컬 wipe 지연 · bfcache guard 가 익명 부팅에서 조기 해제 |
| P2-11 (SW-06) | 계정 전환 wipe 가 B 세션에서 `device_all_users` 해제 → B 푸시 일시 손실 가능 (네이티브·통화 민감 영역: 보고만) |
| P2-12 (AD-04~AD-09) | store-settlements GET 권한키 누락 · 빈 권한=티어 기본값 · 관리자 대상 확인 DB 오류 시 fail-open · 정지 운영자 정책 불일치 · admin `/me` 스냅샷 미초기화 · password 로그인 설정은 UI 스위치뿐 |
| P2-13 (OA-08, OA-10, OA-12, OA-13, OA-15~OA-18) | `findAuthUserByEmail` 4,000명 상한 · synthetic email 선점(pre-hijack, Supabase 공개 가입 설정 NOT_PROVEN) · Google native nonce 없음/Apple nonce 선택 · 파생 비밀번호 seed 가 service key 로 fallback · PKCE 쿠키 옵션 유실 · unlink 무재인증·fallback 으로 실효 없음 · web identity 기록 실패 무시 · 문서 드리프트(provider-matrix 의 Google native 501, rebind magiclink) |
| P2-14 (OA-11) | `sanitizeNextPath` 제어문자 미차단 → `next=%2F%09%2Fevil.example` 외부 리다이렉트 |
| P2-15 (UX-06~UX-18) | 원시 오류코드·개발자 문구 노출 · 반경 규칙(OAuth 12px) 위반 · "카카오로 로그인" vs "계속하기" 불일치 · 조사 오류 `{provider}으로` · 로그아웃 성공 안내가 빨간 오류색 · 정지/차단 전용 화면 없음 · capacitor-return 빈 화면 · 관리자 거부 화면 로그인 링크 없음 · 약관 화면 비토큰 색(Starbucks 팔레트) · PhoneVerificationBox 예외 미처리 · AuthGateOverlay 키보드/safe-area 미처리 · Android 뒤로가기 약관 오버레이 미등록 |
| P2-16 | `auth_providers.client_secret` 평문 DB 보관 (클라이언트 노출은 없음 N5). Vault/env 이전 권장 |
| P2-17 | `favorite_audit_log` anon SELECT `true` (user_id·post_id 공개) (LIVE) |

### NOT_PROVEN (확정 불가 · 외부 설정/기기 필요)

1. Production `NAVER_OAUTH_CLIENT_ID` 존재 여부 — P0-1 도달성.
2. Supabase 대시보드 설정: 이메일 자동 identity 연결(P1-6) · 공개 이메일 가입/auto-confirm(OA-10) · JWT 서명 방식(P2-5) · Realtime "public channel access" 비활성(SV-09) · access token 수명.
3. Apple `sub` 가 Services ID(web)와 bundle(native) 간 동일한지 (팀/그룹 설정) — 다르면 Apple 회원 중복.
4. AD-01 RSC 레이아웃 생략 실현 가능성.
5. 모든 실기기 결과 (Android 폰/태블릿, iPhone, 웹) — 이번 감사에서 실행하지 않음.

---

## 4. 결함별 수정 설계 (G 설계와 연결)

| ID | 최소 수정 설계 | DB | 구분 | 회귀 위험 | 검증 |
|---|---|---|---|---|---|
| P0-1 | Naver 를 `resolveProviderLogin`(identity `naver:<id>`) + synthetic email(Kakao 패턴)로 전환. email 일치는 `provider_email_conflict`. 프로필 식별 컬럼 덮어쓰기 제거. **모든 start/callback/exchange 가 `auth_providers.enabled` 를 서버에서 확인** (OAuth 공통 가드 1곳) | 기존 Naver 회원(LIVE 0명) backfill 불필요 | 웹 | 낮음 (Naver 회원 0) | 단위: 동일 이메일 Naver → conflict · provider OFF → 403 |
| P0-2 | 다른 탭에서 **명시적 logout broadcast** 수신 시 로그아웃 탭과 같은 `wipeClientSessionState("user_logout")` + `location.replace`. 예상치 못한 SIGNED_OUT 복구 경로는 불변 (CUT-A 부팅 루프 방지) | 없음 | 웹 | 중 (부트 루프) — broadcast 출처 한정 | Playwright 2탭 A→B: 탭2 리로드·sessionStorage 공백 |
| P1-1 | verify 시 `status`·`member_status` 는 현재 값이 null/active/pending/sns 계열일 때만 승격. 정지·차단·탈퇴는 전화 필드만 갱신 | 없음 (TS) | 웹 | 낮음 | 단위: suspended row verify → status 불변 |
| P1-2 | `tokenInfo.app_id === KAKAO_APP_ID` 필수, env 없으면 fail-closed | 없음 | 웹(서버) | 낮음 (env 등록 필요 → Owner) | 단위: app_id 불일치 401 |
| P1-3 | conflict-check 라우트 삭제(미사용) 또는 세션 필수. 클라이언트 payload 에서 `existingUserId` 제거 | 없음 | 웹 | 낮음 | 단위·grep |
| P1-4 | stash 를 conflict 대상 `existingUserId`+수신 세션에 바인딩 · URL 주입 거부 · credential 제출 시 fallback 금지 · 토큰 종류별 HMAC 키 분리 | 없음 | 웹 | 낮음 | 단위: 타 계정 세션에서 stash → 거부 |
| P1-5 | owner 재발급을 provider 무관 **magiclink(generateLink)+verifyOtp** 로 구현(계약 주경로). Google 비밀번호 fallback 유지 | 없음 | 웹 | 중 (Auth §4 reopen 필요) | 단위 Kakao/Apple rebind + 실기기 Android Kakao 가입 → iOS Kakao 로그인 |
| P1-6 | 웹 정책 candidate = 이번 로그인 identity(`last_sign_in_at` 최신 또는 provider 쿼리 일치). 해당 identity SSOT row 없고 다른 identity 보유 시 `provider_email_conflict`. **Supabase 자동 연결 설정 확인(Owner)** | 없음 | 웹 | 중 | 단위 + 웹 Google→Apple 동일 이메일 |
| P1-7 | email/password 갱신은 auth user 가 **같은 provider 의 DIBAY synthetic 계정**일 때만. 탈퇴 확인을 모든 갱신 앞으로. `profiles.provider*` 는 최초 기록만 | 없음 | 웹 | 중 | 단위: 연결 회원 재로그인 시 email 불변 |
| P1-8 | hard delete 금지 → tombstone. orphan = profile 없음 또는 콘텐츠 없는 pending 만 | 없음 | 웹 | 낮음 | 단위 |
| P1-9 | password 성공 후 `/api/me/signup-status` 1회 → `consentComplete` 를 `finishClientAuthLogin` 에 전달 (Destination 의미 불변, 입력 보강) | 없음 | 웹 | 낮음 | 단위 + e2e 미동의 아이디 로그인 → terms |
| P1-10 | API 로만 쓰는 테이블은 authenticated INSERT/UPDATE/DELETE **REVOKE** (기존 20270521/20270522 패턴). 클라이언트 직접 쓰기 유지 테이블(`product_chats` 읽음)은 `markRoomAsRead` 를 API 로 이전 후 revoke | **마이그레이션 (Owner 승인)** | DB+웹 | 중 (숨은 직접 쓰기) — `.from(...).insert/update` grep 결과 1곳 | 마이그레이션 후 LIVE ACL 재조회 + 회귀 vitest |
| P1-11 | 해당 SSR 페이지/로더에서 `requireCommunityAdmin(area)`/`requireAdminPermission` 서버 호출, 실패 시 거부 패널. 권한키 없는 `scope=null` → 거부 | 없음 | 웹 | 낮음 | 키 없는 운영자 세션으로 페이지 요청 |
| P1-12 | `guard_profiles_self_update` 제한 목록에 `phone`, `terms_*`, `privacy_*` 추가 (쓰기는 서비스롤 경로: OTP·legal-consent 이미 서버) | **마이그레이션 (Owner 승인)** | DB | 낮음 — 클라이언트가 이 컬럼을 직접 쓰는 코드 확인 후 | LIVE 함수 정의 재조회 + vitest |
| P1-13 | 3개 SQL 의 `profiles.role` 판정을 `is_platform_admin()` / `admin_memberships` 조인으로 교체 | **마이그레이션 (Owner 승인)** | DB | 낮음 | 관리자 recovery 실행 1회 확인 |
| P1-14 | iOS 셸에서 Apple 이 없으면 다른 소셜 버튼도 숨김 + 관리자 설정 경고 · 버튼 목록을 `routing.action !== "native_blocked"` 로 필터 (bridge ready 후 렌더) | 없음 | 웹 | 낮음 | 단위 + iOS 실기기 |
| P1-15 | 다이얼로그 액션을 `useOAuthLogin().startOAuthProvider` 로 위임 (email → 내부 로그인 폼, naver → web start) | 없음 | 웹 | 낮음 | 단위 + 실기기 |
| P1-16 | 공식 4색 G SVG · 1px `#747775` 테두리 · Kakao 검정 심볼/`rgba(0,0,0,.85)` 라벨 | 없음 | 웹 | 없음 | 라이트/다크 스크린샷 |
| P2 묶음 | §5 SSOT 적용 시 함께 (원시코드 → i18n 키, 반경 surface prop, nonce 서버 발급, next 제어문자 차단, fail-open → 503 등) | 일부 DB(P2-8, P2-17) | 웹/DB | 낮음 | 해당 단위 |

---

## 5. 최종 통합 SSOT 구조 (G)

### 5.1 인증 공급자 ↔ DIBAY 회원 식별 SSOT

```text
IDENTITY KEY   = user_auth_identities(provider, provider_user_id)   ← 유일한 로그인 식별 권위
PERSON         = user_auth_identities.user_id = auth.users.id = profiles.id
EMAIL / PHONE  = 연락·진단 속성. 로그인 식별·병합 근거로 사용 금지 (전 provider, Naver 포함)
SESSION MINT   = 식별된 PERSON 에 대해서만. 방식은 provider 무관 단일 함수
                 issueOwnerSession(personId)  (magiclink+verifyOtp 주경로)
PROVIDER ON/OFF= auth_providers.enabled 를 start·callback·exchange 서버가 강제
LINK           = 로그인된 본인 + 새 provider 자격 재검증 + 대상 계정 바인딩 토큰
UNLINK         = 재인증 + identity row 삭제 + profiles_fallback 비활성 (최소 1개 identity 유지)
NEVER          = 기존 owner 의 auth email/password 를 다른 provider 로그인이 덮어씀 · auth user hard delete
```

### 5.2 회원가입 완료 SSOT (기존 유지 + 입력 보강)

- 완료 = **약관·개인정보 동의 (CMS 필수 버전)** 1조건 (변경 없음).
- 모든 로그인 경로(OAuth·native·**password**)가 같은 `consentComplete` 를 Destination 에 전달한다.
- 로그인 상태 + 미동의면 public 경로에서도 DibaySignupGate 를 적용한다. 클라이언트는 `signup_incomplete` 403 을 consent 화면으로 보낸다.
- 동의 기록 쓰기는 `PATCH /api/me/legal-consent` 1곳뿐이다 (DB 가드로 강제).
- 전화 인증 = 기능 게이트. **동의 이후에만** OTP 를 시작할 수 있다. 인증은 전화 필드만 바꾸고 생애주기 상태는 바꾸지 않는다.
- DB 직접 쓰기 = API 경유 테이블은 회원 DML 권한 없음 → 중앙 게이트를 우회할 수 없다.

### 5.3 세션 · 계정 전환 SSOT

- 로그아웃 = 서버 세션 무효 + **기기 내 계정별 상태 전부 분리**. 서버 데이터는 보존한다. 로컬 초안·캐시는 삭제를 허용한다 (`dibay-session-policy.md` §D 유지).
- 다른 탭 = 명시적 logout broadcast 를 받으면 같은 wipe + 하드 리로드.
- 계정별 클라이언트 캐시 = viewer id 를 키에 포함하고, peek 할 때 불일치면 버린다.
- 사용자 변경 감지(A→B) 시 admin `/me` 스냅샷·admin fetch 캐시를 초기화한다.
- logout-all = registry 를 JWT `session_id` 에 바인딩한다. 모르는 쿠키 UUID 로 자동 재등록하지 않는다.

### 5.4 관리자 권한 SSOT (기존 HARD LOCK 유지)

- 권한 = `admin_memberships`(active) + `admin_staff_permissions` 이다. 앱·SQL·RLS·알림 수신자 **전부 동일 함수(`is_platform_admin`)** 를 쓰고, `profiles.role` 판정 잔존 0 이 목표다.
- 권한키 = 페이지 렌더(SSR)와 API 양쪽에서 서버가 강제한다. 클라이언트 게이트는 표시용이다.
- 대상 보호 확인은 DB 오류 시 fail-closed(503).
- 정지 운영자 정책 = Owner 결정 1회 → 모든 admin 가드에 동일 적용.

### 5.5 로그인 UI/UX/CTA SSOT

- 단일 트리:
  - `AuthLoginSurface({surface:"page"|"overlay"})`
  - → `useAuthLoginBootstrap`: 공급자·설정 fetch 1곳 + 플랫폼 필터(iOS Apple 보장, `native_blocked` 숨김)
  - → `LoginProviderButtons`
  - → `AuthNotice(info|error)`
  - → 내부 로그인 폼
- 사용처: `/login`·AuthModal·충돌 다이얼로그·launch 페이지 모두 `useOAuthLogin` 사용.
- 라벨: `"{Provider}로 계속하기 / Continue with {Provider}"`. Kakao 만 공식 "카카오 로그인". 타이틀 "dibaY 시작하기" + "처음이면 자동으로 가입됩니다".
- 브랜드 토큰 파일 1곳(`OAuthLoginProviderVisuals.tsx`). 반경은 surface 로 결정 (page 4px / overlay `--overlay-radius-md`).
- 상태: idle → pending(누른 버튼만 spinner) → awaiting_return → cancelled(무음) → error(재시도). 모든 종료 상태에서 버튼을 재활성화한다.

### 5.6 인증 오류 처리 SSOT

- 서버는 `code` 만 반환하고, 클라이언트는 `code → i18n 키` 매핑 1곳에서 처리한다 (미지 코드 = `auth_err_generic_retry`).
- `{code}`·`{detail}`·원시 Supabase/DB 메시지·개발자 문구는 화면에 표시하지 않고 로그로만 남긴다.
- 상태 화면: 정지(사유·고객센터) / 차단 / 탈퇴 / 계정 충돌(기존 방법 안내) / 앱 업데이트 필요(native_blocked).

### 5.7 기존 정상 기능 보호 · 회귀 검증

- §2 N1~N22 는 수정하지 않는다.
- Auth HARD LOCK §4 reopen 대상: P0-1, P1-5, P1-6, P1-7, P1-9 (Completion/Session/Identity 의미 접촉). 나머지는 reopen 불필요.
- 회귀 게이트:
  - 기존 `verify:auth-*` 7종
  - `vitest lib/auth lib/admin* app/api/admin lib/profile` (현재 2119 PASS 기준)
  - 신규 단위 테스트(결함별)
  - Playwright `auth-session-isolation.spec.ts` 에 2탭 케이스 추가

---

## 6. 구현 범위와 위험 (H. 구현 계획 · 적용 순서)

한 번의 통합 수정 계획으로 한다. 단 **DB 마이그레이션은 Owner 의 운영 DB 적용 승인이 별도로 필요**하다.

| 순서 | 묶음 | 결함 | 수정 파일(주요) | DB | 구분 |
|---|---|---|---|---|---|
| 1 | 계정 혼합 차단 | P0-1, P1-2, P1-3, P1-4, P1-7, P1-8, P2-14 | `app/api/auth/naver/*`, `lib/auth/naver-oauth.ts`, `lib/auth/native/kakao-token-verify.server.ts`, `*-native-session.server.ts`, `reconcile-google-native-orphan.server.ts`, `app/api/auth/provider/conflict-check`, `lib/auth/provider-identity/link-token.server.ts`, `app/api/me/auth-providers/link/complete`, `lib/auth/safe-next-path.ts`, OAuth 공통 provider-enabled 가드 | 없음 | 웹 |
| 2 | 제재·게이트 우회 차단 | P1-1, P1-9, P1-11, P2-4 | `lib/auth/phone-otp-service.ts`, `finish-client-auth-login.client.ts`/password 로그인 호출부, 관리자 SSR 페이지 5개, `enforce-api-member-mutation-policy.ts` | 없음 | 웹 |
| 3 | DB 권한 정합 | P1-10, P1-12, P1-13, P2-8, P2-17 | 신규 마이그레이션 1개 (REVOKE · guard 컬럼 추가 · role→membership) + `lib/chat/markRoomAsRead.ts` API 이전 | **필요 (Owner 승인 후 적용)** | DB+웹 |
| 4 | 계정 전환 격리 | P0-2, P2-9, P2-10, AD-08 | `SupabaseAuthSync.tsx`, `client-session-wipe.ts`, `dibay-session-manager.ts`, messenger bootstrap-cache, trade 초안 session draft, admin-me-context | 없음 | 웹 |
| 5 | 교차 플랫폼 로그인 | P1-5, P1-6 | `web-oauth-owner-rebind.server.ts`, `web-oauth-policy.server.ts` | 없음 | 웹 (Auth §4 reopen 승인) |
| 6 | 로그인 UI/CTA SSOT | P1-14, P1-15, P1-16, P2-1, P2-2, P2-15 | `components/auth/*`, `app/login/*`, `lib/auth/login-error-i18n.ts`, `lib/i18n/catalog/auth-ui.ts`, consent 화면 | 없음 | 웹 |
| 7 | 문서 정정 | P2-13 드리프트 | `docs/auth-provider-matrix.md`, rebind 계약, linking 정책(Naver 예외 삭제) | 없음 | 문서 |

- **웹/네이티브 구분:** 전 묶음 **웹** (main 반영 후 앱 재시작). 네이티브 파일(`android/**`·`ios/**`·capacitor) 변경 **없음** → 앱 재빌드 불필요. 통화·네이티브 플러그인 미접촉.
- **주요 위험:**
  - 묶음 4: CUT-A 부팅 루프. broadcast 출처 한정으로 완화한다.
  - 묶음 3: 숨은 클라이언트 직접 쓰기. 적용 전 grep + 적용 후 ACL 재조회로 확인한다.
  - 묶음 5: Auth HARD LOCK reopen.
- **검증 기준:**
  - 묶음별 단위 테스트 + 최종 HEAD 에서 `typecheck:build` + 관련 vitest + eslint 1회.
  - 실기기 확인(Owner 수행, `public.user_devices.app_version` 기준): Android Kakao 가입 → iOS Kakao 로그인 · iOS Apple 버튼 · 정지 회원 OTP · 아이디 미동의 로그인.

---

## 7. Owner 결정이 필요한 사항

1. **Naver**: (a) identity 기반으로 고쳐 유지 / (b) 라우트 비활성(410). LIVE 회원 0명. 감사 권고는 (b), 재도입 시 (a).
2. **Supabase 대시보드 확인/변경 승인**: 이메일 자동 identity 연결 · 공개 이메일 가입/auto-confirm · JWT 서명 방식 · Realtime public channel 비활성 · Production `NAVER_OAUTH_CLIENT_ID`/`KAKAO_APP_ID` env. 작업 환경은 접근 불가이므로 Owner 확인이 필요하다.
3. **운영 DB 마이그레이션 적용 승인**: 묶음 3 (REVOKE · profiles 가드 컬럼 · role→membership SQL).
4. **Auth HARD LOCK §4 reopen 승인**: 묶음 1(Naver·native 갱신)·2(P1-9)·5(교차 플랫폼). 근거 = Reopen trigger 3 (Code First Break) · 4 (보안).
5. **아이디(password) 로그인 고객 노출**: LIVE `auth_login_settings.password=ON` 이다. 계약 §5 는 "고객 가입 경로 아님". 고객 화면에서 숨김(`/login?internal=1` 전용)으로 할지 결정이 필요하다.
6. **정지(suspended) 운영자 권한**: 전 관리자 API 차단 / 현행(일부 도메인만 차단).
7. **Apple Services ID ↔ bundle 그룹 설정** 확인 (sub 동일성 = Apple 중복 계정 여부).
8. **계정 연결 해제(unlink) 정책**: 재인증 필수 + 마지막 1개 identity 해제 금지 — 승인 시 묶음 1 에 포함.
9. **`auth_providers.client_secret` 평문 보관** 이전(Vault/env) 여부 — 우선순위 P2.
