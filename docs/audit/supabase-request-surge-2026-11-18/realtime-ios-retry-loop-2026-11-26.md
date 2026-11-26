# 24시간 63,006 · Realtime 오류 상승 — 감사 (2026-11-26 13:30 PHT)

- 지시: Owner 「리얼타임 부분이 상승하고 63,006 Total Requests 상승되는 근본 원인 … 하나하나 감사 후 보고」(대시보드 캡처: 최근 24시간, Realtime 683·오류 278, API Gateway 59,885)
- 근거: Supabase `edge_logs`·`realtime_logs`(24h) · Vercel 관측(라우트별·방별 요청, Supabase 호출) · 운영 DB 읽기 전용(`cm_monitoring_rollup_hourly`·방·참여자·`user_devices`). 운영 변경 없음. 코드 변경 없음.
- 창: 대시보드 「Last 24 hours」 = 11-25 13:00 ~ 11-26 13:00 PHT.

## 1. 결론
1. **Realtime 오류 278건은 거의 전부 `SocketJoinRateLimitReached: Too many joins on this socket`**(282건, 11-26 09:38~12:50 PHT, 3구간). Realtime 요청 수가 늘어난 것이 아니다(실시간 접속·서버 broadcast 는 하루 수백 건 그대로).
2. **같은 시간에 iPhone 1대(앱 1.2.7 (62))의 실시간 채널이 전부 가입 실패 → 재시도를 반복**했다. 앱 감시 집계(`realtime.subscription`) iOS: 11-26 가입 시간초과 재시도 **1,602** · 끊김 재시도 **881** · 성공 117 (11-25 iOS 는 0·0·349). 실패 채널 = 알림·안읽음 소리·방 묶음·친구요청·거래 노출 **5종 전부** → 채널 하나가 아니라 그 기기 연결(소켓) 단위 문제.
3. **실시간이 실패하면 열린 방이 HTTP 로 따라잡기를 반복**한다(코드 §4). 그 iPhone 이 들어가 있던 1:1 방 2개에서 오늘 메시지 GET **1,041** · 방 bootstrap GET **666** — 이 방들의 오늘 새 메시지는 각 1건(`call_stub`)뿐이다. 방 `0bbd2940…` 은 09:30~13:00 PHT 동안 30분마다 112~173회(약 11초마다 1번) 고르게 반복.
4. 그래서 **오늘 오전(11-26 09~13 PHT) 서버 호출 증가의 최대 단일 원인 = iPhone 1대의 실시간 재가입 폭주 → HTTP 폴백 반복**. 추정 Supabase 호출 ≈ 메시지 1,041×3.72 + bootstrap 666×2.85 ≈ **5,800**(1요청당 값은 같은 24h 라우트 평균 실측값 — 방별 Supabase 수는 측정 불가라 추정).
5. 24시간 63,006 의 나머지는 11-25 오후 사용(앞 보고 `rise-root-cause-2026-11-25.md` — 통화 상태 조회·통화 시작·방 열기·presence)과 고정 바닥(cron)이다.

## 2. 24시간 시간별 (edge_logs, PHT)
| 시간 | 합계 | 서버 | | 시간 | 합계 | 서버 |
|---|---|---|---|---|---|---|
| 11-25 13 | 5,439 | 5,171 | | 11-26 07 | 1,277 | 1,210 |
| 14 | 5,570 | 5,190 | | 08 | 2,707 | 2,561 |
| 15 | 5,629 | 5,414 | | **09** | **6,332** | 5,967 |
| 16 | 5,452 | 5,043 | | 10 | 3,515 | 3,401 |
| 17 | 4,454 | 3,793 | | **11** | **5,819** | 5,618 |
| 18~06 | 480~3,050 (밤 바닥 약 480/h) | | | 12 | 2,977 (부분) | 2,924 |
- 서버(Vercel) 몫 94~97% — Realtime 직접 요청(`/realtime/*`)은 시간당 0~221.

## 3. 라우트별 Supabase 호출 (Vercel, 24h 대 직전 24h)
| 경로 | 11-25 13~11-26 13 | 직전 24h | 차이 |
|---|---|---|---|
| 방 메시지 `rooms/[roomId]/messages` | 5,724 | 1,983 | **+3,741** |
| 방 bootstrap `rooms/[roomId]/bootstrap` | 3,832 | 948 | **+2,884** |
| 통화 상태 `calls/sessions/[sessionId]` | 4,728 | 2,517 | +2,211 (11-25 통화 사용 — 앞 보고) |
| 미들웨어 | 2,826 | 2,502 | +324 |
| 통화 정리 cron | 2,164 | 2,255 | 같음 |
- 메시지 라우트 요청은 **GET 이 거의 전부**(11-26 UTC GET 1,066 · POST 0). 보내기가 아니라 받아오기.
- 방별(11-26 UTC): `0bbd2940…` 메시지 833·bootstrap 540 / `e6807e2f…` 메시지 208·bootstrap 126 / 그 밖 방은 한 자리 수.

