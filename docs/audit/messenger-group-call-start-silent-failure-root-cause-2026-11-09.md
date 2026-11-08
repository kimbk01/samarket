# 그룹 통화 시작 시 「아무 반응 없음」 — 원인 분석 (구현 전, Owner 승인 대기)

- 작성: 2026-11-09 PHT · 기준 운영 `8535a4bfa`(배포 `dpl_6V8w…`)
- 규정: AGENTS.md 「통화 변경 규정」 2번(증거로 원인 특정) · 3번(영향 분석·계획 → 승인 후 구현)
- 코드 변경 없음.

## 1. 현상 (FAIL)

CRYSTAL CLEAR(그룹, 11명)에서 「그룹 음성 통화 → 통화」를 누르면 확인 창만 닫히고 **아무 화면·안내도 나오지 않는다.**

| 시도 | 기기·계정·배포 | 결과 |
|---|---|---|
| 02:18 PHT | Android 태블릿 zxzx11, 1.2.5 (38), `dpl_9REE…`(D2-다 이전) | 화면 변화 없음 · 통화 세션 0건 |
| 02:20 PHT | 같은 기기, `dpl_6V8w…`(D2-다) | 같음 |
| 02:25 PHT | Android 휴대폰 q테스트1, 1.2.5 (38), `dpl_6V8w…` | 같음 |

OS 권한(마이크·카메라)은 두 기기 모두 허용 상태(`dumpsys package` granted=true). D2-다 이전 배포에서도 같으므로 D2-다로 생긴 결함이 아니다.

## 2. 실측 방법

- 운영 앱 안 브라우저(메인관리자, 375×812)에서 같은 버튼을 눌렀다. 이 브라우저에는 마이크가 없어 권한 확인만 통과하도록 `navigator.permissions.query` 를 이 탭 안에서만 「granted」로 바꿨다(운영 코드 무변경).
- 통화 시작 요청과 응답, 그룹 통화 컨텍스트 값(Provider), 방 화면이 쓰는 값(view)을 React 트리에서 직접 읽었다.
- 직접 요청: `POST /api/community-messenger/rooms/bc5f…/calls {callKind:"voice"}` 응답 확인.

## 3. 확정 원인 (3개 · 각각 실측)

### C1. 서버 규칙: 그룹 통화는 참여자 4명 이하 방만 — 11명 방은 거절

- `lib/community-messenger/service.ts:20393` `if (isGroupRoom && snapshot.members.length > 4) return { ok:false, error:"group_call_limit_exceeded" }`
- 실측: 직접 요청 → **HTTP 400 `{"ok":false,"error":"group_call_limit_exceeded"}`** · 화면 흐름에서도 같은 요청·응답 1건.
- 운영 DB: 활성 그룹방 105개 중 4명 초과 2개(open 8개 중 0 · private 97개 중 2).

### C2. 화면은 「그룹 통화 시작 가능」·버튼 활성 — 4명 규칙을 모름

- `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts:288` `canStartGroupCall` = 그룹방 · 사용 가능 · (owner/admin 또는 멤버 통화 허용) — **참여자 수 조건 없음**.
- 실측: 11명 방에서 「그룹 통화 시작 가능 · 지금 시작 가능」 표시, 버튼 활성.

### C3. 통화 상태가 방 화면에 전달되지 않음 — 거절 안내·통화 화면이 안 보임 (2026-06-20부터)

- 그룹 통화 컨텍스트(Provider) 값은 바뀐다: 실측 `panel: {mode:"dialing", sessionId:null}`, `errorMessage: "그룹 통화는 현재 최대 4인까지만 지원합니다."`
- 그런데 방 화면이 쓰는 값은 그대로다: 실측 `view.call.panel = null`, `view.call.errorMessage = null`.
- 원인 코드: `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx:315` `view` 의 `useMemo` 의존성 목록에 **`room.call` 이 없다**(주석 「`room` 전체 dep 금지 — 필드 단위만」, 도입 `8a91e3871` 2026-06-20). `callView`(통화 화면)·타임라인 오류 배너가 이 낡은 `view.call` 을 읽는다.
- 증명: 같은 상태에서 관계없는 값(방 메뉴 열기 = `activeSheet`)을 바꾸자 `view` 가 다시 계산되어 그제야 통화 화면 「Ringing… · 그룹 통화는 현재 최대 4인까지만 지원합니다.」가 나타났다(캡처).
- 영향: 그룹방의 모든 통화 상태 표시 — 발신 중·수신(incoming)·연결·종료 화면이 다른 값이 바뀔 때까지 늦게 나타나거나 안 나타난다. (수신 화면 지연은 같은 전달 경로라 코드로 판단 — 실기 NOT_PROVEN)

