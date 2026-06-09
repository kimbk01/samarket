# Community 메신저 통화 상태 머신 (코드 정렬안)

**범위**: 기존 `community_messenger_call_sessions` 원장 + 감사(`community_messenger_call_events`)—**1:1·그룹 미디어는 Agora SFU** (`call-provider`). 레거시 `community_messenger_call_signals`는 direct 터미널 hangup 등 제한적.  
**금지**: 새 테이블 생성, unread/badge/bootstrap/prefetch/message list 변경은 본 문서 범위 밖.

---

## 실제 진입 경로 (코드 기준)

### A. 1:1 Direct Call — **음성 통화 MVP 실경로 (Agora)**

제품에서 일반 사용자가 거는 **1:1 통화**는 아래 체인으로 동작한다.

| 단계 | 코드·경로 |
|------|-----------|
| 방에서 발신 트리거 | `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts` — `startManagedDirectCall` |
| 세션 생성·네비게이션 | `lib/community-messenger/call-session-navigation-seed.ts` — `startOutgoingCallSessionAndOpen` |
| 전용 통화 페이지 | `app/(main)/community-messenger/calls/[sessionId]/page.tsx` → `/community-messenger/calls/[sessionId]` |
| 통화 UI·미디어 | `components/community-messenger/CommunityMessengerCallClient.tsx` — **Agora** 기반 조인·상태 |

1:1 방 UI에서는 `MessengerRoomGroupCallShell`이 **`DIRECT_ROOM_GROUP_CALL_STUB`** 을 쓰므로, 그룹용 WebRTC 훅 그래프는 **로드되지 않는다**.

### B. Group Call — Agora SFU + 방 오버레이

| 단계 | 코드·경로 |
|------|-----------|
| Provider | `lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge.tsx` |
| 훅 | `lib/community-messenger/use-community-messenger-group-call.ts` |
| Agora 세션 | `lib/community-messenger/call-provider/group-agora-session.ts` |
| 토큰 | `GET /api/community-messenger/calls/sessions/[sessionId]/token` (group 허용) |
| UI | `components/community-messenger/call-ui/GroupRoomCallOverlay.tsx` |
| 컨텍스트 스텁(1:1) | `lib/community-messenger/room/community-messenger-group-call-context.tsx` — `DIRECT_ROOM_GROUP_CALL_STUB` |

그룹 방에서만 `startOutgoingCall`·패널·Agora 조인이 살아 있다. 세션 PATCH: `accept` / `reject` / `cancel` / **`leave`**(개인 퇴장) / **`end`**(전체 종료).

### 미연결·레거시 후보 (파일 주석·본 절로 분류)

| 파일 | 역할 | 실경로 |
|------|------|--------|
| `lib/call/call-session-state.ts` | 패널+transport → phase 합성 | `use-call-session.ts` 등 레거시 참고용 |
| `lib/call/use-call-session.ts` | `deriveCallSessionPhase` 래퍼 | **import 없음** |

(데드 코드 정리로 제거됨: 옛 P2P 1:1 훅 `use-community-messenger-call.ts`, UI 미사용 `call-machine.ts`.)

---

## 1. 제품 상태 어휘 vs 실제 UI 타입 (매핑)

문서·기획에서 쓰는 이름과, **1:1 Agora 클라**가 쓰는 `CallPhase`(`components/messenger/call/call-ui.types.ts`)는 아래처럼 맞춘다.

| 제품/문서 (이 문서) | 1:1 Agora UI (`CallPhase`) | 비고 |
|---------------------|----------------------------|------|
| **idle** | (패널 없음 / 라우트 이탈) | |
| **ringing** | `ringing` | |
| **connecting** | `connecting` | 수락 직후·Agora 조인 전 등 |
| **active** | **`connected`** | 문서의 **active = 코드 `connected`** |
| **ended** | **`ended`** | DB `ended` |
| **rejected** | **`declined`** | DB `rejected` |
| **missed** | `missed` | |
| **cancelled** (DB) | UI phase는 주로 **`ended`** 로 흡수 | `CommunityMessengerCallClient` 의 `resolveDirectCallPhase`가 `cancelled` → phase `ended`. **문구**는 `session.status === "cancelled"` 분기로 “통화 취소” 등 **취소 전용 카피** 보정 |
| **busy** | (별도 phase 없음) | `peer_busy` HTTP·토스트; 세션 행 없음 |
| **failed** | UI에 **`failed` 분기는 있으나** 아래 §8 참고 | |

### 그룹 훅 (`use-community-messenger-group-call`)

- 패널 모드: `dialing` | `incoming` | `connecting` | `active` — 제품 **ringing** 에 가깝게 `dialing`/`incoming` 으로 표현.
- 종료 패널 `GroupCallEndedState.reason`: `"ended" | "declined" | "missed" | "failed" | "canceled"` — DB **`cancelled`** ↔ **`canceled`** (ICE `failed` 와 무관). 제품 **rejected** ↔ **`declined`**.

