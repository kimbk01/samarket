# 수신 통화 조회(`/incoming`) Supabase 증폭 — 영향 분석·수정 계획 (2026-11-18)

- Owner 지시: 「계획서 작성」 (2026-11-18, 요청 급증 원인 보고 FAIL 1 에 대해)
- 상태: **계획만. 코드·DB 변경 0건.** 통화 변경 규정 3번 — Owner 승인 후 구현, 통화 단독 커밋·단독 main 반영, 실기기 행렬 PASS 전 다음 단계 금지.
- 시간 표기: PHT(UTC+8). 로그 시각은 UTC 원문을 괄호로 병기.

## 0. Owner 지시와의 충돌 (먼저 보고)

| 항목 | 기존 승인 설계 | 이번 측정 | 처리 |
|---|---|---|---|
| 실시간 정상(SUBSCRIBED 5초+)일 때 정기 조회 10초 | S4 (`supabase-request-surge-s4-poll-reduction-design-2026-11-08.md` §3) — 「SUBSCRIBED 만으로 폴링 0 불승인」, 10초 = 무음 사망 시 30초 울림 안 발견 상한, **보임·숨김 같음** | 맥 iOS 앱 1대가 22시간 내내 10초마다 조회. 정기 조회의 약 30%가 창이 가려진(hidden) 상태 | **이 계획은 클라이언트 간격을 바꾸지 않는다.** 숨김 상태 간격 변경은 S4 결정과 충돌하므로 §7 「Owner 결정 필요」로만 남긴다 |

## 1. 확인된 결함 (증거)

조건: 운영 Supabase `ckdosyydvgzqwpbwuhon` edge 로그·`cm_monitoring_rollup_hourly`, 읽기 전용. 기간 11-17 11:50 ~ 11-18 11:50 PHT.

1. **조회 1회 = Supabase 6건.** 계정 `5f875d4b…` 의 11-17 21:00:04 PHT(13:00:04Z) 묶음:
   - `profiles?select=status,deleted_at` (인증 가드 회원 상태)
   - `call_sessions` direct·ringing·initiator/recipient `limit=20` ← ①
   - `call_sessions` direct·ringing|active `limit=20` (heartbeat·lease 열 포함) ← ②
   - `call_sessions` direct·ringing|active `limit=1` ← ③
   - `call_sessions` direct·ringing·initiator/recipient `limit=20` ← ④ (**①과 같은 쿼리**)
   - `call_sessions` recipient=본인·ringing `limit=10` ← ⑤ (실제 응답 목록)
   - 다음 묶음 21:00:14 → :25 → :36 → :46 (간격 10.6초)
2. **지속 시간·규모**: 11-17 03:08 PHT ~ 11-18 약 01:00 PHT(≈22시간) 연속. 24시간 동안 이 계정 통화 세션 조회 22,271건 + 회원 상태 조회 4,482건(전체 272,678건의 약 10%).
3. **발생 경로 = V4 수신 탐색 맥 iOS 앱 묶음**(`CallV4MacIncomingHost` → `startCallV4IncomingDiscovery(userId, { macIosApp: true })`).
   근거: 같은 기간(11-17 03:00 ~ 11-18 02:00 PHT) `call.incoming_discovery:poll_tick_*` 집계가 **platform=ios 에서만** 나왔다. iOS 네이티브에서 이 집계를 내는 경로는 `macIosApp` 뿐이다(`realtimeFeedActive = !isCapacitorNativePlatform() || macIosApp`). 요청 UA 도 `Macintosh … AppleWebKit`(Safari 표기 없음 = 앱 내 WKWebView).

   | 집계 (기록+버린 수) | 회 |
   |---|---|
   | subscribed · visible | 4,542 |
   | subscribed · hidden | 1,948 |
   | unsubscribed · visible/hidden | 95 |

   → 정기 조회의 **98.6%가 실시간 연결 정상 상태**에서 나갔다(S4 설계대로 10초). 기기 소유자·실제 화면 상태는 **NOT_PROVEN**.
4. 조회 1회 6건 × 10초 = 기기 1대당 시간 2,160건, 하루 약 5.2만 건. 메신저 화면을 켠 맥이 늘면 대수만큼 늘어난다.

## 2. 원인 (코드)

`app/api/community-messenger/calls/sessions/incoming/route.ts` → `listIncomingCommunityMessengerCallSessionsResult(userId, { directOnly: true })` (`lib/community-messenger/service.ts`)

