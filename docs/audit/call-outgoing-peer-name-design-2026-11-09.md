# 발신 화면 상대 이름 「대화 상대」 결함 — 원인 확정·개선안 (2026-11-09)

상태: **Owner 「구현 승인」 2026-11-09 — 구현 반영**. 통화 변경 규정(AGENTS.md 「통화 변경 규정」) 3번에 따른 사전 문서.

## 0. Owner 지시 원문

> 채팅에서 친구 찾기후 바로 통화를 발신 하면 수신상대가 대화상대 인 부분이고 친구아닌 채팅 방에서 친구를 발신 하면 상대방의 이름이 나오는 구조로 되어 있다 … 뭐 때문에 변경 된 부분인지 … 아울러 친구 찾기에서 통화를 발생시 발신이 안되는 부분이 1회 발생 되었다
> 땜빵으로 하지 말고 정확한 원인에 개선안을 끝까지 확인 해서, 개선안을 보고 해라

## 1. 증거 (운영 DB·서버 로그, 2026-11-09 PHT)

| 시각 | 출처 | 내용 |
|---|---|---|
| 14:55:34~39 | Vercel `GET /api/community-messenger/users` | BK(iPhone, 1.2 (30)) 친구 찾기 검색 |
| 14:55:45.7 | Vercel `POST /api/community-messenger/rooms` · DB `community_messenger_rooms` | BK↔김선희 1:1 방 `cbacbd57…` **신규 생성** (기존 방 없음) |
| 14:55:46.8 | Vercel `[call-permission] allow` | `relationLabel: 'stranger'` — **친구 아님** |
| 14:55:47.3 | DB `call_sessions`·`call_events` | 영상 세션 `131106ad…` ringing |
| 14:55:47.6 | DB `notification_deliveries` | FCM `call_ringing` sent → 김선희 Android(1.2.5 (37)) |
| 14:55:47.988 | 같은 행 `nativeAck.receivedAt` | 수신 기기 네이티브 수신 확인 (screenInteractive=true) |
| 14:55:59.0 | DB `call_events` | 발신자 취소(canceled), 11초 |
| 14:56:03 | Vercel `rooms/cbacbd57…/bootstrap`·`mark_read` | BK 가 그 방에 들어감 |
| 14:56:08.3 | DB·Vercel | 방 안에서 재발신 `48c89daf…` → 14:56:15 수락 → 14:58:22 종료 |

→ 「대화 상대」 발생 조건(친구 아님 + 기존 방 없음)과 정확히 일치. 발신 화면 실제 캡처는 없음 → 화면 판정 **NOT_PROVEN**.

## 2. 원인 (코드 확정)

### 2-1. 1차 원인 — 홈 확인창이 확인창 이름을 버리고 다시 추측
- `components/community-messenger/CommunityMessengerHome.tsx:4213` 확인창 「발신」 → `startFriendDirectCall(next.peerUserId, next.kind)` — 확인창에 표시한 `next.peerLabel` 를 전달하지 않음.
- `startFriendDirectCall`(2528행)이 이름을 다시 추측: 친구 목록 → 기존 1:1 방 제목 → 없으면 **`t("cm_ui_chat_peer_fallback")` = 「대화 상대」** 를 **실제 이름처럼** 발신 엔진에 넘김.
- 친구 찾기 결과 프로필(`1692행 onOpenProfile`)은 `user.displayName` 을 갖고 있지만 버려짐.
- 비친구 채팅방에서는 2번째(방 제목)에서 이름을 찾으므로 정상으로 보였음.

### 2-2. 근본 원인 — 발신 엔진이 서버의 정답 이름을 화면에 반영하지 않음
- 서버 세션 생성 응답 `created.session.peerLabel` 은 상대 프로필 닉네임으로 항상 채워짐 (`lib/community-messenger/service.ts` `mapCallSession` 5211행).
- 그러나 `lib/community-messenger/call-v4/call-v4-actions.ts` `callV4CreateOutgoing` 은 생성 후에도 **클라이언트가 넘긴 `input.peerLabel` 만** 사용:
  - 웹 identity: `buildOutgoingIdentity` 339행 `peerLabel?.trim() || session.peerLabel` — 클라 값이 「대화 상대」면 서버 값 무시
  - Android 네이티브 bind: 861행 `peerName: input.peerLabel` / fallback 897행
  - iOS CallKit·네이티브 발신: 917행 `peerName: input.peerLabel`
