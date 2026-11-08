# 그룹 통화 — 발신·취소·발신 화면 결함 원인 분석과 설계 (2차, 구현 전 · Owner 승인 대기)

- 작성: 2026-11-09 PHT (1차 `65cb4482d` 를 대체)
- Owner 지시: 「그룹 전화의 발신 자체도 안되는 부분이고 취소를 눌러도 꺼지지도 않는 부분, 발신 회면 자체가 디바이 화면이 아닌 부분이다, 정확히 원인을 확인 해서 설계안을 다시 만들어라」
- 규정: AGENTS.md 「통화 변경 규정」 2번(증거로 원인 특정) · 3번(영향 분석·계획 → 승인 후 구현) · 4번(한 번에 한 원인, 통화 단독 커밋)
- 코드 변경 없음.

## 0. 시험 중 작업자 문제 (먼저 보고)

- 02:44~02:46 PHT 시험 발신(앱 안 브라우저, 메인관리자)의 연결음이 Mac 에서 계속 울렸다. 서버 쪽 통화는 02:46:28 에 무응답으로 끝났지만 발신 화면이 닫히지 않아 연결음이 이어졌다(아래 G6 결함과 같은 현상). 02:48 에 브라우저 화면을 닫아 멈췄다.
- 시험 통화 4건(50703e7b · fb6c614e · 8262e613 · 7835a4ae)이 「테스트」 방 통화 기록에 남았다(부재중·취소). 운영 DB 에 진행 중(ringing/active)인 통화는 0건이다(02:51 PHT 확인).

## 1. 실측 조건

| 항목 | 값 |
|---|---|
| 운영 배포 | `dpl_2Whuf…`(main `68e4d0547`, 통화 코드는 `8535a4bfa` 와 같음) |
| 방 | 「테스트」 비공개 그룹 4명(김선희·메인관리자·q테스트1·w테스트1), `3e92fa77…` · 비교: CRYSTAL CLEAR 11명 |
| 발신 A | Android 휴대폰 SM-M156S, q테스트1, 1.2.5 (38), 02:40:15 PHT |
| 발신 B·C | 앱 안 브라우저 375×812, 메인관리자, 02:44:43 · 02:50:41 PHT. 이 탭에서만 마이크 권한·장치를 가짜로 바꿈(운영 코드 무변경) |
| 수신 확인 | 휴대폰(방 밖 → 방 안) 화면 캡처 · 운영 DB(`community_messenger_call_sessions`·`_participants`·`call_events`·`notification_deliveries`) · 브라우저 React 트리 값 |

## 2. 실측 결과 (FAIL 목록)

| # | 현상 | 증거 |
|---|---|---|
| F1 | 11명 방: 「통화」를 눌러도 반응 없음 | POST `/rooms/…/calls` → 400 `group_call_limit_exceeded` (1차 실측) |
| F2 | 4명 방: **세션은 만들어지지만 아무에게도 울리지 않음** | 세션 50703e7b(18:40:16Z)·8262e613(18:44:44Z) 모두 참여자 3명 `invited` 로 생성 · `notification_deliveries` **0건** · 휴대폰(수신자)은 방 밖에서도 방 안에서도 수신 화면 없음(02:44:46~02:45:38 캡처 6장) · 결국 무응답(missed)으로 끝남 |
| F3 | 발신자 「취소」를 눌러도 화면이 안 닫힘 | 발신 C: 취소 → PATCH 200, 서버 `cancelled`(18:50:44Z), 그룹 통화 값 `panel=null` 인데 **화면은 10초 넘게 「Ringing...」 유지** |
| F4 | 서버에서 통화가 끝나도 발신 화면이 안 닫힘 | 발신 A: 서버 `missed`(18:42:28Z) 뒤 25초 넘게 「Ringing…」·흐린 취소 버튼, 앱을 강제 종료해야 빠져나옴 · 발신 B: 서버 `missed`(18:46:28Z) 뒤에도 화면·연결음 유지(위 0번) |
| F5 | 발신 화면이 DIBAY 화면이 아님 | 보라색 배경 + 영어 「Ringing...」(휴대폰 캡처). 1:1 통화 화면은 DIBAY 녹색 테마 |
| F6 | 발신 화면이 늦게 뜸 | 발신 B·C: 그룹 통화 값 `dialing` 뒤 약 1.0~1.1초 지나서야 화면 표시 · 발신 A: 확인 1초 뒤 캡처에 화면 없음 |

