# 그룹 채팅 프레즌스·타이핑 (수치 정책)

100+ 멤버에서 **전원 동기화 금지**. 아래 값은 기본 권장; 제품별로 env 로 조정 가능.

---

## 1. Active in room (이 방 화면을 보는 중)

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| 하트비트 최소 간격 | **60–90 s** | 그 사이 추가 PATCH 금지 |
| 전송 조건 | `document.visibilityState === 'visible'` | 백그라운드 탭에서는 전송 안 함 |
| 서버 집계 | 최근 T **120 s** 이내 하트비트만 “활성” | 오래된 항목은 제외 |

**UI:** “지금 보는 중 **약 N명**” — 서버는 **샘플 최대 15명** + `approxViewerCount`(버킷/카운터)만 반환. 전 멤버 온라인 일괄 조회 없음.

---

## 2. Global online (목록·친구)

- 그룹 방 입장 시 **전원** 온라인 상태를 로드하지 않음.
- 별도 **얇은** presence (예: 사용자 단위 채널 또는 Redis TTL) — 그룹과 분리.

---

## 3. Typing 신호

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| 입력 디바운스 | **200–400 ms** | keydown 마다 전송 금지 |
| 전송 상한 | **1회 / 2–3 s** / 사용자 | 추가 타이핑 이벤트 드롭 |
| 조건 | 포그라운드 + 입력 포커스 | |
| 전송 경로 | Realtime **Broadcast** (동일 방 채널, DB INSERT 아님) | |
| 수신 UI | 이름 최대 **2명** + “외 N명” 집계 문구 | |

---

## 4. 최적화 모드 연동

인원 [messenger-performance-targets.md](./messenger-performance-targets.md) §2 “그룹 최적화 모드”에 도달하면:

- 하트비트 간격 **2배**
- 타이핑 전송 상한 **2배 엄격**(또는 비활성)
- presence 샘플 **8명**으로 축소

코드 상수는 [lib/community-messenger/monitoring/thresholds.ts](../lib/community-messenger/monitoring/thresholds.ts) `MESSENGER_PERF_DESIGN_LIMITS.groupParticipantsOptimize` 와 맞춘다.
