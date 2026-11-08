# D2-다 그룹방 첫 진입 시 방 화면 전체 다시 그리기 — 영향 분석·계획 (구현 전, Owner 승인 대기)

- 작성: 2026-11-09 PHT · 기준 운영 `40d46dc83`(D5 반영 후)
- 규정: AGENTS.md 「통화 변경 규정」 3번(수정 전 영향 분석·계획 문서 → Owner 승인 후 구현) · 4번(통화만 단독 커밋)
- 이 문서는 **설계만** 한다. 코드 변경 없음.

## 1. 결함 (FAIL)

그룹방에 **앱 실행 후 처음** 들어갈 때, 대화 상자(타임라인·입력창 포함)가 한 번 만들어졌다가 지워지고 다시 만들어진다.
다시 만들어진 대화 상자는 맨 위(가장 오래된 메시지)에서 시작해 약 0.3초 뒤 맨 아래로 이동한다 — 사용자에게는 **화면이 위로 튀었다 내려오는 깜빡임**.

| 측정 | 조건 | 결과 |
|---|---|---|
| 대화 상자 생성·삭제 | 운영 `40d46dc83`, 앱 안 브라우저 375×812, 메인관리자, 새로고침 후 채팅 목록 → CRYSTAL CLEAR(그룹) | 799ms 생성(scrollTop 1464) → **830ms 삭제 → 830ms 새로 생성(scrollTop 0)** → 1139ms 2063(맨 아래) |
| 같은 측정(D5 전) | 운영 `41dd238f4` | 1464 → 0 → 2063 (같은 현상 — D5 와 무관한 기존 결함) |
| 두 번째 진입 | 같은 앱 실행 안에서 그룹방 재진입 | 삭제·재생성 없음(모듈이 이미 메모리에 있음) |
| 1:1 방 | 같은 조건 | 삭제·재생성 없음 |

## 2. 원인 (운영 화면의 React 트리로 확정)

옛 대화 상자와 새 대화 상자의 상위 컴포넌트 사슬을 비교해, 둘이 **공유하는 가장 가까운 조상**과 그 바로 아래를 읽었다.

- 공유 조상 = `MessengerRoomGroupCallShell` (`lib/community-messenger/room/MessengerRoomGroupCallShell.tsx`)
  — 운영 코드에서 `function u({isGroupRoom, bridgeDeps, children}) { …useLayoutEffect… import(…).then(e => …CommunityMessengerGroupCallProviderBridge…) }`
- 옛 대화 상자: 공유 조상 바로 아래 = `CommunityMessengerGroupCallContext.Provider` (임시 값 `DIRECT_ROOM_GROUP_CALL_STUB`)
- 새 대화 상자: 공유 조상 바로 아래 = `CommunityMessengerGroupCallProviderBridge`(운영 `function I({children,...p}){ let y = useCommunityMessengerGroupCall(…) …`) → 그 아래 Provider

즉 셸이 그룹 통화 모듈을 **동적으로 불러오는 동안** `<Provider>{children}</Provider>` 를 그리다가, 불러온 뒤 `<Bridge><Provider>{children}</Provider></Bridge>` 로 **트리 모양을 바꾼다**. React 는 같은 자리의 컴포넌트 종류가 바뀌면 그 아래를 전부 버리고 새로 만든다 → 방 화면(타임라인·입력창·헤더) 전체 재생성.

- 셸 위의 `useMessengerRoomClientPhase1`(메시지·스크롤 컨트롤러)은 재생성되지 않는다 → 진입 위치 결정은 이미 끝난 상태라 새 대화 상자에 다시 적용되지 않고 scrollTop 0 으로 남았다가, 크기 변화 보정(keep-bottom)이 뒤늦게 맨 아래로 내린다.
- 미리 불러오기(`CommunityMessengerRoomClientInner.tsx:127` `useEffect` 의 `import(...)`)는 방 클라이언트가 마운트된 **뒤** 시작해, 첫 진입에는 늦다.

## 3. 바꿀 것 (설계 · 1개 파일 중심)

**셸의 트리 모양을 고정한다.** 셸은 항상 `<CommunityMessengerGroupCallContext.Provider value={value}>{children}</Provider>` 를 같은 자리에 그린다.
그룹 통화 훅은 Provider 를 감싸지 않고, **형제 위치의 값 공급 컴포넌트**(화면 없음, `null` 반환)에서 실행해 값을 셸로 올린다.

```
MessengerRoomGroupCallShell
├─ (모듈 로드 후) <GroupCallValueHost deps onValue={setValue} />   ← useCommunityMessengerGroupCall(deps) 실행, null 렌더
└─ <Provider value={value ?? DIRECT_ROOM_GROUP_CALL_STUB}>{children}</Provider>   ← 자리·종류 불변
```

| 파일 | 변경 |
|---|---|
| `lib/community-messenger/room/MessengerRoomGroupCallShell.tsx` | 항상 Provider 고정 · Bridge 를 형제 값 공급자로 렌더 · `value` state |
| `lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge.tsx` | `children` 감싸기 대신 `onValue(value)` 로 값 전달(useLayoutEffect, 값 바뀔 때만) |
| 그 외 | 변경 없음 — 훅(`use-community-messenger-group-call.ts`)·컨텍스트·소비처(`use-messenger-room-phase2-controller.ts:415`)·통화 API·푸시·네이티브 무변경 |