## 3. 확정 원인 (각각 코드 위치 + 실측)

### G1. 서버 4명 제한 (F1)
- `lib/community-messenger/service.ts:20393` 그룹방 참여자 > 4 이면 거절. 활성 그룹방 105개 중 2개가 4명 초과.

### G2. 화면은 4명 제한을 모름 (F1)
- `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts:288` `canStartGroupCall` 에 참여자 수 조건 없음 → 11명 방에서 「그룹 통화 시작 가능」·버튼 활성.

### G3. 그룹 통화를 받는 경로가 없음 (F2) — 3갈래 모두 막힘
- **G3-가 푸시 없음**: 통화 시작 함수가 그룹이면 푸시 입력을 `null` 로 돌려준다(`service.ts` `incomingCallPush: !isGroupRoom && peerUserId ? … : null`). 라우트는 이 값이 있을 때만 발송(`app/api/community-messenger/rooms/[roomId]/calls/route.ts:84`). → 실측 `notification_deliveries` 0건. 앱이 꺼졌거나 백그라운드면 받을 길이 없다.
- **G3-나 앱 전역 수신 화면이 1:1 만 조회**: `components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx:475` `GET …/calls/sessions/incoming?directOnly=1` (도입 `930c1145e` 2026-04-05). 서버는 `directOnly` 면 `session_mode = 'direct'` 만 돌려준다(`service.ts:22535`). 참여자 실시간 변경을 받아도 같은 조회를 다시 해서 그룹 세션은 버려진다. 화면 표시 조건도 `sessionMode === "direct"` 만 본다(같은 파일 409·897·1814줄). 수락 처리(2209줄)만 그룹 분기가 있다.
- **G3-다 방 안에서도 통화 정보가 방 화면에 오지 않음**: 방 화면의 그룹 통화 값은 방 스냅샷의 `activeCall` 에서 온다(`components/community-messenger/CommunityMessengerRoomClientInner.tsx:139`). 방 화면이 실제로 부르는 두 요청이 모두 `activeCall: null` 을 돌려준다.
  - 첫 진입 `bootstrap?mode=instant&hydration=critical`: `critical` 티어는 통화 조회를 건너뛴다(`service.ts:15926` `if (!deferSecondary && !isCriticalTier)` 안에서만 `getActiveCallSessionForRoom`).
  - 이후 갱신 `bootstrap?snapshotTier=silent_delta`: `lib/community-messenger/server/load-community-messenger-room-silent-delta.ts:257` 이 `activeCall: null` 고정. 클라이언트 병합은 키가 있으면 그대로 덮어쓴다(`lib/community-messenger/room/merge-community-messenger-silent-delta.ts:43`) → 다른 곳에서 값이 들어와도 다음 갱신 때 지워진다.
  - 실측(통화 8262e613 울리는 중, 18:46Z): 두 요청 모두 `activeCall=null`, 같은 시각 `GET /rooms/{id}` 와 무인자 `bootstrap` 은 세션을 돌려줌. 브라우저 방 화면 값 `activeCall=null`(통화 내내).

### G4. 발신 화면이 그룹 통화 값 변화를 늦게·안 받음 (F3·F6)
- `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx:315` `view` 의 `useMemo` 의존성에 `room.call` 이 없다(도입 `8a91e3871` 2026-06-20). 통화 화면은 `view.call` 을 쓴다(같은 파일 478줄 → `CommunityMessengerRoomPhase2CallLayer.tsx:65`).
- 실측: 취소 후 그룹 통화 값 `panel=null` 인데 화면 「Ringing...」 유지(F3). 발신 시 값 `dialing` 뒤 화면 표시가 다른 갱신이 올 때까지 늦음(F6).

