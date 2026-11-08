# 실시간 연결 끊김 이유 진단 설계 (D2) — 2026-11-09

> 상태: **설계만** · 구현·배포 전 Owner 승인 필요 (Owner 「D2 설계 작성」 2026-11-09)
> 앞 단계: `docs/audit/realtime-subscription-diagnostics-rollup-design-2026-11-08.md` (D1, 운영 반영 `16b3f03fa`·`a194fd670`·`749f26a6f`)

## 0. 확인된 사실 (증거)

| # | 사실 | 증거 |
|---|---|---|
| F1 | E2 실패는 채널 하나가 아니라 **거의 모든 채널이 동시에 `channel_error` → 재시도 성공** 모양이다 | D1 집계 00:26 PHT (웹·Android) |
| F2 | 실패 때 거절 이유는 비어 있고(reason=null) **토큰은 있었다**(hasRealtimeToken=true) | 내장 브라우저 00:36:38 PHT `[cm-rt-private-broadcast]` 경고 2건 |
| F3 | 2.4초 뒤 같은 기기에서 **웹소켓을 새로 열었다** | Supabase edge 로그 00:36:40.988 `realtime/v1/websocket` 101 |
| F4 | 라이브러리는 웹소켓이 닫히거나 오류가 나면 **모든 채널에 `CHANNEL_ERROR` 를 한꺼번에** 보낸다 | `@supabase/realtime-js` 2.99.2 `_onConnClose`·`_onConnError` → `_triggerChanError()` |
| F5 | 라이브러리는 25초마다 심장박동을 보내고, 다음 차례까지 응답이 없으면 **스스로 웹소켓을 닫고 다시 연결**한다 | 같은 파일 `sendHeartbeat` — `heartbeat timeout` |
| F6 | 화면이 보이는 탭은 토큰 만료 90초 전에 갱신해 만료 때 오류 0건 | 01:25:49 갱신 / 01:27:18 만료 관찰 |
| F7 | 인증 라이브러리는 화면이 숨겨지면 토큰 자동 갱신을 멈춘다(실시간 연결은 유지) | `@supabase/auth-js` 2.99.2 `_onVisibilityChanged` |

**모르는 것(NOT_PROVEN):** 웹소켓이 왜 닫히는가 — ① 심장박동 시간 초과(앱이 바쁘거나 숨김 상태라 타이머가 늦음) ② 네트워크·서버 종료 ③ 숨김 중 토큰 만료. 지금은 어디에도 기록되지 않는다.

## 1. 변경 내용 — 끊긴 이유를 「종류별 건수」로만 기록

새 이벤트 종류 `realtime.connection` 을 U1 집계에 추가한다. **정상 상태(심장박동 성공)는 기록하지 않는다** — 이상만 기록해 5분 64개 상한을 차지하지 않는다.

| metric 형식 | 언제 | 값(value) |
|---|---|---|
| `heartbeat_timeout.<화면>.<토큰>` | 심장박동 응답이 다음 차례까지 안 옴(라이브러리가 곧 연결을 닫음) | — |
| `heartbeat_slow.<화면>` | 심장박동 응답이 5초 이상 걸림 | 걸린 ms |
| `socket_error.<화면>.<토큰>` | 웹소켓 오류 | — |
| `socket_close.<코드>.<화면>.<토큰>` | 웹소켓 닫힘 | — |
| `socket_reopen.<화면>` | 닫힌 뒤 다시 열림 | 끊겨 있던 ms |

- `<화면>`: `visible` / `hidden` (document.visibilityState)
- `<토큰>`: `token_ok` / `token_expired` / `no_token` — 실시간 연결에 붙은 JWT 의 만료 시각(exp)만 현재 시각과 비교한다. 토큰 값·사용자 정보는 저장하지 않는다.
- `<코드>`: `c1000`(정상 종료 — 심장박동 시간 초과로 라이브러리가 닫을 때 포함) / `c1001` / `c1006`(비정상 끊김) / `c4xxx` / `other`
- 최대 종류 수: 제한된 고정 조합 약 60종. 서버가 허용 표로 재검증해 임의 문자열은 버린다(D1 과 같은 방식).

**이 기록으로 판정할 수 있는 것**
- `heartbeat_timeout.hidden.*` 가 많음 → 숨김 상태 타이머 지연 → 원인 ①
- `socket_close.c1006.visible.token_ok` → 네트워크·서버 끊김 → 원인 ②
- `socket_close.*.hidden.token_expired` → 숨김 중 토큰 만료 → 원인 ③
- 아이폰 폭주가 다시 나면 `socket_close`·`socket_reopen` 이 짧은 간격으로 몰리는지로 「연결 반복」 여부를 확인

## 2. 연결 방식 — 인증 잠금 파일은 건드리지 않는다

- `lib/supabase/client.ts`(Auth HARD LOCK 영역)는 **수정하지 않는다.**
- 라이브러리 공개 함수 `sb.realtime.onHeartbeat(cb)` 와 연결 상태 알림 목록(`sb.realtime.stateChangeCallbacks.close/error/open`)에 **기록 함수만 추가**한다.
  - `onHeartbeat` 는 콜백 1개만 받는 함수다. 저장소 전체에서 지금 쓰는 곳 0곳(확인함) → 새 모듈이 유일한 사용처. 다른 곳에서 덮어쓰면 실패하는 테스트를 함께 둔다.
  - `stateChangeCallbacks` 는 라이브러리 내부 목록이다. 배열이 아니면(라이브러리 변경) 아무것도 하지 않는다.
  - 라이브러리가 두 콜백 모두 `try/catch` 로 감싸 실행한다(같은 파일 확인) → 기록 함수의 예외가 연결·재연결에 번지지 않는다. 기록 함수 자체도 `try/catch`.
