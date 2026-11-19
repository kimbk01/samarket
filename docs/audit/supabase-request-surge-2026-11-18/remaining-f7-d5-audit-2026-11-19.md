# 남은 큰 항목 감사 — 수신통화 폴링(F7)·미들웨어 회원 확인(D5) + 레거시 앱 비교 (2026-11-19 PHT)

- 근거: 코드 추적(파일:줄), Vercel 관측(서버→Supabase `external_api_request`, 들어온 요청 `request`, PHT 날짜), 공식 문서(Telegram API·Supabase·Next.js). 운영 DB 변경 없음 · 코드 변경 없음(보고만).
- 두 항목 모두 규정상 승인 대상: F7 = **통화 변경 규정**(분석·승인·통화 단독 PR·실기 행렬), D5 = **Auth HARD LOCK 재개봉**.

## 1. 실측

### 1-1. 수신통화 폴링 `/api/community-messenger/calls/sessions/incoming`

| PHT 날짜 | 요청 수 | 비고 |
|---|---|---|
| 11-12·11-13 | 0 | |
| 11-14 | 457 | |
| 11-15 | 3,331 | |
| 11-16 | 1,687 | |
| 11-17 | **6,462** | 서버→Supabase 31,152 → **폴링 1회 ≈ 4.8** (A1 전) |
| 11-18 | 275 | 맥 앱 종료(11-17 17~18 UTC) — 조치 효과 아님 |

- 폴링하는 기기 = **맥(아이폰 앱을 맥에서 실행)** 과 웹. 맥은 PushKit 이 오지 않아 폴링으로만 찾는다(`ios/App/App/Call/DibayCallPlatformCapability.swift:12,24,27`). 아이폰·안드로이드는 폴링 없음(PushKit·FCM).
- 맥 측정(11-18 문서 `incoming-call-poll-fanout-plan-2026-11-18.md` §1.3): 폴링의 **98.6% 가 Realtime 정상 상태**, **약 30% 가 창이 숨겨진 상태**.
- A1(11-18 15:17) 뒤 코드상 1회 ≈ 2.3~4 (목록 1 + 정리 30초 1회분 + 미들웨어 profiles 1 + 정책 0~0.3). **A1 뒤 운영 단가는 NOT_PROVEN**(그 뒤 맥 사용 없음).

### 1-2. 미들웨어(`proxy.ts`) — PHT 11-18 (가장 최근 꽉 찬 하루)

| 호출 | 건수/일 | 언제 |
|---|---|---|
| `profiles` | **10,229** | ① 로그인 회원 `/api` GET 마다 회원 상태(`status, deleted_at`) — 인스턴스별 5초 캐시라 거의 매번 조회 ② 비공개 페이지마다 가입 완료 확인(12열) — 캐시 없음 |
| `member_write_gate_snapshot` | 3,800 | 회원 쓰기(POST·PATCH·DELETE) 마다 — 캐시 없음(보안 P0-R3, 의도) |
| JWKS(서명 키) | 1,156 | 인스턴스 시작·10분마다 |
| `required_consent_versions` | 1,124 | 비공개 페이지·쓰기 — 인스턴스별 30초 캐시 |
| 토큰 갱신 | 14 | |
| **합계** | **16,323** | 7일 내내 하루 0.9~1.8만(11-14 8,931 ~ 11-16 17,718) — 사용량 따라 움직임 |

- 미들웨어는 회원 수 × 화면 이동·API 수에 **그대로 비례**한다. 1만 명이면 같은 사용 패턴에서 이 비용이 회원 수 배로 는다.

## 2. 레거시 앱은 어떻게 하나

| 축 | Telegram(공식 API 문서) | DIBAY 지금 |
|---|---|---|
| 수신통화 전달 | 서버가 받는 사람의 **모든 활성 기기에 `updatePhoneCall` 을 밀어 보냄**(push). 클라이언트가 묻지 않는다 | Realtime 신호가 와도 **10초마다 HTTP 로 다시 묻는다**(정상·숨김 상관없이) |
| 끊겼다 다시 붙을 때 | 시작·재연결·갭 발견·**15분 이상 업데이트 없음** 때만 `getDifference` 로 따라잡기 | 상태 변화·보임·온라인 때 즉시 따라잡기는 **이미 있음** + 10초 상시 폴링 |
| 계정 차단·로그아웃 | 세션을 서버에서 끊는다(요청마다 계정 상태를 DB 에서 다시 읽지 않음) | **요청마다** `profiles` 를 읽어 상태 확인 |
| 권한·상태 정보 | 세션(인증 키)에 묶여 있음 | Supabase 권장: 상태·역할을 **토큰 발급 때 1번** 클레임으로 넣는다(Custom Access Token Hook) |

