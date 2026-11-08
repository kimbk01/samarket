# 웹 V4 수신 배너가 상대 종료 뒤에도 닫히지 않음 — 원인 확정 · 수정안 (구현 0건)

- 작성: 2026-11-08 PHT · 기준: `origin/main` (Production `2c613dc7a`)
- 상태: **설계만. 코드·DB·설정 변경 0건.** AGENTS.md 「통화 변경 규정」 3번 — Owner 승인 후 구현, 통화 단독 커밋.
- Owner 지시: 「수정안 작성」 · 「임시나 땜빵을 하지 마라 끝까지 원인을 확인 해야 하는 중요한사항 이다」

## 0. 정정 (작업자 잘못)

| # | 앞 문서·보고 | 사실 | 근거 |
|---|---|---|---|
| E8 | 설계 보완서 K4·실기 I1~I3: 「`CallV4WebEstablishmentHost` 는 iOS 앱에서도 마운트 → CallKit 과 웹 시트 순서 위험」 | iOS 앱 셸은 **sync-only** 다. 웹 수신 탐색·수신 시트가 마운트되지 않는다. U2 의 「앱 셸 제외」는 해가 없는 중복이고, K4 위험은 처음부터 없었다 | CODE `CallV4Provider.tsx` `syncOnly = isLegacyWebCallEstablishmentRemoved() \|\| (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios")` |

---

## 1. 현상 (실기 · 증거)

- 조건: Production `2c613dc7a`, 2026-11-08 20:42 PHT.
  - 수신: 앱 내장 브라우저(데스크톱), 관리자, `/community-messenger`, 탭 보임.
  - 발신: Samsung SM-M156S, q테스트1, 1.2.5 (38).
- 순서:
  1. 세션 `5414a107` 생성: 20:42:24.497
  2. 웹 수신 배너 표시. U2 Realtime 신호가 531ms 에 도착했고, 실시간이 먼저 발견했다(612ms).
  3. 30초 무응답 → 서버 `missed`: 20:42:54.966. 종료 broadcast 3건 발송(202): 20:42:55~56.
  4. 웹 콘솔: `[DIBAY_CALL_V4] remote_terminal_ignored {callId: 5414a107…, source: realtime, reason: not_current_connected_call}`
  5. 배너는 missed 뒤 **46초 이상 그대로 남았다**(20:43:41 확인). 새로고침해야 사라졌다.
- 판정: **FAIL.**

---

## 2. 원인 확정

### 2-1. 웹 V4 수신 배너가 닫히는 조건 (CODE)
- `CallV4IncomingSheet.tsx`: `phase === "incoming_ringing"` 이고 `identity.direction === "incoming"` 이면 표시한다.
- 닫히는 것은 store 의 phase 가 바뀔 때뿐이다:
  - 로컬 수락 → `callV4Accept`
  - 로컬 거절 → `callV4Reject`
  - 원격 종료 → `callV4HandleRemoteTerminal` → `finalizeCallV4Terminal`
- 배너 안의 「남은 N초」는 표시만 한다. 0초가 돼도 아무 처리를 하지 않는다(`IncomingCallBanner`).

### 2-2. `callV4HandleRemoteTerminal` 로 가는 경로 전수 (CODE) — 데스크톱 웹에서 동작하는 것이 없다

| 경로 | 위치 | 데스크톱 웹 V4 수신 중 동작 | 이유 |
|---|---|---|---|
| FCM 종료 브리지 | `CallV4Provider.tsx` `installDibayFcmCallBridge.onFcmTerminal` | 안 됨 | 네이티브 앱에서만 오는 이벤트 |
| 버스 `cm.call.session_terminal` | `CallV4Provider.tsx:421` | 안 됨 | **상대 종료를 받아서 이 이벤트를 보내는 곳은 Legacy `GlobalCommunityMessengerIncomingCall.tsx:826/2117`, Legacy `CommunityMessengerCallClient`, V3 뿐이고 셋 다 V4 경로에서 마운트되지 않는다.** V4 자신(`call-v4-actions.ts:418`)은 같은 브라우저에서 내가 끊었을 때 다른 탭에 알리는 용도로만 보낸다 |
| 버스 `cm.call.incoming_consumed` | `CallV4Provider.tsx:427` | 안 됨 | 보내는 곳이 Legacy 뿐이다 |
| surface owner `ios_callkit_end` | `CallV4Provider.tsx` `onSurfaceOwnerBridge` | 안 됨 | iOS 앱 전용 |
| 연결 통화 종료 감시(hangup broadcast) | `call-v4-connected-terminal-watch.ts` `startCallV4TerminalRealtimeWatch` | **신호는 도착하지만 무시한다** | `confirmRemoteTerminalStatus` 가 `WATCH_PHASES = {"joining","connected"}`(19행)일 때만 처리한다 → 이번 실기 로그가 이것이다 |