---

## 2. DB `status` 매핑 (`community_messenger_call_sessions.status`)

**체크 제약 (현행 스키마)**:

```7:7:supabase/migrations/20260605001000_community_messenger_webrtc_signaling.sql
  status text not null check (status in ('ringing', 'active', 'ended', 'rejected', 'missed', 'cancelled')),
```

| DB `status` | 제품 클라 상태 | 비고 |
|-------------|----------------|------|
| `ringing` | ringing (+ connecting 혼재 가능) | |
| `active` | active(**connected**) | Agora는 DB가 `active`인 뒤에도 로컬 조인·원격 트랙 전까지 **connecting**으로 보일 수 있음 |
| `ended` | ended | |
| `rejected` | rejected(**declined**) | |
| `missed` | missed | |
| `cancelled` | ended + **취소 문구** | UI phase는 종종 `ended`로 통합 |

### connecting / busy / failed — DB 컬럼

**결론 (변경 없음)**: `status` CHECK 확장 없이, connecting/busy/failed 는 **클라 임시** 또는 **`ended_reason`** / 감사 이벤트로 표현.

---

## 3. 이벤트 매핑

### 3.1 HTTP·세션 액션 (A/B 공통)

| 제품 이름 | 의미 | 구현 |
|-----------|------|------|
| **call.invite** | 세션 생성 | `POST .../rooms/:roomId/calls` |
| **call.accept** | 수락 | `PATCH` `action: "accept"` |
| **call.reject** | 거절 | `action: "reject"` |
| **call.cancel** | 발신 취소 | `action: "cancel"` |
| **call.end** | 종료 | `action: "end"` |
| **call.busy** | 발신 불가 | HTTP `peer_busy` 등 — 행 없음 |
| **call.timeout** | missed 유도 | 클라/정책에 따라 `PATCH` `action: "missed"` |

### 3.2 WebRTC 시그널 (그룹·레거시 P2P 경로)

| 이름 | 저장소 |
|------|--------|
| offer / answer / ice | `community_messenger_call_signals` |

Agora 1:1 경로는 **관리 연결 토큰·채널 조인**이 중심이며, 시그널 테이블 사용 패턴은 P2P와 다르다. 상세는 `docs/call-signaling-contract.md` 및 Agora 연동 코드를 따른다.

### 3.3 감사 `community_messenger_call_events`

**CHECK (`event_type`)**: `invited`, `ringing`, `accepted`, `declined`, `canceled`, `missed`, `connected`, `ended`, `timeout` — `supabase/migrations/20260616140000_community_messenger_call_events.sql`

**삽입 경로 (`lib/community-messenger/service.ts`)**: `appendCommunityMessengerCallSessionEvent` 단일.

| 항목 | 코드 동작 | 비고 |
|------|-----------|------|
| 첫 이벤트 | 세션 생성 시 **`ringing`만** 기록 | CHECK 의 **`invited`는 현재 삽입 없음** |
| 거절·제품 어휘 | **`declined`** (`auditEventTypeForAction`) | 문서/제품의 **rejected** 와 이름 불일치 |
| 취소 | **`canceled`** (미국식 철자, CHECK 동일) | **cancelled**(영국식) 이벤트 타입 없음 |
| 연결 완료 | **`connected` 미삽입** | 수락 시 **`accepted`** 만 기록 |
| 링 타임아웃 | 클라가 **`missed`** 액션 시 **`missed`** 이벤트 | CHECK 의 **`timeout` 미삽입** |

새 이벤트 타입 추가·CHECK 변경 없이, 위는 **문서·분석용 불일치 표**로만 유지한다.

---

## 4. UI 표시 (요약)

| 해석 | 1:1 Agora (`CommunityMessengerCallClient` / `CallScreen`) |
|------|------------------------------------------------------------|
| ringing | 발신 “전화 거는 중 …” / 수신 벨 UI |
| connecting | “연결중…” 등 |
| **connected** (= 문서 active) | “통화 중” |
| ended / cancelled 문구 | phase는 `ended`에 가깝게 두고 **status로 취소 vs 종료** 문구 분기 |
| declined (= 문서 rejected) | “거절됨” |
| missed | “부재중 알림” 등 |
| busy | 인입 없음·토스트 (`peer_busy`) |

---

## 5. 전이·금지 전이

한 `room_id` 당 `ringing`/`active` 세션 **하나**(부분 유니크 인덱스) 등 **원칙은 동일**하다.  
다만 **A(Agora)** 와 **B(그룹 WebRTC)** 는 **서로 다른 클라이언트 상태 모듈**을 타므로, “단일 statechart 파일”이 아니라 **두 갈래**로 이해한다.

**금지 전이**(터미널 → 다시 live 등)는 이전과 동일 — 새 세션으로 재시작.

---

## 6. 서버 영속 vs 클라 임시 vs 이벤트

