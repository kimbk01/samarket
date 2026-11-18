# Supabase 요청 급증 (11-18) — 근본 원인 분해·설계안

- Owner 지시: 「정확히 분석해서 설계안을 보고」 (2026-11-18)
- 상태: **분석·설계만. 코드·DB 변경 0건.** (별건: S-1 PR #464 — 수신 통화 조회 중복 2건, Owner 승인 2026-11-18)
- 시간: PHT. 원자료 시각은 UTC 병기.

## 0. 작업자 잘못 (먼저 보고)

1. 1차 보고에서 「주원인 = 시험 기기」라고 썼지만 **분해 근거 없이 쓴 판정**이었다(당시 직접 증거는 새벽 구간 40,262건뿐).
2. 원인을 다 나누기 전에 S-1(효과 전체의 약 4%)부터 계획·구현했다. S-1 은 실제 결함이지만 **이번 증가의 원인은 아니다.**
3. 2차 조회에서 Vercel 일 단위 합계(전날 370,820)를 그대로 비교에 썼다가 틀린 값임을 확인했다(날짜 경계로 이중 합산). 이 문서는 **시간 단위로 받아 직접 합산한 값만** 쓴다.

## 1. 측정 방법·조건

| 자료 | 내용 |
|---|---|
| Vercel `vercel.external_api_request.count` | Vercel 서버가 Supabase(`ckdosyydvgzqwpbwuhon.supabase.co`)를 부른 횟수. **`origin_route`(부른 라우트)·`request_path`(Supabase 경로)** 로 묶음. 1시간 단위로 받아 합산 |
| Vercel `vercel.request.count` | 라우트별·**`client_user_agent`·`client_ip`(보낸 기기)**별 요청 수, `is_prefetch_request` |
| Supabase edge 로그 | 쿼리 문자열(select·uid) 확인용 |
| 운영 DB (읽기 전용) | `user_devices`·`cm_monitoring_rollup_hourly` |

- 비교 구간: 전날 = 11-16 12:00 ~ 11-17 12:00 PHT, 이번 = 11-17 12:00 ~ 11-18 12:00 PHT (UTC 04:00 기준).
- 대조: Vercel 시간별 Supabase 호출 수는 Supabase 로그 시간별 수와 일치했다(예: 11-17 04Z 15,345 vs 16,113, 13Z 3,192 vs 3,199). Supabase 대시보드 합계 = Vercel 경유(약 25만) + 앱 직접 호출(약 1.4만) + 기타.

## 2. 결론 — 증가분 분해

Vercel 경유 Supabase 호출: **128,942 → 249,500 (+120,558)**. 라우트별 「요청 1회당 Supabase 호출 수」는 이틀 동안 거의 같다(예: incoming 5.4→5.4, room bootstrap 3.7→4.0, home-feed 15.3→16.6). **같은 코드를 더 많이 불렀다** — 새로 생긴 누수는 없다.

| 원인 | 증가분 | 비율 | 판정 근거 |
|---|---|---|---|
| **A. 사무실 Android 시험 기기 2대의 반복 실행** | **+107,572** | **89%** | 아래 §3 |
| B. 그 밖 | +12,986 | 11% | 항목별로 나누지 않음 — **NOT_PROVEN**. 후보: 맥 iOS 앱 수신 통화 조회가 전날에는 하루의 일부만, 이번에는 하루 대부분 돌았다(§4-4) |

A 의 계산: 두 기기의 라우트별 요청 수 × 그 라우트의 「요청 1회당 Supabase 수」 + 미들웨어 호출을 요청 비율로 나눈 값. 기기 단위 Supabase 호출을 직접 세는 지표는 없어서 **추정값**이다(라우트 평균 배수 적용).

## 3. 원인 A — 시험 기기 반복 실행 (증거)

### 3-1. 보낸 기기
Vercel `/api/*` 요청을 기기(UA)·IP 로 묶은 결과 (전날 → 이번):

| 기기 (UA) | IP | 전날 | 이번 | 증가 |
|---|---|---|---|---|
| Android 16 **Samsung SM-M156S** (WebView) | 27.49.10.28 (사무실) | 3,002 | 16,682 | **+13,680** |
| Android 16 **Xiaomi 24076RP19G** (WebView) | 27.49.10.28 | 6,354 | 19,769 | **+13,415** |
| iPhone (iOS 18.7) | 27.49.10.28 | 8,880 | 8,926 | +46 |
| 맥 WKWebView (Macintosh) | 27.49.10.28 | 7,513 | 7,557 | +44 |
| API 전체 | | 32,429 | 61,553 | +29,124 |

→ API 요청 증가분의 **93%(+27,095)가 두 기기**. 계정은 zxzx11(`0c4b0a80…`)·q테스트1(`9259ab7d…`). 그 기간 두 기기에 1.2.7 (70)→(76)→(79) 빌드가 차례로 설치됨(`user_devices`).

### 3-2. 무엇을 했나
두 기기 요청 71,121건(정적 파일 포함, 이번 구간):
- 앱 실행 때 한 번씩 나가는 API: `devices/register` **677** · `telemetry/entry` 694 · `startup-config` 698 · `/` 685. 전날은 `devices/register` **51**.
  → **앱 처음 실행(콜드 스타트) 51회 → 677회 (13배).**
- 시간 분포: 11-17 17:00~19:00 PHT, 11-17 23:00 ~ 11-18 12:00 PHT 에 몰림. 한 시간에 최대 97회 실행.
- 같은 시간대에 이 기기로 `adb shell am force-stop com.dibay.app` → `monkey -p com.dibay.app … LAUNCHER 1` 을 반복한 작업 세션이 2개 확인됨: 「배민 인트로/팝업 플로우 감사」(force-stop → 실행 → 12초 대기 반복), 「Android 하단 네비게이션 기능 검증」. 세션별 몫은 **NOT_PROVEN**.

### 3-3. 앱 실행 1회의 비용
| 항목 | 값 |
|---|---|
| 실행 1회당 API 요청 | 시간대별 33 ~ 143건 (시험 화면 이동 포함; 가장 적은 시간대 33건) |
| 실행 1회당 화면 데이터(RSC) 요청 | 10 ~ 61건 (가장 적은 시간대 10건) |
| 실행 1회당 Supabase 호출 | 평균 약 **195건** (추정, §2 방법) |
| 실행 1회당 `/favicon.ico` | **17.4건** (Supabase 무관, Vercel 요청) |

→ 시험이 운영 Supabase 를 쓰는 한(테스트 DB 사용 금지 규정), 자동 반복 실행 1회는 운영 요청 약 195건이다. **677회 = 약 13만 건.**

## 4. 구조 결함 — 사용량이 Supabase 로 크게 증폭되는 곳 (모든 사용자 공통)

### 4-1. 라우트별 증폭 (이번 구간, 요청 1회당 Supabase)

| 라우트 | 요청 | Supabase | 1회당 | 주요 호출 (1회당) |
|---|---|---|---|---|
| `calls/sessions/incoming` | 4,412 | 23,758 | 5.4 | call_sessions 5 (중복 2 → **S-1 PR #464**) |
| `rooms/[roomId]/messages` | 1,549 | 16,345 | 10.6 | profiles 1.02 · room_access 0.98 · message_user_hides 0.94 · participants 0.72 · rooms 0.66 · messages_after 0.63 · user_sessions 0.53 · notification_events 0.49 |
| `rooms/[roomId]/bootstrap` | 3,327 | 13,231 | 4.0 | room_access 1.0 · participants 0.89 · bootstrap_snapshot 0.82 · direct_pair_facts 0.54 |
| `me/notifications/badge-count` | 1,642 | 12,495 | 7.6 | notification_events 1.86 · stores 1.66 · participants 0.93 · count_badge 0.93 · rooms 0.78 · store_orders 0.73 · owner_hub_attention 0.73 |
| `philife/neighborhood-feed` | 1,660 | 11,991 | 7.2 | community_posts 1.99 · locations 1.0 · profiles 1.0 · post_hides 0.87 · viewer_states 0.87 · social_relations 0.72 |
| `stores/home-feed` | 692 | 11,457 | **16.6** | **shadow_wave RPC 4.37** · **admin_settings 2.68** · stores 1.81 · 정책·쿠폰·캠페인·주소 각 1.0 |
| `calls/sessions/[sessionId]` | 1,836 | 8,478 | 4.6 | call_sessions 1.78 · call_session_participants 1.08 |
| `community-messenger/bootstrap` | 610 | 7,204 | 11.8 | **bootstrap_snapshots 3.55** · user_relationships 1.07 · social_relations 1.0 |
| `me/notifications/room-read` | 352 | 6,678 | **19.0** | notification_events 3.0 · rooms 2.71 · clear_notification_target 2.0 · store_orders 1.69 · stores 1.69 · owner_hub_badge 1.25 |
| `rooms/[roomId]` | 357 | 5,499 | 15.4 | rooms 2.93 · owner_hub_badge 1.11 · hub_badge_counters 1.05 · clear_target 1.0 · store_orders 1.0 |
| `trade-chat-list-meta` | 230 | 3,428 | 14.9 | social_relations 3.0 · 그 밖 7개 표 각 1.0 |

### 4-2. 미들웨어(`proxy.ts`) — 모든 화면 이동·API 요청마다
- Supabase **22,213건/일**: profiles 15,304 · `member_write_gate_snapshot` 4,372 · jwks 1,287 · `required_consent_versions` 1,243.
- API GET: `enforceApiMemberReadPolicy` → 회원 상태 조회. 캐시 수명 **5초**(`MEMBER_LIFECYCLE_AUTHORITY_CACHE_TTL_MS`), 서버 인스턴스마다 따로라서 5초보다 간격이 긴 호출은 매번 DB 를 읽는다(10초 간격 조회에서 매번 조회 실측). `status,deleted_at` 조회 하루 11,693건 이상.
- 화면(문서·RSC): 로그인 사용자는 `resolveProxySignupGateRedirect` 가 **가입 완료 회원에게도 매번** profiles 를 읽고(`id,dibay_id,…` 하루 3,624건) 동의 버전을 확인한다.
- **미리 받기(prefetch) RSC 요청 13,311건/일**도 이 경로를 그대로 탄다.

### 4-3. 상시 주기 호출 (앱을 켜 두기만 해도)
| 호출 | 주기 | 기기 1대·1시간 | 하루 합계 |
|---|---|---|---|
| `community-messenger/presence` (접속 상태) | 12초 (`HEARTBEAT_MS`) | 약 300회 → Supabase 약 280 | 요청 14,088 · Supabase 13,068 |
| V4 수신 통화 조회 (맥 iOS 앱) | 10초 (S4 승인) | 360회 → Supabase 약 1,950 (S-1 후 약 1,440) | Supabase 23,758 |

### 4-4. 정적 파일
- `/favicon.ico`·`/images/brand/dibay-app-icon.png` 응답이 `cache-control: public, max-age=0, must-revalidate` (운영 실측). WebView 가 화면 이동마다 다시 확인 → 하루 favicon 13,773 · 앱 아이콘 5,712 요청. Supabase 무관, Vercel 요청 수만 늘린다.

## 5. 설계안 (줄어드는 양 순)

각 항목은 **도메인별 단독 PR**, 해당 도메인 규정(통화·메신저 hard-lock·Auth HARD LOCK·거래 불변조건)을 따른다. 「예상」은 이번 구간 측정값으로 한 계산 — 운영 측정 전 NOT_PROVEN.

### D-0. 운영 반복 실행 시험의 사용량 관리 (원인 A · 증가분의 89%)
- 바꾸는 것: 코드 아님. 작업 규정·시험 스크립트.
- 내용
  1. 기기 자동 시험 스크립트는 실행(콜드 스타트) 횟수를 세어 보고서에 「실행 N회 · 운영 Supabase 약 N×195건」으로 적는다.
  2. 같은 측정 묶음의 반복 실행은 **10회 이하**로 하고, 더 필요하면 Owner 에게 먼저 알린다.
  3. 시험 시작·종료 시각(PHT)을 보고서에 적어 운영 지표와 대조할 수 있게 한다.
- 예상: 이번 같은 날 기준 하루 약 10만 건 감소.
- **Owner 결정 필요**: 반복 상한(10회)과 이 규정을 AGENTS.md 에 넣을지. 테스트 DB 사용 금지 규정과 맞물리는 운영 정책이라 작업자가 정하지 않는다.

### D-1. S-1 수신 통화 조회 중복 제거 — **진행 중 (PR #464)**
- 6 → 4건. 예상 하루 약 1.2만 건 감소(맥 앱을 켜 둔 시간에 비례).

### D-2. 미들웨어 화면 경로의 가입 확인 조회 생략 (Auth HARD LOCK)
- 파일: `proxy.ts` `maybeRedirectIncompleteSignup`, `lib/auth/proxy-signup-gate.ts`, 프록시 신원 캐시(`peekProxyAuthSessionCache`).
- 변경: 「가입 완료」 판정을 신원 캐시와 같은 수명으로 함께 기억한다(완료 판정만 기억, 미완료는 매번 확인). 미리 받기(prefetch) RSC 에서는 가입 확인을 하지 않는다(실제 이동 때 확인).
- 영향 화면: 로그인 사용자의 모든 화면 이동. 가입 미완료 회원의 온보딩 이동(그대로 매번 확인).
- 깨질 수 있는 것: 가입을 막 마친 직후 첫 이동 — 완료만 기억하므로 해당 없음. 관리자 권한 판정 경로(P2-3) 유지.
- 예상: profiles 약 3,600 + 동의 버전 확인 약 1,200 / 일.

### D-3. API 읽기 회원 상태 확인을 서버 인스턴스 밖에서 공유 (Auth HARD LOCK · 보안 P2-6)
- 현재: 인스턴스 메모리 캐시 5초 → 대부분 놓침.
- 변경 안: 차단·탈퇴 판정을 「모더레이션 때 올리는 세대 번호(epoch)」로 확인하는 구조. 회원 상태가 바뀔 때만 DB 를 다시 읽는다. 현재 캐시에 `epoch` 필드가 이미 있으므로(`member-lifecycle-authority-cache.ts`) 그 세대를 인스턴스 간에 공유하는 방법을 설계한다.
- 캐시 수명만 늘리는 방식은 하지 않는다(차단 반영이 늦어짐 — 보안 계약 위반, 근본 수정 규정).
- 예상: 회원 상태 조회 하루 1.1만 건 이상 중 대부분. **세부 설계는 Auth HARD LOCK 문서 검토 후 별도 문서** — 이 문서에서는 범위만 고정.

### D-4. 홈 매장 피드 `stores/home-feed` (요청 1회당 16.6)
- 파일: `lib/stores/discovery/load-store-discovery-ranked-live.ts`·`store-discovery-shadow-adapter.ts`(순위 계산 wave RPC 를 1회당 평균 4.37번), 같은 요청 안에서 `admin_settings` 2.68번.
- 변경: ① 같은 요청 안의 설정 읽기를 요청 단위 1회로 합친다. ② wave 를 필요한 장 수만큼 한 번에 받는 RPC(또는 첫 wave 크기 조정)로 4.37 → 1~2.
- 지켜야 할 것: `docs/trade-lightweight-design.md` 가 아닌 매장 디스커버리 계약 — 순위 결과가 바뀌면 안 된다(현행과 결과 대조 테스트).
- 예상: 하루 약 5,000~6,000건.

### D-5. 알림 읽음 처리 `room-read`(19.0) · 방 열기 `rooms/[roomId]`(15.4) · 배지 `badge-count`(7.6) (메신저·알림 hard-lock)
- 세 라우트가 같은 표(notification_events·rooms·store_orders·stores·owner_hub_badge·hub_badge_counters)를 각자 여러 번 읽는다. room-read 는 notification_events 3번·rooms 2.71번·clear_target 2번.
- 변경: 방 1개 읽음 처리를 RPC 1회(읽음 + 알림 정리 + 배지 결과 반환)로 합치고, 방 열기에서 이미 한 읽음 처리를 room-read 가 다시 하지 않게 한다.
- 영향 화면: 메신저 방 열기·뒤로가기·배지 숫자(하단 탭·앱 아이콘). Realtime bump 계약(`docs/messenger-realtime-policy.md`) 유지.
- 예상: 하루 약 1.2만 건.

### D-6. 메신저 방 메시지 `rooms/[roomId]/messages` (10.6) · 메신저 첫 화면 `bootstrap`(11.8)
- messages: 같은 요청에서 room_access·participants·rooms·user_sessions 를 따로 읽는다 → 방 접근 확인 RPC 결과를 재사용.
- bootstrap: `community_messenger_bootstrap_snapshots` 를 1회당 3.55번 읽는다 → 1회로.
- 메신저 방 계약(`docs/community-messenger-mobile-room-viewport.md`·방 메시지 기본 계약) 유지 확인 필요.
- 예상: 하루 약 1만 건.

### D-7. 정적 아이콘 캐시 (Supabase 무관 · Vercel 요청)
- `next.config` headers 로 `/favicon.ico`·`/images/brand/*` 에 `max-age=86400` 이상.
- 예상: Vercel 요청 하루 약 1.9만 건 감소.

### D-8. 접속 상태 12초 주기 (통화 변경 규정 대상)
- presence 는 통화 presence lease 와 묶여 있어 **통화 변경 규정**(영향 분석·실기 행렬) 대상. 이번 문서에서는 측정값만 기록하고 설계하지 않는다.

## 6. 우선순위·순서
1. D-0 (Owner 결정) — 증가분의 89%.
2. D-1 진행 중(PR #464) → 실기 행렬.
3. D-4 · D-5 · D-6 · D-2 · D-7 — 서로 다른 도메인이라 각각 단독 PR. 각 PR 전 라우트별 「요청 1회당 Supabase」를 같은 방법(§1)으로 측정해 전후 비교.
4. D-3 · D-8 — 별도 설계 문서(Auth HARD LOCK·통화 규정) 먼저.

## 7. NOT_PROVEN·한계
- 원인 B(+12,986)의 항목별 분해.
- 두 작업 세션 각각의 실행 횟수.
- 「실행 1회당 195건」은 시험 화면 이동을 포함한 평균. 화면 이동 없는 순수 콜드 스타트 비용은 따로 측정하지 않았다(가장 적은 시간대: API 33건·RSC 10건).
- 기기 단위 Supabase 수는 라우트 평균 배수로 낸 추정이다.