### C4(부수). 거절 후 「Ringing…」 화면이 남고 「취소」가 동작하지 않음

- 거절 응답 뒤에도 `panel` 을 비우지 않는다(`use-community-messenger-group-call.ts` `startOutgoingCall`: 실패 시 `setErrorMessage` 만). 화면은 「Ringing…」으로 남는다(실측 캡처).
- 「취소」는 `cancelOutgoingCall` 이 `sessionId` 없으면 즉시 반환 → 아무 변화 없음(실측). 새로고침해야 빠져나온다.

## 4. 바꿀 것 (설계 · 원인별 1개)

| 원인 | 변경 | 파일 |
|---|---|---|
| C3 | `view` 의존성에 `room.call` 추가(통화 핸들은 값이 바뀔 때만 새 객체 — D2-다 값 공급자가 같은 값이면 올리지 않음) | `CommunityMessengerRoomClientPhase2Body.tsx` |
| C4 | 시작 요청이 실패하면 `panel` 을 비우고 오류만 남김(→ 기존 타임라인 오류 배너가 표시) | `use-community-messenger-group-call.ts` `startOutgoingCall` |
| C2 | `canStartGroupCall` 에 「참여자 4명 이하」 추가 · 초과 시 안내 문구(기존 키 `cm_ui_group_call_limit_four`)로 표시하고 버튼 비활성 | `use-messenger-room-phase2-room-presentation.ts`, 방 메뉴 시트 |
| C1 | **변경 안 함** — 4명 제한은 서버 규칙. 늘릴지는 **Owner 결정 필요**(Agora·요금·화면 구성 영향) | — |

- C3 는 통화 화면 전체의 표시 시점을 바꾸는 변경이다 — 「view 가 통화 상태 변화마다 다시 계산」되어 그룹방 타임라인도 다시 그려질 수 있다. 통화 중 1초 타이머(`elapsedSeconds`)도 핸들 필드라 **통화 중 매초 view 재계산**이 생긴다. 대안: `view` 에서 `call` 을 빼고 `callView` 를 `room.call` 에 직접 의존시켜 타임라인 재계산을 막는다(권장 — 오류 배너만 별도로 `room.call.errorMessage`·`room.call.panel` 의존).

## 5. 영향 경로 · 호환 · 위험 · 롤백

- 경로: 그룹방 방 화면의 그룹 통화 표시·발신·수신·연결·종료·취소, 방 메뉴의 그룹 통화 버튼. 1:1 통화(`startManagedDirectCall`)·네이티브 수신 화면·CallKit·PushKit·FCM·서버 API 무변경.
- 설치 바이너리: 웹만 변경 — Android 1.2.5 (20·24·37·38), iOS 1.2 (21·22·23·28·30) 앱 재시작으로 반영.
- 위험: 통화 중 화면 재렌더 증가(위 대안으로 축소) · 버튼 비활성 조건 추가로 4명 초과 방에서 버튼이 꺼짐(의도).
- 롤백: 통화 단독 커밋 1개 revert.

## 6. 실기 검증 (통화 규정 5번)

- 4명 이하 그룹방(예: 「테스트」 4명 — 김선희·메인관리자·q테스트1·w테스트1)에서 Android ↔ iPhone: 음성·영상 발신 / 수신 화면 즉시 표시 / 수락 / 거절 / 벨 중 취소 / 무응답 / 통화 중 / 종료 후 재발신 / 통화 중 방 나가기.
- 4명 초과 방: 버튼 비활성 + 4인 안내 · 누를 수 없음.
- 각 항목 시각: 발신 · `community_messenger_call_sessions` 생성 · `notification_deliveries` · 수신 화면 · 연결 · 종료.