### G5. 시작 실패 뒤에도 발신 상태가 남음 (F1 후속)
- `lib/community-messenger/use-community-messenger-group-call.ts` `startOutgoingCall`: 실패 시 오류 문구만 넣고 `panel` 은 그대로. `cancelOutgoingCall` 은 `sessionId` 가 없으면 바로 끝남(623~625줄) → 11명 방에서 「Ringing…」 고착·취소 무반응(1차 실측).

### G6. 서버에서 끝난 통화를 발신자가 모름 (F4)
- 발신 화면은 G3-다 때문에 `activeCall` 이 계속 `null` 이라, 훅이 서버 상태를 볼 수 없다. 종료(missed·cancelled) 처리 분기(`use-community-messenger-group-call.ts:313`)가 실행되지 않고, `activeCall` 이 없으면 기존 panel 을 유지한다(256~258줄). 여기에 G4 가 겹쳐 화면이 남는다.

### G7. 그룹 발신 화면 = DIBAY 테마 미지정 (F5)
- `components/community-messenger/call-ui/GroupRoomCallOverlay.tsx:278` 화면 모델에 `visualTheme` 이 없다 → `components/messenger/call/CallBackground.tsx:7` 기본 보라색(`VOICE_BG`, 주석 「Viber 계열」).
- 1:1 통화 화면은 `visualTheme: "starbucks"`(`CommunityMessengerCallClient.tsx:5109·5664`) → 녹색 `#00754A`.
- 상태 문구가 영어로 고정되어 있다: 같은 파일 290줄 `"Ringing..."`. 기존 한국어 키 `cm_ui_outgoing_voice_dialing`(「전화 거는 중」)이 있다.

### 확인 못 한 것 (추측으로 채우지 않음)
- 휴대폰(q테스트1)이 02:42:46 PHT 에 새 그룹 통화(fb6c614e)를 만들고 4초 뒤 취소했다(운영 DB). 이 시각에 작업자는 휴대폰을 누르지 않았다. 코드상 그룹 발신은 사용자 탭(`startGroupCall`)이나 권한 재시도 버튼(`retryCallDevicePermission`)으로만 시작된다. 누가 눌렀는지, 자동 재발신인지는 **확인 못 함**(이 시각 서버 로그에 발신 요청 기록이 남지 않음).
- 발신 B 는 화면 값 `activeCall=null` 이었는데도 18:46:28Z 에 메인관리자 기기가 무응답(missed) 처리를 보냈다. 무응답 타이머는 `activeCall` 이 있어야 돈다(341~342줄). 그 사이 어떤 요청으로 값이 잠깐 들어왔는지는 **확인 못 함**.

## 4. 설계 (원인별 1개 · 단계별 통화 단독 커밋)

| 단계 | 원인 | 변경 | 파일 | 결과 |
|---|---|---|---|---|
| 1 | G4 | 통화 화면(`callView`)과 타임라인 오류 배너를 `view` 가 아닌 **그룹 통화 값(`room.call`)에 직접** 연결. `view` 에는 `call` 을 넣지 않아 타임라인 재계산은 늘리지 않음 | `CommunityMessengerRoomClientPhase2Body.tsx`, `CommunityMessengerRoomPhase2CallLayer.tsx` | 취소·종료 즉시 화면 닫힘, 발신 화면 즉시 표시 |
| 1 | G5 | 시작 요청 실패 시 `panel` 을 비우고 오류만 남김(기존 오류 배너로 표시) | `use-community-messenger-group-call.ts` | 실패 후 고착 없음 |
| 1 | G7 | 그룹 통화 화면 모델(발신·수신·연결·종료 4개)에 `visualTheme: "starbucks"` 지정 + `"Ringing..."` → `t("cm_ui_outgoing_voice_dialing")` | `GroupRoomCallOverlay.tsx` | 1:1 과 같은 DIBAY 녹색 화면·한국어 |
| 2 | G3-다·G6 | 그룹방이면 `critical`·`silent_delta` 티어도 `getActiveCallSessionForRoom`(기존 캐시 함수)로 `activeCall` 을 채움. 1:1 방은 지금처럼 비움(1:1 통화 경로를 바꾸지 않기 위해 범위를 그룹방으로 한정) | `service.ts` 스냅샷, `load-community-messenger-room-silent-delta.ts` | 방 안 수신 화면 표시 · 서버 종료가 발신자 화면에 반영 |
| 3 | G3-나 | 전역 수신 조회에 그룹 포함(`directOnly` 제거 또는 그룹 포함 인자) + 표시 조건에 그룹 허용. 수락은 기존 그룹 분기(방으로 이동 `?callAction=accept`) 사용 | `GlobalCommunityMessengerIncomingCall.tsx`, 수신 API | 앱이 켜져 있으면 방 밖에서도 수신 |
| 3 | G2 | `canStartGroupCall` 에 「참여자 4명 이하」 추가, 초과 시 기존 문구 `cm_ui_group_call_limit_four` 로 안내하고 버튼 비활성 | `use-messenger-room-phase2-room-presentation.ts`, 방 메뉴 시트 | 11명 방에서 누를 수 없음 |
| — | G3-가 | **Owner 결정 필요** — 앱이 꺼졌거나 백그라운드일 때의 그룹 수신(푸시·CallKit·Android 수신 화면)은 네이티브·푸시 발송 변경이라 별도 설계 | — | — |
| — | G1 | **Owner 결정 필요** — 4명 제한 유지/확대(Agora 요금·화면 구성) | — | — |