- DIBAY 의 이전 수신통화(V3 `GlobalCommunityMessengerIncomingCall`)는 **Realtime 정상이거나 창이 숨겨지면 HTTP 0** 이었다(`lib/community-messenger/incoming-call-ui-policy.ts`). V4 가 이 조건을 잃었다.

## 3. 결함 판정

| # | 결함 | 증거 | 판정 |
|---|---|---|---|
| F7-1 | 창이 숨겨져도 10초 폴링 | `call-v4-incoming-discovery.ts:515-521`(숨김 검사 없음) · 맥 30% | **결함** — 레거시·V3 모두 0 |
| F7-2 | Realtime 정상인데 10초 폴링 | `:148` · 맥 98.6% | **Owner 결정과 충돌** — 11-08 S4 「SUBSCRIBED 만으로 폴링 0 불승인」(이유: Realtime 이 조용히 죽으면 30초 벨 안에 못 찾음) |
| F7-3 | 목록 SELECT 가 정리보다 먼저 → 만료된 울림이 1회 실릴 수 있음(유령 벨) | `full-audit` 이전 감사 · 30초 안 정리 생략 구간 | **결함(통화 정확성)** — 실기 NOT_PROVEN |
| D5-1 | `/api` GET 마다 회원 상태 DB 조회(5초 캐시는 인스턴스별이라 거의 무효) | `enforce-api-member-read-policy.ts:60-101` · `member-lifecycle-authority-cache.ts:13` | **결함(규모 비례)** |
| D5-2 | 비공개 페이지마다 가입 완료 확인 `profiles` 12열, 캐시 없음 | `proxy-signup-gate.ts:13-36` | **결함(규모 비례)** — 가입 완료 회원은 값이 거의 안 바뀜 |
| — | 쓰기 게이트 DB 1회 | `enforce-api-member-mutation-policy.ts:168-171` | **결함 아님** — 차단 즉시 반영 보안 요구(P0-R3). 유지 |
| — | JWKS·동의 버전 | 인스턴스별 캐시 | 작음 — 유지 |

## 4. 권장안

### F7 (통화 규정 — 통화 단독 PR · 실기 행렬)
1. **F7-1 숨김 창 = 정기 HTTP 0.** 숨겨진 동안 벨은 Realtime 신호 → 즉시 1회 조회(이미 있음, `:526-537`)로 받는다. 다시 보이면 즉시 따라잡기(이미 있음). V3·Telegram 과 같다.
2. **F7-2 Realtime 정상 간격 10초 → 25초.** 근거: Supabase Realtime 은 25초마다 심장박동(heartbeat)을 보내 연결이 죽으면 상태가 바뀌고 → 기존 코드가 즉시 따라잡기 + 2초 폴링으로 돌아간다(`realtime-js` `HEARTBEAT_INTERVAL: 25000`). 즉 「조용히 죽음」을 잡는 시간이 이미 25초라 10초 폴링이 더 빨리 잡지 못하는 구간은 작다. **S4(폴링 0 금지)는 지킨다**(0 이 아니라 25초).
3. **F7-3 정리 → 목록 순서 고정**(유령 벨 제거).
- 효과(열어 둔 맥/웹 1대, 하루 종일 기준): 10초·숨김 포함 8,640회 → 약 2,400회 (−72%). 1회 단가 ~3 → **하루 약 2.6만 → 약 0.7만**.
- 위험: 숨김 창에서 Realtime 이 죽고 신호도 못 받으면 다시 보일 때까지 벨을 못 받는다(맥은 PushKit 없음). V3 와 같은 수준. 실기 행렬(맥 숨김 수신·Realtime 끊김 수신·취소 후 재울림 없음·무응답 타임아웃)로 확인.

