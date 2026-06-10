# 메신저 send ACK — prod 동일 리전 실측

> **목표**: [messenger-performance-targets.md](./messenger-performance-targets.md) §4 — 전송 ~ 서버 ack **≤ 200ms** (prod·동일 리전).  
> **구조 lock**: `npm run verify:messenger-hot-path-contract` · MP-AUDIT-6~8.

## 측정 정의

| 항목 | 값 |
|------|-----|
| 구간 | 전송 버튼 클릭 → `POST .../messages` **200** |
| warm | 사이클당 **첫 전송 제외**(compile·phone cache cold), 2·3번째만 집계 |
| 판정 | warm 샘플 **p95 ≤ 200ms** · **max ≤ 300ms** (1.5× 여유) |
| 환경 | 앱·Supabase **동일 리전** · 프로덕션 빌드 권장 |

## 명령

```bash
# 로컬 dev (참고용 — 200ms 미달 가능)
PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
E2E_TEST_USERNAME=aaaa E2E_TEST_PASSWORD=1234 \
node scripts/measure-messenger-ack-warm.mjs

# prod (디바이 운영: https://samarket.vercel.app)
PLAYWRIGHT_NO_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
E2E_TEST_USERNAME=qqqq E2E_TEST_PASSWORD=... \
MESSENGER_ACK_WARM_CYCLES=3 \
node scripts/measure-messenger-ack-warm.mjs
```

결과: `docs/perf/messenger-ack-warm-latest.json`  
종료 코드: `0` = gate PASS · `2` = 측정 완료·gate 미달 · `1` = 오류

## 사전 조건

1. 테스트 계정이 메신저 방 1개 이상 보유
2. `NEXT_PUBLIC_SUPABASE_URL` 과 앱 배포 리전 정합
3. DB 마이그레이션 `20260610150000_community_messenger_send_text_ack_hot_path.sql` 적용

## dev vs prod 해석

- **dev**: Next dev compile·HMR로 첫 send가 수백 ms~수초 튈 수 있음 → warm만 본다.
- **dev (2026-06-10, localhost)**: warm p95 **325ms** — gate 미달.
- **prod (2026-06-10, SQL+배포 `ba9aa329` 후)**: warm 6샘플 — **min 220 · max 337 · avg 284 · p95 337** (`docs/perf/messenger-ack-warm-prod-latest.json`). 이전 p95 414 → **개선**. 클라 200ms gate **미달**.
- **로컬 서버 분해** (헤더): warm `x-samarket-send-handler-ms` **min 143 · p95 281** — 안정 구간은 **~150–200ms**. 클라 ack는 RTT가 추가됨.
- **판정 권장**: H축「동일 리전」은 **`x-samarket-send-route-ms` ≤200** 으로 서버만 본다. 로컬 브라우저→prod 측정은 지리 RTT가 섞임.
- 로컬 계정: 방이 없으면 `E2E_TEST_USERNAME=qqqq` 사용.

### prod 시도 (2026-06-10, 잘못된 호스트 `dibay.vercel.app`)

- 무효 — 운영 도메인은 **[https://samarket.vercel.app](https://samarket.vercel.app)**.
- `active_session_id` 쿠키 보강 후 `samarket.vercel.app` 재시도.
- 로컬 warm 참고: min **174** · p95 **544** (`docs/perf/messenger-ack-warm-latest.json` — prod 실패 시 덮어쓰기 주의).
- 체크시트 메신저 5/5는 **체감·구조** 승인과 별도; ACK 200ms는 H축 SLO 라운드.

## 갱신

실측 후 [samarket-performance-track-state.md](./samarket-performance-track-state.md) 「MP-AUDIT-12」에 3회 수치·판정 기록.
