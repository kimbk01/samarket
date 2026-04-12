# 그룹 채팅 UI: 가상화·배치·최적화 모드

[messenger-performance-targets.md](./messenger-performance-targets.md) §2·§3 및 [lib/community-messenger/monitoring/thresholds.ts](../lib/community-messenger/monitoring/thresholds.ts) `MESSENGER_PERF_DESIGN_LIMITS` 와 정합.

---

## 1. 메시지 수신 배치 (클라이언트)

- Realtime 이벤트를 **즉시 setState 하지 않고** 50–100 ms 버퍼에 넣은 뒤 `requestAnimationFrame` 한 번에 flush.
- 동일 tick 다중 메시지는 단일 상태 업데이트로 합침.

---

## 2. 가상화(virtualization) 전환 시점

| 구분 | 기준 | 출처 |
|------|------|------|
| DOM에 동시에 올릴 메시지 **버블** 상한 | 권장 ≤**50**, 경고 ≤**80**, 치명 ≤**120** | `MESSENGER_PERF_DESIGN_LIMITS.messagesBeforeVirtualization` |
| 권장 동작 | 상한 초과 시 **가상 스크롤 필수** | messenger-performance-targets §2 |
| 조기 전환 | `prefers-reduced-motion`, Save-Data, 저메모리 힌트 | |

**참고:** 거래 채팅 [components/chats/ChatDetailView.tsx](../components/chats/ChatDetailView.tsx) 는 임계치 전까지 리스트 렌더; 그룹 전용 화면에서는 **동일 상수**를 import 하거나 공유 상수 모듈로 통일한다.

---

## 3. 그룹 최적화 모드 전환 (인원)

| 인원 | 정책 |
|------|------|
| ≥ **50** | 검토: presence/typing 샘플 축소 |
| ≥ **100** | 필수: 최적화 모드 ([group-chat-presence-typing.md](./group-chat-presence-typing.md)) |
| ≥ **200** | 엄격: 가상화 강제, 과거 스크롤 prefetch 깊이 축소, 썸네일 해상도 다운 |

상수: `MESSENGER_PERF_DESIGN_LIMITS.groupParticipantsOptimize` (`review: 50`, `required: 100`, `strict: 200`).

---

## 4. 최적화 모드에서 할 일 (체크리스트)

- [ ] 메시지 리스트 가상화 강제
- [ ] Presence/typing 간격 확대 또는 비활성
- [ ] 이미지·스티커 지연 로드 우선순위 하향
- [ ] Realtime 백업 폴링만 유지(간격 확대)
- [ ] 클라이언트 perf 스팬 로그에 `group_optimization: true` 라벨

---

## 5. 측정

- 방 입장 p95: `MESSENGER_PERF_REFERENCE_P95_MS.roomBootstrap` / 그룹은 `groupJoin` 참고.
- SLO 초과 시 [messenger-production-slo.md](./messenger-production-slo.md) 알림 파이프와 연동.