| 순서 | 호출 | 쿼리 | 응답에 쓰이나 |
|---|---|---|---|
| 0 | `requireAuthenticatedUserId` → 인증 가드(`lib/auth/server-guards.ts:181` `resolveMemberLifecycleAuthority` — 호출 연결은 코드 추적 미완, NOT_PROVEN) | profiles 회원 상태 | 인증 (통화 밖 — 이번 범위 아님) |
| 1 | `reconcileUserLiveCallSessions` → `terminalStaleRingingDirectSessionsForUser` | ① | 만료 울림 → 부재중 처리 (부수 효과) |
| 2 | `reconcileUserLiveCallSessions` 본문 | ② | 만료 울림·끊긴 통화 정리 (부수 효과) |
| 3 | `reconcileUserLiveCallSessions` → `getUserLiveDirectCallSessionId(sb, uid, "live")` | ③ | **아니오** — 수신 함수는 `liveSessionId` 를 버린다 |
| 4 | `listIncoming…` 안의 `terminalStaleRingingDirectSessionsForUser` 재호출 | ④ = ① | **아니오** — 1~2ms 전 ①이 같은 일을 했다 |
| 5 | `listIncoming…` directOnly 조회 | ⑤ | 예 (응답) |

- ③·④는 수신 목록 응답에 영향이 없는 중복이다. ③ 안의 만료 울림 정리 분기도 ①이 이미 처리한 뒤라 사실상 다시 일어나지 않는다(③은 ① 직후 같은 사용자 행을 다시 본다).
- 전역 만료 울림 정리는 별도로 매분 예약 작업(`cleanupExpiredRingingCommunityMessengerCallSessions`, 24시간 718회)이 하고 있다.

## 3. 수정 계획 (서버만 · 클라이언트·네이티브 무변경)

**단계 S-1 (이번 승인 대상)** — 수신 조회 경로에서 중복 2건 제거, 6 → 4건.

| 파일·함수 | 변경 |
|---|---|
| `lib/community-messenger/service.ts` `reconcileUserLiveCallSessions(userId, reason, options?)` | 선택 인자 `{ skipLiveLookup?: boolean }` 추가. true 면 ③(`getUserLiveDirectCallSessionId`)을 건너뛰고 `liveSessionId: null` 반환. **기본값 false — 다른 호출처 8곳(세션 GET·active·방 발신·create_guard·peer_create_guard·accept_other_active_guard·incoming_policy·active_api) 동작 그대로.** |
| 같은 파일 `listIncomingCommunityMessengerCallSessionsResult` | `reconcileUserLiveCallSessions(userId, "incoming_api", { skipLiveLookup: true })` 로 호출하고, 바로 뒤의 `terminalStaleRingingDirectSessionsForUser` 재호출(④)을 제거한다. |

바뀌는 동작: `/incoming` 응답 내용·상태 코드·오류 계약(D1 503) **변화 없음**. Supabase 조회 수만 줄어든다. 만료 울림 → 부재중 처리는 ①·② 에서 그대로 일어난다.

**단계 S-2 (S-1 실기 PASS 뒤 별도 승인)** — ②의 select 에 ⑤의 열을 더해 ⑤를 ②의 결과(정리 대상 제외)에서 메모리로 뽑기, 4 → 3건. ②는 정리 전 스냅샷이라 「방금 부재중 처리된 행」을 빼는 로직이 필요해 회귀 위험이 S-1 보다 크다. 이번 승인 범위에 넣지 않는다.

**범위 밖 (보고만)**: 인증 가드 회원 상태 조회(①번 위 0번)의 서버 메모리 캐시가 서버리스 인스턴스 간에 안 맞아 매 조회 DB 를 다시 읽는다(하루 11,693건). 통화가 아닌 인증 도메인 — 별도 작업.

## 4. 영향받는 경로

| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성 (`create_guard`·`peer_create_guard`) | 없음 — `reconcile` 기본 동작 유지 |
| VoIP/FCM 발송 (`lib/push/**`) | 없음 — 미변경 |
| iOS CallKit / Android 수신 화면 | 없음 — 네이티브 미변경, 수신 시작은 푸시 경로 |
| 웹·맥 수신 시트 (V4 탐색·레거시 `GlobalCommunityMessengerIncomingCall`) | 같은 응답을 받음 — 표시·간격 변화 없음 |
| 취소·거절·종료·부재중 | 만료 울림 부재중 처리(①·②) 유지. ④ 제거로 「직전 1~2ms 사이 새로 만료된 울림」이 이번 조회에서 한 번 덜 정리될 수 있으나, ⑤는 ringing 만 고르고 다음 조회(10초)·매분 예약 작업이 정리한다 → 수신 시트에 만료 울림이 뜨는지 실기로 확인(§6 V-5) |
| 상태 폴링·CallKit 종료 신호 | 없음 — 세션 GET·active 경로 미변경 |
| 통화 기록·팝업 | 없음 — 종료 사유 문자열(`stale_ringing_expired`·`reconcile_stale_ringing`) 동일 |

