# `/api/trade/chat/entry/resolve` — 단계 계측·비교 방법

## 계측 켜기

로컬(또는 스테이징)에서 서버 프로세스에만:

```bash
set TRADE_ENTRY_PERF_LOG=1
npm run dev
```

서버 콘솔에 `[trade-entry-perf]` 한 줄이 나온다. 비활성화 시 **로그·오버헤드 없음**(`process.env`만 검사).

## 로그가 의미하는 단계 (resolve 한 요청)

| 세그먼트 키(예) | 의미 |
|-----------------|------|
| `resolve_route_auth` | resolve 라우트: `requireAuthenticatedUserId` 직후 구간 |
| `resolve_route_session` | `validateActiveSession` 구간 |
| `resolve_service_sb` | `resolveServiceSupabaseForApi` |
| `resolve_item_core_start` ~ `resolve_item_core_end` | **공유 코어** `runItemTradeChatStartCore` (구 예: 내부 `fetch(/api/chat/item/start)` hop) |
| `item_access_and_post_parallel` | 회원 검증 + 상품 행 조회 병렬 |
| `blocks_and_existing_room_parallel` | 차단 + 기존 `item_trade` 방 조회 병렬 |
| `room_existing_*` | 기존 방 재오픈 경로(참가자·`chat_rooms` 업데이트·`community_messenger_room_id` select) |
| `room_insert_*` / `participants_insert` | 신규 방 insert·참가자 insert |
| `messenger_schedule_after_*` | 응답 후 `after()` 로 메신저 연결 스케줄(본문 RTT 제외 설계 유지) |
| `_total_ms` | 해당 스코프 시작부터의 총 ms |

스코프 이름: `entry_resolve_route`(라우트 전체), `item_start_route`(단독 `POST /api/chat/item/start` 호출 시).

## 수정 전·후 비교 (수치 필수)

1. **동일 환경**(같은 PC, 같은 DB, 같은 상품 id)에서 측정한다.
2. **브라우저** 개발자 도구 → Network → `entry/resolve` → **Time**(또는 Waiting + Content Download)을 최초 진입 **3회** 기록한다.
3. 서버 로그의 **`entry_resolve_route` → `_total_ms`** 를 같은 3회와 대조한다.
4. **개선으로 주장할 수 있는 것**: 이번 변경은 **같은 요청 안에서 `resolve → fetch(item/start)` 이중 HTTP를 제거**했다. 따라서 예전 구조 대비 **Node 내부의 추가 fetch 왕복 1회**가 사라진다. DB·RPC 시간은 동일 코어를 쓰므로 동일 조건에서 거의 같아야 한다.

**주의:** 예전 커밋과의 숫자 비교는 저장소에서 이전 버전을 체크아웃해 같은 3회 절차를 반복해야 한다. 이 문서만으로 “몇 % 빨라졌다”고 적지 않는다.

## 검증 명령 (회귀)

- `npm run verify:trade-hot-path-contract`
- `npx tsc --noEmit`
