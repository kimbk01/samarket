# E-C1 상세 설계 — 통화 중(busy) 기록 1건

- 작성: 2026-10-23 · Owner **정책 승인 2026-10-23 18:50 PHT** 후 구현 진행
- 상위: `docs/audit/messenger-2026-10-23-stage-e-scope-report.md` · 계획 §1 P2 · D4
- Owner 결정: E-F1 Contact LOCK **유지·E 보류** · 통화 P2 순서 **E-C1 → 발신자 안내 → E-C2 → E-C3**
- **승인 정책:** 권장안 C · API 옵션 A(`peer_busy` + `busyKind`) · **발신자 전용 표시** · 게이트/CallKit/VoIP/FCM 불변 · **DB 스키마 변경 없음**
- **call_stub 결론:** 공유 타임라인 행이라 수신자 숨김이 불가(스키마 없이) → **공유 stub 미작성**. 영속 = 터미널 세션 + call_log(목록 필터 발신자만) · 채팅 줄 = 발신 기기 로컬만.
- **제외:** SIDE-01·02·03·04·05·07 · E1/E2/E9/E10 · 희귀 · E-C2/E-C3 · main/Production(별도 승인)

---

## 1. 문제 (확정 사실)

| 사실 | 근거 |
|---|---|
| 1:1 발신 시 상대(또는 본인)가 다른 room 에서 live(`ringing`/`active`)이면 서버가 **세션 insert 전** `peer_busy` 반환 | `service.ts` busy 게이트 (`dialFresh`·비-fresh 분기) |
| 벨·VoIP·FCM·CallKit **없음** (정책 준수) | 세션 미생성 → incoming 디스패치 미진입 |
| **통화 기록 탭·DB call_logs 0건** | `createCommunityMessengerCallLog` 미호출 |
| 채팅 타임라인은 **클라 로컬 스텁만** (`appendLocalCallChatMessageForPeerBusy`) — 재설치·타기기·새로고침 후 사라질 수 있음 | `call-peer-busy-local-log.ts` · `call-session-navigation-seed.ts` |
| 본인 live 여도 API 오류 문자열이 **`peer_busy` 동일** → UI 「상대방이 통화중」 (C-17) | `service.ts` 19441–19455 · `cm_ui_call_peer_busy` |
| DB `call_sessions.status` / `call_logs.status` CHECK 에 **`busy` 없음** | 마이그레이션 core·webrtc |
| Authority: `peer_busy` → **missed 아님** · 세션 터미널 아님 | `dibay-call-authority-lock.md` |

---

## 2. 제품 목표 (E-C1만)

1. busy 판정 시 **영속 기록 정확히 1건** (발신 시도당).
2. **상대 통화 중** vs **발신자 본인 통화 중**을 기록·표시에서 구분.
3. 기존 busy 게이트·벨·푸시·CallKit·VoIP·live 세션 유니크 **동작 불변**.
4. E-C2(12상태)·E-C3(중앙 팝업)·발신자 안내 UX 고도화는 **다음 단계** — 본 설계는 기록·최소 문구 정합만.

---

## 3. 권장 설계 (선택 · 근거)

### 3.1 한 줄 요약

> busy HTTP 응답 **직전·동일 요청 경로**에서 **ringing/active 세션을 만들지 않은 채**,  
> **즉시 터미널 세션 1행 + call_log 1행 + call_stub 1행**을 쓰고,  
> API 오류를 `peer_busy` / `caller_busy` 로 분기한다.  
> incoming 푸시·CallKit·VoIP 디스패치는 **호출하지 않는다**.

### 3.2 왜 「터미널 세션」인가