## 5. 설치된 구 바이너리 호환

운영 `user_devices` (is_active, 최근 14일, 11-18 12:00 PHT 조회):

| 플랫폼 | 버전(빌드) | 기기 |
|---|---|---|
| Android | 1.2.7 (79) · (54) · 1.2.6 (39) | 2 · 14 · 1 |
| iOS | 1.2.4 (55) · (53) · 1.2.3 (49) · 1.2.2 (35)(34) · 1.2.1 (31) · 1.2 (27)(22) | 2 · 10 · 2 · 8·3 · 1 · 1·6 |

모든 바이너리가 같은 `/incoming?directOnly=1` 를 부르고 응답 형식이 바뀌지 않으므로 **재빌드 없이 호환**. 배포 구분 = 웹(서버)만.

## 6. 검증

**코드**: `call-session-get-route`·`incoming-route-d1-503`·`incoming-call-sessions-d1-error-contract`·`room-call-*`·`call-active-presence`·`call-waiting-capability` 테스트 + 신규 단위 테스트(수신 경로 call_sessions 조회 4→… 횟수, 기본 호출 시 ③ 유지) · `typecheck:build` · `typecheck:test` · 변경 파일 eslint.

**운영 계측(배포 후)**: 같은 맥 계정의 10초 묶음이 6건 → 4건인지 edge 로그로 확인(Production SHA 기록).

**실기기 행렬** (통화 변경 규정 5번 최소 행렬 — 매 테스트 Production SHA·발신·세션 생성·VoIP/FCM 발송·수신 화면·연결·종료 시각 기록, 서버 시각은 운영 DB 대조):

| # | 시나리오 |
|---|---|
| V-1 | Android↔iPhone 음성 발신·수신 (양방향) |
| V-2 | Android↔iPhone 영상 발신·수신 (양방향) |
| V-3 | 거절 |
| V-4 | 벨 중 취소 → 지연 푸시 재울림 없음 |
| V-5 | 무응답 타임아웃 → 부재중 1건, 수신 시트 잔존 없음 |
| V-6 | 통화 중(busy) |
| V-7 | 정상 종료 후 즉시 재발신 |
| V-8 | 맥 iOS 앱 수신 시트 표시·수락 이관 (이번 변경이 가장 직접 닿는 경로) |

## 7. 회귀 위험·롤백

- 위험: 낮음 — 응답 생성 쿼리(⑤)와 정리 쿼리(①·②) 유지, 기본 인자 호환. 가장 큰 위험은 §4 의 만료 울림 1회 지연(V-5 로 확인).
- 롤백: Vercel Instant Rollback(재빌드 없음) → 원복 PR. DB·네이티브 변경 없음.

## 8. Owner 결정 필요

1. **S-1 구현 승인** (서버 2곳, 통화 단독 PR, 실기 행렬 V-1~V-8).
2. (선택) **맥 iOS 앱이 가려진 동안의 정기 조회 간격** — 현재 S4 결정(보임·숨김 같게 10초)대로 둔다. 바꾸려면 S4 결정 변경이 필요하다. 맥은 PushKit·CallKit 수신이 없어 웹 조회가 유일한 수신 경로라는 점(D2-3)이 판단 근거다. 이 계획서는 값을 제안하지 않는다.

## 9. 예상 효과 (계산값 — 운영 측정 전 NOT_PROVEN)

- 조회 1회 6 → 4건(-33%). 지난 24시간 `/incoming` 5,784회 기준 하루 약 11,600건 감소(전체 27.2만의 약 4%). 켜 둔 맥 1대당 하루 약 5.2만 → 3.5만 건.
- 전체 증가(14.3만 → 27.2만)의 주원인인 시험 기기 트래픽·API 공통 가드 조회는 이 계획으로 줄지 않는다.

## 10. 정정 (2026-11-18 · 작업자 잘못)

- 이 계획서는 `docs/audit/supabase-request-surge-design-supplement-2026-11-08.md` §6 을 읽지 않고 썼다. §6 은 R3(`getUserLiveDirectCallSessionId`)·L1(재정리) 을 빼면 상황 4(첫 정리 실패 후 재시도)·5(두 정리 사이 만료)의 DB 상태·부작용이 달라진다고 판정했다(BLOCKED, 「동등하게 뺄 수 있는 쿼리는 현재 구조에 없다」).
- §4 의 「응답·동작 변화 없음」은 틀렸다. S-1(PR #464, 운영 반영 12:10 PHT)은 그 BLOCKED 판정과 충돌한다.
- 되돌리기 PR 을 만들고 병합 여부는 Owner 결정에 둔다(통화 변경 규정).