- 단계마다 통화 단독 커밋 1개, 실기 PASS 후 다음 단계.
- 2단계는 방 진입 hot path(첫 진입 `critical` 티어)에 조회 1개가 늘어난다. 그룹방에만 적용하고, 캐시 적중률·진입 시간을 변경 전후로 측정해 보고한다.

## 5. 영향 경로 · 호환 · 위험 · 롤백

- 경로: 그룹방 통화 화면(발신·수신·연결·종료·취소), 방 스냅샷의 `activeCall`(그룹방), 앱 전역 수신 화면(3단계), 방 메뉴 그룹 통화 버튼. 1:1 통화(`startManagedDirectCall`·`CommunityMessengerCallClient`)·네이티브 수신 화면·CallKit·PushKit·FCM 발송·통화 세션 API 는 바꾸지 않는다(3단계 전역 수신 화면만 1:1 과 같은 파일이라 1:1 수신 회귀 확인 필수).
- 설치 바이너리: 웹만 변경 — Android 1.2.5 (20·24·37·38), iOS 1.2 (21·22·23·28·30) 모두 앱 재시작으로 반영.
- 위험: 1단계 — 통화 상태가 바뀔 때마다 통화 화면만 다시 그림(타임라인 제외). 2단계 — 그룹방 진입 지연 증가 가능(측정). 3단계 — 1:1 수신 화면 로직과 같은 파일이라 1:1 수신·벨·취소 회귀 위험.
- 롤백: 단계별 커밋 revert(웹만).

## 6. 실기 검증 (단계마다 · Production SHA 매번 기록 · 서버 시각은 운영 DB 대조)

- 1단계: 4명 방 발신 → 화면 즉시 표시(녹색·「전화 거는 중」) · 취소 즉시 닫힘 · 11명 방 실패 시 고착 없음 · 무응답 타이머 종료 시 닫힘.
- 2단계: 방 안 수신자 수신 화면 표시 · 수락·거절 · 다른 사람이 취소/무응답 처리 시 양쪽 화면 닫힘 · 그룹방 진입 시간 전후 비교.
- 3단계: 방 밖(앱 켜짐) 그룹 수신 화면 · 수락 시 방으로 이동해 연결 · 1:1 통화 행렬(발신·수신·거절·벨 중 취소·지연 푸시 재울림 없음) 회귀 없음.
- 각 항목: 발신 시각 · 세션 생성 · (해당 시) 발송 기록 · 수신 화면 표시 · 연결 · 종료 시각.

## 7. 승인 요청 범위

1단계(G4·G5·G7)부터 단계별로 승인받는다. G3-가(백그라운드 수신)·G1(4명 제한)은 Owner 결정 전에는 손대지 않는다.