- 설치 시점: 모니터링 클라이언트가 **처음 실시간 구독 결과를 기록할 때 1회** (`messengerMonitorRealtimeSubscriptionOutcome`). 실시간을 쓰지 않는 화면에서는 설치되지 않는다.

## 3. 바뀌는 파일 · 바뀌지 않는 파일

| 구분 | 파일 | 내용 |
|---|---|---|
| 새 파일 | `lib/community-messenger/monitoring/realtime-connection-monitor.ts` | 1회 설치, 이상 이벤트만 기록, 화면·토큰·코드 분류(순수 함수 분리) |
| 새 파일 | `lib/community-messenger/monitoring/realtime-connection-rollup-key.ts` | metric 조합·허용 표·검증(클라이언트·서버 공용) |
| 수정 | `lib/community-messenger/monitoring/client.ts` | `messengerMonitorRealtimeSubscriptionOutcome` 에서 설치 함수 1회 호출 |
| 수정 | `lib/community-messenger/monitoring/monitoring-rollup.ts` | `realtime.connection` metric 허용 표 재검증 |
| 테스트 | 분류 함수·허용 표·1회 설치·예외 격리·`onHeartbeat` 단일 사용처 검사 | |
| **무변경** | `lib/supabase/client.ts`(Auth HARD LOCK)·`subscribe-with-retry.ts`·모든 채널·통화 코드·DB·API 라우트·관리자 화면 코드 | 연결·재시도·심장박동 주기·통화 흐름 그대로 |

DB 변경 없음(표의 metric 검사 `^[a-z0-9_.:-]{1,96}$` 통과, 최장 `socket_close.other.visible.token_expired` = 40자).

## 4. 영향 · 위험

| 영향받는 곳 | 바뀌는 점 | 깨질 수 있는 것 | 처리 |
|---|---|---|---|
| 모든 실시간 연결(메신저·통화 수신·알림) | 심장박동·닫힘 때 기록 함수가 추가로 불림 | 기록 함수 예외 → 연결 처리 중단 | 라이브러리 `try/catch` + 기록 함수 `try/catch`. 연결 동작 코드 무변경 |
| 모니터링 전송량 | 이상 이벤트만 추가 | 끊김이 폭주하면 이벤트가 늘어남 | U1 상한(5분 1회·64개) 그대로 → 서버 요청은 늘지 않음. 넘친 것은 버린 수로 같은 키에 집계 |
| 관리자 「DB 집계」 카드 | 행 종류 증가 | 표가 길어짐 | 카드 코드 무변경. 구현 후 화면 확인 |
| 성능 | 심장박동 1회당 문자열 분류 1번(이상일 때만 기록) | 없음 수준 | 정상 심장박동은 비교 1번 후 종료 |

**통화 규정 적용 판단:** 통화 동작(발신·수신·푸시·CallKit·종료)은 바꾸지 않는다. 다만 통화 수신 채널도 같은 실시간 연결을 쓰므로 D1 과 같이 **단독 커밋·단독 반영**하고, 실기기 확인은 V5 최소 확인(Android 발신 → 웹 수신 벨 → 벨 중 취소)으로 한다.

**Auth HARD LOCK 판단:** 인증 파일·세션 처리·토큰 갱신 코드는 바꾸지 않는다. 토큰은 **읽기만**(만료 시각 비교) 한다. 재개(reopen) 대상 아님.

## 5. 롤백

커밋 1개 되돌리기(웹만). DB·네이티브 무변경. 쌓인 행은 14일 뒤 자동 삭제.

## 6. 검증 계획

| # | 항목 | 방법 | 판정 |
|---|---|---|---|
| V1 | 코드 | `typecheck:build`·`typecheck:test`·관련 vitest·eslint | PASS (= 코드 PASS) |
| V2 | 분류 정확성 | 단위 테스트: 화면·토큰(만료 전/후/없음)·닫힘 코드 → metric | 전수 |
| V3 | 격리 | 단위 테스트: 기록 함수가 예외를 던져도 콜백이 정상 반환, 1회만 설치 | 통과 |
| V4 | 운영 기록 | 배포 후 웹 탭에서 네트워크를 잠시 끊었다 연결(브라우저 오프라인) → 5분 뒤 `socket_close.*`·`socket_reopen.*` 행 | 행 확인(Production SHA·시각) |
| V5 | 통화 최소 확인 | Android 발신 → 웹 수신 벨 → 벨 중 취소 (시각 기록) | 기존과 같음 |
| V6 | 원인 판정 | 다음 정기 조회에서 Android·iOS 의 `realtime.connection` 행으로 ①②③ 판정 | 발생 전까지 NOT_PROVEN — 반복 확인하지 않음 |

## 7. 이 설계가 하지 않는 것

- 끊김을 **고치지 않는다.** 원인이 확정되면 원인별 설계(예: 숨김 탭 연결 정책, 토큰 갱신 시점, 심장박동 방식)를 따로 올린다.
- 오류 메시지 본문·IP·사용자 정보는 저장하지 않는다.