- 그래서 진입점이 대체 문구나 빈 값을 넘기면 그대로 화면에 남음. 같은 원인의 다른 증상(코드상, 실기기 NOT_PROVEN):
  - 거래 채팅 발신(`components/chats/TradeChatCallHeaderButtons.tsx:108`)은 이름을 넘기지 않음 → Android 네이티브 `safePeerName` 이 **「DIBAY」** 로 표시, 생성 후에도 보정 안 됨.

### 2-3. 언제·무엇 때문에 드러났나 (git)
| 커밋 | 날짜 | 내용 |
|---|---|---|
| `0bd42dbd5` | 2026-07-06 | 발신 확인창 도입 — 확인창 「발신」이 이름 없이 재추측하도록 연결 (2-1 결함 코드 생성) |
| `0b3dd1bd2` | 2026-10-24 | 상호 친구 F-1 — **친구 찾기 결과 행 → 프로필 시트** 신설. 이때부터 비친구·방 없는 상대에게 홈 확인창으로 발신하는 경로가 생겨 결함이 드러남 |
| (기존) | 2026-09-23 이전부터 | 2-2: 발신 엔진이 서버 이름으로 보정하지 않는 구조 |

이전에 문제가 없던 이유: 10-24 전에는 친구 찾기 결과에서 프로필·통화로 가는 경로가 없어, 홈 확인창 발신은 항상 친구 목록(이름 있음) 대상이었음.

## 3. 개선안 (2개 원인 모두 · 웹 2파일)

규칙 (단일): **발신 화면 이름 = 진입 화면이 사용자에게 보여 준 실제 이름. 진입 화면이 이름을 모르면 서버 세션 이름. 대체 문구는 이름으로 전달하지 않는다.**
- 클라 이름 우선 유지 이유: N-2(`129fb1efd`, 10-26)·매장 주문방(진입 화면이 정한 이름) 동작을 바꾸지 않기 위함. 서버 값으로 덮어쓰면 매장 주문방 등 도메인 이름이 닉네임으로 바뀌는 회귀 발생.

### 3-1. `components/community-messenger/CommunityMessengerHome.tsx`
- `startFriendDirectCall(peerUserId, kind, peerLabelOverride?)` — 확인창 `onConfirm` 이 `next.peerLabel` 원본 이름을 전달.
- 확인창 상태에 **표시용 이름**과 **발신용 이름**을 분리: `openHomeOutgoingConfirm` 이 실제 이름(override → 친구 목록 → 방 제목)을 `dialPeerLabel` 로 저장하고, 모를 때만 확인창 **표시**에 「대화 상대」를 쓰며 발신에는 빈 값 전달.
- `startFriendDirectCall` 재추측 경로도 동일 — 대체 문구를 `startDirectCall` 에 넘기지 않음.

### 3-2. `lib/community-messenger/call-v4/call-v4-actions.ts`
- 세션 생성 직후 1회 `const dialPeerName = input.peerLabel || incomingCallPeerNicknameLabel(created.session.peerLabel) || null;`
- identity(`buildOutgoingIdentity`), Android bind·fallback establishment, iOS establishment 에 `input.peerLabel` 대신 `dialPeerName` 사용.
- 생성 전 Android 준비 화면(612행)은 서버 응답 전이므로 `input.peerLabel` 유지 — 값이 없으면 기존처럼 「DIBAY」가 잠깐 보이고, bind 시 Android `Session` 이 `dialPeerName` 으로 다시 그려짐 (`NativeVoiceCallRuntime.bindOutgoingFromPreparing` 504행 → `NativeVoiceCallActivity.applyState` 702행, 영상 동일 구조). 네이티브 코드 무변경.

### 3-3. 바뀌는 동작 / 바뀌지 않는 동작
| 경로 | 현재 | 수정 후 |
|---|---|---|
| 친구 찾기 → 프로필 → 발신 (비친구·방 없음) | 「대화 상대」 | 상대 닉네임 |
| 친구 목록 발신 | 닉네임 | 동일 |
| 비친구 기존 방 발신 | 방 제목 | 동일 |
| 거래 채팅 발신 Android | 「DIBAY」 (코드상) | 생성 후 상대 닉네임 |
| 매장 주문방·통화 탭 다시 걸기(N-2) | 진입 화면 이름 | 동일 (클라 이름 우선) |
| 수신자 화면·푸시 이름 | 서버 프로필 | 무변경 |