| 대안 | 판정 |
|---|---|
| **(A) call_log만 · session_id null** | 가능하나 CUT4 스텁이 `sessionId` 바인딩·멱등 키를 세션에 둠 → 채팅방 영속 스텁이 약해짐. history만 채우면 방 메시지는 로컬 의존 유지. |
| **(B) ringing 세션 생성 후 즉시 cancel** | **금지.** 순간 live → 벨/푸시/경합 위험. |
| **(C) 권장: status=`cancelled` + ended_reason busy · started_at=ended_at 즉시 터미널 insert** | live 인덱스·busy 게이트 대상 아님(`ringing`/`active`만 live). CUT4 스텁·call_log `session_id` 유니크 유지. 기존 푸시 경로는 insert-ringing 이후에만 동작 → **호출 안 함**. |

### 3.3 본인 vs 상대 구분

서버 게이트에서 **이미 분기되는 조건**을 오류 코드에 반영한다 (동작 변경 없음 · 문자열만 분리).

| 조건 | 새 API `error` | `ended_reason` | 발신자 기록 라벨(초안) | 최소 안내(E-C1) |
|---|---|---|---|---|
| `userHasLiveDirectCallSessionOutsideRoom(caller)` 또는 dialFresh 외 caller live | **`caller_busy`** | `caller_busy` | 「내가 다른 통화 중」 | 기존 배너 계약에 `caller_busy` 추가 · i18n 신규 |
| peer live outside room | **`peer_busy`** (현행 유지) | `peer_busy` | 「상대 통화 중」 | 현행 `cm_ui_call_peer_busy` |

- Canonical reader: `resolveCanonicalTerminalReason` 에 `caller_busy` → 예: `busy_self`(신규) 또는 기존 `busy` + actor 플래그. **E-C1에서 taxonomy 확장은 최소** — presentation만 `caller_busy`/`peer_busy` wire를 구분.
- **missed / rejected 로 매핑 금지** (authority LOCK).

### 3.4 기록 1건 계약

동일 busy 응답에 대해:

1. `community_messenger_call_sessions` **1행**  
   - `status = cancelled` (CHECK 기존 값 · **스키마 busy 추가 없음**)  
   - `ended_reason = peer_busy | caller_busy`  
   - `started_at = ended_at = now` · `answered_at = null` · `duration` 개념 0  
   - `initiator = 발신자` · `recipient = 의도 peer` · `room_id` = 발신 시도 room  
2. `community_messenger_call_logs` **1행** (`session_id` FK · 유니크)  
   - `status = cancelled` (CHECK 기존 · **DB status에 busy 추가하지 않음**)  
   - `ended_reason` 동일 · `duration_seconds = 0`  
3. `community_messenger_messages` call_stub **1행** (멱등 `cm_call_stub:session:{id}`)  
   - `resolvedEvent = peer_busy` (본인은 동일 이벤트 + ended_reason으로 문구 분기, 또는 `resolvedEvent` 확장 `caller_busy` — 구현 시 presentation SSOT만)  
   - **`incrementUnread = false`** (부재중 아님 · Bell/아이콘 금지)  
   - room bump는 preview 갱신만 (unread +0)

**중복 방지:** session 1 → log/stub 유니크. 클라 `appendLocalCallChatMessageForPeerBusy`는 서버 스텁 도착 후 reconcile(동일 session/tmp 키) 또는 **서버 기록 성공 시 로컬 전용 append 생략**으로 이중 줄 방지.

### 3.5 표시

#### 통화 기록 탭 (`MessengerCallLogsPanel` / `presentCallHistoryRow`)

- 현행 버그: `remote_busy` canonical → displayType **`failed`** · 배지 「실패」 (`call-log-display-type.ts`).  
- E-C1 수정 범위:  
  - `ended_reason` ∈ {`peer_busy`,`caller_busy`} → canonical `remote_busy` / `self_busy`(신규)  
  - displayType 예: **`busy`** (신규) 또는 기존 `cancelled` 유지 + 배지 키만 분리  
  - 배지: 상대 「통화 중」 / 본인 「다른 통화 중」 (i18n)  
  - 색: 회색 계열(취소와 유사) · **빨강 부재중·실패 금지**  
  - `showDuration = false` · 재발신 가능(room/peer 유지)

#### 채팅방 기록 메시지 (call_stub)