(이전 버전과 동일 개념) — DB `community_messenger_call_sessions` + `ended_reason` + `community_messenger_call_events` + (경로별) 시그널·Agora 메타.

---

## 7. 바쁨(busy)

서버 `userHasActiveDirectCallSession`: 상대 **active** 1:1 일 때 `peer_busy` — **DB `busy` 컬럼 없음**.  
관리자 **busy_auto_reject_enabled** 등은 기존 설명 유지.

---

## 8. Timeout — 이중 기준 문제 (코드 현황)

| 출처 | 기준 | 용도 |
|------|------|------|
| `use-community-messenger-group-call.ts` | 그룹 WebRTC 링·missed 등 타이머 | 타이머 만료 시 `PATCH missed` 등(1:1 Agora는 `CommunityMessengerCallClient`·`messenger-call-ring-timeout` 등 별도) |
| `GlobalCommunityMessengerIncomingCall` + `CallOverlay` | **`incoming_ring_timeout_seconds`** (기본 **45**, 관리자 설정) | 수신 오버레이 **남은 시간 표시** |

**문제**: 발신/훅은 **35초**, 수신 UI 카운트다운은 **기본 45초**로 **불일치**할 수 있다. 오버레이는 **자동 missed PATCH를 걸지 않고 표시만** 하는 설계이면, 실제 종료 시점은 **발신 측 타이머·서버·동기화**에 더 의존한다.

**문서 권장 (구현 과제)**: 벨 길이의 **최종 단일 기준**은 **`incoming_ring_timeout_seconds`** 로 통일하고, 발신 missed 타이머·표시·(필요 시) 서버 정책을 **같은 값**에서 파생시키는 것이 맞다.

---

## 9. 알려진 코드 불일치 (문서만 기록 — 수정은 별도 PR)

다음은 **문서 정렬을 위해 명시**하며, 본 파일만으로는 코드를 바꾸지 않는다.

| 주제 | 내용 |
|------|------|
| **그룹 cancelled → ended reason** | `use-community-messenger-group-call.ts`: 세션 `cancelled` 종료 시 `showEndedPanel` 에 **`reason: "failed"`** 로 넣는 분기가 있다. 의미상 **취소(cancelled)** 와 **실패(failed)** 가 섞일 수 있음 → **수정 후보**. |
| **1:1 Agora `failed` phase** | `CommunityMessengerCallClient` 의 `resolveDirectCallPhase`는 **`failed` 를 반환하지 않는다**. Agora 조인 실패는 **`errorMessage`** 등으로 처리되며, `CallScreen` 의 **`phase === "failed"`** 문구 분기는 **안정적으로 도달하지 않을 수 있음** → **음성 MVP 전 필수 보강 후보**. |
| **옛 P2P 1:1 훅** | `use-community-messenger-call.ts` 는 **레포에서 제거됨** — 문서는 **Agora** `CommunityMessengerCallClient` 기준으로만 맞춘다. |

---

## 10. 결과 보고 슬롯 (본 문서 개정)

| 항목 | 내용 |
|------|------|
| DB `status` CHECK 확장 | **불필요** (기존 결론 유지) |
| 1:1 MVP 경로 | **Agora** (`CommunityMessengerCallClient`) 로 문서 반영 완료 |
| 이중 스택 | **A Direct Agora / B Group WebRTC** 로 분리 기술 완료 |

---

## 다음 구현 우선순위 (권장 1~5)

1. **링 타임아웃 단일화**: `incoming_ring_timeout_seconds` 를 단일 소스로 두고, **35s 하드코드·45s 표시** 상충 제거.  
2. **Agora 조인 실패 → 터미널 UI**: `resolveDirectCallPhase` 또는 동등 로직으로 **`failed`(또는 명확한 오류 종료)** 가 일관되게 보이도록 보강.  
3. **그룹 훅 cancelled 처리**: `showEndedPanel` 의 **`cancelled` → `reason: "failed"`** 오분류 수정.  
4. ~~**레거시 정리**~~: `use-community-messenger-call.ts` 데드 코드 제거 및 교차 참조 정리 **완료**.  
5. **감사 로그 정렬**: `call.invite` 첫 이벤트 `ringing` vs `invited` 등 서버·문서 한 줄로 통일.

---

## 참고 (코드·스키마)

- 1:1 통화 페이지: `components/community-messenger/CommunityMessengerCallClient.tsx` — `resolveDirectCallPhase`
- 그룹 훅: `lib/community-messenger/use-community-messenger-group-call.ts`
- ~~미연결 P2P 훅~~: 제거됨 — 1:1은 `CommunityMessengerCallClient.tsx`
- 세션 스키마: `supabase/migrations/20260605001000_community_messenger_webrtc_signaling.sql`
- 감사·`ended_reason`: `supabase/migrations/20260616140000_community_messenger_call_events.sql`
- 방당 하나의 live 세션: `supabase/migrations/20260611160000_community_messenger_one_live_call_per_room.sql`
- 시그널 계약: `docs/call-signaling-contract.md`