**다른 방법을 쓰지 않는 이유**
- 그룹방 진입 전 모듈을 기다린 뒤 방을 그리기: 그룹방 첫 진입이 모듈 로딩 시간만큼 늦어진다(진입 속도 계약 위반).
- 앱 시작 때 미리 불러오기만: 알림·링크로 바로 그룹방에 들어오는 첫 진입은 여전히 늦을 수 있어 원인이 남는다.

## 4. 바뀌는 동작 · 영향 경로

| 경로 | 지금 | 변경 후 |
|---|---|---|
| 그룹방 첫 진입 화면 | 방 화면 전체 재생성 + 맨 위 0.3초 | 재생성 없음 · 진입 위치 그대로 |
| 그룹 통화 훅 실행 시점 | 모듈 로드 직후(Bridge 마운트) | **같음**(값 공급자 마운트) — 훅의 효과(세션 구독 `community-messenger-group-call-session:*`, 활성 통화 동기화, 타이머, 종료음, 미디어 정리)는 같은 조건·같은 시점에 실행 |
| 통화 상태가 화면(패널·버튼)에 닿는 시점 | 훅이 다시 그려지는 같은 커밋 | **한 번의 layout 커밋 뒤**(값 공급자 → 셸 state → Provider). 페인트 전이라 화면 지연은 없음이 목표 — 실기로 확인 |
| 셸 재렌더 | 없음 | 통화 상태가 바뀔 때마다 셸 1회(통화 중 1초 타이머 포함). `children` 은 같은 요소라 방 화면 전체는 다시 그리지 않고 Provider 소비처만 갱신 |
| 1:1 방 | 임시 값 Provider | 같음(값 공급자 없음) |
| 언마운트(방 나감) | Bridge 언마운트 → 훅 정리(미디어 정리) | 값 공급자 언마운트 → 같은 정리 |
| `localVideoRef`·`bindRemoteVideo/Audio` | 훅이 만든 객체 그대로 전달 | 같은 객체 그대로 전달(복사 금지) |

- 1:1 통화·수신 화면·CallKit·PushKit·FCM·Agora 연결·통화 기록·서버 API: **경로에 없음**(그룹방 방 화면 안의 그룹 통화 컨텍스트만).

## 5. 설치된 구 바이너리 호환

웹 코드만 바뀐다(네이티브 파일 무변경). 최근 14일 `user_devices`(is_active) 기준 설치 버전 — 모두 같은 웹을 불러오므로 앱 재시작으로 반영, 재설치 불필요.

| 플랫폼 | 버전(사용자 수) |
|---|---|
| Android | 1.2.5 (38) 2 · (37) 14 · (24) 2 · (20) 1 |
| iOS | 1.2 (21) 2 · (22) 2 · (23) 1 · (28) 1 · (30) 1 |

## 6. 회귀 위험 · 확인 방법

| 위험 | 확인 |
|---|---|
| 통화 상태가 화면에 한 커밋 늦게 반영 → 버튼 중복 탭·패널 깜빡임 | 실기 행렬 전 항목에서 패널 전환 캡처 · 「통화 중」 버튼 상태 |
| 값 공급자가 값을 올리는 반복 렌더(무한 루프) | 값이 바뀔 때만 올림 + 단위 테스트(같은 값 재전달 시 셸 재렌더 없음) |
| 그룹 통화 수신(방 밖·방 안) | 방 밖 수신은 전역 수신 경로라 영향 없음 · 방 안 수신은 실기 행렬 |
| 방 나갈 때 미디어 정리 누락 | 통화 중 방 나가기 → 마이크·카메라 표시등 꺼짐 확인 |

## 7. 롤백

단독 커밋 1개 → `git revert <SHA>` 후 main 반영(웹만, 앱 재시작).

## 8. 실기기 검증 (통화 규정 5번 · Production SHA 매 테스트 기록 · 서버 시각은 운영 DB 대조)

- 화면: 그룹방 첫 진입(앱 재시작 직후) — 대화 상자 재생성 없음·위로 튀지 않음(운영 브라우저 생성·삭제 기록 + 기기 화면 녹화)
- 그룹 통화(Android ↔ iPhone, 3인): 음성·영상 발신 / 수신·수락 / 거절 / 벨 중 취소 / 취소 후 지연 푸시(재울림 없음) / 통화 중(busy) / 무응답 타임아웃 / 정상 종료 후 즉시 재발신 / 통화 중 방 나가기(미디어 정리)
- 각 항목: 발신 시점 · 세션 생성(`community_messenger_call_sessions`) · 발송(`notification_deliveries`) · 수신 화면 표시 · 연결 · 종료 시각
- 1:1 통화: 발신·수신 1회씩(경로 밖임을 확인)

## 9. 승인 요청 범위

위 3번 설계(셸 트리 고정 + 형제 값 공급자)만, 통화 단독 커밋 1개. 다른 메신저 변경과 묶지 않는다.
