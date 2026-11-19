# 고스트 통화 (상대가 미디어에 한 번도 안 들어온 「통화 중」) — 문제 보고서 · 수정 설계안

- 작성 2026-11-19 PHT (Claude) · 상태: **1단계 운영 반영 (PR #513 → `895cfd4e4`, 2026-11-19 11:06 PHT) · Android 실기 PASS (G1·G2·G4·G5 일부) · G3(iPhone) NOT_PROVEN · 2단계 미승인**
- 실기 결과: `docs/audit/runtime-2026-11-19/recheck-claude/phase1-verify/RESULT.md`
- **정정**: 아래 「연결 끊김」은 저장 문장 기준이다. 채팅 화면 글자는 기존 동작대로 **「중단됨」**으로 보인다(실기 G1).
- 근거 실기: `docs/audit/runtime-2026-11-19/recheck-claude/RECHECK.md` (10:24~10:35 PHT, Production `edd0c8453`)
- 통화 변경 규정(AGENTS.md 「통화 변경 규정」) 2·3번에 따른 문서. 승인 후에만 구현한다.

## 0. 내 잘못 먼저

- 앞선 보고에서 문제 보고서·설계안 없이 「고쳐라 한마디로 승인」을 요청했다. 승인할 대상이 없는 요청이었다. 이 문서가 그 대상이다.
- 첫 보고에서 커서의 D-CALL-1 설명 일부(「Xiaomi 착신 불가」)를 그대로 옮겼다가 재실기에서 오판으로 정정했다.

## 1. 문제 (한 줄)

전화를 **받는 순간** 건 사람 앱이 꺼지면, 받은 사람 화면에는 아무도 없는 「통화 중」이 **사용자가 끊을 때까지** 계속되고, 건 사람은 그동안 다시 걸 수 없으며(「이미 통화 중」), 기록은 실제 통화처럼(예: 「6분 47초」) 남는다.

## 2. 증거 (직접 본 것만)

| 항목 | 증거 |
|---|---|
| 재현 | 세션 `17b42c71` — 10:26:24 Xiaomi 수락, 10:26:25 Samsung 앱 강제 종료 → Xiaomi 「통화 중」 00:26 → 05:10 → 06:40, 10:33:13 Xiaomi 가 직접 끊을 때까지 유지 (캡처 `recheck-claude/r2-*.png`) |
| 상대는 미디어에 없었음 | 운영 DB `call_events`: 이 세션의 `connected` 는 `session_patch / client_connected_proposal` 1건뿐, 양쪽 `native_media_evidence / remote_user_joined` **0건** |
| 받은 쪽은 자기 입장만으로 연결 처리 | Xiaomi 로그 10:26:25.624 `agora_native_join_success` → 같은 ms `state_connected` → `active_call_phase IDLE -> CONNECTED`. 이후 6분 동안 상대 부재 감지·종료 로그 없음 (`recheck-claude/r2-ghost-xiaomi-logcat.txt`) |
| 건 사람 발신 막힘 | 10:27:26 Samsung 재발신 → 화면 「이미 통화 중」, 서버 `caller_busy`. 재실행한 Samsung 화면에는 통화 표시 없음 |
| 기록 | Xiaomi 채팅 「음성 통화 · 6분 47초」 (실제 미디어 연결 0초) |
| 잠금은 원인 아님 | 세션 `6a81f07c` — 벨 중 Samsung 잠금 → 양쪽 `remote_user_joined`, 정상 통화·종료 |
| 같은 사례 (커서 시험) | 세션 `7b850ad3` 09:17 — 같은 모양(제안 1건·미디어 0건), 10분 37초 유지, Samsung 발신 `caller_busy` 6회 |

## 3. 원인 (코드 위치)

| # | 위치 | 동작 |
|---|---|---|
| C1 | Android 음성 `NativeVoiceCallAgoraEngine.java:428-448` · 영상 `NativeVideoCallAgoraEngine.java:938-962` | **받는 쪽**: 자기 채널 입장 성공(`onJoinChannelSuccess`) = `onConnected()`. 거는 쪽은 상대 입장(`onUserJoined`)을 기다림 |
| C2 | iOS 음성 `NativeVoiceCallAgoraEngine.swift:362-382` (주석 「Incoming callee contract (Android): local join success → connected」) · 영상 `NativeVideoCallAgoraEngine.swift:703-730` | iOS 도 같은 규칙 |
| C3 | Android 음성 `:473-490` · 영상 `:~1000` `onUserOffline` | 상대가 **들어온 적이 있어야**(remoteUid) 처리. 들어온 적 없으면 상대 부재를 알 길이 없음. 상대 입장 대기 시간 제한도 없음 |
| C4 | 웹 `lib/call/native/native-connected-sync.ts:128` → 서버 `lib/community-messenger/service.ts:21860-21905` | 네이티브 「연결됨」을 받아 `action=connected`(제안) 전송 → 서버가 **미디어 증거 없이 `connected_at` 기록** (주석: 「legacy JS proposal (no media evidence)」) |
| C5 | `lib/call/call-active-presence.ts:113-137` · `lib/community-messenger/call-session-heartbeat.ts:155-197` · `service.ts:977` | 서버는 **한쪽이라도** 생존 신호가 있으면 LIVE. 양쪽 다 끊겨야 종료 → 받은 쪽 앱이 신호를 계속 보내므로 영원히 LIVE |
| C6 | `service.ts:20996` `userHasLiveDirectCallSession` | 고스트 세션이 LIVE 라서 건 사람 새 발신은 `caller_busy` |
| C7 | 기록 시간 = `ended_at − connected_at` (`docs/dibay-call-authority-lock.md` Duration) | C4 로 찍힌 `connected_at` 때문에 미연결 통화가 「6분 47초」로 기록 |

## 4. 기존 설계와의 충돌 (보고만 — 임의로 고르지 않음)

| 문서·변경 | 내용 | 현재 코드와 관계 |
|---|---|---|
| `bf75dc73e` (2026-09-01) | 「한쪽 생존 신호 끊김으로 통화를 끝내지 않는다」 — 실제 통화가 10분쯤 잘못 끊기던 문제 수정 | 현재 코드(C5). **이 설계안은 이 결정을 되돌리지 않는다** (§6 원칙 1) |
| `docs/community-messenger-active-call-lifecycle.md:60` | 「한쪽이라도 90초 끊기면 종료」 | **현재 코드와 반대** — 09-01 이후 문서가 갱신되지 않음 |
| `docs/audit/call-termination-authority-audit-2026-11-01.md` A12·I6 | 「앱 강제 종료 → 상대에게는 서버 heartbeat 만료로 전달」 | **현재 코드에서는 전달되지 않음**(C5). 11-01 감사의 전제가 틀림 |
| `call-connected-authority.ts:98-101` · `call-media-connected.ts` | 「연결 증거는 상대 입장(`remote_user_joined`)만. 자기 입장은 증거 아님. 옛 제안 경로는 구 앱 때문에 유지」 | 계약은 이미 올바름. 옛 제안 경로(C4)가 남아 계약을 우회 |

## 5. 운영 영향 (운영 DB 읽기 전용, 최근 30일, 1:1 통화)

| 항목 | 값 |
|---|---|
| 수락된 통화 | 621 (음성 362 · 영상 259) |
| 미디어 증거로 연결 | 612 |
| 연결로 기록됐지만 미디어 증거 0 | **4** — 11-15 영상 2초 1건, 11-19 시험 3건(6초·545초·407초) |
| 실제 사용자 고스트(60초 이상) | **0건 확인** (60초 이상 2건은 모두 오늘 시험) |
| 수락 → 첫 미디어 증거 시간 | 음성 p50 1.3초 · p99 2.8초 · 최대 5.2초 / 영상 p50 1.3초 · p99 3.7초 · 최대 4.0초 |
| 설치 앱 (14일) | Android 1.2.6(39)·1.2.7(54)·1.2.7(79), iOS 1.2(22)~1.2.5(56) — **모두 미디어 증거 보고 도입(`60fbbf10f`, 10-15) 이후 빌드** |

→ 지금까지 실제 사용자 피해 기록은 없다. 그러나 받는 순간 상대 앱이 죽는 일(OS 메모리 회수·배터리·앱 강제 종료)은 일반 사용에서 생길 수 있고, 생기면 위 1번 증상이 그대로 난다.

## 6. 수정 설계

### 원칙
1. **생존 신호(heartbeat)로 끊지 않는다** — 09-01 결정 유지. 판단 근거는 「미디어가 한 번이라도 연결됐는가(`remote_user_joined`)」 하나.
2. 실제 통화 612건은 모두 수락 후 5.2초 안에 미디어 증거가 왔다 → **30초**(기존 상수 `CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS`) 안에 증거가 없으면 연결 실패로 본다. 실제 통화를 끊을 여지는 최대값의 약 6배 여유.
3. 통화만 단독 PR, 한 번에 한 원인. **1단계(서버·웹)** 와 **2단계(네이티브)** 를 따로 승인·반영.

### 1단계 — 서버·웹 (웹 배포만, 설치된 모든 앱에 적용)

| # | 바꾸는 곳 | 바뀌는 동작 |
|---|---|---|
| S1 | `service.ts:21860-21905` `action=connected`(제안) | `connected_at` 을 **쓰지 않는다**. 이벤트(`client_connected_proposal`)는 감사용으로 계속 기록. 응답 형태는 그대로(`ok`, `session`). `connected_at` 은 `action=media_connected`(상대 입장 증거)만 기록 — 계약(§4 마지막 줄)대로 |
| S2 | 새 판정 함수 1개 (`lib/call/call-active-presence.ts`): 「`status=active` · 수락 후 30초 경과 · `connected_at` 없음」 = **미디어 미연결** | 판정만, 쓰기 없음 |
| S3 | `service.ts:977` `isStaleActiveRowForReconcile` (조회 열에 `connected_at` 추가) | S2 이면 정리 대상 → 기존 `reconcileUserLiveCallSessions` 가 종료. 이 함수는 **새 발신 직전 거는 사람·받는 사람 모두**(`create_guard`·`peer_create_guard`), 수신·세션 조회 때 이미 호출됨 → 건 사람이 다시 걸면 고스트를 먼저 끝내고 정상 발신 |
| S4 | `call-session-heartbeat.ts:155` `cleanupStaleActiveCommunityMessengerCallSessions` (2분 크론) | 양쪽 끊김 조건에 더해 S2 도 종료 → 아무도 다시 걸지 않아도 **최대 약 2분 30초** 안에 고스트 종료 |
| S5 | 종료 사유 | 기존 사유 `failed_network`(수락 후 → 화면 「연결 끊김」, `docs/dibay-call-authority-lock.md` CUT3 표). 새 사유를 만들지 않음. 서버 종료 경로에서 이 사유가 그대로 기록되는지는 **구현 때 테스트로 확인** |
| S6 | 문서 | `community-messenger-active-call-lifecycle.md:60`(현재 코드와 반대)·11-01 감사 A12/I6 전제를 현재 동작으로 정정 |

**1단계로 바뀌는 사용자 화면**
- 받은 쪽: 고스트 「통화 중」이 수락 후 최대 약 2분 30초(크론) 또는 상대가 다시 거는 즉시 서버 종료 → 기존 「상대 종료」 경로(hangup 신호·FCM·Android 네이티브 생존 신호의 `heartbeat_server_not_live`)로 화면이 닫힘. **설치된 앱에서 실제로 닫히는지는 실기 확인 항목**(§8).
- 건 사람: 다시 걸면 「이미 통화 중」 없이 바로 발신.
- 기록: 「N분 N초」 대신 「연결 끊김」, 통화 시간 0.

**1단계로 안 고쳐지는 것**: 받은 쪽은 30초~2분 30초 동안 여전히 「통화 중」 타이머를 본다 → 2단계.

### 2단계 — 네이티브 (Android·iOS 재빌드·스토어 출시 필요)

| # | 바꾸는 곳 | 바뀌는 동작 |
|---|---|---|
| N1 | Android 음성·영상 `onJoinChannelSuccess`(C1), iOS 음성·영상 `didJoinChannel`(C2) | 받는 쪽도 **상대 입장(`onUserJoined`/`didJoinedOfUid`) 때만 연결**. 그 전에는 「연결 중…」 |
| N2 | 같은 파일 | 자기 입장 후 30초 안에 상대가 안 들어오면 기존 종료 판단 함수(`CallTerminationPolicy`) → 서버 end(`failed_network`) → 기존 정리 함수로 종료 |
| N3 | 버전 | 설치·배포용 빌드 때 Android `versionCode`·iOS `CURRENT_PROJECT_VERSION` 1회 증가 (`native:prepare`) |

## 7. 영향 분석 (통화 변경 규정 3번 항목)

| 경로 | 1단계 영향 | 2단계 영향 |
|---|---|---|
| 발신 시작·세션 생성 | 거는 사람에게 고스트가 있으면 먼저 종료 후 진행 (S3) | 없음 |
| VoIP/FCM 발송 | 없음 (고스트 종료 시 기존 종료 알림 경로 사용) | 없음 |
| iOS CallKit / Android 수신 화면 | 없음 | 수락 후 「연결 중」 표시 시간이 상대 입장까지(실측 p50 1.3초) 늘어남 |
| 취소·거절·부재중 | 없음 (`ringing` 은 대상 아님 — S2 는 `active` 만) | 없음 |
| 정상 종료 | 없음 | 없음 |
| 상태 폴링·생존 신호 | 판정 기준 추가만, 생존 신호 처리 무변경 | 없음 |
| CallKit 종료 신호 | 서버 종료 → 기존 상대 종료 경로 | 기존 종료 함수 사용 |
| 통화 기록·채팅 말풍선 | 미연결 통화가 「연결 끊김」·0초로 남음 | 같음 |
| 팝업·PiP·Dock | 없음 | 없음 |
| 그룹 통화 | 없음 (`session_mode=direct` 만) | 없음 |
| **구 바이너리 호환** | 설치된 모든 앱(Android 39~79, iOS 22~56)이 미디어 증거를 보냄(§5) → S1 후에도 정상 통화의 `connected_at` 은 증거로 기록. **증거를 안 보내는 앱이 있으면 그 앱의 정상 통화가 30초 뒤 끊김** — 14일 내 활성 기기 중 해당 없음 | 구 앱은 2단계 혜택 없음(1단계로 보호) |

## 8. 회귀 위험

| 위험 | 막는 방법 |
|---|---|
| 정상 통화인데 증거 보고(`media_connected` PATCH)가 네트워크로 실패 → 30초 뒤 잘못 종료 | 증거는 **양쪽이 각각** 보냄 — 둘 다 실패해야 발생. 운영 30일 612/612 증거 도착. 반영 후 1주 `failed_network` 수락 후 종료 건수를 운영 DB 로 대조 |
| S1 로 `connected_at` 이 늦게 찍혀 통화 시간이 짧게 기록 | 실측: 미디어 증거가 제안보다 먼저 또는 같은 초(09:28:40 vs 09:28:41) → 차이 0~1초 |
| 1단계 서버 종료 후 받은 쪽 화면이 안 닫힘 | 실기 행렬 G2·G3 로 확인. 안 닫히면 1단계 FAIL 로 보고(2단계 전제) |
| 데스크톱 웹 통화 | 웹 통화 연결 경로는 이미 제거됨(`call-v4-phase-bridge.ts:60` `legacy_web_establishment_removed`) — 영향 없음 |

## 9. 롤백

- 1단계: PR 1개 되돌림(revert) → main 병합 = 원상복구. 장애 시 Vercel Instant Rollback(재빌드 없음).
- 2단계: 스토어 이전 빌드 재배포. 1단계는 2단계 없이 단독으로 성립하므로 2단계만 되돌려도 고스트 보호는 유지.

## 10. 실기 검증 항목 (1단계 반영 후, Production SHA 매 시험 확인)

| ID | 시험 | 기대 |
|---|---|---|
| G1 | A→B 발신, B 수락 직후 A 앱 강제 종료 (Android↔Android) | B 화면 2분 30초 안에 닫힘, 서버 `failed_network`, 기록 「연결 끊김」 0초 |
| G2 | G1 뒤 A 앱 재실행 → 즉시 재발신 | 「이미 통화 중」 없이 B 벨 |
| G3 | G1 을 iPhone 수신 쪽으로 | iPhone CallKit·화면 닫힘 |
| G4 | 정상 통화 3분 유지 (Android↔Android, Android↔iPhone, 음성·영상) | 끊기지 않음, 기록 시간 = 실제 |
| G5 | 기존 통화 행렬: 거절·벨 중 취소·취소 후 지연 푸시·통화 중(busy)·무응답·정상 종료 후 즉시 재발신 | 반영 전과 같음 |
| G6 | 각 시험: 발신·세션 생성·발송·수신 화면·연결·종료 시각 기록, 운영 DB 대조 | — |

앱 처음 실행 상한(10회) 안에서 한다 — G1·G3 각 1회 재실행 필요, 예상 3~4회.

## 11. 이 설계에 넣지 않은 것 (확인 못 함 → 따로 보고)

- **연결된 뒤 상대 앱이 죽는 경우**: Android 는 상대 이탈 중 「네트워크 끊김형(DROPPED)」을 무시하고(C3), 서버도 한쪽 끊김으로는 끝내지 않음(C5) → 같은 고스트가 날 수 있다. **실기 미측정(NOT_PROVEN)**. 09-01 결정(실제 통화 오종료 방지)과 직접 부딪히므로 이 설계에 섞지 않고, 실기 측정 후 따로 보고한다.
- 09:17 원 사례에서 Samsung 이 왜 빠졌는지 — NOT_PROVEN.
- 09:30 Xiaomi 통화 표시 없음 — NOT_PROVEN (PiP X 닫기 경로 adb 조작 불가).

## 12. 승인 요청 항목

1. **1단계(S1~S6) 구현 승인** — 통화 전용 PR 1개, 로컬 검증 후 Owner 승인 없이 자동 병합하지 않고 보고(통화 변경 규정), 반영 후 §10 실기.
2. 2단계(N1~N3)는 1단계 실기 PASS 후 별도 승인 요청.