- 공유 라벨 SSOT: 기존 `formatCallEventSharedListLabel` · `peer_busy` → `음성/영상 통화 · 통화 중`  
- 본인 busy: `… · 다른 통화 중`(또는 동등 en) — `ended_reason`/`resolvedEvent`로 분기  
- viewer tip(`encodeCallStubRoomTip`)은 발신자 기준 문구 우선  
- **수신자(바쁘던 쪽) unread 증가 없음** · 방이 열리면 스텁이 보일 수 있음(공유 타임라인). 수신자 전용 숨김은 E-C1 범위 밖(추가 승인 시).

### 3.6 서버 응답 계약 (변경 최소)

```text
POST .../rooms/:roomId/calls
→ 200 아님, ok:false
→ error: "peer_busy" | "caller_busy"
→ (신규, 선택) busyRecord: { sessionId, callLogId }  // 클라 로컬 스텁 멱등·이중 방지용
```

- **세션을 클라에 “성공 통화”로 넘기지 않음** (ok:false 유지 → CallKit/발신 UI 진입 없음).
- 기존 클라: `peer_busy`만 처리 → `caller_busy`는 구앱에서 generic 실패로 떨어질 수 있음 → §6 호환.

### 3.7 명시적 비범위 (건들지 않음)

- busy **게이트 조건**·`userHasLiveDirectCallSession*` 로직  
- VoIP/FCM/`incoming-call-voip-dispatch` · CallKit · PushKit  
- A1~A7 VoIP 종료 규칙 · missed 정책  
- E-C2 12상태 표 · E-C3 중앙 팝업 · 발신자 안내 UX 고도화(다음 단계)  
- 네이티브 바이너리  
- Contact/친구 · SIDE 대장 항목

---

## 4. DB 변경 필요 여부

| 항목 | 필요? | 설명 |
|---|---|---|
| `call_sessions.status` CHECK에 `busy` | **아니오** | `cancelled` + `ended_reason` |
| `call_logs.status` CHECK에 `busy` | **아니오** | 동일 |
| `ended_reason` 컬럼 | **이미 있음** (NEW-18) | wire 값만 추가 |
| 신규 테이블 | **아니오** | |
| RLS | **아니오**(기존 member 정책으로 initiator/recipient·caller/peer 충분) | |
| Owner DB 승인 | **마이그레이션 없으면 불필요** | CHECK 확장·새 테이블 시에만 별도 승인 |

→ E-C1 권장안은 **웹(서비스·표시·i18n)만**. 운영 DB 스키마 변경 없음.

---

## 5. 이전 버전·구 바이너리 호환

| 클라이언트 | 동작 |
|---|---|
| 구 웹/앱 (error=`peer_busy`만 인식) | 상대 busy: 현행과 동일. **본인 busy:** 서버가 `caller_busy`를 주면 구클라가 문구를 못 알아들을 수 있음 → **호환 옵션 A(권장):** API는 당분간 `error: "peer_busy"` 유지 + `busyKind: "peer"|"caller"` 필드 추가(구클라는 필드 무시·기록은 서버 영속). **옵션 B:** `caller_busy` 즉시 도입(구클라는 generic 실패 토스트 · 기록은 서버에 남음). Owner 구현 승인 시 A/B 확정. |
| 구 클라 로컬 스텁만 쓰던 기기 | 서버 스텁/로그가 생기면 **영속 1건**이 정본. 로컬 분·서버 분 이중 방지 로직 필수. |
| 구 `call_logs` 행 (ended_reason null) | 변경 없음. busy 행만 새 wire. |
| 표시 매핑 미배포 기기 | 서버에 기록은 있으나 탭에서 「실패/취소」로 잘못 보일 수 있음 → **표시 수정은 같은 웹 배포에 포함** (네이티브 재빌드 불요). |

---

## 6. 영향 범위 (해당 변경만 · 재감사 금지)