## 4. 구조 (코드 확인)
1. `lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts`
   - 가입 실패 2회째부터 `onAfterSubscribeFailure` → 열린 방마다 `messageFallback.schedule()` → `onRefresh`.
   - 재가입 성공(`SUBSCRIBED`)마다 `firstSubscribeResync.schedule()` → 모든 열린 방 `onRefresh`.
2. `lib/community-messenger/room/use-messenger-room-client-phase1.ts` 의 `onRefresh` = `catchUpNewerMessages()`(메시지 `after=` GET) → 새 메시지 없으면 `refresh(true)`(방 bootstrap GET).
3. `lib/community-messenger/realtime/subscribe-with-retry.ts` + `cm-rt-loop-guard.ts` — 채널마다 따로 재시도(350ms×2ⁿ, 최대 20s), 같은 채널 5번 연속 실패 시 10~30초 쉬고 **다시 끝없이** 재시도. 쉬는 조건은 오프라인·화면 숨김뿐. **소켓 단위로 「가입 거절(`SocketJoinRateLimitReached`)」을 알아보고 멈추는 장치가 없다**(코드 검색: 해당 오류 처리 0건) → 5개 채널이 같은 소켓에서 계속 재가입 → 서버가 소켓 가입을 막음 → 다시 시간초과 → 재시도… 스스로 유지되는 반복.
- 즉 **실시간 실패 = 방마다 HTTP 폴링으로 바뀌는 구조**이고, 실패가 끝나지 않으면 폴링도 끝나지 않는다. 데이터가 안 바뀌어도(새 메시지 0) 매번 GET 2개.

## 5. 확인한 사실 (증거)
- `realtime_logs` ERROR 282건 = `error_code: SocketJoinRateLimitReached`, 10분 단위: 09:30 4 · 09:40 15 · 09:50 17 · **10:00 220** · 11:50 8 · 12:00 11 · 12:40 5 · 12:50 3.
- 두 방 모두 1:1(`general_direct`), 참여자 2명, 공통 참여자 = iPhone 사용자(`631a4438…`, `user_devices` iOS `1.2.7 (62)`, 같은 device). 상대는 Android `1.2.7 (85)` 2명(방마다 다름).
- 참여자 `last_read_at` 은 09:45·09:49 이후 변화 없음 → 읽음 처리 주고받기(DB 쓰기) 반복이 아니다.
- iOS 실패는 11-23 에도 작게 있었다(시간초과 434·끊김 214) — 같은 구조가 처음이 아니다.

## 6. NOT_PROVEN
- iPhone 이 09:38 에 왜 가입 실패를 시작했는지(네트워크·백그라운드·앱 상태) — 기기 로그 없음. 기기 실측 안 함.
- 지금(13:30 PHT 이후)도 계속되는지 — 확인한 마지막 구간은 12:30~13:00 PHT(방 `0bbd2940…` 메시지 GET 121).
- 방별 Supabase 호출 수 — Vercel 은 방별 Supabase 수를 주지 않아 라우트 평균으로 추정.
- 대시보드 63,006 과 edge_logs 합(약 60.1k)의 차이 — 대시보드는 Auth·Storage·Realtime 등 다른 서비스 집계를 더한 값으로 보임(확인 못 함).

## 7. 줄이려면 (구현 아님 — 메신저 Realtime 설계·승인 필요)
| 순서 | 대상 | 방향 |
|---|---|---|
| 1 | 소켓 단위 가입 거절 감지 | `SocketJoinRateLimitReached`/연속 시간초과면 소켓 전체 재가입을 한 번에 멈추고(차단기) 길게 쉰 뒤 소켓을 새로 연결 |
| 2 | 실시간 실패 시 방 HTTP 폴백 | 실패 재시도마다가 아니라 상한(예: 방당 분당 1회)·화면 보일 때만 |
| 3 | 재가입 성공마다 모든 방 `onRefresh` | 끊긴 시간 동안 새 bump 가 있었을 때만 따라잡기 |
- 메신저 Realtime 계약(`docs/messenger-realtime-policy.md`)·근본 수정 규칙 대상. 통화 채널은 건드리지 않는다.
