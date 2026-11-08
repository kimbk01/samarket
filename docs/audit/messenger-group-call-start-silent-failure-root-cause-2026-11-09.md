# 그룹 통화 — 확정 원인과 보류 조치 (2026-11-09)

- Owner 지시 원문
  - 「그룹 전화의 발신 자체도 안되는 부분이고 취소를 눌러도 꺼지지도 않는 부분, 발신 회면 자체가 디바이 화면이 아닌 부분이다, 정확히 원인을 확인 해서 설계안을 다시 만들어라」
  - 「다른 통화 부분을 건딜면 안된다고, 정확히 그룹 통화 부분만 해야 한다」 · 「정확한 원인이 아니면 보고 하지 마라」
  - 「통화 그룹 통화 부분은 일단은 사용 부분을 보류 한다, 그룹 채팅 만 학인 하고 그룹 통화 가능은 재거 해라」
- 이 문서는 1차(`65cb4482d`)·2차(`3eba0ed17`)를 대체한다. 2차의 「확인 못 함」 항목과 공용 코드(방 스냅샷·전역 수신 화면)를 바꾸는 설계는 **철회**한다.

## 1. 계약 확인

- `lib/community-messenger/call-phase0-basics.ts` — 「Phase 0 — 발신·수신·종료·취소(음성 1:1)만 안정화」, `isCmGroupCallEnabled()` = **false**.
- 즉 계약상 그룹 통화는 꺼져 있다. 전역 수신 화면은 이 값을 지킨다(`GlobalCommunityMessengerIncomingCall.tsx:2210` 그룹 수락 차단, 2026-04-05부터 1:1 만 조회). **그룹방 화면은 이 값을 보지 않고 그룹 통화 시작을 열어 두었다** — 이것이 「발신해도 아무에게도 안 울리는」 그룹 통화가 사용자에게 노출된 원인이다.

## 2. 운영 실측으로 확정한 결함 (운영 `dpl_2Whuf…`, 「테스트」 4명 방 · CRYSTAL CLEAR 11명 방)

| 현상 | 확정 원인 (코드 위치) | 증거 |
|---|---|---|
| 11명 방: 눌러도 반응 없음 | 서버 4명 초과 거절 `service.ts:20393` | POST → 400 `group_call_limit_exceeded` |
| 4명 방: 아무에게도 안 울림 | ① 그룹은 푸시 입력 없음(`service.ts` `incomingCallPush: !isGroupRoom … : null`) ② 전역 수신은 1:1 만 조회(`GlobalCommunityMessengerIncomingCall.tsx:475` `directOnly=1`) ③ 방 화면 요청(`critical`·`silent_delta`)은 `activeCall` 을 비워 보냄(`service.ts:15926`, `load-community-messenger-room-silent-delta.ts:257`) | 세션 2건 생성·참여자 `invited` · `notification_deliveries` 0건 · 수신 휴대폰 방 밖/안 캡처 6장 수신 화면 없음 · 울리는 중 두 요청 `activeCall=null` |
| 취소해도 화면이 안 닫힘 | 통화 화면이 `view.call` 을 쓰는데 `view` memo 의존성에 `room.call` 없음(`CommunityMessengerRoomClientPhase2Body.tsx:315`) | 취소 PATCH 200 · 서버 `cancelled` · 그룹 통화 값 `panel=null` 인데 화면 「Ringing...」 10초 넘게 유지 |
| 서버에서 끝나도 화면이 안 닫힘 | 위 ③ 으로 발신자 훅의 `activeCall` 이 계속 null → 종료 분기 미실행(`use-community-messenger-group-call.ts:256~258·313`) + 위 memo 결함 | 서버 `missed` 뒤 휴대폰 25초 이상·브라우저 화면·연결음 유지 |
| 발신 화면이 DIBAY 화면이 아님 | 그룹 화면 모델에 `visualTheme` 없음 → 기본 보라색(`CallBackground.tsx:7` 「Viber 계열」), 상태 문구 영어 고정(`GroupRoomCallOverlay.tsx:290` `"Ringing..."`). 1:1 은 `visualTheme: "starbucks"`(녹색) | 휴대폰 캡처 |

## 3. 이번 조치 — 그룹방 통화 진입점 제거 (Owner 「그룹 통화 가능은 재거 해라」)

기존 계약 플래그 `isCmGroupCallEnabled()`(false)를 그룹방 화면에도 적용한다. 그룹방 분기만 바꾸고 1:1 통화 코드·서버·네이티브·푸시는 바꾸지 않는다.

| 진입점 | 파일 | 변경 |
|---|---|---|
| 방 메뉴 「그룹 통화」 상태 카드 + 「그룹 음성 통화」「그룹 영상 통화」 버튼 | `CommunityMessengerRoomPhase2RoomSheets.tsx` | 플래그 false 면 그리지 않음 |
| 방 메뉴 발신 확인창 | 같은 파일 | 플래그 false 면 열리지 않음 |
| 방 정보 「통화 상태」 칸(그룹방) | 같은 파일 | 플래그 false 면 그리지 않음 |
| 대화 상단 「· 그룹 통화 시작 가능」 문구 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | 플래그 false 면 붙이지 않음 |
| 그룹방 통화 기록 말풍선 탭 → 다시 걸기 | 같은 파일 `startCallStubRedial` | 그룹방이고 플래그 false 면 아무것도 하지 않음(1:1 방은 그대로) |
| 시작 함수 `startGroupCall` | `use-messenger-room-phase2-controller.ts` | 플래그 false 면 즉시 반환(어느 진입점이든 차단) |

- 바꾸지 않는 것: 1:1 발신·수신·헤더 통화 버튼(`startManagedDirectCall`), 그룹방에서 멤버에게 거는 1:1 통화, 그룹 통화 훅·화면 코드(보류 상태로 그대로 둠), 서버 API, 전역 수신 화면, 네이티브.
- 지난 그룹 통화 기록 말풍선은 대화 기록으로 그대로 보인다(누르면 아무 동작 없음).
- 설치 바이너리: 웹만 변경 — 앱 재시작으로 반영.
- 롤백: 이 커밋 revert.
- 그룹 통화를 다시 켤 때: 위 2절의 결함을 **그룹 통화 전용 코드 안에서** 고치는 설계를 따로 만들어 승인받은 뒤 플래그를 켠다.

## 4. 검증

- 로컬(코드 PASS): `typecheck:build`·`typecheck:test` 통과 · vitest 4파일 17건 통과(신규 `lib/community-messenger/room/phase2/__tests__/group-call-hold-entry-gate.test.ts` — 변경 전 코드에서는 실패) · 변경 3파일 eslint 오류 0(경고 168건은 변경 전과 같음).
- 운영·실기: main 반영 후 그룹방 메뉴·방 정보·대화 상단·통화 기록 말풍선, 1:1 방 헤더 통화 버튼을 화면으로 확인해 보고에 기록한다.
