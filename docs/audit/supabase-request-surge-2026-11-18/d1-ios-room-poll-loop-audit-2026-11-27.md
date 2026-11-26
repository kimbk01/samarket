# D1 감사 — iPhone 1대 방 메시지 반복 조회 (2026-11-27 01:35 PHT)

지시: Owner 「D1 감사 진행」. 대상 = `rise-2026-11-26-exact.md` §3-1.
근거: Vercel 요청 전수(분 단위)·Vercel 실행 로그·Supabase `realtime_logs`·운영 DB(읽기 전용)·당시 운영 SHA 코드. 코드·운영 변경 없음.

## 0. 내 잘못 먼저

- 직전 보고에서 D1 원인 코드를 「NOT_PROVEN」이라고 썼다. 그러나 **같은 건을 내가 11-26 13:30 에 이미 감사했고**(`realtime-ios-retry-loop-2026-11-26.md`), 그 감사를 근거로 #604·#629 를 설계·반영했다. 기존 감사와 연결하지 않고 보고했다 → 아래로 정정한다.

## 1. 결론

| 항목 | 판정 | 증거 |
|---|---|---|
| 무엇 | **FAIL(결함)** — iPhone 앱 1대의 실시간 채널이 가입을 거절당하는 동안, 실패할 때마다 열린 방이 HTTP 로 메시지·방 정보를 다시 받음 | §2·§3 |
| 언제 | 11-26 **09:45~10:32**, **11:10~13:47** PHT. 5분마다 26~32회(약 11초마다 1회)로 일정 | Vercel 5분 단위 |
| 누구 | BK(631a4438) iPhone, 기기 `7ce3219f`, 앱 **1.2.7 (62)**, 방 `0bbd2940`(1:1) 외 `e6807e2f` | 운영 DB·Vercel IP·경로 |
| 비용 | 메시지 GET 1,132회 + 방 열기 GET 약 740회(이 방) → Supabase ≈ 6,400(경로 평균 배분) | Vercel |
| 왜 끝났나 | 13:46~13:48 에 그 기기의 62 기록이 꺼지고 **1.2.8 (64)** 로 바뀜 → 13:47 에 반복 멈춤 | `user_devices.updated_at` |
| 원인 코드 | **확인** — 당시 운영 `4933b872` 의 방 묶음 채널 `onAfterSubscribeFailure`(2번째 실패부터 실패할 때마다 열린 방 전부 `onRefresh`) → `catchUpNewerMessages`(메시지 `after=` GET) + 새 메시지 없으면 `refresh(true)`(방 열기 silent) | §3 |
| 시작 계기 | **NOT_PROVEN** — 09:39:02 에 운영 배포(`4933b872`)가 연결됐고 가입 거절이 09:38~09:40 에 시작됐다. 시각은 겹치지만 배포가 원인이라는 증거는 없다(기기 로그 없음) | §2 |
| 지금 코드에서 | **코드 PASS** — 운영 `ab27bca` 에 #604(가입 재시도 감독·차단기)·#629(실패마다 폴백 삭제, 15초 지속 시 묶음당 60초에 1회만) 포함 | §4 |
| 재발 여부 | 14:00 PHT 이후 지금(01:30 PHT)까지 가입 거절 **0건**, iPhone 방 메시지 반복 없음 | `realtime_logs`·Vercel |
| iPhone 실기 | **NOT_PROVEN** — 고친 코드로 iPhone 에서 같은 상황(가입 거절)을 재현·측정하지 않았다 | — |

## 2. 시간 증거

- Supabase `realtime_logs` `SocketJoinRateLimitReached`(PHT 시간별): 09시 36 · **10시 220** · 11시 8 · 12시 30 · 13시 8 · 14시 이후 **0**.
- 방 `0bbd2940` 메시지 GET(5분): 09:45 부터 20→27~30 · 10:30 17 · 10:35~11:05 0 · 11:10~13:40 26~32 · 13:45 12 · 13:50 이후 0.
- Vercel 실행 로그(03:10~03:12 UTC) 방 열기 7건 = 모두 `snapshotTier: silent_delta`, `cmReqSrc: room_silent`, 간격 11~13초 — 사람이 방을 연 것(`room_client_block`)이 아니라 **자동 silent 재조회**.
- 같은 시간 그 IP 의 방 화면 이동(`rooms/[roomId].rsc`)은 100회로, 방 열기 920회의 1/9 → 화면 이동이 아니다.
- 배포: `dpl_2AYo5tTt…` = `4933b872`(#602), 빌드 09:36:32, 연결 09:39:02 PHT.

## 3. 코드 경로 (당시 운영 `4933b872`)

1. `lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts` `onAfterSubscribeFailure`: `attempt >= 2` 면 열린 방마다 `messageFallback.schedule()`. 재가입에 성공하면 `firstSubscribeResync.schedule()` 로 또 모든 방을 다시 받는다.
2. `lib/community-messenger/realtime/subscribe-with-retry.ts`: 채널마다 끝없이 재시도한다. 서버의 가입 거절(`SocketJoinRateLimitReached`)을 알아보는 처리가 없다.
3. `lib/community-messenger/room/use-messenger-room-client-phase1.ts` `onRefresh`: `catchUpNewerMessages()`(메시지 GET) → 새 메시지가 없으면 `refresh(true, { triggerReason: "realtime_on_refresh" })` → 방 열기 `?snapshotTier=silent_delta&cmReqSrc=room_silent`.
→ 실시간 실패가 끝나지 않으면 HTTP 재조회도 끝나지 않는 구조. 메시지:방 열기 ≈ 1.5:1 이 실측(1,361:920)과 맞는다.

## 4. 지금 운영(`ab27bca`, 01:32 PHT 확인)에서 달라진 점

- #604 `messenger-realtime-supervisor.ts`: 가입 실패·끊김이 60초에 6번 또는 5분에 20번이면 차단기가 열린다. 30→60→120→300초 쉬고 시험 가입 1번. 6번 연속이면 멈춤.
- #629 `global-messenger-room-bundle-channel.ts`: `onAfterSubscribeFailure` 폴백을 지웠다. 연결이 15초 넘게 끊겼을 때만 묶음당 **60초에 1번** `after=` 로 따라잡는다(`MESSENGER_ROOM_BUNDLE_FALLBACK_AFTER_MS` 15,000 · `_INTERVAL_MS` 60,000). 재연결 때 다시 읽기는 묶음 1번(조용 1초·최대 5초).
- #633·#636: 폴백 때 방 열기(silent)는 내가 보낸 글이 읽음을 기다릴 때만, 끊김 1번에 1번.
- 같은 상황의 상한(계산): 메시지 GET 약 11초에 1번 → **60초에 1번 이하**. 방 열기는 실패마다 → **끊김당 최대 1번**. iPhone 앱은 웹을 운영 주소에서 받으므로 앱 재시작 뒤 적용된다(네이티브 재빌드 불필요).

## 5. 남은 것

- iPhone 실기: 가입 거절 상황에서 반복이 60초 1회 이하로 묶이는지 — **NOT_PROVEN**(iPhone 확인 항목 남음).
- 09:38 에 가입 거절이 시작된 계기(배포·네트워크·백그라운드 전환) — **NOT_PROVEN**.
- 10:35~11:05 에 반복이 멈췄다가 다시 시작한 이유 — **NOT_PROVEN**(앱 백그라운드로 추정되지만 증거 없음).