### 2-3. 서버 종료 broadcast 도 모든 경우를 덮지 못한다 (CODE)
- `service.ts:22175-22179`: 종료 신호는 **종료를 실행한 사람(actor)의 상대방에게만** 보낸다(`publishDirectTerminalHangupSignalBestEffort(peerUserId, …)`).
- 그래서 수신자가 actor 인 종료는 **수신자 자신의 다른 기기·탭에 전달되지 않는다.**

| 종료 상황 | 종료 실행자(actor) | 수신자 웹이 받는 신호 |
|---|---|---|
| 발신자가 벨 중 취소 | 발신자 | broadcast 받음 → 단계 조건으로 무시 |
| 발신자 기기의 30초 무응답 처리 (이번 실기) | 발신자 | broadcast 받음 → 무시 |
| 발신자 앱이 죽어 cron·조회가 missed 처리 | 수신자(`terminalOneExpiredRingingAsMissed` actor = recipient) | **신호 없음** |
| 수신자가 휴대폰에서 거절 | 수신자 | **신호 없음** |
| 수신자가 휴대폰에서 받음(다른 기기 수락) | 수신자 | 웹 푸시(`sendWebPushForCommunityMessengerCallAnsweredElsewhere`)만. V4 웹 수신 시트 처리 경로는 CODE 에서 찾지 못함(NOT_PROVEN) |

### 2-4. 이력 — 회귀가 아니라 처음부터 있던 설계 공백
| 시점 | 사실 | 근거 |
|---|---|---|
| 2026-06-24 02:18 PHT | V4 「MainActivity single WebView lane」 도입. 종료 처리를 FCM·버스 기준으로 설계 | `b3e73a628` |
| 2026-06-24 01:22 PHT | 운영 V4 스위치(`NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE`) 생성. 06-25 11:00 수정 | Vercel 환경변수 기록 |
| 2026-06-24 | 연결 통화 종료 감시를 `joining/connected` 만 대상으로 도입 | `e42dd9c02` → 재적용 `302b23560` |
| 2026-06-28 | Android 웹 수립 제거, 「Desktop Web establishment preserved — **Desktop Quarantine**(승인 없이 확장 금지)」 | `561a98e17` |

**결론:**
- 운영 데스크톱·PWA 웹 수신은 2026-06-24 부터 V4 경로다.
- V4 는 「울리는 중 상대 종료」를 네이티브(FCM)와 Legacy(버스)에 맡겼다. 그런데 데스크톱에는 두 경로가 모두 없다.
- 그 결과 약 4개월 반 동안 데스크톱 웹 수신 배너는 상대가 끊어도 닫히지 않았다.
- U2(`ed1441dae`)는 이 경로들을 바꾸지 않았다(변경 파일 6개에 해당 파일 없음).

---

## 3. 수정안 — 「서버 세션 상태」를 유일한 기준으로

땜빵으로 보는 안과 이유:
- 배너의 0초 카운트다운으로 닫기: 클라이언트 시계 기준이고, 취소·거절·다른 기기 수락을 못 덮는다.
- 단계 조건(`WATCH_PHASES`)에 `incoming_ringing` 만 추가하기: §2-3 의 「신호 없음」 3가지가 그대로 남는다.

근본안: 수신 중인 통화가 **서버에서 ringing 이 아니게 된 순간**을 여러 전달 경로로 감지한다. 그리고 **같은 확인 함수 하나**에서 서버 상태를 다시 읽어 정리한다.

### 3-1. 단일 확인 함수 (신규)
`confirmCallV4IncomingRemoteTerminal(callId, source)` — `lib/community-messenger/call-v4/` 신규 1개.
1. 현재 store 가 `phase === "incoming_ringing"` 이고 `identity.callId === callId` 이고 `direction === "incoming"` 일 때만 진행한다. 아니면 아무것도 하지 않는다.
2. 서버 세션을 1회 다시 읽는다(`callV4FetchSession`). 실패하거나 404 면 아무것도 하지 않는다(다음 전달 경로가 다시 부른다).
3. 상태별 처리:
   - `cancelled` / `missed` / `rejected` / `ended`: 기존 `callV4HandleRemoteTerminal(callId, status, router, source)` → 기존 `finalizeCallV4Terminal`. 중복 방지(`remoteTerminalFinalized`)도 기존 것을 쓴다.
   - `active`(다른 기기 수락): 기존 함수로 정리한다. 안내 문구는 §5 Owner 결정.
   - `ringing`: 아무것도 하지 않는다.