### D5 (Auth HARD LOCK 재개봉 — Reopen trigger 4)
1. **D5-1 회원 상태를 토큰 클레임으로.** Supabase Custom Access Token Hook 이 토큰 발급·갱신 때 `member_status`(active·suspended·blocked·withdrawn)를 넣고, 미들웨어 읽기 게이트는 이미 검증한 클레임(`getClaims`)만 본다 → `/api` GET 의 `profiles` 0.
   - 차단·탈퇴 때: 지금처럼 Auth ban + **세션 강제 종료(갱신 토큰 무효화)** 를 추가해 새 토큰이 나오지 않게 한다.
   - **의미 변화(Owner 결정 필요)**: 이미 받은 토큰이 끝날 때까지(프로젝트 JWT 만료 설정 — 확인 못 함, Supabase 기본 1시간) 차단 회원이 **읽기**는 할 수 있다. 쓰기는 지금처럼 즉시 막힌다(쓰기 게이트 DB 유지). 지금 읽기 게이트도 5초 + 인스턴스별 지연을 허용하고 있다.
2. **D5-2 가입 완료 여부도 클레임으로.** 가입·동의 완료 회원은 비공개 페이지에서 `profiles` 0. 미완료·동의 버전 변경 때만 DB.
3. 쓰기 게이트·JWKS·동의 버전은 그대로.
- 효과: 미들웨어 `profiles` 하루 약 1만 → 토큰 발급 때만(활성 회원 1명당 약 1시간에 1회). 회원 수가 늘어도 화면 이동 수에 비례하지 않는다.
- 검토 후 버린 방법: 미들웨어 안 공유 캐시 — Next.js 16 문서가 proxy 의 캐시·공유 전역에 기대지 말라고 명시. 5초 캐시 늘리기 — 인스턴스별이라 효과 작고 차단 반영만 늦어짐(임시 조치).

### 순서
1. **D5 먼저** — 매일 1~1.8만, 모든 회원·모든 화면에 비례(상시 비용).
2. **F7 다음** — 웹/맥을 열어 둔 사람 수 × 시간에 비례(최근 하루 3.1만이었지만 지금은 0). 통화 단독 PR·실기 행렬이 필요해 D5 와 섞지 않는다.

## 5. NOT_PROVEN · 확인 못 함
- A1 뒤 수신통화 1회 단가(운영 표본 없음).
- 운영 JWT 만료 설정 값 · 서명 방식(JWKS 호출로 비대칭으로 추정).
- `profiles` 1만 건 중 ①(`/api` GET)·②(비공개 페이지) 비율 — 관측에서 분리 안 됨(이전 문서는 ①이 대부분).
- 운영 V4 수신 플래그 값(문서·실측 경로로 추정).

## 출처
- Telegram Phone calls: https://core.telegram.org/api/calls · Updates: https://core.telegram.org/api/updates
- Supabase Custom Access Token Hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook · getClaims: https://supabase.com/docs/reference/javascript/auth-getclaims
- Next.js proxy: https://nextjs.org/docs/app/api-reference/file-conventions/proxy

## 6. D5 구현 기록 (Owner 「D5 승인」 2026-11-19)
- HARD LOCK: `docs/auth-hard-lock.md` Amendment 2026-11-19 (2) 를 코드 변경 전에 기록.
- DB: `supabase/migrations/20271119210000_custom_access_token_hook_member_claims.sql` — 운영 begin…rollback 시험: 실제 회원 → `dibay_m` 들어감 · 없는 회원·잘못된 id → 토큰 그대로.
- 코드: `lib/auth/member-token-claims.ts`(검증 클레임 읽기) · 읽기 게이트 · 가입 게이트 · `proxy.ts`.
- 안전 순서: 코드는 클레임이 없으면 이전과 똑같이 DB 를 읽는다 → ① 코드 병합 ② 함수 운영 적용(훅 꺼진 상태 = 영향 0) ③ 대시보드에서 훅 켜기 순서로 어느 단계에서 멈춰도 기능 변화 없음.
- 남은 Owner 승인: 운영 DB 함수 적용 · Supabase 대시보드 Auth Hooks 활성화(설정 변경) · JWT 만료 설정 값 확인.
