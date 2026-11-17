# 그룹 채팅 프레즌스·타이핑 (수치 정책)

100+ 멤버에서 **전원 동기화 금지**. 아래 값은 기본 권장; 제품별로 env 로 조정 가능.

---

## 1. Active in room (이 방 화면을 보는 중)

레거시 Telegram 기준 (Owner 2026-11-18 「권장안대로 반영」, P3). 근거: Telegram Android `ChatActivityEnterView` 재전송 `lastTypingTimeSend < now - 5000`(5초) · `MessagesController` `timeToRemove = 5900`(5.9초) · 이름 규칙 `MessagesController` 11340-11367.

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| 발신 구동 | 입력창 글자 변경(키 입력) | 타이머 폴링 없음 |
| 재전송 간격 | **5 s** (입력이 이어지는 동안) | 마지막 발신 뒤 5초가 지난 다음 글자 변경 때 `typing:start` 1회 |
| 수신 유지 | **5.9 s** | 마지막 `typing:start` 뒤 5.9초 지나면 해제(정리 주기 1초) |
| 유휴 중지 | **2.6 s** 무입력 → `typing:stop` 1회 | |
| 즉시 중지 | 초안 비움(전송 포함) · 입력창 blur · 화면 숨김 · pagehide · 방 나감 | |
| 조건 | 화면 보임 + 입력창 포커스 | 저장 초안 복원만으로는 보내지 않음 |
| 해제 | 그 사람 메시지 도착 시 즉시 | `typing:stop` 유실 대비 |
| 인원 상한 | 없음 | 레거시 동일 |
| 전송 경로 | Realtime **Broadcast** (비공개 토픽 `community-messenger-typing:<roomId>`, REST 발신, DB INSERT 아님) | 1:1 차단 관계는 발신 권한 없음(`internal.cm_can_signal_typing_in_room`, Owner 승인 후 적용) |
| 수신 UI (방 머리글) | 1:1 「입력 중」 · 그룹 1명 「{이름} 입력 중」 · 2명 「{이름1}, {이름2} 입력 중」 · 3명+ 「{이름1}, {이름2} 외 {N}명 입력 중」 · 이름 없음 「{N}명 입력 중」 + 점 3개 애니메이션 | 타임라인 입력 중 행 없음 |
| 수신 UI (대화 목록) | 미리보기 자리에 「입력 중」 + 점 | 화면에 보이는 행만 수신(최대 15방) |

---

## 4. 최적화 모드 연동

인원 [messenger-performance-targets.md](./messenger-performance-targets.md) §2 “그룹 최적화 모드”에 도달하면:

- 하트비트 간격 **2배**
- 타이핑 전송 상한 **2배 엄격**(또는 비활성)
- presence 샘플 **8명**으로 축소

코드 상수는 [lib/community-messenger/monitoring/thresholds.ts](../lib/community-messenger/monitoring/thresholds.ts) `MESSENGER_PERF_DESIGN_LIMITS.groupParticipantsOptimize` 와 맞춘다.