## 4. 영향 범위
- 변경 파일: 위 2개 (웹). 서버·DB·푸시·네이티브(`android/**`·`ios/**`) 무변경 → **웹 배포 · 앱 재빌드 불필요**.
- 영향 경로: 발신 시작·Android 준비/bind·iOS CallKit 발신 표시 이름·웹 발신 화면 identity·통화 독(CallDock)·통화 기록 표시(서버 계산, 무변경).
- 신호·세션 생성·VoIP/FCM 발송·취소/거절/종료/부재중·상태 폴링·CallKit 종료 신호: 이름 값 외 무변경.
- 설치 구 바이너리 호환: Android bind 이름 반영(`0f9ed2106`, 09-23)은 현재 설치본 1.2.5 (37) 포함 이후 모든 빌드에 있음. iOS establishment `peerName` 인자는 1.2 (30) 에 있음 (`NativeVoiceOutgoingCallCoordinator.swift`·`NativeVideoOutgoingCallCoordinator.swift`).

## 5. 회귀 위험 · 대응
| 위험 | 대응 |
|---|---|
| 서버 `peerLabel` 이 「닉네임 (@아이디)」 형태 | `incomingCallPeerNicknameLabel` 로 N-2 와 같은 규칙 정리 |
| 매장 주문방 이름이 닉네임으로 바뀜 | 클라 이름 우선 유지로 방지 (매장 화면은 이름을 넘김) |
| 이름 값 변경이 통화 동작에 영향 | 이름은 표시 전용 필드 — 테스트로 bind/establishment 다른 인자 불변 확인 |

## 6. 롤백
단독 커밋 1개 `git revert` → main 1회 반영. DB·네이티브 변경 없음.

## 7. 검증
- 코드: `vitest` — `call-v4-outgoing-native-fallback.test.ts` 에 (a) 클라 이름 없음 → 서버 이름으로 identity·bind·iOS establishment (b) 클라 이름 있음 → 클라 이름 유지 (c) 홈 확인창 onConfirm 이 확인창 이름 전달. `typecheck:build`·`typecheck:test`·변경 파일 eslint.
- 실기기 (Production SHA 매 테스트 기록, 서버 시각 운영 DB 대조):
  1. 친구 찾기 → 비친구·방 없음 → iPhone→Android 음성·영상, Android→iPhone 음성·영상: 발신 화면 이름 = 닉네임
  2. 친구 목록 발신 / 비친구 기존 방 발신: 이름 불변
  3. 거래 채팅 Android 발신: 이름
  4. 매장 주문방 구매자 발신: 이름 불변
  5. 통화 탭 다시 걸기: 닉네임만 (N-2 불변)
  6. 규정 최소 행렬: 거절·벨 중 취소·취소 후 지연 푸시 재울림 없음·통화 중·무응답 타임아웃·정상 종료 후 즉시 재발신

## 8. 발신 안 됨 1건 — 원인 확인 못 함
- 친구 찾기 경로 발신은 오늘 1건(`131106ad…`, 14:55:47)뿐. 서버 기준 방 생성·세션 생성·FCM 발송·**수신 기기 네이티브 수신 확인까지 PASS**.
- 수신 화면이 떴는지, 발신 iPhone 화면이 떴는지는 두 기기 모두 이 Mac 에 연결되지 않아 기기 로그 없음 → **NOT_PROVEN**.
- 재발신(방 안, 성공)과 서버·푸시·수신 확인 값이 동일 (fsiAllowed=false·channelImportance=-1000 도 동일) → 서버·푸시 쪽 차이 없음.
- 위 2절 결함과 인과 관계는 코드상 없음 (이름은 표시 값만). 다른 원인으로 단정하지 않음.

## 9. 범위 밖 발견 (보고만)
- 매장 주문방 구매자 발신: 확인창은 매장명(`resolveStoreOrderBuyerVoicePeerLabel`)을 보여 주지만 실제 발신은 `startManagedDirectCall` 이 `snapshot.room.title` 을 넘김 (`CommunityMessengerRoomPhase2StoreOrderChrome.tsx:207` → `use-messenger-room-phase2-controller.ts:735`). 확인창 이름 ≠ 발신 화면 이름 가능 — 실기기 미확인.