### 3-2. 전달 경로 (세 경로 모두 위 함수만 호출)
| # | 경로 | 바꾸는 곳 | 덮는 상황 |
|---|---|---|---|
| T1 | **U2 Realtime 피드의 UPDATE** — 현재 울리는 통화의 행이 `status ≠ ringing` 으로 바뀌면 | `call-v4-incoming-realtime-feed.ts`: 지금은 ringing 만 전달 → 「내 수신 행의 상태 변경」도 별도 콜백(`onSessionStatus`)으로 전달 · `call-v4-incoming-discovery.ts` 에서 연결 | **§2-3 의 모든 경우**(서버 행 변경은 actor 와 상관없이 수신자 구독에 온다) |
| T2 | 기존 2초 폴링의 성공 응답에서 현재 울리는 callId 가 빠지면 | `call-v4-incoming-discovery.ts` `tick` | Realtime 이 끊긴 동안. 응답 실패는 `[]` 로 오므로(A3) 빠짐만으로 판단하지 않고 반드시 3-1 에서 서버를 다시 읽는다 |
| T3 | 기존 hangup broadcast | `call-v4-connected-terminal-watch.ts` `onHangup`: 지금은 `confirmRemoteTerminalStatus`(연결 중 전용)만 → 수신 중이면 3-1 호출 추가. 연결 중 처리는 그대로 | 발신자 actor 인 종료를 가장 빨리 |

### 3-3. 바꾸지 않는 것
- 연결 중 종료 감시 조건(`WATCH_PHASES`)
- 로컬 수락·거절
- FCM·버스 경로
- 서버·DB·네이티브
- U2 폴링 주기
- 「ringing 은 시트를 직접 띄우지 않고 기존 판단 경로로만」 원칙

---

## 4. 영향 분석 (전후)

| 대상 | 영향 | 근거·확인 |
|---|---|---|
| 데스크톱·Windows PWA 웹 수신 | 상대가 끊으면 배너가 닫히고, 기존 `finalizeCallV4Terminal` 의 정리·안내가 실행된다 | 실기 W5~W11 |
| Android 앱 | 없음 — sync-only 라 수신 탐색·시트 미마운트 | CODE `CallV4Provider` `syncOnly` |
| iOS 앱 | 없음 — sync-only | CODE (E8) |
| 연결 중 통화 종료 | 없음 — T3 는 수신 중일 때만 새 함수로 간다 | 기존 테스트 `call-v4-connected-terminal-watch.test.ts` 유지 + 신규 |
| 수락 중(`accepting`) 단계 | 이번 범위에서 제외(수락 PATCH 결과 경로가 이미 처리). 수락과 상대 취소가 겹치는 경우는 실기 W10 으로 확인 | NOT_PROVEN |
| 서버 요청 | 종료 1건당 세션 GET 최대 3회(T1·T2·T3 가 각각 1회, 정리 후에는 0) | 상한 고정 |
| 안내 표시 | 기존 `classifyCallTerminalReason` 계약을 따른다. 수신 방향 cancelled·missed·active 의 실제 문구는 실기로 확인 | NOT_PROVEN |

### 설치 바이너리
- 네이티브 변경이 없다.
- Android·iOS 앱은 영향이 없다(sync-only).

### 롤백
- 웹 전용이다. 커밋 revert → main 반영 → 브라우저 새로고침.

---

## 5. Owner 결정 필요
1. 다른 기기에서 받았을 때 웹 배너가 닫히면서 보여 줄 안내.
   - 현재 매핑(`mapCallV4RemoteTerminalReason`)은 `active` 를 중립 `ended` 로 처리한다 → 「통화 종료」 류의 안내가 나올 수 있다.
   - 안내 없이 닫기 / 「다른 기기에서 받았습니다」 중 선택. 계약·지시가 없으므로 비워 둔다.

---

## 6. 검증

### 코드 (구현 시)
- 신규 테스트:
  - 3-1 상태별 처리: ringing 은 무시, 각 종료 상태는 정리, active, 404/실패는 무시
  - T1/T2/T3 가 각각 3-1 을 부르는지
  - 연결 중 단계는 기존 경로 그대로인지
  - 같은 통화 중복 정리 0회
- 기존 통화 테스트 전부, `typecheck:build`·`typecheck:test`·eslint, 통화 검사 스크립트
  - 기존 실패 3종(`cm-call-engine-lockdown`·`call-authority-contract`·`cm-call-lifecycle-contract`)은 변경 전과 같은 개수인지 대조

### 실기 (Production SHA 매 회 기록, 발신·생성·종료·배너 닫힘 시각, 서버 시각은 운영 DB 대조)
| # | 상황 | 기대 |
|---|---|---|
| W5 | 휴대폰 발신 → 웹 수신 중 발신자 취소 | 배너 닫힘(T1·T3) |
| W6 | 30초 무응답(발신자 기기 missed) | 배너 닫힘 |
| W7 | 수신자 휴대폰에서 거절(같은 계정 웹도 울림) | 웹 배너 닫힘(T1) |
| W8 | 수신자 휴대폰에서 받음 | 웹 배너 닫힘 + §5 안내 |
| W9 | 발신 앱 강제 종료 → 서버 missed | 웹 배너 닫힘 |
| W10 | 웹에서 수락 누르는 순간 발신자 취소 | 화면 1개, 상태 일치 |
| W11 | 웹 네트워크 끊김 중 취소 → 재연결 | 폴링·재구독 후 배너 닫힘(T2) |
| R1 | 정상 수신·수락·연결·종료 | 기존과 같음 |