| 영역 | 영향 | 위험 완화 |
|---|---|---|
| POST calls busy 분기 | 터미널 세션+log+stub write 추가 | ringing insert·푸시 호출 **금지** 단위 테스트 |
| call_log / call_stub writer | busy 전용 진입점 또는 `createCommunityMessengerCallLog` 확장 | unread=false · missed 파이프라인 미호출 |
| 통화 기록 탭 presenter | busy ≠ failed 매핑 수정 | vitest display-type |
| 발신 시드 `peer_busy` 처리 | `caller_busy`/`busyKind` · 로컬 append 조정 | 이중 스텁 방지 |
| in-app notice | 최소 문구 키 분기 | E-C3 팝업 아님 |
| VoIP/CallKit/FCM | **없음** | 디스패치 미호출 증명 |
| live busy 게이트 | **조건 동일** | 회귀: busy 시 벨 0 |

---

## 7. 실기기 완료 기준 (E-C1 PASS)

Production SHA 고정 · callId(또는 sessionId)·`notification_deliveries` 대조. Android↔iPhone 각 방향.

| # | 시나리오 | PASS |
|---|---|---|
| 1 | I·X 통화 중 · S→I(같은 peer) 발신 | S에 **기록 1건** 「상대 통화 중」 · 채팅 스텁 1 · **I 벨·VoIP·FCM 수신 0** · deliveries incoming 0 |
| 2 | S 본인이 다른 방 통화 중 · S→I 발신 | S에 **기록 1건** 「내가/다른 통화 중」 · **상대 busy 문구 아님** · I 벨 0 |
| 3 | 같은 시도 재조회(통화 탭·방 재입장·타기기 로그인) | **여전히 1건** (로컬만 아님) · 이중 줄 없음 |
| 4 | busy 직후 기존 통화 종료 → 즉시 재발신 | 정상 링·연결 (게이트 오염 없음) |
| 5 | 무응답·거절·취소 1회씩 | 기존 라벨·unread 정책 유지 (busy와 혼동 없음) |

측정 안 함 = NOT_PROVEN. FAIL 시 §8.

---

## 8. 실패 시 복구

1. **즉시:** busy 기록 write 플래그/함수만 비활성(게이트는 현행 `peer_busy` 반환 유지) → 벨 없는 정책은 유지, 기록만 다시 0건.  
2. **잘못 생성된 터미널 세션·log·stub:** 해당 `ended_reason in (peer_busy,caller_busy)` 행만 운영 정리(Owner DB 승인 후). live 세션·A1 fence 건드리지 않음.  
3. **표시 회귀(실패로 보임):** presenter 매핑만 핫픽스 · 네이티브 재빌드 불요.  
4. **푸시가 나가면:** E-C1 FAIL · 디스패치 호출 경로 제거가 최우선(기록 기능보다 우선).  
5. 복구 커밋은 **통화 busy 기록만** 단독 · SIDE·친구·E-C2와 묶지 않음.

---

## 9. 구현 시 예상 터치 (승인 후 · 지금은 수정 금지)

- `lib/community-messenger/service.ts` — busy 분기 write · error/`busyKind`  
- call_log / call_stub 경로 · `call-event-message` / `call-event-presentation` / `call-log-display-type`  
- `call-session-navigation-seed.ts` · `call-peer-busy-local-log.ts` · notice contract · i18n  
- 관련 vitest만  
- **android/** · **ios/** · Capacitor · Contact LOCK **수정 금지**

배포 구분(구현 시): **웹만** (앱 재시작).

---

## 10. Owner 승인 요청

1. **§3 권장안(C) 채택** 여부 (터미널 `cancelled` 세션 + log + stub · 스키마 무변경).  
2. API 호환 **옵션 A**(`peer_busy` + `busyKind`) vs **B**(`caller_busy` 즉시).  
3. 수신자 방 타임라인에 busy 스텁 **공유 노출 허용**(unread=0) 확정.  
4. 승인 시 **구현 → 로컬 검증 → (별도) main/Production → 실기기 §7**.

승인 전 코드·DB·네이티브·배포 **금지**.
