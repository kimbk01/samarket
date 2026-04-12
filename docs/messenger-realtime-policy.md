# Realtime 구독 · 디바운스 정책

구현: [`lib/community-messenger/use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts)

## 원칙

1. **가벼운 이벤트만** — INSERT 한 건·메타 변경 한 건 단위로 클라이언트에서 머지; **전체 메시지 목록 재요청**은 디바운스된 `refresh` 로만.
2. **방당 WebSocket 채널 1개** — `postgres_changes` 를 한 채널에 묶어 구독 수를 줄임.
3. **홈 목록** — `community_messenger_rooms` 의 `id=in.(…)` 필터는 **90개 단위 청크** (Supabase `in` 한도 여유).
4. **디바운스 지연**
   - 홈 메타 전체 refresh: **650ms** (`createRefreshScheduler(..., 650)`)
   - 방 메타(참가자·방 행): **800ms**
   - 통화 관련: **0ms** (즉시 스케줄 — 별 스케줄러)
5. **typing / presence** (향후) — 별 테이블 또는 브로드캐스트 채널, **수십 바이트 이하** 페이로드; 방 전체 `GET` 금지.

## 안티패턴

- Realtime 이벤트마다 무조건 `refresh(true)` 로 전체 부트스트랩 재호출.
- 동일 테이블에 사용자별 중복 채널 구독.
