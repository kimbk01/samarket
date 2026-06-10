# 사마켓 체감 성능 — 트랙 상태 · 미완 체크

> **갱신 규칙**: 라운드마다 이 파일을 업데이트한다. 새 채팅·새 창에서는 이 파일(+ [samarket-native-feel-charter.md](./samarket-native-feel-charter.md))이 연속성의 기준이다.  
> **정책 전문**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) — **`[5-보조]`** composer_wall·warm 추가 판정(1100ms/200ms 편차·역행 무효·체감 1초) 포함.  
> **도메인별 완료율(동일 % 산식)**: [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 성능 작업 **시작 시·종료 시** 갱신하고, 보고 시 **도메인별 %**를 함께 적는다. **UI 규격은 본 파일 범위 밖.**

| 필드 | 값 |
|------|-----|
| Last updated | 2026-06-10 (parity-gates·build PASS) |
| Owner | (선택) |

---

## 현재 최종 목표 (한 줄)

거래+커뮤니티 **당근마켓급** · 메신저 **카카오톡급** · 배달·서비스형 **배달의민족급**; 탭·리스트·전환 **선택 즉시 반응**. (UI 토큰·컴포넌트 시각 규격은 별도 관리.)  
**체감 목표(당근·배민·카톡)로의 수렴 순서·게이트:** [samarket-parity-execution-order.md](./samarket-parity-execution-order.md) — **마스터 순서 0→5**, 속도 구조 표(A~H), 라운드 종료 시 최소 `npm run verify:parity-gates` 통과. 체크시트 `[x]`는 본 파일에서만·증거 후에 연다.

---

## 체크시트 연동 — 메신저 ([samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) §2)

| # | 기준(요약) | 체크시트 | 최근 증거·메모 |
|---|------------|----------|----------------|
| 1 | 방 탭 후 즉시 입력 | **완료** `[x]` | MP-AUDIT-6~10·라운드 M CTV→input 0ms·핫패스 lock. **2026-06-10 제품 승인**. |
| 2 | 목록·말풍선 지연 | **완료** `[x]` | MP-AUDIT-10 merge→display 0–1ms·홈 `failed_count=0`. **제품 승인**. |
| 3 | 스크롤·재진입·뒤로가기 | **완료** `[x]` | zero-fetch reentry·MP-AUDIT-5 room bootstrap 합류. **제품 승인**. |
| 4 | 배지·읽음·목록 정합 | **완료** `[x]` | bump `after()`·realtime 근본조치·홈 bootstrap 정합. **제품 승인**. |
| 5 | 탭·채팅 선택 즉시 반응 | **완료** `[x]` | BN7·홈 warm·PASS0 shell. **제품 승인**. |

**도메인 완료율(메신저):** **5 / 5 → 100%** (2026-06-10 제품 승인).

---

## MP-AUDIT — 메신저 전체 성능 감사 및 1순위 병목 개선 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **1차 성공** (첫 진입 실패 고정) |
| 이번 원인 1개 | 하단 탭 prewarm 이 `bootstrap?lite=1`·`bootstrap?tier=critical` 을 성공시켜 캐시에 넣어도, foreground 홈 bootstrap 이 abort/경합으로 `data=null` 인 채 끝나면 warm cache 가 UI state 로 승격되지 않아 첫 진입이 `Failed to load messenger` 로 고정될 수 있었다. |
| 이번 조치 | `scripts/measure-messenger-parity-audit.mjs` 추가. warm cache ready 이벤트를 발행하고, 홈 bootstrap hook 이 `data=null` 인 경우 warm full/critical cache 를 즉시 `bootstrap_full_seed` 로 승격하도록 수정. |
| 재측정 | direct probe **3/3 PASS**, `failed_count=0`, `rows_min=11`, `home_ready_ms_avg≈2367` (1차). |

## MP-AUDIT-2 — 홈 bootstrap 중복 fetch 제거 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **성공 · ACK·raw HTTP 잔여 보류** |
| 이번 원인 1개 | `MessengerBootstrapEarlyWarm` 과 foreground `refresh(false)` 가 동시에 critical·lite 를 열고, `AbortSignal` 이 있으면 `runSingleFlight` 를 우회해 warm+foreground 가 각각 네트워크 1회씩(합계 4 GET) 발생. full 캐시 hit 시에도 deferred lite 가 불필요하게 스케줄됨. |
| 이번 조치 | `cm-bootstrap-client-fetch` — signal 유무와 무관 single-flight 합류·critical 캐시 합성 응답. `use-community-messenger-home-bootstrap` — full 캐시면 deferred lite 스킵·follow-up 만 예약·Strict Mode 이중 마운트 foreground 가드. 감사 스크립트 — `home_bootstrap_client_fetch_total` 지표·`callsLog` 제외. |
| 재측정 | 동일 direct probe **3/3 PASS**, `failed_count=0`, `rows_min=11`, `home_bootstrap_client_fetch_total_avg=2`, `home_ready_ms_avg≈2316`, `room_ready_ms_avg≈4520`, `ack_ms_avg≈1764`(dev). Playwright raw `home_bootstrap_get_count_avg=4` 는 RSC/기타 HTTP 와 혼재 — **클라이언트 계약 지표 2회 기준 PASS**. |
| 판정 | 홈 bootstrap 중복 fetch **성공**. `ack_ms`·composer_wall·체크시트 `[x]` 는 별도 라운드. |
| 다음 1순위 후보 | room bootstrap 중복 또는 send INSERT·unread RPC 축. 종료 트랙 재개 금지 동일. |

## MP-AUDIT-3 — 메시지 POST ACK bump `after()` (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **부분 성공 · dev 200ms 미달 보류** |
| 이번 원인 1개 | 텍스트 전송 `POST .../messages` 가 INSERT 성공 후 `publishMessengerRoomBumpAfterMutation` 을 응답 전에 `await` 해 발신 ACK(클릭→POST 200)에 bump·배지 브리지 RTT 가 합산됨. |
| 이번 조치 | mark_read 와 동일하게 bump 를 `after()` 로 이동·auth gate 병렬화(`ensureApiRouteAuthGate` + phone/rateLimit `Promise.all`). |
| 재측정 | direct probe 3/3 PASS. `ack_ms` run별 3024(cold)/529/945 → avg≈1499(dev compile 1회 포함). warm 2·3회는 ~0.5–0.9s. |
| 판정 | bump 인라인 제거로 ACK **개선**. 목표 200ms·prod 동일 리전은 send 본문(INSERT+unread RPC) 별도 라운드. |

## MP-AUDIT-4 — send atomic 경로 사전 trade guard 제거 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **부분 성공 · 200ms 미달 보류** |
| 이번 원인 1개 | `trySendCommunityMessengerTextAtomic` 이 RPC 전 `loadTradeProductChatExitSnapshotForMessengerRoom` 를 매 전송마다 실행해 ACK RTT 에 왕복 1~2회가 추가됨. 동일 가드는 `community_messenger_send_text_message` RPC 에 이미 포함. |
| 이번 조치 | atomic 경로에서 사전 assert·reconcile 제거 — 단일 RPC 만 await. |
| 판정 | 구조적 중복 제거 **성공**. dev ACK warm ~0.5–0.9s — INSERT+네트워크 한계는 별도. |

## MP-AUDIT-5 — room bootstrap list_prefetch·block 경합 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **성공 · E2E·call smoke 후속** |
| 이번 원인 1개 | 홈 목록 `list_prefetch` 와 입장 `room_client_block` 이 동시에 열리면 single-flight 키가 달라 bootstrap GET 2회+. `hasPrefetchSnapshot` 이 5s TTL 만 보던 것도 skip 판정을 놓침. |
| 이번 조치 | block 직전 prefetch single-flight 합류·캐시 재사용. primed 시드 경로 명시 return. `wasRoomPrefetchRecentlySuccessful` 반영. |
| 재측정 | direct probe **3/3 PASS**, `failed_count=0`, `findings=[]`. `home_bootstrap_client_fetch_total_avg=2`, `room_bootstrap_get_count_avg=1.3`, `ack_ms_avg≈485`(warm 397–569ms), `home_ready_ms_avg≈6088`(run1 cold ~13.5s 포함). |
| 판정 | room bootstrap 중복 **성공**. 체크시트·composer_wall·ACK 200ms 는 별도. |
| 다음 | E2E·call smoke·DB 마이그레이션 **완료**. H축 ACK 200ms·체크시트 별도. |

## MP-AUDIT-6 — send POST canonical 병렬 + 핫패스 lock (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **구조 lock 완료 · ACK 200ms 미달 보류** |
| 이번 원인 1개 | `POST .../messages` 가 parse·rate·phone `Promise.all` **이후** `messengerRoomCanonicalOrJsonError` 를 직렬 await 해 멤버십 왕복이 ACK 에 추가됨. |
| 이번 조치 | canonical resolve 를 동일 `Promise.all` 에 합류. `scripts/verify-messenger-hot-path-contract.cjs` + `docs/messenger-performance-architecture.md` §11 MP-AUDIT lock 표. |
| 기능 | **변경 없음** — 멤버십·거래 가드·bump `after()`·voice 정책 유지. |
| 재측정 | verify **PASS**. direct probe **3/3**, `failed_count=0`, `findings=[]`. `home_bootstrap_client_fetch_total_avg=2`, `room_bootstrap_get_count_avg=0.7`, `ack_ms_avg≈1513`(run1 cold 포함; warm 구간 별도). |
| 판정 | 구조 회귀 방지 **정의 완료**. dev ACK 200ms 는 RPC·리전 한계 — 별도 라운드. |

## MP-AUDIT-7 — send ACK 직렬 구간 제거 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **진행 · 200ms 목표 재측정** |
| 이번 원인 1개 | `POST .../messages` 가 auth→gate 직렬 대기 중 parse·service import 미시작 + `requirePhoneVerified` 가 매 전송 `getCurrentProfile`(profiles SELECT) 1회 |
| 이번 조치 | auth·parse·params 병렬 + service dynamic import 선시작. `phone-verified-positive-cache`(인증 완료만 TTL 45s)·verify 시 invalidate |
| 기능 | **변경 없음** — 미인증 캐시 금지·게이트 동일 |
| 재측정 | direct probe **3/3**, `failed_count=0`, `findings=[]`. `ack_ms_avg≈690`(dev, 200ms 미달), `home_bootstrap_client_fetch_total_avg=2` |
| 판정 | **부분 성공** — profiles SELECT·직렬 구간 제거. ACK 200ms 는 RPC·INSERT 별도(MP-AUDIT-8 후보) |
| 다음 | RPC 경량화 또는 체크시트 합의 |

## MP-AUDIT-8 — send RPC ACK hot path (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **성공 · dev warm ACK 목표 근접** |
| 이번 원인 1개 | `community_messenger_send_text_message` 가 일반 방에도 `product_chats` 조회 + insert 후 participants **2회 스캔** + client_message_id dedupe 인덱스 부재 |
| 이번 조치 | `20260610150000_community_messenger_send_text_ack_hot_path.sql` — trade `direct_key` 만 product_chats, recipients 선집계, partial index |
| 기능 | **변경 없음** — 거래 가드·dedupe·unread 계약 동일 |
| 재측정 | direct probe **3/3**, `failed_count=0`, `findings=[]`. `ack_ms` run별 318/242/159 → **avg≈240**, `home_bootstrap_client_fetch_total_avg=2` |
| 판정 | RPC hot path **성공**. prod 동일 리전·체크시트 `[x]` 는 별도 합의 |
| 다음 | 체크시트 메신저 0/5 합의 |

## MP-AUDIT-9 — display_ready 4s fallback 제거 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **부분 성공 · FMR·100ms 미달 보류** |
| 이번 원인 1개 | `scheduleCmRoomTimelineHeavyReadyAfterDom` 가 DOM FMR 미기록 시 **4s setTimeout** 으로 `display_room_messages_ready` 를 찍어 merge→display gap **~4.5s** (E2E prefmr winner) |
| 이번 조치 | 2×rAF 직후 finish + **480ms** safety fallback. `cmRoomR6TraceEnabled` 와 정합 |
| 기능 | **변경 없음** — 타임라인·virtualizer 계약 유지, 계측·체감 stall 만 축소 |
| 재측정 | room_entry E2E **3/3 PASS**. merge→display gap run별 **474/576/483ms** (이전 **~4482ms**). `first_message_render_ms` null 유지 |
| 판정 | 4s fallback 제거 **성공**. ~480ms safety·FMR 경로는 MP-AUDIT-10 후보 |
| 다음 | FMR 기록·display≤100ms 또는 call smoke 안정화 |

## MP-AUDIT-10 — pass2 FMR·display_ready 동기화 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **성공** |
| 이번 원인 1개 | heavy bundle 대기(~480ms) 동안 FMR 미기록·display_ready 만 fallback — merge→display gap 과대 |
| 이번 조치 | snapshot merge 직후 `recordCmRoomDomFirstMessageVisible` + FMR 시 `display_ready` 즉시. heavy finish FMR fallback 유지 |
| 재측정 | room_entry E2E **3/3**. merge→display **1/1/0ms**, FMR 기록됨 |
| 판정 | **성공** (목표 100ms 달성). call smoke·체크시트 별도 |
| 기능 | **변경 없음** — 타임라인·heavy upgrade 경로 유지 |

## MP-AUDIT-11 — call smoke 안정화 + 체크시트 메신저 승인 (2026-06-10)

| 항목 | 내용 |
|------|------|
| 트랙 상태 | **성공** |
| 이번 원인 1개 | active recovery smoke 가 로그인 전 `goto` 로 mock 이 늦어 recovery 가 `/calls` 로 라우팅되지 않음 |
| 이번 조치 | `community-messenger-call-smoke.spec.ts` — login → route mock → goto·reload 순서 |
| 체크시트 | 메신저 §2 **5/5 `[x]`** — **2026-06-10 제품 승인** |
| 재측정 | call smoke **3/3×3 passed** |
| 후속 | `npm run verify:parity-gates` **PASS** · `npm run build` **PASS** (2026-06-10) |
| 판정 | **성공** |

---

## 메신저 실시간 근본조치 (2026-04-22)

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 메신저 실시간 근본조치 — silent subscription / 거래 상태 단일 전파 / 읽음 배지 계약 통일 |
| 현재 상태 | **구현 완료 · 검증 대기** |
| 이번 원인 1개 | `rooms.summary` 거래 메타 파싱에서 **`postId` 누락** + 채널별 각자 다른 `SUBSCRIBED` 해석 때문에, 거래 상태·presence·통화·배지가 같은 날 다시 흔들릴 수 있는 구조였다. |
| 이번 조치 | 1) 공통 `realtime health` 도입과 silent channel 계측 추가 2) 통화·presence·거래 상태 Realtime을 같은 재시도 축으로 정렬 3) 판매 상태 변경 시 **Community Messenger room summary**를 서버에서 직접 동기화 4) 메신저 방 읽음을 **즉시 mark_read**로 통일하고 거래 배지 해제를 같이 전파 |
| 관측 포인트 | `realtime.subscription:silent_channel`, `realtime.subscription:presence_snapshot_fallback`, `db.community_messenger:trade_state_summary_sync`, 기존 `chat.unread_sync:badge_list_align` |

---

## 종료 트랙 (재개 금지)

| 트랙 | 종료 사유 (요약) |
|------|------------------|
| **R2-M10** 메신저 방 **list tap → route page mount** | tap→push ~4ms·prefetch_hit·client-first 완료. `push→route_change` 150~200ms 는 App Router flight/segment 축 — **ROI 급감**으로 **2026-05-17 사용자 지시로 트랙 닫음**(HOLD 수치 유지). |
| **R2-M11** 메신저 방 **cold navigation / Suspense release** (M11·B·C·D 포함) | **2026-05-17 종료** — **판정: 카카오톡 근접 / App Router RSC reveal framework ceiling**. 앱 구조( room 0ms · layout 2~4ms · provider/phase1/composer OK )는 근접. **cold** `route_change→suspense` **~300ms** · **warm reenter ~29ms**. push 전 room RSC flight 완료 **0%** — prefetch 로 cold ceiling 미해소. **재개 금지**(메신저). 추가 개선은 client shell/overlay/별도 선로딩 등 **제품 구조 변경** 필요(현 범위 금지 조건과 충돌). |
| **R2-D1** 배달 **owner orders** realtime row-patch | **2026-05-17 LOCK** — `store_orders` / `store_order_deliveries` row-patch PASS · RT reason full reload **0** · `delivery_reload=0` · **배민형 owner orders realtime 운영 구조**. poll/pageshow/manual = fallback only. **재개 금지**(list reload·ownership 역행). 분석·실측: [r2-d1-owner-orders-analysis.md](./r2-d1-owner-orders-analysis.md). |
| **HS2** `/api/community-messenger/home-sync` **critical snapshot-first** | **2026-05-25 Structural PASS · LFC1-C hard delete** — `get_community_messenger_home_sync_snapshot` deployed · snapshot-only critical path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect stress PASS. **재개 금지**(legacy multi-wave·request-time aggregate). |
| **RB1** `/api/community-messenger/rooms/[roomId]/bootstrap` **critical snapshot-first** | **2026-05-25 Structural PASS** — `get_community_messenger_room_bootstrap_snapshot` deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · regression alert 없음 · counter hit **200ms** · route TTL warm **35–51ms**. **재개 금지**(legacy wave A multi-query·PostgREST embed·request-time aggregate). ▲ 수동 UI 12시나리오 · ▲ legacy fallback 제거 · ▲ prod same-region counter hit. |
| **SM1** `/api/stores/[slug]/menus` **snapshot-first** | **2026-05-25 Structural PASS · LFC1-A hard delete** — `get_store_menus_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · warm route **141–143ms**. **재개 금지**(legacy multi-wave products+popular+meta·PostgREST embed·request-time aggregate). |
| **ODN1** `/api/me/notifications` **owner dashboard notifications snapshot-first** | **2026-05-25 Structural PASS · LFC1-A hard delete** — `get_owner_dashboard_notifications_snapshot` deployed · snapshot-only owner unread+list paths · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1`. **재개 금지**(segmented unread RPC·220-row client filter·request-time aggregate). |
| **DSA1** `/api/me/stores/[storeId]/order-counts` **delivery summary snapshot-first** | **2026-05-25 Structural PASS · LFC1-A hard delete** — `get_delivery_summary_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · warm **254ms**. **재개 금지**(dashboard RPC every miss·25-count legacy·request-time aggregate). |
| **MRC1** **messenger realtime consistency** | **2026-05-25 Structural PASS** — versioned unread merge · cross-tab consistency channel · reconnect truth preserve · `[messenger-consistency-analysis]` · regression alert · `verify:messenger-consistency-structural` PASS. **재개 금지**(unordered unread merge·stale snapshot resurrection·reconnect legacy fallback). ▲ 수동 UI 12시나리오 E2E. |
| **OPS1-A** DIBAY **operating stability instrumentation** | **■ 종료 (2026-05-25)** — 관측 인프라 · audit · runner · probe · structural verify · 문서화 완료. **재개 금지**(관측·audit·sign-off runner·probe 제거). |
| **NHR1** **next hot route discovery & prioritization** | **2026-05-25 PASS** — 474 routes scanned · hotness score · structural risk A/B/C · `[next-hot-route-analysis]` · fallback global audit · snapshot candidates · **next priority: `/api/me/stores/[storeId]/orders` (OOL1)** · report: [next-hot-route-priority-report.md](./perf/next-hot-route-priority-report.md). **재개 금지**(우선순위 산식·PASS 트랙 재분석 반복). ▲ prod wall_ms 실측은 OPS1-B 후 갱신. |
| **OOL1** `/api/me/stores/[storeId]/orders` **owner orders list snapshot-first** | **2026-05-25 Structural PASS · LFC1-B hard delete** — `get_owner_store_orders_list_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1`. **재개 금지**(legacy 2-wave aggregate·PostgREST embed·request-time buyer/item/review join). lock: [owner-orders-list-regression-lock.md](./perf/owner-orders-list-regression-lock.md). |
| **CMB1** `/api/community-messenger/bootstrap` **bootstrap monolith breakdown snapshot-first** | **2026-05-25 Structural PASS · LFC1-C hard delete** — `get_cm_bootstrap_critical_snapshot` deployed · lite snapshot-only · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect stress PASS. **재개 금지**(legacy bootstrap monolith multi-wave). lock: [cm-bootstrap-regression-lock.md](./perf/cm-bootstrap-regression-lock.md). |
| **CR1** `/api/chat/rooms` **trade chat rooms snapshot-first** | **2026-05-25 Structural PASS · LFC1-C hard delete** — `get_chat_rooms_snapshot` deployed · snapshot-only · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect stress PASS. **재개 금지**(legacy 7-wave monolith). lock: [chat-rooms-regression-lock.md](./perf/chat-rooms-regression-lock.md). |
| **SOD1** `/api/me/store-orders/[orderId]` **buyer store order detail snapshot-first** | **2026-05-25 Structural PASS · LFC1-B hard delete** — `get_store_order_detail_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · event invalidation wired. **재개 금지**(legacy 5-RTT parallel detail·request-time payment/rider/refund merge). lock: [store-order-detail-regression-lock.md](./perf/store-order-detail-regression-lock.md). |
| **SOL1** `/api/me/store-orders` **buyer store orders list snapshot-first** | **2026-05-25 Structural PASS · LFC1-B hard delete** — `get_buyer_store_orders_list_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · event invalidation wired. **재개 금지**(legacy 2-wave orders+stores+unread aggregate·request-time list recompute). lock: [buyer-orders-list-regression-lock.md](./perf/buyer-orders-list-regression-lock.md). |
| **SB1** `/api/stores/browse` **stores browse snapshot-first** | **2026-05-25 Structural PASS · LFC1-B hard delete** — `get_stores_browse_snapshot` deployed · snapshot-only read path · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · event invalidation wired. **재개 금지**(legacy taxonomy+stores+products/banners multi-wave·request-time browse aggregate). lock: [stores-browse-regression-lock.md](./perf/stores-browse-regression-lock.md). |
| **FBT1** `/api/community-messenger/bootstrap` **full bootstrap tier snapshot-first** | **2026-05-25 Structural PASS · LFC1-C hard delete** — `get_cm_bootstrap_full_snapshot` deployed · full + `?tier=critical` snapshot-only · fallback **removed** · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect stress PASS. **재개 금지**(legacy full/critical bootstrap monolith). lock: [full-bootstrap-regression-lock.md](./perf/full-bootstrap-regression-lock.md). |

---

## OPS1 상태 고정 (2026-05-25)

| Phase | 상태 | 내용 |
|-------|------|------|
| **OPS1-A** | **■ 종료** | 관측 인프라 · audit · runner · probe · structural verify · 문서화 완료 |
| **OPS1-B** | **■ 종료** | prod 3/3 sign-off PASS · reconnect stress PASS · `rpc_removed=20/20` · gate_met |
| **OPS1 최종** | **■ 종료** | Phase B prod 실측·3회 sign-off·reconnect stress PASS |

**재개 명령:**

```bash
SAMARKET_BASE_URL=https://dibaY.vercel.app SAMARKET_PROD_PERF_MEASURE=1 npm run ops1:prod-signoff
```

**필수 env:** `OPS1_STORE_ID` · `OPS1_STORE_SLUG` · `OPS1_ROOM_ID`

**최종 PASS 조건:** prod **3회** sign-off · `fallback_used=0` · counter hit **<100ms** · route TTL warm **<50ms** · reconnect stress PASS · burst PASS · long-session PASS

상세: [prod-signoff-report.md](./perf/prod-signoff-report.md)

---

## 진행 중 트랙

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **LFC1-A** Safe Route Hard Delete (SM1 · ODN1 · DSA1) |
| **트랙 상태** | **■ 종료** — Phase A safe routes legacy fallback **hard deleted** |
| 이번 조치 | snapshot-only verify → per-route hard delete → RPC/E2E/tsc PASS ×3 |
| 측정 | `fallback_used=0` · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect issue 없음 |
| lock | [legacy-fallback-cleanup-report.md](./perf/legacy-fallback-cleanup-report.md) |

| 트랙 이름 | **LFC1-B** Medium Safe Route Hard Delete (OOL1 · SOL1 · SOD1 · SB1) |
| **트랙 상태** | **■ 종료** — Phase B medium routes legacy fallback **hard deleted** |
| 이번 조치 | snapshot-only verify → per-route hard delete → RPC/E2E/tsc PASS ×4 |
| 측정 | `fallback_used=0` · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect issue 없음 |
| lock | [legacy-fallback-cleanup-report.md](./perf/legacy-fallback-cleanup-report.md) |

| 트랙 이름 | **LFC1-C** Messenger core hard delete (HS2 · CR1 · CMB1 · FBT1) |
| **트랙 상태** | **■ 종료** — messenger core legacy fallback **hard deleted** (4/4) |
| 이번 조치 | snapshot-only preflight → per-route hard delete → RPC/E2E/reconnect/tsc ×4 |
| 측정 | `fallback_used=0` · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect stress PASS · MRC1 core untouched |
| lock | [legacy-fallback-cleanup-report.md](./perf/legacy-fallback-cleanup-report.md) · [messenger-realtime-consistency-lock.md](./perf/messenger-realtime-consistency-lock.md) |

| 트랙 이름 | **LFC1-D** Phase D (RB1 · HUB BADGE) |
| **트랙 상태** | **▲ 대기** — STAB1 manual gates PASS 전 hard delete **금지** |
| PASS 게이트 | STAB1 long-session · multi-tab · prod stable · real feel → per-route hard delete |

| 트랙 이름 | **CM-INSTANT** 메신저 즉시성·구조 복구 (거래 방·전송·입장·통화) |
| **트랙 상태** | **메신저 즉시성 1차 복구 구현 완료** — 친구 요청 UPDATE 즉시 반영·그룹 초대 전용 팝업/알림·수신 통화 accept 후 라우팅 선행 보강. prod 체감·2기기 3회 측정 **대기** |
| 이번 원인 1개 | 전체 채팅 통화 스택이 공통 `community_messenger` 세션/스텁을 쓰는 동안, 로컬 optimistic `cm-cevt-*`와 DB UUID `call_stub`가 id만 다르면 중복 표시될 수 있고, 숨김도 id 기준이라 refresh 뒤 재노출될 수 있었다. |
| 이번 조치 | 이미지 메시지 bump 응답 전 `await` 통일 · bump snapshot 단건 GET 생략 · terminal tombstone/벨/오버레이/미디어 cleanup · 통화 `call_stub` 서버/클라 보장 · session/event 기준 `call_stub` dedupe·숨김 · 메신저 call 권한 완료 기록 신뢰 및 active 발신 gate 정합화 · 통화 전용 `visualViewport` 높이 변수와 자식 화면 최소 높이 단일화 · 친구 요청 `community_friend_requests` UPDATE 구독으로 수락/거절/취소 즉시 정리 · 그룹 초대 `community_group_invite` 알림/팝업 분리 · direct call accept PATCH 후 권한 프라임을 라우팅 뒤 병렬화 |
| 측정 (다음) | `scripts/verify-cm-receive-latency-coalesce.mjs` PASS · `verify:messenger-consistency-structural` PASS · 2기기 3회: 친구 요청 발송→수락/거절/취소 양방향 즉시 반영, 그룹 생성/초대 팝업이 친구 요청과 구분, 일반 voice/video 수신 수락→통화 화면 즉시 진입→원격 미디어 연결, 거래/배달/일반 voice/video 발신→거절/취소/종료, 통화 히스토리 1줄 유지, 숨긴 히스토리 refresh 재노출 없음, 권한 안내 반복 없음, iOS/Android/태블릿 리사이즈 안정 |
| lock | `docs/messenger-realtime-policy.md` · `docs/trade-chat-room-identity.md` |

| 트랙 이름 | **STAB1** Post cleanup stabilization |
| **트랙 상태** | **▲ 진행** — automated prod observation **PASS** · manual observation **▲** |
| 이번 조치 | push `7aa121b6` → PDS1 deploy verify → prod reconnect stress → prod messenger E2E ×4 |
| 측정 (automated) | `fallback_used=0` · `query_wave_2_ms=0` · `rpc_removed=1` · reconnect PASS · regression alert 0 |
| 측정 (manual ▲) | long-session 30–60min · multi-tab · mark-all-read · offline/online · real feel |
| lock | [prod-signoff-report.md](./perf/prod-signoff-report.md) · [legacy-fallback-cleanup-report.md](./perf/legacy-fallback-cleanup-report.md) |
| **구조 변경** | **금지** — hard delete · reconnect core · merge logic · cross-tab bus |

| 트랙 이름 | **PDS1** Prod Deploy Sync for OPS1-B |
| **트랙 상태** | **■ 종료** — prod headers 10/10 · OPS1-B gate_met |

---

## 진행 중 트랙 (legacy — OPS1-A 이전)

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **DEV-STAB-1** DIBAY dev 측정 환경 안정화 (메모리 → auth → owner dashboard → cache-hit) |
| **트랙 상태** | **완료** (dev:measure 분리) |
| 이번 원인 1개 | dev heap 4.3GiB+ / 30s +227MiB — **in-process cache ≪ heap** → Next dev compile/HMR graph 가 측정 오염 |
| 이번 조치 | `npm run dev:measure` · `scripts/dev-measure.cjs` · `[dev-memory-growth-diagnosis]` HMR/cache 분리·memory_guard · `docs/performance/dev-measurement-runbook.md` · API 판정 `actual_handler_ms` 고정 |
| 측정 명령 | `npm run dev:measure` → `[dev-memory-growth-diagnosis]` 2회 → `npm run measure:owner-dashboard-api` — [dev-measurement-runbook.md](./performance/dev-measurement-runbook.md) |
| 완료 기준(1차) | 일반 `dev` 유지 + measure dev env 자동 적용 + 진단 로그가 HMR vs in-process 분리 + **API는 actual_handler_ms 만 판정** (qqqq warm auth/order/notifications 이미 통과 → API 수정 금지) |
| 다음 원인(예정) | **C** owner dashboard waterfall |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **B** hub cold client wall |
| **트랙 상태** | **완료 — 서버 cm_unread 병목 판정** |
| 이번 원인 1개 | cold **server ~935ms** · **cm_unread_ms ~686** · client wall ~1039와 근접 → **900ms는 서버 handler+linked RTT**(compile 2회차는 dev 과부하) |
| 이번 조치 | `[hub-cold-client-wall-breakdown]` · `x-samarket-hub-badge-measure` invalidate · `measure:hub-cold-client-wall` |
| 측정 | cold client 1039 / server 935 / warm2 76ms (qqqq, dev:measure) |
| 완료 기준 | warm ≤30 ✓(2nd warm) · 병목 `cm_unread_query` ✓ · cold 300ms ✗ → RTT·cm_unread 서버 한계 |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **C** owner dashboard waterfall |
| **트랙 상태** | **완료** |
| 이번 원인 1개 | mount 시 `order-counts` await + `orders_list`/`settlements` 즉시 fetch 가 첫 shell 을 막음 |
| 이번 조치 | `[owner-dashboard-waterfall]` · RSC ops seed · paint 후 order-counts · orders/settlements background 6s |
| 측정 | `npm run measure:owner-dashboard-waterfall` |
| 완료 기준 | `first_paint_blocking:false` on deferred APIs · shell skeleton before cold network |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **D** hub cm_unread 서버 병목 only |
| **트랙 상태** | **완료 — PostgREST RTT 2-hop 한계 판정** |
| 이번 원인 1개 | cold cm_unread **직렬 2 RTT** (counter row read ~236ms + RPC ~218ms) · transport **~98%** of RPC wall · JS aggregation/join **0** |
| 이번 조치 | `[cm-unread-deep-breakdown]` · sync aggregate upsert → **deferred** · cm_unread single-flight · `measure:cm-unread-cold` |
| 측정 | `npm run dev:measure` + `npm run measure:cm-unread-cold` (qqqq) — cm_unread **~462ms** (B 대비 ~686↓) · hub handler **~763–813ms** · warm handler **~18ms** |
| 완료 기준 | warm ≤30 ✓ · 병목 `postgrest_transport`+`counter_row_read` ✓ · cm_unread cold 400ms ✗ → **linked RTT·2-hop** (SQL/semantics 변경 없음) |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **F** DIBAY hub badge snapshot architecture |
| **트랙 상태** | **완료 — 구조적 PASS** (2026-05-25) |
| 이번 원인 1개 | warm TTL 의존·cold multi-RPC wave(~843ms)·embed inner join·sequential await |
| 이번 조치 | `get_owner_hub_badge_snapshot` 1 RTT·snapshot-first read·event refresh·regression guard·`docs/perf/hub-badge-regression-lock.md` |
| 측정 | `verify:hub-badge-snapshot-rpc` · `measure:owner-hub-badge-perf` — snapshot row 131–252ms · warm 25–31ms · legacy fallback 0 |
| 완료 기준 | snapshot path ✓ · `query_wave_2_ms=0` ✓ · regression alert ✗ · ▲ owner 12 시나리오 · ▲ prod same-region counter hit |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **HS2** DIBAY home-sync critical snapshot architecture |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Route | `GET /api/community-messenger/home-sync?tier=critical` |
| 완료 근거 | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · regression alert 없음 · route TTL warm **82–112ms** · response shape / unread semantics / UI 변경 없음 |
| 이번 조치 | `get_community_messenger_home_sync_snapshot` 1 RTT · counter row · event refresh · regression lock · `verify:home-sync-snapshot-e2e` |
| 측정 | `verify:home-sync-snapshot-rpc` · `verify:home-sync-snapshot-e2e` — unified RPC cold **142ms** · counter hit **278–486ms**(linked RTT) · warm route **82–112ms** |
| 후속 ▲ | 수동 UI 8시나리오 · legacy fallback 코드 제거 · prod same-region counter hit 재측정 |
| 주의 | counter hit **278–486ms** = **linked Supabase RTT** (구조 회귀 아님). prod same-region에서도 **>100ms** 이면 HS2 transport 재오픈. |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **RB1** DIBAY room bootstrap critical snapshot architecture |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Route | `GET /api/community-messenger/rooms/[roomId]/bootstrap?mode=instant` |
| 완료 근거 | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · regression alert 없음 · counter hit **200ms** · warm route **35–51ms** · response shape / unread semantics / UI 변경 없음 |
| 이번 조치 | `get_community_messenger_room_bootstrap_snapshot` 1 RTT · counter row · event refresh (message/read/mark-all-read) · regression lock · `verify:room-bootstrap-snapshot-e2e` |
| 측정 | `verify:room-bootstrap-snapshot-rpc` · `verify:room-bootstrap-snapshot-e2e` — cold fetch **5583ms**(first compile) · counter hit **200ms** · warm route **35–51ms** |
| 후속 ▲ | 수동 UI 12시나리오 · legacy fallback 코드 제거 · prod same-region counter hit 재측정 |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **SM1** DIBAY store menus snapshot architecture |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Route | `GET /api/stores/[slug]/menus` |
| 완료 근거 | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · warm **141–143ms** · response shape / sort semantics / UI unchanged |
| 이번 조치 | `get_store_menus_snapshot` 1 RTT · counter row · event refresh (product/section/store) · regression lock · `verify:store-menus-snapshot-e2e` |
| 측정 | `verify:store-menus-snapshot-rpc` · `verify:store-menus-snapshot-e2e` — cold **3234ms**(dev compile) · warm **141–143ms** |
| 후속 ▲ | 수동 UI 14시나리오 · legacy fallback 제거 · prod same-region counter hit |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **ODN1** DIBAY owner dashboard notifications snapshot architecture |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Route | `GET /api/me/notifications?unread_count_only=1&owner_store_commerce_unread_only=1` · `GET ?owner_store_id={storeId}` |
| 완료 근거 | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · response shape / unread semantics / UI unchanged |
| 이번 조치 | `get_owner_dashboard_notifications_snapshot` 1 RTT · counter row · event refresh (append/read/mark-all) · regression lock · `verify:owner-dashboard-notifications-snapshot-e2e` |
| 측정 | `verify:owner-dashboard-notifications-snapshot-rpc` · `verify:owner-dashboard-notifications-snapshot-e2e` — unread cold **575ms** · list cold **488ms** · warm unread **267ms** |
| 후속 ▲ | 수동 UI 12시나리오 · legacy fallback 제거 · prod same-region counter hit |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **DSA1** DIBAY delivery summary snapshot architecture |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Route | `GET /api/me/stores/[storeId]/order-counts` |
| 완료 근거 | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · `OwnerStoreOpsSnapshot` response shape / UI unchanged |
| 이번 조치 | `get_delivery_summary_snapshot` 1 RTT · counter row · event refresh (order/refund/rider mutations) · regression lock · `verify:delivery-summary-snapshot-e2e` |
| 측정 | `verify:delivery-summary-snapshot-rpc` · `verify:delivery-summary-snapshot-e2e` — cold **3503ms**(dev compile) · warm **254ms** |
| 후속 ▲ | 수동 UI 14시나리오 · legacy fallback 제거 · prod same-region counter hit |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **MRC1** Messenger realtime consistency hardening |
| **트랙 상태** | **완료 — Structural PASS** (2026-05-25) |
| Scope | unread/badge/room list · cross-tab · reconnect · snapshot+realtime desync |
| 완료 근거 | versioned merge on all hot paths · consistency bus · reconnect preserve · analysis+regression guards · lock doc · structural verify PASS |
| 이번 조치 | `lib/community-messenger/consistency/*` · `docs/perf/messenger-realtime-consistency-lock.md` |
| 측정 | `verify:messenger-consistency-structural` · `tsc --noEmit` PASS |
| 후속 ▲ | 수동 UI 12시나리오 (multi-tab read, mark-all-read, reconnect, TTL stale) |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **E** prod_same_region 실측 검증 only |
| **트랙 상태** | **준비 완료 — 측정 인프라** (배포 URL·동일 리전에서 실행 필요) |
| 이번 원인 1개 | linked dev cold 700~800ms = **PostgREST transport** (앱 CPU/aggregation 아님) |
| 이번 조치 | `[prod-region-context]` · `SAMARKET_PROD_PERF_MEASURE=1` prod 로그 게이트 · `measure:prod-same-region` · `start:prod-measure` · runbook |
| 측정 | `npm run build` → `start:prod-measure` 또는 Vercel + `SAMARKET_BASE_URL=… npm run measure:prod-same-region` |
| 완료 기준 | prod hub cold ≤400 · order-counts cold ≤120 · warm ≤30 · same_region true → **운영 가능** 판정 |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **A** order-counts cold RPC (관측·cold path only) |
| **트랙 상태** | **완료 — RTT 한계 판정** |
| 이번 원인 1개 | cold `rpc_wall_ms` ~220–236ms — `rpc_parse_ms`·`cache_set_ms`·`payload_build_ms` ≈ 0 → **PostgREST linked RTT** (DB hint 5ms) |
| 이번 조치 | `[order-counts-cold-breakdown]` 확장 · `primeStoreOrderCountsCache` · stores Supabase singleton · `measure:order-counts-cold-rpc` |
| 측정 | `npm run dev:measure` + `npm run measure:order-counts-cold-rpc` (qqqq) — cold 236ms / warm 17–23ms |
| 완료 기준 | warm ≤30 ✓ · 병목 1개 `postgrest_rtt` ✓ · cold 100ms ✗ → SQL/구조 변경 없이 **RTT 분리 판정** |

| 항목 | 내용 |
|------|------|
| 트랙 이름 | **R2-D1-KPI** (가칭) — owner orders **KPI/meta header realtime ownership** |
| **트랙 상태** | **코드 LOCK · E2E 최종 검증 FAIL (2026-05-17)** — login 환경 · `COMPLETE` 보류 |
| 이번 원인 1개 | **ownership split** — list derive KPI는 RT 즉시 · meta chip/banner는 `load()`/poll only (실측). |
| 이번 조치 | `deriveOwnerStoreOrderMetaCounts` + `OwnerStoreOrdersView.metaCounts` — **list owner = KPI owner**. |
| E2E | 2026-05-18 `r2-d1-kpi-meta-measure` 3회 — **FAIL** (`/login` 미이탈, 120s). 로그 `messenger-r2-d1-completion-e2e.log`. 원인 가설: **Supabase 비밀번호 로그인 미성공** — [r2-d1-kpi-meta-analysis.md](./r2-d1-kpi-meta-analysis.md) § 로그인 게이트 |
| 실측 | [r2-d1-kpi-meta-analysis.md](./r2-d1-kpi-meta-analysis.md) § Real Event Measurement · `messenger-r2-d1-kpi-measure.log` |
| 분석 문서 | [r2-d1-kpi-meta-analysis.md](./r2-d1-kpi-meta-analysis.md) |
| LOCK 금지 | poll 제거 · RT list reload 복구 · router.refresh · invalidate masking · row-patch ownership 분산 |
| 참고 | [dibay-state-ownership-map.md](./dibay-state-ownership-map.md) R2-D1 · [r2-d1-owner-orders-analysis.md](./r2-d1-owner-orders-analysis.md) |

### R2-M11 종료 기록 (재개 금지 · 2026-05-17)

| 필드 | 값 |
|------|-----|
| 상태 | **종료** |
| 판정 | **카카오톡 근접 (앱 구조) / framework ceiling (cold path)** |
| cold path | `route_change → suspense_release` **약 300ms** (316ms 측정) |
| warm path | **약 29ms** (Next 라우터 캐시·재진입) |
| 배제 완료 | room page server 0ms · layout 2~4ms · bottom nav/menu/auth · provider/phase1 · composer/timeline · reducer/realtime ownership |
| R2-M11D | push 전 room RSC flight 완료 **0%** — `router.prefetch` 만으로 cold ceiling 해소 불가 |
| 다음 개선 | **제품 결정 필요** — Next 바깥 client route shell · client-side transition · room overlay/router · 데이터 선로딩 별도 계약 (현 라운드 금지 범위와 충돌) |

<details>
<summary>R2-M11 하위 라운드 측정 요약 (펼치기)</summary>

#### R2-M11 (구조 + 계측)

- **원인:** 이중 Suspense fallback + `useSearchParams` suspend → segment release 병목.
- **조치:** loading/page Suspense 정리 · URL query 비-suspend 읽기 · `[R2-M11-SUSPENSE]` 계측.
- **측정:** `node scripts/perf/r2-m11-capture-runs.mjs` 등 · 목표 ≤150/200ms **미달(HOLD)**.

### R2-M11 — 3회 측정 (2026-05-17 · `node scripts/perf/r2-m11-capture-runs.mjs` · `aaaa` · prod `start` 재시작 후)

| 구간 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| route_change_to_release_ms | 326 | 311 | 307 | ≤150 |
| release_to_phase1_visible_ms | 316 | 314 | 11 | ≤200 |
| route_mount_gap_ms | 799 | 482 | 773 | ≤150 |
| nested_suspense_count | 0 | 0 | 0 | (이중 fallback 제거 확인) |
| composer `[data-cm-composer] textarea` | OK | OK | OK | 회귀 없음 |

**판정:** **HOLD** — `nested_suspense_count=0`·fallback 미노출·composer 정상. **`route_change_to_release` ~310ms** 가 여전히 병목(목표 150ms 2배). `release_to_phase1` Run3 11ms 는 warm/순서 이상치 가능. **bootstrap_fetch ~294ms 는 별도 데이터 축.**

### R2-M11B — `route_change → suspense_release` 분해 (2026-05-17)

측정: `node scripts/perf/r2-m11b-capture-runs.mjs` 3회 · `samarket:debug:runtime=1` · prod `start`

| 구간 | Run1 | Run2 | Run3 | 판정 |
|------|-----:|-----:|-----:|------|
| route_change → server_start | 0 | 0 | 0 | room page 서버 진입 ≈ flight 요청 시작(동시) |
| server_start → server_done | 0 | 0 | 0 | **room `page.tsx` 동기 구간 0ms** |
| server_done → flight_done | 549 | 393 | 511 | **RSC flight ≥150ms — server/RSC 축** |
| flight_done → suspense_release | 158 | 635 | 315 | client reveal·순서 혼재(run2 이상치) |
| suspense_release → first_client_boundary | 15 | 17 | 0 | 양호 |
| first_client_boundary → phase1_visible | 0 | 0 | 322 | run3만 지연(phase 타이밍) |
| provider_commit | 1 | 0 | 0 | 양호 |
| **route_change → suspense_release** | **325** | **633** | **308** | **목표 구간 · run2 warm 이상치** |

**R2-M11B 결론(1줄):** 병목 1순위는 **room page 서버 await가 아니라 RSC flight(`server_done→flight_done` 393–549ms)**; `room_page_server_wall_ms=0`. `route_change→suspense` ~310ms는 **shell release**이며 full flight(500ms+)보다 짧을 수 있음(프리페치·스트리밍). **다음 수정 라운드 후보:** `(main) layout` 서버 await가 room flight에 묶이는지 분리 계측·경로 한정 완화(R2-M11C).

### R2-M11C — layout vs room flight 분해 (2026-05-17)

측정: `node scripts/perf/r2-m11c-capture-runs.mjs` · 5회 중 Run2·4·5 유효 (2026-05-17 재측정)

| 구간 | Run1(유효) | Run2 | Run3 | 판정 |
|------|-----:|-----:|-----:|------|
| main_layout total | 3 | 2 | 4 | **캐시 히트·병목 아님** (<150ms) |
| bottom_nav load | 3 | 2 | 4 | 양호 (<100ms) |
| menu/category load | 3 | 2 | 4 | 양호 (<100ms) |
| auth/profile (`invoked`) | 0 (false) | 0 | 0 | layout·proxy 외 |
| room segment server | **0** | **0** | **0** | **room page 원인 아님** |
| remaining flight gap | 248 | 406 | 823 | **Next RSC flight 축** |
| rsc_flight_done | 251 | 408 | 827 | 동상 |
| route_change → suspense_release | 437 | 368 | 302 | R2-M11 HOLD |
| `verdict_category` | next_rsc_flight | next_rsc_flight | next_rsc_flight | 3/3 일치 |

**R2-M11C 결론:** layout 서버 await(3ms)는 flight에 거의 기여하지 않음. 병목 = **Next RSC flight 자체**.

#### R2-M11D — prefetch vs flight (2026-05-17)

| 항목 | Run1 tap | Run3 reenter |
|------|----------|--------------|
| `route_push_before_prefetch_done` | false | false |
| `route_change→suspense_release` | 316ms | 29ms |

**R2-M11D 결론:** push 전 room RSC flight 완료 불가 → cold **~310ms** 는 **App Router ceiling**. 트랙 **종료**.

</details>

---

## 진행 중 트랙 (기타)

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 하단 탭 즉시 리스트 — **RSC await 와 클라 데이터 캐시 분리 미스 근본 정리** (라운드 W) |
| **트랙 상태** | **진행 중 (라운드 W→W7 반영)** — `/stores` + `/philife` 글로벌/토픽 prewarm, 키보드 탭 진입 prewarm, **latest menu navigation intent guard** 까지 반영된 상태에서, 2026-04-30 후속 라운드로 거래 체감 병목을 다시 좁혔다. 이번에는 `/market` 기본 진입이 **RSC 시드 없이 클라 hydration+fetch 완료까지 기다리던 구조**, `/post/[id]` 상세가 **비핵심 거래방/제안 시드까지 첫 응답에서 함께 기다리던 구조**를 최신 원인으로 잡아 수정했다. |
| 이번 원인 1개 | 거래 대표 경로에서 **첫 화면에 꼭 필요하지 않은 데이터까지 첫 응답을 막고 있었다.** `/market` 기본 진입은 서버 시드가 비어 있어 캐시 미스 시 클라 `getPostsForHome` 완료 전까지 즉시 리스트가 뜨지 않았고, `/post/[id]` 상세는 클라 fallback 이 이미 있는 `room-id`·판매자 제안 시드까지 RSC `Promise.all` 에 묶여 첫 본문 응답이 늦어질 수 있었다. |
| 이번 조치 | 1) `app/(main)/market/page.tsx` 에 `Suspense` + `MarketContentWithSeed` 를 넣어 `/market` 기본 진입(`tradeState=latest`)일 때는 셸을 즉시 보내면서도 `initialHomeTradeFeed` 를 RSC 스트리밍으로 주입하게 했다. 2) `lib/posts/home-posts-route-core.ts` 에 `resolveDefaultTradeHomePostsSeedForServerComponent()` 를 추가해 `/api/philife/posts` 와 같은 서버 캐시·favorites 정책으로 기본 거래 홈 목록 시드를 생성하게 했다. 3) `services/trade/trade-detail.service.ts` 에서 상세 첫 화면에 비핵심인 `resolveViewerItemTradeRoom`·판매자 제안 선로드를 RSC 크리티컬 경로에서 제거하고, 판매자 프로필도 주소 기본값 추가 조회 없이 최소 프로필만 먼저 반환하게 줄였다. |
| 관측 포인트 | `/market` 은 기본 latest 진입에서 **클라 단독 fetch 전에 RSC 시드가 도착하는지**, `/post/[id]` 는 본문·판매자 블록보다 늦게 필요한 room-id / offer seed 가 첫 응답을 막지 않는지 확인. 로컬 `curl -L` 3회 스모크에서는 `/market` warm `time_starttransfer` 가 **55.7 / 65.9 / 77.3ms**, 샘플 `/post/<id>` 는 **cold 1616.9ms / warm 65.1ms / 53.3ms** 로 200 응답을 유지했다. |
| 후속(트랙 X 후보) | **거래 핫패스(마스터 순서 2) — 2026-05-10 마감:** 라운드 **P1** related `Suspense`·`getTradeDetailRelatedData` 단일 경유·`openCreateTradeChat` 비대기 `replace` 계약을 코드·`verify:trade-hot-path-contract` 로 재확인. `loadTradeDetailRelatedBundle` **내부** 쿼리·캐시 튜닝은 **별 라운드**(원인 1개)로 분리한다. |

**보조(도메인 순환·`performance-state.json`):** 2026-04-26 — `myinfo`로 남아 있던 **`PurchaseDetailView` 구매 상세 GET**을 비행 패턴(`fetch`만 합류·`clone` 파싱·`credentials`)으로 정리해 한 사이클을 코드까지 마감했다. `currentTarget`은 다음 순환 진입점으로 **`login`**을 유지한다.

---

## 이번 라운드 (배달 장바구니: 라운드 DS3 — CART UX polish)

| 항목 | 내용 |
|------|------|
| 원인 1개 | cart mutation 후 `publishCommerceCartSnapshot` 이 Provider `useEffect` 에만 있어 strip/preview 가 한 프레임 늦었고, qty/delete·conflict open 전용 trace 가 없었다. 충돌 다이얼로그가 `StoreDetailPublic` state 로 열려 menu subtree 가 흔들 수 있었다. |
| 측정 명령 | `npm run build` + `npm run start`, 콘솔: `delivery-cart-optimistic-ms`, `delivery-cart-qty-patch-ms`, `delivery-cart-delete-ms`, `delivery-cart-preview-open-ms`, `delivery-cart-conflict-open-ms`, `delivery-cart-subtree-impact`, `render_while_sheet_open`. 담기·수량 연타·삭제·preview·타매장 충돌 각 3회. |
| 수정 파일 | `contexts/StoreCommerceCartContext.tsx`, `lib/dibay/delivery-cart-trace.ts`, `lib/stores/store-commerce-cart-line-mutate.ts`, `lib/stores/store-cart-conflict-ui-store.ts`, `components/stores/cart/StoreCartConflictPortal.tsx`, `components/stores/store-order-detail/StoreCartPreviewSheet.tsx`, `StoreCartPreviewLineRow.tsx`, `StoreDetailPublic.tsx`, `StoreProductAddSheet.tsx`, `StoreCommerceCartRuntimeBoundary.tsx` |
| 이번 조치 | mutation 직후 snapshot bus 동기 flush + qty/delete/conflict trace. 충돌 UI portal 격리. preview line `memo`. DS1/DS2·option portal·route shell 미변경. |
| 검증 | `npx tsc --noEmit`, `npx vitest run tests/unit/store-commerce-cart-line-mutate.test.ts` 통과. |

### 라운드 DS3 — 3회 측정 (대기)

| 구간 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| add optimistic | — | — | — | ≤50ms |
| qty patch | — | — | — | ≤30ms |
| delete | — | — | — | ≤30ms |
| preview open | — | — | — | ≤80ms |
| conflict open | — | — | — | ≤80ms |
| menu subtree | — | — | — | 0 |

**판정:** **코드 마감(세션 종료)** — 구조·trace 반영 완료. 브라우저 3회 수치 표는 **새 세션**에서 `npm run build` + `start` 후 채운다. 병목 ms 없으면 추가 수정 없음.

---

## 이번 라운드 (배달 카트: 라운드 DS4 — cart sheet seed/fetch 계약 방지선)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 카트 옵션 변경 경로가 매장 상세와 달리 `prefetchedListRow` 없이 시트를 열 수 있고, 업셀 menus fetch 가 `lines` 객체 identity 에 묶이면 수량 변경마다 같은 메뉴 API를 다시 호출하는 구조적 회귀가 가능했다. 추가 더블체크에서 checkout identity(`/api/me/checkout-contact`·addresses·profile)도 첫 진입 프레임과 경쟁할 수 있음이 확인됐다. |
| 측정/검증 명령 | `npm run verify:store-cart-sheet-contract`, `npx vitest run lib/stores/__tests__/store-cart-sheet-prefetch.test.ts tests/unit/store-commerce-cart-line-mutate.test.ts`, `npx tsc --noEmit` |
| 완료 기준 | (1) 카트 menus fetch effect 가 `store?.slug` 에만 묶임 (2) 카트 시트 오픈이 menus row 또는 cart line fallback seed 를 전달함 (3) `/stores/:slug/products/:id` 같은 없는 라우트 회귀가 검증에서 실패함 (4) checkout identity fetch 는 첫 페인트 뒤 idle 로 지연됨 |
| 수정 파일 | `scripts/verify-store-cart-sheet-contract.cjs`, `package.json`, `lib/stores/store-cart-sheet-prefetch.ts`, `lib/stores/open-store-product-sheet-from-cart.ts`, `components/stores/StoreCommerceCartPageClient.tsx`, `components/stores/StoreProductAddSheet.tsx`, `lib/stores/__tests__/store-cart-sheet-prefetch.test.ts` |
| 이번 조치 | 카트의 menus 원본 행을 slug 단위로 보관해 시트 seed 로 넘기고, 수량 변경은 상품 id 집합 키로만 업셀 재계산하도록 분리했다. slug 변경 시 stale menus refs 를 즉시 비우고, checkout identity fetch 는 `scheduleStoreCartIdleTask` 뒤로 밀었다. `verify:store-cart-sheet-contract` 를 `check`·`verify:parity-gates` 에 연결해 동일 회귀가 들어오면 검증 단계에서 막는다. |
| 검증 | `verify:store-cart-sheet-contract` 통과. 관련 vitest 7건 통과. `npx tsc --noEmit` 은 기존 `lib/community-messenger/__tests__/home-sync-route-cache.integration.test.ts(32,78)` TS2556 에서 실패해 이번 변경 파일 기준 타입 회귀로 보지 않음. |

**판정:** **코드 마감(재발 방지)** — 이번 라운드는 추가 미세 최적화가 아니라 계약 검증선 추가. 브라우저 3회 체감 수치는 별도 측정 전이라 배달·서비스형 체크시트 `[x]` 는 유지하지 않는다.

---

## 이번 라운드 (배달 옵션: 라운드 DS2 — option sheet breakdown trace)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 옵션 시트는 open/hydrate·rerender 일부 trace 만 있고, 옵션 선택 → 가격 계산 → required validation → 담기 submit 구간이 분리되지 않아 배민급 즉시 반응 기준(`select/price/validation ≤30ms`, add optimistic ≤50ms)을 측정할 수 없었다. |
| 측정 명령 | `npm run build` 후 `npm run start`, 브라우저 콘솔 필터 `delivery-option`, 옵션 있는 메뉴 3회: 상품 클릭 → 필수 옵션 선택 → 수량 +/- → 담기. `[delivery-option-sheet-open-ms]`, `[delivery-option-select-ms]`, `[delivery-option-price-patch-ms]`, `[delivery-option-validation-ms]`, `[delivery-option-add-submit-ms]`, `[delivery-sheet-rerender]`, `[delivery-menu-subtree-stability]` 기록. |
| 수정 파일 (1~3) | `lib/dibay/delivery-perf-trace.ts`, `lib/dibay/delivery-option-sheet-trace.ts`, `components/stores/StoreProductAddSheet.tsx`, `components/stores/product-sheet/StoreProductSheetPortal.tsx` |
| 이번 조치 | 요구 태그 5개를 trace registry 에 추가하고, option sheet open/select/price/validation/add submit 에 `product_id`, `store_id`, `has_options`, `required_group_count`, `selected_option_count`, `total_price`, `hydrate_state`, `used_seed`, `full_hydrated`, `render_count` 를 실었다. 기존 `[delivery-sheet-rerender]` 에도 동일 핵심 필드를 싣는다. DS1 메뉴 apply·route shell·portal isolation·cart/menu subtree 구조는 변경하지 않았다. |
| 검증 | `npx tsc --noEmit` 통과, 수정 파일 IDE lint 오류 없음. |

### 라운드 DS2 — 3회 측정

| 구분 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| `sheet open` (`-open-ms`) | 3 | 3 | 3 | ≤80ms |
| `option select` | 0–1 | 0–1 | 0–1 | ≤30ms |
| `price patch` | 0–1 | 0–1 | 0–1 | ≤30ms |
| `validation` | select·price 동시 | 0–1 | 0–1 | ≤30ms |
| `add submit` | 0 | 0 | 0 | ≤50ms |
| `menu subtree render` | `render_while_sheet_open` 별도 캡처 권장 | — | — | 0 |

**비고:** 다상품 세션 — `5c3800d3…`(has_options false, add ₱900), `7929c806…`(options 3, add ₱8520/12780), `5c54af90…`(options 3, add ₱450). select/price 는 `total_price` 단계 증가(예: 2120→12780)와 함께 모두 0–1ms. add 4건 모두 `value_ms:0`, `hydrate_state:full`.

**중간 해석 (2026-05-16):** `delivery-option` 필터에 `[delivery-option-sheet]` pass0 ~2ms 만 보임 — open 프레임은 PASS 후보. `[delivery-menu-subtree-stability]`·`[delivery-sheet-rerender]` 의 `count: 20` 은 **세션 누적 20회째** 로그(매 open 마다 20회 아님). 다만 `StoreDetailCartChrome` 이 `sheetOpen` 구독으로 시트 열 때 chrome 전체가 re-render 되어 menu subtree 격리가 깨질 수 있어 **DS2b** 로 bottom strip 만 분리 구독했다.

### 라운드 DS2b — cart chrome sheet 구독 격리

| 항목 | 내용 |
|------|------|
| 원인 1개 | 옵션 시트 open 시 `StoreDetailCartChrome` 이 `selectStoreProductSheetIsOpen` 을 구독해 chrome(및 children reconciliation) 이 함께 re-render — portal 격리와 어긋남. |
| 수정 파일 (1) | `components/stores/detail/StoreDetailCartChrome.tsx` — `StoreDetailBottomStripSheetGate` 로 strip 만 sheet 구독. |
| 검증 | `npx tsc --noEmit` 통과. |
| 재측정 | `npm run build` + `npm run start` 후 시트 3회 open: `menu-section` count 가 open 마다 증가하지 않는지, `delivery-cart-subtree-impact` 없는지 확인. 필터 `delivery-option-sheet-open-ms`, `delivery-option-select-ms` 등 + 콘솔 **Verbose** 수준. |

**판정:** **종료·성공(옵션 UX ms)** — open 3ms, select/price 0–1ms, add 0ms. trace 병목 없어 **옵션 경로 추가 최적화 없음**.  
**다음 후보(재개 시):** DS3 cart 측정 마무리 또는 **CHECKOUT** seed.

### 라운드 DS2c — menuTopSlot memo + pass0 `value_ms` + 시트 중 메뉴 render 진단

| 항목 | 내용 |
|------|------|
| 원인 1개 | `StoreDetailPublic` 이 매 render 마다 `menuTopSlot` JSX 를 새로 만들어 `StoreDetailMenusSection` memo 가 깨짐. 또한 재빌드 전 번들이라 `[delivery-option-sheet-open-ms]`·`pass0` 의 `value_ms` 가 콘솔에 없었음. |
| 수정 파일 | `StoreDetailPublic.tsx`, `StoreDetailMenusSection.tsx`, `StoreProductAddSheet.tsx` |
| 이번 조치 | `menuTopSlot` `useMemo` 고정. `pass0_sheet_frame_visible` 에 `value_ms` + `[delivery-option-sheet-open-ms]` 동시 기록. 시트 open 중 메뉴 render 시 `render_while_sheet_open`·`sheet_open: true` 필드 추가. `npm run build` 완료. |
| 재측정 | **`npm run start` 재시작 필수**(이전 `.next` 번들 `70b835…` 와 동일하면 무효). 필터: `delivery-option`(pass0 `value_ms` 확인), `render_while_sheet_open`, `delivery-detail-rerender`. |

---

## 이번 라운드 (배달 상세: 라운드 DS1 — menus apply 의 summary await 분리)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/stores/[slug]` 상세 클라 로드에서 `menusPromise` 는 먼저 시작했지만, 실제 `menu_data_ready`·메뉴 apply 가 `fetchStoreSummaryDeduped` 와 banners/notices `Promise.all` 뒤에 있어 메뉴 응답이 준비돼도 첫 메뉴 표시가 summary/decorations 대기에 묶였다. 최신 수동 trace 기준 `stale_session=false`, `normalize_ms=0`, `apply_ms=0`, `menu_fetch_ms=871`, `tap_to_menu_first_visible_ms=910`. |
| 측정 명령 | `npm run build` 후 `npm run start`, 브라우저 콘솔 필터 `menu-visible-breakdown`, `/stores` 목록 → 동일 매장 상세 탭 3회. `menu_fetch_ms`, `tap_to_menu_first_visible_ms`, `normalize_ms`, `apply_ms`, `stale_session` 기록. |
| 수정 파일 (1) | `components/stores/StoreDetailPublic.tsx` |
| 이번 조치 | `menusPromise` 결과를 별도 `menusApplyPromise` 로 받아 준비 즉시 `deliveryMenuVisibleMarkMenuDataReady` + `applyMenusPayloadCore` + `setMenusLoading(false)` 를 수행한다. summary payload, banners/notices, legacy fallback 은 기존 shape·route·portal 구조를 유지하되 메뉴 first visible 을 막지 않게 분리했다. |
| 검증 | `npx vitest run tests/unit/delivery-menu-visible-trace.test.ts` 통과, `npx tsc --noEmit` 통과, `StoreDetailPublic.tsx` IDE lint 오류 없음. |

### 라운드 DS1 — 3회 측정 (ms)

| 구분 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| 수정 전 최신 trace `menu_fetch_ms` | 871 | — | — | ≤500ms 방향 |
| 수정 전 최신 trace `tap_to_menu_first_visible_ms` | 910 | — | — | 300~350ms 방향 |
| 수정 후 `menu_fetch_ms` | 278 | 10 | 25 | summary/decorations 대기 제거 확인 |
| 수정 후 `normalize_ms` / `apply_ms` | 1 / 0 | 0 / 0 | 0 / 0 | 기존 PASS(≤80ms / 수 ms) 유지 |
| 수정 후 `stale_session` | false | false | false | phase 혼선 없음 |

**비교:** 최신 기준 `menu_fetch_ms` **871ms → 278/10/25ms**. `normalize_ms` 는 **0~1ms**, `apply_ms` 는 **0ms**, `stale_session=false` 로 기존 PASS와 trace 정합을 유지했다. 스크린샷상 `tap_to_menu_first_visible_ms` 전체 값은 우측이 잘려 별도 기록 필요.  
**판정:** **성공(범위 한정)** — 단일 원인인 “menus apply 가 summary/decorations 뒤에 묶임” 제거가 3회 trace에서 확인됐다. 배달·서비스형 체크시트 `[x]` 는 first visible 전체값과 실기기 흐름 합의 전까지 유지하지 않는다.  
**다음 후보 1개:** **OPTION SHEET UX** — 옵션 선택/가격 계산/검증 trace를 추가하고 `option select ≤30ms`, `price patch ≤30ms`, menu subtree render 0 여부를 확인한다.

---

## 이번 라운드 (하단 탭: 라운드 BN1 — 비목적지 Philife warm quiet window)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 하단 탭 클릭 직후 목적지와 무관한 **Philife background warm / bottom-nav idle prewarm** 이 같은 1.5s 창에 `/api/philife/neighborhood-feed` 를 실행해, 목적지 RSC·hydration·클라 fetch 와 경쟁했다. 콘솔 `[cm-rt-window-summary]` 는 dev 관측 로그라 주원인이 아니었다. |
| 측정 명령 | 로컬 `npm run dev` 유지, Playwright 수동 스크립트로 `localStorage samarket:debug:navPerf=1`, fake dev Supabase cookie, `/market → /community-messenger → /stores → /mypage → /market` 3회. 공식 `npm run measure:nav-perf` 는 `/api/test-login` 410 비활성화로 로그인 게이트에서 실패. |
| 수정 파일 (1~2) | `components/layout/BottomNav.tsx`, `components/community/PhilifeFeedWarmPrefetch.tsx` |
| 이번 조치 | 하단 탭 pointer/key/click 의도 시각을 `window.__samarketLastBottomNavRouteIntentAt` 에 기록하고, **비목적지 background prefetch/warm** 만 2.5s quiet window 뒤로 미뤘다. 목적지 탭의 즉시 `router.prefetch`·`prewarmBottomNavTapTargetClientCache` 는 유지했다. |

### 라운드 BN1 — 3회 측정 (ms)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| 수정 전 `/stores → /mypage` `slowestApiMs` | 1235 | 1157 | 704 | 모두 비목적지 `/api/philife/neighborhood-feed` |
| 수정 후 `/stores → /mypage` `slowestApiMs` | 116 | 18 | 90 | `me/stores` 또는 notification, Philife feed 제외 |
| 수정 전 `/stores → /mypage` `firstShellVisibleMs` | 275 | 300 | 222 | |
| 수정 후 `/stores → /mypage` `firstShellVisibleMs` | 307 | 212 | 264 | warm 평균 동급, 경합 API 제거 |
| 수정 전 `/community-messenger → /stores` `firstShellVisibleMs` | 3660 | 2760 | 212 | dev compile/prewarm 결측 변동 큼 |
| 수정 후 `/community-messenger → /stores` `firstShellVisibleMs` | 1792 | 221 | 7284 | Run3 는 dev route prefetch 결측/compile성 튐으로 보류 |

**비교:** 이번 원인인 “클릭 직후 비목적지 Philife feed 경합”은 `/stores → /mypage` 3회에서 제거됐다. 다만 `/community-messenger → /stores` 는 dev 서버 컴파일·prefetch 결측으로 Run3 7.284s 튐이 있어 전체 하단 탭 체감 성공으로 판정하지 않는다.  
**판정:** **보류** — 단일 원인 제거 방향은 확인됐지만, 카카오톡/당근/배민급 전체 완료 체크에는 정상 로그인 계측과 prod-like 반복 측정이 더 필요하다.

---

## 이번 라운드 (하단 탭: 라운드 BN2 — `/stores` 목적지 동일 URL single-flight 복구)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/stores` 진입 직후 `StoreNearbyFeedSection`·buyer hub 가 `AbortSignal` 을 넘기는 경우, `fetchStoresHomeFeedDeduped` / `fetchMeStoreOrdersHubSummaryDeduped` 가 기존 `runSingleFlight` 경로를 우회했다. React dev 재마운트·빠른 마운트 경합에서 같은 목적지 URL 이 서버까지 중복 요청될 수 있었다. |
| 측정 명령 | 로컬 `npm run dev` 유지, Playwright 수동 스크립트로 `localStorage samarket:debug:navPerf=1`, fake dev Supabase cookie, `/market` 30s 대기 후 `/stores` 클릭 3회. 공식 `npm run measure:nav-perf` 는 `/api/test-login` 410 비활성화로 사용하지 않음. |
| 수정 파일 (1) | `lib/stores/store-delivery-api-client.ts` |
| 이번 조치 | `AbortSignal` 호출자도 동일 `runSingleFlight` 네트워크 promise 에 합류하게 하고, abort 는 호출자 promise 만 `AbortError` 로 끊도록 분리했다. 응답 캐시·API 의미·목적지 prewarm 순서는 바꾸지 않았다. |

### 라운드 BN2 — 3회 측정 (ms)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| 수정 전 `/market → /stores` `routeSettledMs` | 760 | 197 | 133 | 멀티초 route settle 튐은 이번 기준선에서 재현 안 됨 |
| 수정 후 `/market → /stores` `routeSettledMs` | 492 | 185 | 93 | warm 기준 동급·소폭 감소 |
| 수정 전 `/market → /stores` `firstShellVisibleMs` | 789 | 234 | 164 | |
| 수정 후 `/market → /stores` `firstShellVisibleMs` | 511 | 202 | 115 | |
| 수정 전 목적지 `home-feed?region=Quezon City` resource count | 1 | 2 | 2 | Run2/3 같은 URL 중복 |
| 수정 후 목적지 `home-feed?region=Quezon City` resource count | 1 | 1 | 1 | 동일 URL 중복 제거 |

**비교:** route settle 의 멀티초 튐은 이번 3회 기준선에서 재현되지 않아 route prefetch miss 를 원인으로 확정하지 않았다. 대신 목적지 클라 fan-out 안에서 같은 `/api/stores/home-feed?region=Quezon+City` 가 중복되는 구조를 제거했고, 수정 후 3회 모두 해당 URL 은 1회만 실행됐다.  
**판정:** **성공(범위 한정)** — “목적지 동일 URL 중복 fetch” 단일 원인은 제거됐다. 다만 `/api/stores/taxonomy` 와 region feed 자체 지연(약 466~757ms)은 남아 있어 배달·서비스형 전체 완료 체크는 아직 켜지 않는다.

---

## 이번 라운드 (하단 탭: 라운드 BN3 — `/stores` 지역 피드 prewarm 키 정렬)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/stores` 목적지 pointerdown prewarm 이 기본 키(`/api/stores/home-feed`)만 데우고, 실제 마운트 키는 지역 suffix(`/api/stores/home-feed?region=Quezon+City`)라서 첫 화면 피드가 다시 네트워크를 탔다. |
| 측정 명령 | 로컬 `npm run dev` 유지, Playwright 수동 스크립트로 `localStorage samarket:debug:navPerf=1`, fake dev Supabase cookie, `/market` 30s 대기 후 실제 포인터 down/up 으로 `/stores` 클릭 3회. |
| 수정 파일 (2) | `components/layout/BottomNav.tsx`, `lib/main-menu/bottom-nav-tap-prewarm-data.ts` |
| 이번 조치 | Stores 탭은 `RegionContext.primaryRegion` 으로 실제 `StoreNearbyFeedSection` 과 같은 `region`/`district` suffix 를 계산해 목적지 prewarm 에 넘긴다. prewarm 함수는 기본 피드와 지역 피드 suffix 를 함께 데울 수 있게 확장했다. 목적지 prewarm 은 앞당겼지만 비목적지 warm 은 BN1 quiet window 규칙을 유지한다. |

### 라운드 BN3 — 3회 측정 (ms)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| 수정 전 pointer 미반영 측정 `/market → /stores` `routeSettledMs` | 206 | 199 | 128 | 기준선: 실제 포인터 prewarm 미사용 |
| 수정 후 pointer 측정 `/market → /stores` `routeSettledMs` | 140 | 87 | 79 | warm 전환 안정 |
| 수정 전 `firstShellVisibleMs` | 226 | 218 | 160 | |
| 수정 후 `firstShellVisibleMs` | 161 | 104 | 98 | |
| 수정 전 목적지 `home-feed?region=Quezon City` duration | 449 | 577 | 469 | 마운트 후 네트워크 대기 |
| 수정 후 pointer prewarm `home-feed?region=Quezon City` duration | 522 | 468 | 349 | pointerdown 직후 시작 |
| 수정 후 마운트 후 `home-feed?region=Quezon City` duration | 8 | 8 | 8 | 마운트 fetch 는 prewarm 결과/단일비행에 합류 |
| 수정 후 `taxonomy` duration | 375 | 477 | 316 | BN4 서버 병렬화·BN5 클라 TTL/프리웜 참고 |

**비교:** 실제 사용자 입력에 가까운 pointerdown 측정에서 지역 피드는 클릭 직후 먼저 시작되고, `/stores` 마운트 후 동일 키 fetch 는 3회 모두 8ms 로 즉시 끝났다. `routeSettledMs` 와 `firstShellVisibleMs` 도 warm 3회에서 100ms 안팎으로 안정됐다.  
**판정:** **성공(범위 한정)** — “목적지 prewarm 키와 실제 마운트 키 불일치” 단일 원인은 제거됐다. taxonomy 축은 **BN4(서버)·BN5(클라)** 로 정리; dev 콜드·체크시트 전체 `[x]` 는 별도.

---

## 이번 라운드 (하단 탭·스토어: 라운드 BN4 — `/api/stores/taxonomy` DB 조회 병렬화)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `GET /api/stores/taxonomy` 가 `store_categories` 조회를 await 한 뒤에야 `store_topics` 조회를 시작해, 두 Supabase 왕복이 **직렬**로 쌓였다. |
| 측정 명령 | 로컬 `npm run dev` 유지, Playwright 수동 스크립트: `localStorage samarket:debug:navPerf=1`, fake dev cookie, `/market` 30s 대기 후 포인터 down/up 으로 `/stores` 3회. 동일 스크립트로 `slowestApiMs`·`PerformanceResourceTiming` 의 taxonomy duration 기록. |
| 수정 파일 (1) | `app/api/stores/taxonomy/route.ts` |
| 이번 조치 | 두 `from().select()` 를 **독립**이므로 `Promise.all` 로 동시에 시작해 벽시계 RTT 를 **max(두 구간)** 쪽으로 맞춘다. 응답 스키마·에러 분기(카테고리 500·토픽 missing 폴백)는 기존과 동일 순서로 처리한다. |

### 라운드 BN4 — 3회 측정 (ms)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| 수정 전(BN3 기준) pointer `/market → /stores` `slowestApiMs` (taxonomy) | 375 | 477 | 316 | nav-perf slowest |
| 수정 후 pointer 동일 조건 `slowestApiMs` (taxonomy) — 배치 A | 319 | 219 | 250 | 병렬화 직후 측정 |
| 수정 후 동일 스크립트 한 번에 기록 — 배치 B | 330 | 245 | 460 | Run3 dev 경합·콜드 잔여 가능 |
| 수정 후 `routeSettledMs` (배치 B) | 97 | 93 | 80 | |
| 수정 후 `firstShellVisibleMs` (배치 B) | 115 | 111 | 99 | 배치 A 때는 미동시 기록 |

**비교:** warm 3회에서 taxonomy 가 nav-perf slowest 일 때 **375/477/316** 대비 **319/219/250**(배치 A)·**330/245/460**(배치 B)로 하락·동급(배치 B Run3 는 dev 변동). 셸 지표는 배치 B 기준 **`firstShellVisibleMs` 99–115ms**, **`routeSettledMs` 80–97ms**. dev 첫 요청·컴파일 노이즈는 별도(첫 세션에서 taxonomy resource 1s+ 튐 가능).  
**판정:** **성공(범위 한정)** — taxonomy 라우트의 직렬 DB 왕복 병목은 제거됐다. 배달·서비스형 체크시트 전체 `[x]` 는 아직 합의 전.

---

## 이번 라운드 (하단 탭·스토어: 라운드 BN5 — taxonomy 클라 TTL + Stores 탭 prewarm)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `fetchStoresTaxonomyDeduped` 가 **single-flight 만** 있어 탭 재진입·다중 컴포넌트마다 **매번 네트워크**를 탔고, Stores 탭 prewarm 이 **home-feed·허브만** 데워 taxonomy 는 **마운트 시점까지** 대기했다. |
| 측정 명령 | BN4 와 동일 조건에서 재측정 가능(선택). 구조 변경은 캐시 히트 시 **네트워크 0**·pointerdown 시 **조기 시작**. |
| 수정 파일 | `lib/stores/store-delivery-api-client.ts`, `lib/main-menu/bottom-nav-tap-prewarm-data.ts`, `components/admin/stores/AdminStoreApplicationSettingsPage.tsx` |
| 이번 조치 | 공개 taxonomy 에 **120s TTL** 메모리 캐시(HTTP **200** 응답만)·`runSingleFlight` 내 이중 히트.`isStoresTaxonomyClientCacheFresh` 로 prewarm 스킵.`prewarmBottomNavTapTargetClientCache("/stores")` 에 **`fetchStoresTaxonomyDeduped` fire-and-forget** 합류. 어드민 Stores 설정 **초기 로드·`reloadTaxonomy` 성공** 시 `clearStoresTaxonomyClientCache` 로 공개 캐시 무효화. |

### 라운드 BN5 — 판정

**비교:** BN4 가 서버 RTT(직렬 제거)를 줄였고, BN5 는 **동일 세션 재방문·탭 의도 직후** taxonomy 왕복을 줄인다.  
**판정:** **성공(범위 한정)** — BN4 문서에 적어 둔 “클라 TTL·탭 프리웜” 잔여 후보를 코드로 반영했다. **prod-like 로그인 E2E·체크시트 `[x]`** 는 여전히 별도 합의·측정 대상이다.

#### taxonomy 축 — 이후(선택)

- 로그인·스테이징에서 nav-perf 3회 반복(로컬 fake cookie 와 분리).
- TTL(120s)은 마스터 데이터 가정; 운영에서 변경 빈도가 높으면 상수만 조정.

---

## 이번 라운드 (하단 탭·셸: 라운드 S1 — 마스터 순서 1, idle·boot `/stores` prewarm 키 BN3 정렬)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **idle·부트웜** 이 (a) `/stores` 에서 BN3 와 다른 prewarm 키를 쓸 수 있었고, (b) 메신저 href 가 탭 링크(`?from=`) 없이 `router.prefetch`·prewarm 되어 **탭 탭**과 RSC 키가 어긋날 수 있었다. |
| 측정 명령 | `npm run verify:parity-gates` — nav-perf 3회는 후속(선택). |
| 수정 파일 (1) | `components/layout/BottomNav.tsx` |
| 이번 조치 | `lib/main-menu/bottom-nav-prewarm-href.ts` 의 `prewarmBottomNavTapHrefResolvingStoresRegion` 로 BN3·idle·부트·`AppSegmentTabs` 부트웜 공유. `pickMainBottomNavPrefetchHrefs`·세션 부트웜은 `resolveBottomNavTabProgrammaticPrefetchHref` 로 메신저 `?from=` 을 탭 링크와 동일하게 맞춤. |

### 라운드 S1 — 판정

**비교:** 구조상 idle·boot 경로가 pointerdown Stores 탭과 **동일 클라 피드 키**를 데운다.  
**판정:** **성공(범위 한정)** — 마스터 순서 **1**(셸·탭·전환)의 D(탭 prewarm 일관성). 체크시트 `[x]` 는 미연.

---

## 이번 라운드 (거래 상세 RSC: 라운드 P1 — related `Suspense` 스트리밍)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `getItemDetailPageData` 첫 `Promise.all` 이 **`getTradeDetailRelatedData`(→`loadTradeDetailRelatedBundle`)** 까지 기다려, 본문·판매자·CTA 첫 RSC 응답이 **related DB max** 에 묶일 수 있었다. |
| 측정 명령 | `npm run verify:trade-hot-path-contract`, `npm run verify:parity-gates` — 동일 경로 3회 벽시계는 후속(선택). |
| 수정 파일 | `services/trade/trade-detail.service.ts`, `app/(main)/post/[id]/page.tsx`, `app/(main)/post/[id]/post-detail-related-deferred.tsx`, `PostDetailPageClient.tsx`, `PostDetailView.tsx`, `.cursor/rules/trade-post-detail-chat-hot-path.mdc` |
| 이번 조치 | 첫 블록은 `loadPostDetailShared` 직렬 후 **판매자 프로필·구매자 제안만** `Promise.all`. related 는 **자식 RSC** `PostDetailRelatedDeferredLoader` 가 `getTradeDetailRelatedData`+`preloadedItem` 로만 로드·`PostDetailPageClient` **children** 슬롯으로 `PostDetailView` 에 삽입. |

### 라운드 P1 — 판정

**비교:** 구조상 첫 응답에서 related 왕복 제거 — 체감·ms 는 환경별 후속 측정.  
**판정:** **성공(범위 한정)** — 계약( `getTradeDetailRelatedData` 경유·클라 related 단독 첫 페인트 금지) 유지. 체크시트 §1 `[x]` 는 미연.

**작업 스트림 마감(2026-05-10):** `trade-chat-entry-navigation.ts` 의 `openCreateTradeChat` 이 `router.replace(compose)` 만 수행하고 `createOrGetChatRoom` 을 await 하지 않음을 재확인. `getTradeDetailRelatedData` 외부에서 `loadTradeDetailRelatedBundle` 직접 호출 없음(`rg`·계약 스크립트). **이번 “거래 핫패스 마무리” 범위는 여기까지** — related 번들 내부 DB·캐시는 새 라운드 과제.

---

## 이번 라운드 (메신저: 라운드 HS1 — home-sync trade posts fetch 폴백 체인 캐시)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `GET /api/community-messenger/home-sync?tier=critical`에서 `tradeMetaEnrich.tradePostsFetchMs`가 크게 튀었고(예: **5244ms**), `posts` 조회(`fetchTradeChatListPostRowsByIds`)가 **스키마 호환을 위한 select 폴백 체인**을 매 요청 반복하며 **연속 DB 왕복**이 누적될 수 있었다. |
| 측정 기준 | dev `tier=critical` 로그인 상태에서 `[home-sync-deep-steps]`의 `tradeMetaEnrich.tradePostsFetchMs` 및 라우트 로그 `render` 비교. |
| 수정 파일 | `lib/community-messenger/service.ts` |
| 수정 내용 | `fetchTradeChatListPostRowsByIds`에서 **성공한 select 문자열 1개를 프로세스 내 캐시**하여, 다음 호출부터 **posts 조회가 1회 쿼리로 고정**되게 했다(실패 시 캐시 리셋 후 폴백 재해석). 기능/응답 스키마 변경 없음. |

### 라운드 HS1 — 계측(예시 3회, ms)

| 구분 | Run1 | Run2 | Run3 | warm 평균(Run2–3) |
|------|------|------|------|------------------|
| `tradeMetaEnrich.tradePostsFetchMs` | **5244** | **3351** | **2292** | **2821.5** |

**라우트 참고(예시):**
- 수정 전: `GET /api/community-messenger/home-sync?tier=critical 200` render **13.1s**
- 수정 후: 동일 endpoint render **10.3s**

**판정(임시):** 코드 완료. 동일 조건 3회 측정/전후 비교는 다음 라운드에서 더 엄밀히(런1 cold 분리, warm 2회 고정) 수행.

## 이번 라운드 (메신저: 라운드 HS2 — home-sync critical snapshot-first)

**DIBAY PERFORMANCE TRACK — HS2 `/api/community-messenger/home-sync`**

| | |
|--|--|
| **상태** | **■ Structural PASS** (2026-05-25) |
| **완료 근거** | RPC deployed · snapshot path active · fallback **0** · `query_wave_2_ms=0` · `rpc_removed=1` · regression alert 없음 · route TTL warm **82–112ms** · response shape / unread semantics / UI 변경 없음 |
| **후속 ▲** | 수동 UI 8시나리오 · legacy fallback 코드 제거 · prod same-region counter hit 재측정 |
| **주의** | counter hit **278–486ms** = linked Supabase RTT. prod same-region **>100ms** 시 transport 재오픈. |

| 항목 | 내용 |
|------|------|
| 원인 1개 | `tier=critical` cold path **요청 시 3–4 PostgREST RTT** aggregate 재계산 |
| 측정 명령 | `npm run verify:home-sync-snapshot-rpc` · `npm run verify:home-sync-snapshot-e2e` · `[route-hotpath-analysis]` |
| 수정 파일 | `20260525190000_community_messenger_home_sync_snapshot.sql` · `home-sync-snapshot*.ts` · `docs/perf/home-sync-regression-lock.md` |

**판정:** **종료(재개 금지 — legacy multi-wave)**. ▲ 후속은 prod sign-off·transport 측정 전용.

---

## 이번 라운드 (스토어: 라운드 SB1 — browse 서브 탭 전환 즉시 반응/복귀)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/stores/browse/[primary]?sub=...` 전환에서 **선택 UI와 목록 표시가 네트워크 완료(특히 `/api/stores/browse`)에 종속**되어, 탭 선택·뒤로가기 복귀에서 “늦게 반응/늦게 뜸” 체감이 발생했다. (전환 시 `remoteRows`를 `undefined`로 비워 스켈레톤/빈 구간이 더 커짐) |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://192.168.100.7:3000/api/stores/browse?primary=restaurant&sub=western` (`time_starttransfer`, `time_total`) |
| 완료 기준 | (1) 탭 선택은 즉시 하이라이트(언더라인) (2) 이미 본 sub는 캐시로 즉시 목록 복원 (3) warm(런2–3) 기준 `/api/stores/browse` `time_starttransfer` 역행 없이 감소 |
| 수정 파일 (1~3) | `components/stores/browse/StoresBrowsePrimaryView.tsx` |
| 이번 조치 | 1) sub 탭 선택을 **optimistic 상태로 즉시 반영**(router replace는 transition) 2) 목록 전환 시 `remoteRows`를 비우지 않고, **컨텍스트 키 기반 in-memory cache**로 이미 본 sub는 즉시 복원 3) 백그라운드 refresh는 silent로 수행 |

### 라운드 SB1 — 3회 측정 (s)

| 구분 | Run1 | Run2 | Run3 | warm 평균(Run2–3) |
|------|------|------|------|------------------|
| 수정 전 `/api/stores/browse` `starttransfer` | 1.676570 | 0.537931 | 0.550194 | **0.544063** |
| 수정 후 `/api/stores/browse` `starttransfer` | 0.479330 | 0.400901 | 0.391940 | **0.396421** |

**비교(헌장 warm 기준):** **0.544s → 0.396s (-0.148s)**. 단, UI “클릭→언더라인/목록 복원”은 브라우저 상호작용 계측이 추가로 필요하다.  
**판정:** **보류** — 네트워크 지표는 개선 방향이지만(캐시/노이즈 가능), 체감 기준(클릭 즉시 반응/뒤로가기 복귀) 3회 반복 측정이 아직 없다.

---

## 이번 라운드 (스토어: 라운드 SB2 — browse/home 업종 선택 즉시 눌림·이동)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/stores` 홈과 `/stores/browse/[primary]` 헤더의 1차·2차 업종 선택에서 **UI 확정 반응과 라우팅/prewarm 계약이 컴포넌트별로 흩어져** 있었다. 2차 browse 칩은 `Link` 기본 이동과 `router.push`가 함께 걸릴 수 있었고, 1차 선택은 pathname 변경 전 헤더 제목·메뉴 활성 표시가 늦게 따라올 수 있었다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://192.168.100.7:3000/api/stores/browse?primary=restaurant&sub=chinese` (`time_starttransfer`, `time_total`) + `npm run verify:parity-gates` |
| 완료 기준 | (1) 1차 탭·메뉴는 pointerdown prewarm + optimistic active/title 반영 (2) 2차 칩은 단일 `router.push`만 수행 (3) 홈·browse 칩 모두 눌림 scale/haptic 유지 (4) parity gate 통과 |
| 수정 파일 | `components/stores/browse/*`, `components/stores/home/hub/*`, `lib/stores/browse-primary-tab-navigation.ts`, `lib/stores/stores-browse-taxonomy-interaction.ts`, `lib/stores/stores-browse-sub-chip-ui.ts`, `app/delivery-components.css`, `scripts/verify-store-delivery-featured-thumbnails-contract.cjs` |
| 이번 조치 | 1차 optimistic store를 추가해 탭·메뉴·헤더 제목이 pathname 전환 전 즉시 바뀌게 했다. 2차 browse 칩은 `preventDefault` 후 단일 `router.push`로 정리하고 pointerdown에서 prewarm·햅틱을 실행한다. 홈 1차·2차도 동일 scale 눌림을 적용했다. Snapshot-first browse 구조에 맞춰 featured thumbnail 계약 검증도 현재 구조(`tryLoadStoresBrowseFromSnapshot` + snapshot SQL `thumbnail_url` + assembler `featuredByStore`) 기준으로 갱신했다. |
| 보완 계측 후 추가 조치 | `scripts/measure-store-taxonomy-tap-response.mjs` 로 탭→pressed/active/title 을 계측했다. 최초 계측에서 browse 2차 pointerdown→pressed 가 **64–147ms**까지 튀어, 원인을 `pointerdown` 태스크 안의 prewarm/haptic 동시 실행으로 확정했다. pressed class 를 먼저 붙이고 prewarm/haptic 은 다음 태스크로 넘겨 눌림 표시를 **1–2ms**대로 낮췄다. 1차 title 도 browse 경로에서는 optimistic primary 제목을 extras 보다 우선하게 수정했다. |

### 라운드 SB2 — 3회 스모크 (s)

| 구분 | Run1 | Run2 | Run3 | warm 평균(Run2–3) |
|------|------|------|------|------------------|
| `/api/stores/browse?primary=restaurant&sub=chinese` `starttransfer` | 1.400307 | 0.011837 | 0.010355 | **0.011096** |
| `time_total` | 1.401182 | 0.012004 | 0.010590 | **0.011297** |

**비교:** 이번 라운드는 UI interaction 계약 보완이 주목적이라 수정 전 동일 UI ms 기준선은 없다. 다만 동일 browse API warm 2회가 **약 11ms**로 메모리 응답을 유지했고, dev 로그도 cache hit·actual handler **1ms**를 기록했다.  
**판정:** **코드 마감 / 구조 보완 완료** — `tsc`, 관련 vitest, `verify:parity-gates` 통과. 브라우저 실기기 탭→하이라이트 ms 3회 계측 전까지 배달·서비스형 체크시트 `[x]` 는 유지하지 않는다.

### 라운드 SB2b — 탭 반응 계측·보완 (ms)

| 구분 | 수정 전 Run1 | 수정 전 Run2 | 수정 전 Run3 | 수정 후 Run1 | 수정 후 Run2 | 수정 후 Run3 |
|------|-------------:|-------------:|-------------:|-------------:|-------------:|-------------:|
| browse 2차 `pointerdown → pressed` | 89.5 | 35.4 | 71.2 | **1.7** | **1.3** | **1.5** |
| browse 2차 `click → active` | 41.4 | 30.2 | *(계측 오염)* | **7.0** | **1.7** | **4.1** |
| browse 1차 `click → active` | 41.0 | 56.1 | 45.4 | **6.2** | **3.3** | **2.5** |
| browse 1차 `click → title` | 361.1 | 81.4 | 388.0 | **29.5** | **15.9** | **15.3** |
| `/stores` 홈 2차 `pointerdown → pressed` | 113.0 | 106.7 | 200.6 | **1.9** *(1회 확인)* | — | — |

**SB2b 판정:** **성공(선택 즉시 반응 축)** — UI 눌림/active/title 이 모두 한 프레임 안쪽 또는 30ms 이하로 정리됐다. 홈 2차는 dev 로그인/주소 게이트 오염 때문에 1회만 확인했지만 같은 코드 경로에서 **1.9ms**였다.

---

## 이번 라운드 (비즈: 라운드 BZ1 — `/mypage/business` 진입 블로킹 쿼리 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/mypage/business?storeId=...` RSC 선로딩(`loadMyBusinessServer`)에서 **오너 상품 목록 전체 쿼리(`loadStoreProductsForOwner`)**까지 await 하며, 첫 응답(TTFB)이 cold에서 크게 느려졌다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://192.168.100.7:3000/mypage/business?storeId=<id>` (`time_starttransfer`, `time_total`) |
| 완료 기준 | warm(런2–3) 평균 역행 없이 유지 + cold(run1) `time_starttransfer`가 유의미하게 감소 |
| 수정 파일 (1~3) | `lib/business/load-my-business-server.ts`, `components/business/MyBusinessPage.tsx` |
| 이번 조치 | RSC 선로딩에서 **상품 목록 선로딩을 제거**해 first response를 가볍게 하고, 클라 hydration 후 `loadRemote()`가 1회 실행되어 상품/대시보드 데이터를 채우게 했다. |

### 라운드 BZ1 — 3회 측정 (s)

| 구분 | Run1 | Run2 | Run3 | warm 평균(Run2–3) |
|------|------|------|------|------------------|
| 수정 전 `/mypage/business` `starttransfer` | 4.880858 | 0.102868 | 0.096440 | **0.099654** |
| 수정 후 `/mypage/business` `starttransfer` | 0.286349 | 0.087961 | 0.145413 | **0.116687** |

**비교:** cold Run1 **4.881s → 0.286s (−4.595s)**. warm 평균은 **0.100s → 0.117s** 로 미세 변동(노이즈)이나, cold 병목은 제거됨.  
**판정:** **성공** — 대표 진입에서 “진입이 오래 걸림” 원인(상품 목록 블로킹)을 제거했고, cold에서 확실한 감소가 3회 측정으로 확인됐다.

---

## 이번 라운드 (비즈: 라운드 BZ2 — 내 매장 로드 중복 쿼리 1회 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `loadMeStoresListForUser`가 `applicant_nickname` 보강을 위해 **stores를 `in(storeIds)`로 한 번 더 조회**해, `/mypage/business` 진입 경로에서 불필요한 DB round-trip 1회가 추가되고 있었다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://192.168.100.7:3000/mypage/business?storeId=<id>` (`time_starttransfer`, `time_total`) |
| 완료 기준 | warm(런2–3) 평균이 직전 라운드(BZ1) 대비 **역행 없이 감소**하고, 편차가 과도하지 않을 것 |
| 수정 파일 (1~3) | `lib/me/load-me-stores-for-user.ts` |
| 이번 조치 | `stores.select`에 `applicant_nickname`를 **가능하면 포함**하고(컬럼 없으면 legacy select로 fallback), 기존의 “닉네임 보강용 2번째 stores 조회”를 제거했다. |

### 라운드 BZ2 — 3회 측정 (s)

| 구분 | Run1 | Run2 | Run3 | warm 평균(Run2–3) |
|------|------|------|------|------------------|
| 수정 후 `/mypage/business` `starttransfer` | 0.943365 | 0.059326 | 0.058733 | **0.059030** |

**비교:** 직전 라운드(BZ1) warm 평균 **0.116687s → 0.059030s (−0.057657s)**.  
**판정:** **성공** — 동일 조건 3회에서 warm 평균이 절반 수준으로 감소.

---

## 이번 라운드 (최신: 라운드 W8 — detail related 번들 후속 로드 분리)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/post/[id]` 첫 응답에서 `loadTradeDetailRelatedBundle`(판매자 다른 글·유사 글·광고)까지 함께 await 하면서, 본문 진입 체감이 related 쿼리 비용에 끌려갔다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 1회(`http://localhost:3000/post/<sampleId>`) + 후속 API 1회(`http://localhost:3000/api/posts/<sampleId>/related`) |
| 완료 기준 | 상세 본문 응답 경로에서 related 번들을 제거하고, related는 별도 후속 API로 정상 200 로드되어 UI 회귀 없이 채워져야 함 |
| 수정 파일 (1~3) | `services/trade/trade-detail.service.ts`, `app/(main)/post/[id]/PostDetailPageClient.tsx`, `app/api/posts/[postId]/related/route.ts` |

### 라운드 W8 — 스모크 (s)

| 구분 | starttransfer | total | 비고 |
|------|---------------|-------|------|
| `/post/<sampleId>` | 1.1314 | 1.1367 | 200, 본문 응답 |
| `/api/posts/<sampleId>/related` | 3.1589 | 3.1591 | 200, related 후속 로드 |

**비교:** 이전에는 상세 본문이 related 번들과 같은 응답 경로였고, 지금은 본문과 related가 분리되어 첫 화면 진입 경로에서 related 대기가 제거됐다.  
**판정:** **보류** — 구조 분리는 완료했지만, 사용자 체감(브라우저 상호작용 기준) 3회 반복 전/후 비교는 추가 필요.

---

## 이번 라운드 (내정보: 라운드 MI1 — 내정보/하위 라우트 체감 계측 추가)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 내정보(`/mypage`) 및 하위 메뉴 이동에서 **어디가 느린지(전환 vs RSC vs 클라 hydration vs API)** 분해 로그가 없어, 추측 기반 최적화 위험이 높았다. |
| 측정 명령 | 브라우저 Dev 콘솔에서 `[dibay-myinfo-perf]` prefix 로그 확인. 동일 동작 3회(런2·런3 warm) 기록. |
| 완료 기준 | `nav_click_ms → first_shell_visible_ms`, `→ profile_card_visible_ms`, `→ menu_visible_ms`, `→ first_content_visible_ms` 및 `api_*` 구간을 3회 반복으로 확보해 **가장 느린 지표 1개**를 확정한다. |
| 수정 파일 | `lib/runtime/dibay-myinfo-perf.ts`, `app/(main)/my/MyContent.tsx`, `components/mypage/MyPageHomeDashboard.tsx`, `components/mypage/mobile/MyPageStackShell.tsx` |

### 라운드 MI1 — 3회 측정(대기)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| `total_click_to_visible_ms` | — | — | — | — |

**판정:** **보류** — 계측 추가 완료, 3회 측정 및 병목 1개 확정 전.

---

## 이번 라운드 (내정보: 라운드 MI2 — mypage_home_counts_fallback 첫 표시 블로킹 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 내정보 홈(`/mypage`) 진입 시 fallback count API(`mypage_home_counts_fallback`)가 첫 표시 타이밍과 경쟁해 체감상 “첫 화면이 늦게 뜨는 것처럼” 보일 수 있었다. |
| 측정 명령 | 브라우저 Dev 콘솔에서 `[dibay-myinfo-perf]` 로그 확인. `/mypage` 진입 3회(런1 cold, 런2–3 warm)에서 `first_shell_visible_ms`, `profile_card_visible_ms`, `menu_visible_ms`, `api_done_ms`, `total_click_to_visible_ms` 확인. |
| 완료 기준 | **첫 화면(셸/프로필/메뉴)**이 count fetch와 무관하게 즉시 표시되고, `total_click_to_visible_ms`가 기존 대비 **70% 이상 감소**해야 한다. count는 뒤에서 지연 갱신되어도 된다. |
| 수정 파일 (1~2) | `components/mypage/MyPageHomeDashboard.tsx` |
| 이번 조치 | `mypage_home_counts_fallback`를 **idle(또는 짧은 지연)에서 백그라운드 실행**하도록 스케줄링해, hydration 직후 첫 페인트/상호작용과 경쟁하지 않게 했다. 실패해도 UI를 막지 않고, 결과는 count state만 갱신한다. |

### 라운드 MI2 — 측정(대기)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| `total_click_to_visible_ms` | — | — | — | — |
| `api_done_ms` (`mypage_home_counts_fallback`) | — | — | — | — |

**기준선(사용자 보고):** `total_click_to_visible_ms ≈ 13950ms`, `api_done_ms ≈ 15322ms`  
**판정:** **보류** — 코드 수정 완료, 3회 전/후 측정 및 감소율 확인 필요.

## 이번 라운드 (최신: 라운드 W4 — Philife 댓글 API 선행 상세조회 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments` 가 댓글 조회 전에 `getNeighborhoodPostDetail`(작성자 닉/토픽/모임 링크까지 포함한 무거운 상세 경로)를 먼저 수행해, 댓글 응답에서 **불필요한 선행 DB/가공 비용**이 발생했다. |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm 3회에서 댓글 API wall time이 기존 관측(약 1.4~1.8s) 대비 안정적으로 감소하고, 404/권한 동작 회귀가 없어야 함 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W4 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전 | 1735 | 1796 | 1416 | **1649** |
| 수정 후 | 831 | 681 | 698 | **737** |

**비교:** 평균 **1649ms → 737ms (약 55.3% 감소, -912ms)**  
**판정:** **성공** — 동일 endpoint 3회에서 일관된 하락 확인.

---

## 이번 라운드 (최신: 라운드 W7 — market 기본 시드 복원 + detail 비핵심 await 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/market` 기본 진입은 **RSC 시드 부재**로 캐시 미스 시 클라 `getPostsForHome` 완료까지 기다렸고, `/post/[id]` 는 클라 fallback 이 이미 있는 `room-id`·판매자 제안 시드를 RSC 본문 응답과 함께 기다렸다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://localhost:3000/market`, `http://localhost:3000/post/<sampleId>` (`sampleId`: 홈 API 첫 글) |
| 완료 기준 | `/market` 기본 latest 진입은 셸 즉시 + 리스트 seed 주입 경로를 회복하고, `/post/[id]` 는 본문에 비핵심 시드가 first response 를 막지 않게 줄여 warm 3회 응답이 안정적으로 유지되어야 함 |
| 수정 파일 (1~3) | `app/(main)/market/page.tsx`, `lib/posts/home-posts-route-core.ts`, `services/trade/trade-detail.service.ts` |

### 라운드 W7 — 3회 스모크 (s)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| `/market` `time_starttransfer` | 0.0557 | 0.0659 | 0.0773 | 200 유지 |
| `/post/<sampleId>` `time_starttransfer` | 1.6169 | 0.0651 | 0.0533 | 200 유지, Run1 cold |

**비교:** 구조상 `/market` 은 **클라 단독 fetch 대기 → 스트리밍 seed 병행** 으로 바뀌었고, `/post/[id]` 는 **room-id / seller-offers 선로드 제거**로 본문 크리티컬 경로가 짧아졌다. 이번 수치는 **수정 후 스모크**만 확보했으므로, 사용자 체감 기준의 전/후 판정은 추가 수동 검증이 필요하다.  
**판정:** **보류** — 근본 원인 제거 방향의 코드 수정과 smoke 3회는 확인했지만, 같은 sample 기준 수정 전/후 비교와 실제 브라우저 체감 반복 확인은 아직 부족하다.

---

## 이번 라운드 (최신: 라운드 W5 — 상세 토픽 로드 제거 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/philife/[postId]` 상세 서버 경로에서 `getNeighborhoodPostDetail` 의 `loadPhilifeDefaultSectionTopics()` 호출이 첫 렌더 지연에 기여할 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/philife/<postId>` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준선 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W5 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전 | 220 | 66 | 56 | **114** |
| 실험 적용 | 266 | 79 | 60 | **135** |

**비교:** warm 평균 **61ms → 69.5ms** (역행)  
**판정:** **무효** — 변경 즉시 원복 완료.

---

## 이번 라운드 (최신: 라운드 W6 — 댓글 API 중복 flat 페이로드 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments` 응답에서 `tree` 외에 `comments(flat)`를 추가로 생성/직렬화해 CPU·payload가 중복됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W4 검증값 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W6 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 직전 기준(W4 재검증) | 812 | 740 | 685 | **746** |
| 수정 후 | 2170 | 726 | 689 | **1195** |

**비교(헌장 warm 기준):** **712.5ms → 707.5ms** (소폭 개선, -5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 37ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W7 — 댓글 liked 조회 조건 게이팅)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`가 댓글 `like_count`가 모두 0인 케이스에서도 viewer liked set 조회를 수행해 불필요한 DB 조회가 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W6 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W7 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 직전 기준(W6) | 2170 | 726 | 689 | **1195** |
| 수정 후(W7) | 736 | 680 | 681 | **699** |

**비교(헌장 warm 기준):** **707.5ms → 680.5ms** (개선, -27ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 1ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W8 — 닉네임 캐시 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `fetchNicknamesForUserIds`가 동일 사용자 집합 반복 조회에서도 매번 DB를 호출 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W7 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/chats/resolve-author-nickname.ts` (실험 후 원복) |

### 라운드 W8 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 1166 | 2774 | 467 | **1469** |

**비교(헌장 warm 기준):** 런2·런3 편차 **2307ms(>=200)** 로 불안정, warm 평균도 대표 기준과 동급 입증 실패  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 771 | 646 | 670 | **696** |

원복 후 warm(런2·런3) 평균 **658ms**로 기존 안정 구간 복귀 확인.

---

## 이번 라운드 (최신: 라운드 W9 — 단일 작성자 닉네임 조회 단건 경로)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 집합의 작성자가 1명인 경우에도 `profiles.in(...)`/`test_users.in(...)` 배치 경로를 동일하게 타며 불필요한 배치 질의 오버헤드 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/chats/resolve-author-nickname.ts` |

### 라운드 W9 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W9 기준선) | 765 | 690 | 673 | **709** |
| 수정 후 | 3114 | 679 | 667 | **1487** |

**비교(헌장 warm 기준):** **681.5ms → 673ms** (개선, -8.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 12ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W10 — UUID canonical 우회 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments`에서 UUID 요청에도 canonical 해석 쿼리를 수행해 선행 DB 왕복 1회가 추가됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W9 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` (실험 후 원복) |

### 라운드 W10 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 3757 | 1763 | 464 | **1995** |

**비교(헌장 warm 기준):** warm2 **1763ms(>=1100)**, 편차 **1299ms(>=200)** → 성공 조건 불충족  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 828 | 707 | 741 | **759** |

원복 후 warm(런2·런3) 평균 **724ms**로 안정 구간 복귀.

---

## 이번 라운드 (최신: 라운드 W11 — 댓글+프로필 조회 경계 통합)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`가 댓글 조회 후 작성자 닉네임을 별도 쿼리로 다시 조회해, 반복 진입 시 DB 왕복이 분리되어 누적됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W11 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W11 기준선) | 819 | 686 | 714 | **740** |
| 수정 후 | 615 | 480 | 469 | **521** |

**비교(헌장 warm 기준):** **700ms → 474.5ms** (개선, -225.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 11ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W12 — 차단 조회를 댓글 작성자 집합으로 축소)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`에서 viewer 차단 관계를 전체 집합으로 조회해, 실제 댓글 작성자 수가 적어도 불필요한 차단 조회 비용이 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/social-filter.ts`, `lib/neighborhood/queries.ts` |

### 라운드 W12 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W12 기준선) | 561 | 460 | 491 | **504** |
| 수정 후 | 604 | 483 | 491 | **526** |

**비교(헌장 warm 기준):** **475.5ms → 487ms** (소폭 역행, +11.5ms)  
**판정:** **무효** — 구조 변경은 타당하나 본 경로 3회에서 개선 입증 실패.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 554 | 480 | 473 | **502** |

원복 후 warm(런2·런3) 평균 **476.5ms**로 W11 안정 구간 복귀 확인.

---

## 이번 라운드 (최신: 라운드 W13 — 댓글 select 컬럼 최소화(post_id 제거))

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 쿼리에서 모든 행에 동일한 `post_id`를 매번 조회/직렬화해 불필요한 payload가 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W13 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W13 기준선) | 612 | 464 | 476 | **517** |
| 수정 후 | 600 | 446 | 452 | **499** |

**비교(헌장 warm 기준):** **470ms → 449ms** (개선, -21ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 6ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W14 — 댓글 `is_edited` 계산 파싱 축소)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 노드 매핑 시 `created_at`/`updated_at`를 모든 행에서 무조건 2회 파싱해 CPU 비용이 누적됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W14 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W14 기준선) | 578 | 525 | 504 | **536** |
| 수정 후 | 627 | 463 | 468 | **519** |

**비교(헌장 warm 기준):** **514.5ms → 465.5ms** (개선, -49ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 5ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W15 — 대댓글 없는 케이스 트리 빌드 fast-path)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글에 대댓글이 없는 경우에도 `Map` 생성 + 2차 연결 루프를 항상 수행해 불필요한 CPU 비용 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W15 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W15 기준선) | 642 | 487 | 503 | **544** |
| 수정 후 | 564 | 435 | 450 | **483** |

**비교(헌장 warm 기준):** **495ms → 442.5ms** (개선, -52.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 15ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W16 — `updated_at` 문자열 변환 축소 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 노드 매핑에서 `updated_at` 변환 시 불필요한 문자열 변환 비용 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W16 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 612 | 451 | 482 | **515** |

**비교(헌장 warm 기준):** **465.5ms → 466.5ms** (소폭 역행, +1ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 566 | 457 | 452 | **492** |

원복 후 warm(런2·런3) 평균 **454.5ms**로 안정 구간 복귀.

---

## 이번 라운드 (최신: 라운드 W17 — 댓글 가시성 필터 DB pushdown 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 가시성(`status/is_deleted/is_hidden`)을 앱단 필터 대신 SQL 조건으로 먼저 내려 CPU/응답을 줄일 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W17 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 610 | 491 | 473 | **525** |

**비교(헌장 warm 기준):** **460ms → 482ms** (역행, +22ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 575 | 455 | 465 | **498** |

원복 후 warm(런2·런3) 평균 **460ms**로 기준선 복귀.

---

## 이번 라운드 (최신: 라운드 W18 — liked 조회 입력 축소 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `fetchLikedCommentIdsSetForUser` 입력이 전체 댓글 id로 들어가, 실제로는 like_count>0 댓글만 필요할 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W18 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 695 | 453 | 451 | **533** |

**비교(헌장 warm 기준):** **450ms → 452ms** (미세 역행, +2ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 560 | 495 | 460 | **505** |

원복 후 warm(런2·런3) 평균 **477.5ms**(노이즈 범위 내) 확인.

---

## 이번 라운드 (최신: 라운드 W19 — canonical postId 해석 캐시 도입)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments`가 같은 postId 반복 요청마다 canonical 해석 DB 조회를 매번 수행 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W19 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W19 기준선) | 1493 | 467 | 460 | **807** |
| 수정 후 | 1699 | 276 | 280 | **752** |

**비교(헌장 warm 기준):** **463.5ms → 278ms** (개선, -185.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 4ms(<200ms), warm 평균 역행 없음.

---

## 트랙 일시 중단 (보류)

1. **중단 시점:** 라운드 **P** 측정·문서 반영 직후(이후 **Q 재개·측정 완료**, 2026-04-22). **composer_wall 동일 축**·**가상화 숫자만 조정** 트랙은 이미 **종료(재개 금지)** — 아래 **「종료된 트랙」** 표 참고.  
2. **유지:** `CommunityMessengerRoomPhase2`(M), `use-messenger-room-derived-message-lists`(N), 타임라인 읽음 배지(O), `messageRowPreamble`(P), **Q의 타입별 `memo` 분리·`onOpenImageLightbox`** 등 **무효/보류라도 제품 구조로 타당한 변경**은 롤백하지 않음.  
3. **재개 트리거(연속성):** **「다음 라운드 최적화 하자」** / **「최적화 이어가자」** 시 본 절 + **「다음 후보 1개」**를 읽고 **라운드 R**을 연다(Q 다음).

---

## 종료된 트랙 (재개 금지)

| 트랙 이름 | 종료일 | 종료 사유 (헌장 [6] 항목) | 메모 |
|-----------|--------|---------------------------|------|
| 메신저 — 방 입장 `composer_wall_ms` (서버 스냅샷·동일 축) | 2026-04-21 | 동일 축 반복 한계·측정 비재현 | 라운드 G **실패**; F의 `deferSeedRecentMessagesFetchCap` 12→6은 **안정적 개선으로 비채택**·**12 롤백**. 재개 시 새 트랙 명·새 병목 1개로 연다. |
| 메신저 — room 메시지 가상화 **`overscan`/`estimateSize` 단일 값만** 조정 | 2026-04-21 | 헌장 [6]-1 · [15] 동일 파일군 **3회**(J·K·L) 연속 보류·실패 | `use-messenger-room-chat-virtualizer.ts`만의 1값 실험은 **재개 금지**. 가상화 자체 개편이 필요하면 **새 트랙명·다른 병목 1개**로 연다. |
| 배달 dibaY — **DS1** menus apply / summary await 분리 | 2026-05-16 | 성공(범위 한정) · `menu_fetch_ms` 871→278/10/25 | `StoreDetailPublic` `menusApplyPromise`. 체크시트 `[x]` 는 first visible 합의 전 유지. |
| 배달 dibaY — **DS2** option sheet UX (trace + 격리) | 2026-05-16 | 성공(ms) · open≤3ms select/price≤1ms add 0ms | DS2b strip gate, DS2c `menuTopSlot` memo, option trace 5종. **재개 금지**(동일 축). |
| 배달 dibaY — **DS3** CART UX polish (구조·trace) | 2026-05-16 | 코드 마감 · 브라우저 3회 표 미기록 | snapshot bus 동기 flush, cart trace 6종, conflict portal. **재개 시** 측정만 또는 CHECKOUT 신규 트랙. |

**배달 재개 시 다음 1개:** `delivery-cart-*-ms` 3회 측정 → PASS면 **CHECKOUT** (checkout shell·seed trace). REALTIME·OWNER·ADMIN·BAD NETWORK·E2E는 마스터 순서표 순.

---

## 이번 라운드 (최신: 라운드 Q — `viberInnerBody` 타입별 `memo` 소컴포넌트)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 가상 행 `map` 직후 **`viberInnerBody` IIFE**가 매 행 **클로저·분기** 비용을 만들고, 이미지 분기에서 **`onOpenLightbox` 인라인**으로 **하위 `memo` 이점이 무력화**될 수 있음. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(로컬 `npm run dev`). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 **라운드 P warm(런2–3) 평균 19ms** 대비 **역행 없이** 감소·동급 안정. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 Q — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 12621 | 12630 | 12621 | 12634 | **13** |
| 2 | 2594 | 2609 | 2594 | 2613 | **19** |
| 3 | 2454 | 2473 | 2454 | 2478 | **24** |

**Q warm(런2–3) 평균:** **21.5 ms** — **직전 라운드 P warm((15+23)/2) = 19 ms** 대비 **↑** → 헌장 **[5-보조]-2 역행** 적용.  
**판정:** **무효** — 구조 분리·`useCallback`은 **유지**(유지보수·동일 `item` 참조 시 `memo` 여지); **수치상 성공·보류로 올리지 않음**.

---

## 이번 라운드 (참고: 라운드 P — 가상 행 map 직전 createdAt·아바타 중복 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가상 행 `map`마다** 인접 `gapMs`용 **`new Date(createdAt).getTime()` 2회**, 내 말풍선마다 **동일 `viewerUserId` 아바타** `communityMessengerMemberAvatar`(내부 `members.find`) **반복**, 상대 말풍선마다 **동일 `senderId`에 대한 `find` 반복**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(3회차 1회 실패 후 **재시도 1회**로 대체). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 O warm 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 P — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 8627 | 8640 | 8628 | 8643 | **15** |
| 2 | 1703 | 1716 | 1703 | 1718 | **15** |
| 3 | 2601 | 2620 | 2601 | 2624 | **23** |

**P 평균:** **~17.7 ms** (O warm 런2–3 **16+23** 평균 **19.5 ms** 대비 **↓**) · 런1은 절대 시각이 크나 **winner는 15ms**  
**판정:** **보류** — **2/3회 15ms**로 베스트는 좋아졌으나 **23ms** 한 번으로 **완전 입증은 어려움**; 구조 변경은 **유지**.

---

## 이번 라운드 (참고: 라운드 O — 타임라인 읽음 배지 파생 단일화)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`latestReadableMineMessageId`** 와 **`peerHasReadMyLatestMessage`** 가 각각 `displayRoomMessages`를 **역순 전체 스캔**하고, 후자는 추가로 **`filter(!pending)` 전 배열 + `find` 2회**로 **동일 렌더 틱에 중복 스캔**이 발생했다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**. |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 N 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 O — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 7828 | 7850 | 7828 | 7856 | **28** |
| 2 | 2775 | 2796 | 2776 | 2799 | **23** |
| 3 | 1836 | 1849 | 1836 | 1852 | **16** |

**O 평균(warm 런2–3만):** **~19.5 ms** (N warm **~19.0 ms**와 동급) · 런1은 절대 시각 cold에 가까워 **제외**  
**판정:** **보류** — 구조 개선(스캔 횟수 실감 감소) **채택**, winner ms **유의미 감소 미입증**.

---

## 이번 라운드 (참고: 라운드 N — `useMessengerRoomDerivedMessageLists` 단일 순회)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`roomMessages` 갱신 직후** `useMessengerRoomDerivedMessageLists`가 **서로 독립인 `useMemo` 6~7개**로 **각각 전 배열을 순회**해, `displayRoomMessages`가 타임라인·가상화에 도달하기 전 **동일 렌더 틱에서 CPU를 과다 사용**한다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(warm 위주; 1회는 절대 시각이 커 cold에 가까움). |
| 완료 기준 | `MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON`의 **`display_room_messages_ready_to_first_message_render_ms`(winner)** 가 **직전(M 이후) 관측 대비 유의미 감소**. |
| 수정 파일 (1~3) | **`use-messenger-room-derived-message-lists.ts`만** |

### 라운드 N — 3회 (ms)

| Run | `display_room_messages_ready` | `first_message_render` | **display_ready → FMR** (winner) | 비고 |
|-----|--------------------------------|------------------------|----------------------------------|------|
| 1 | 2105 | 2128 | **23** | phase2·display 동대역 |
| 2 | 2509 | 2525 | **16** | |
| 3 | 2107 | 2125 | **18** | |

**N 평균(winner):** **~19.0 ms** (M 직후 동일 스펙에서 자주 보던 **~16–21ms**와 **동급**; cold 혼입 러닝에서는 **29ms**까지 벌어짐)  
**판정:** **보류** — 구조적으로 **O(n) 한 번**으로 줄였으나, **로컬 dev 3회만으로 winner 구간의 안정적 단축은 입증되지 않음**(노이즈·cold 경로). **코드는 유지**(메시지 수 증가 시 이점 확대).

---

## 이번 라운드 (참고: 라운드 M — `input_ready` 를 `useLayoutEffect`로 이전)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`input_ready_ms`** 가 **`useEffect`**(페인트 이후)에서만 기록·`first_interactive` 호출되어, 동일 DOM 기준에서도 **CTV→input** 게이트가 **프레임만큼 불필요하게 커질 수 있음**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회 연속**. |
| 완료 기준 | **H 대비** CTV→input **악화 없음** + FMR−CTV **감소**(동일 스펙·로컬 dev). |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** |

### 라운드 M — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5799 | 5799 | 5799 | 5820 | **+21** | **0** | **0** |
| 2 | 2121 | 2121 | 2121 | 2139 | **+18** | **0** | **0** |
| 3 | 1658 | 1658 | 1658 | 1674 | **+16** | **0** | **0** |

**M 평균:** FMR−CTV **~18.3 ms** (H **78.7 ms** 대비 ↓) · CTV→input **0 ms** (H **20.7 ms** 대비 ↓) · p2→CTV **0 ms**  
**판정:** **성공** — 동일 조건 3회에서 **역행·편차 과대 없음**.

---

## 이번 라운드 (참고: 라운드 L — `estimateSize` 96→104 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과소 추정이면 초기 가상 행 수가 많아 **첫 메시지 커밋 비용**이 커진다 → **104**로만 **한 값** 상향 검증. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 분리 3회**(`--workers=1`). (중간 실패 2회는 재시도로 대체.) |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — 시도 후 **`estimateSize` 96 원복** |

### 라운드 L — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5225 | 5225 | 5233 | 5242 | **+17** | **8** | **0** |
| 2 | 2119 | 2119 | 2247 | 2270 | **+151** | **128** | **0** |
| 3 | 1887 | 1887 | 1897 | 1905 | **+18** | **10** | **0** |

**L 평균:** FMR−CTV **~62 ms** (H **78.7**보다 ↓) · CTV→input **~48.7 ms** (H **20.7**보다 ↑ — **런2 악화로 기준 불충족**) · p2→CTV **0 ms**  
**판정:** **보류** — 동일 스펙에서 **런 간 편차 큼**(FMR−CTV 17↔151); 채택 시 **입력 지연 악화** 구간 재현 가능.

---

## 이번 라운드 (참고: 라운드 K — `estimateSize` 96→80 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과대면 초기 virtual range·측정이 커져 **FMR**이 늦어진다. **검증:** **80**으로만 하향. |
| 측정 명령 | `messenger-room-entry-perf-breakdown.spec.ts` **3회 분리 실행**(`--workers=1`); 2회차는 로그 미포착으로 **추가 1회**로 3개 수치 확보. |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — `estimateSize` **원복 96** |

### 라운드 K — 수정 적용 시 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 3792 | 3792 | 3820 | 3886 | **+94** | **28** | **0** |
| 2 | 1049 | 1049 | 1072 | 1139 | **+90** | **23** | **0** |
| 3 | 1317 | 1317 | 1337 | 1382 | **+65** | **20** | **0** |

**K 평균:** FMR−CTV **~83.0 ms** (H **78.7 ms**보다 ↑) · CTV→input **~23.7 ms** (H **20.7 ms**보다 ↑) · p2→CTV **0 ms**

---

## 이번 라운드 (참고: 라운드 J — virtualizer `overscan` 12→6 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** 초기 `overscan`이 크면 첫 virtual item 준비·측정이 늘어 **FMR**이 늦어진다. **검증:** `overscan` **12→6**만 변경. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME=aaaa` `E2E_TEST_PASSWORD=1234` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 3회 분리** |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 유의미 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`lib/community-messenger/room/use-messenger-room-chat-virtualizer.ts`만** (시도 후 **overscan 원복 12**) |

### 라운드 J — 수정 적용 시 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 1850 | 1850 | 1893 | 1983 | **+133** | **43** | **0** |
| 2 | 1706 | 1705 | 1734 | 1820 | **+115** | **29** | **−1** |
| 3 | 2396 | 2395 | 2415 | 2469 | **+74** | **20** | **−1** |

**J 평균:** FMR−CTV **~107.3 ms** · CTV→input **~30.7 ms** · p2→CTV **≈ −0.7 ms**

**H 기준(동일 스펙 이전 기록):** FMR−CTV **78.7 ms** · CTV→input **20.7 ms**

---

## 이번 라운드 (참고: 라운드 I — `first_message_render` 조건 완화 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `first_message_render_ms`가 **`getVirtualItems().length > 0`와 동시에** 잡히며 라운드 H에서 **+70~+91ms** 간격을 만든다는 가설 — **DOM(`[id^="cm-room-msg-"]`) 존재 시에도 virtualizer count 0이면 통과**하도록 완화 시도. |
| 측정 명령 | 동일 `messenger-room-entry-perf-breakdown.spec.ts` — 수정 후 **프로세스 3회 분리**(`1..3 \| ForEach-Object { npx playwright test … }`)로 route perf 오염 방지. |
| 완료 기준 | FMR−CTV 평균 **라운드 H 대비 유의미 감소** + phase2→CTV·input_ready **악화 없음** |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** (시도 후 **원복** — 현재 트리는 라운드 H와 동일 조건) |

### 라운드 H (기준선, 코드 변경 없음)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1925 | 1925 | 1946 | 1995 | **+70** |
| 2 | 1566 | 1565 | 1584 | 1640 | **+75** |
| 3 | 1109 | 1109 | 1131 | 1200 | **+91** |

**H 평균 FMR−CTV:** **78.7 ms** · `CTV→input_ready` 평균 **20.7 ms** · `phase2→CTV` **0~1 ms**

### 라운드 I — 수정 적용 중 3회 (동일 계정·분리 실행)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1320 | 1320 | 1354 | 1437 | **+117** |
| 2 | 1218 | 1218 | 1245 | 1316 | **+98** |
| 3 | 1365 | 1365 | 1400 | 1476 | **+111** |

**I 평균 FMR−CTV:** **108.7 ms** (↑) · `CTV→input_ready` 평균 **32 ms** (↑) · `phase2→CTV` **0 ms**

### 롤백 후 확인 1회

| `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|----------------|------------------------------|-----------------|------------------------|---------------|
| 1700 | 1699 | 1724 | 1787 | **+88** |

---

## 미완 체크리스트 (라운드 J)

- [x] 코드 완료 — `overscan` 시도 후 롤백
- [x] 동일 조건 3회 측정(분리 실행, `--workers=1` 동등)
- [x] 수정 전·후 비교(H 기준)
- [x] 판정 기록 — **실패**
- [x] 트랙 유지 — **유지**

---

## 3회 측정 결과

### 수정 전 (동일 스펙·동일 room, 2026-04-21 기록)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | cold 편차 | **5094** |
| 2 | warm | **1596** |
| 3 | warm | **1696** |

**수정 전 warm 평균 (런2–3):** **1646 ms**

### 라운드 A 수정 후 (page canonical 직렬 제거, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 스펙상 예열 후 첫 루프 | **1448** |
| 2 | warm | **1268** |
| 3 | warm | **976** |

**라운드 A warm 평균 (런2–3):** **1122 ms**

### 라운드 B 수정 후 (participants `profiles!…` embed + `hydrateProfilesLabelsOnlyWithMap` prefetched, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **841** |
| 2 | warm | **1070** |
| 3 | warm | **1217** |

**라운드 B warm 평균 (런2–3):** **1143 ms** (목표 ≤1000ms **미달**).

### 라운드 C 수정 후 (defer seed messages `.limit` → `min(messageLimit, 12)`, select 컬럼 동일, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1705** |
| 2 | warm | **1365** |
| 3 | warm | **598** |

**라운드 C warm 평균 (런2–3):** **981.5 ms** (목표 ≤1000ms **달성**).  
**messages 쿼리:** defer seed 시 **최대 12 row** (이전 대비 라운드 B 대비 **20→12** 상한). select: `id, room_id, sender_id, message_type, content, metadata, created_at` **변경 없음**(줄인 항목은 **row 수 = `.limit()` 상한** 1건뿐).

**환경 노이즈:** 로컬 `npm run dev`, `PLAYWRIGHT_NO_WEBSERVER=1`, 동일 room id. (간헐적 `goto` 타임아웃 후 재시도 1회 성공.)

### 라운드 D 수정 후 (defer seed 시 rooms select에서 `notice_text` 제외, 2026-04-20)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1433** |
| 2 | warm | **1928** |
| 3 | warm | **1297** |

**라운드 D warm 평균 (런2–3):** **1612.5 ms** — 라운드 C warm 평균 **981.5 ms** 대비 **역행** → **무효** 규칙 적용.  
**rooms 쿼리:** `deferSecondaryRequested`일 때만 `notice_text` 미포함(그 외는 기존과 동일 select 문자열).

### 라운드 E 수정 후 (비-defer messages 상한 20, defer 시드 12행 유지, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1004** |
| 2 | warm | **1420** |
| 3 | warm | **2055** |

**라운드 E warm 평균 (런2–3):** **1737.5 ms**. 런2–3 편차 **635ms** (≥200ms). warm 둘 다 **≥1100ms**.  
**messages 쿼리:** defer seed 시 **최대 12 row**(라운드 C와 동일). 비-defer 시 **최대 20 row**(`Math.min(messageLimit, 20)`). → **Playwright 시드(defer) 경로의 messages row 수는 C와 동일**; 본 3회 값은 **노이즈·다른 단계** 비중이 큼.

### 라운드 F 수정 후 (`deferSeedRecentMessagesFetchCap` 12→6, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1501** |
| 2 | warm | **670** |
| 3 | warm | **1255** |

**라운드 F warm 평균 (런2–3):** **962.5 ms** (≤1000ms **달성**). 런2–3 편차 **585ms** (≥200ms). warm3 **1255ms** (≥1100ms, **<1100 미달**).  
**messages 쿼리:** defer seed 시 **최대 6 row** (`deferSeedRecentMessagesFetchCap = 6`; 라운드 G 후 **롤백**으로 현재는 다시 **12**). 라운드 E warm 평균 **1737.5ms** 대비 **악화 아님** → **무효 규칙 미적용**.

### 라운드 G (F와 동일 코드, 재측정만, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1665** |
| 2 | warm | **1102** |
| 3 | warm | **1732** |

**라운드 G warm 평균 (런2–3):** **1417 ms** — 라운드 F **962.5ms** 대비 **악화**. warm2 **1102ms** (엄밀히 **<1100ms** 미달). warm3 **1732ms**. 편차 **630ms** (≥200ms).

**라운드 G 종료 조치:** 판정 **실패** — F 개선 수치 **재현 실패** → `deferSeedRecentMessagesFetchCap` **12로 롤백**(현재 코드). **`composer_wall_ms` 동일 축 트랙 종료.**

---

## 판정 · 트랙 (라운드 G·`composer_wall` 축 마감)

| 항목 | 값 |
|------|-----|
| 판정 | **실패** — 라운드 F 개선 **재현 실패**; warm 평균 **1417ms**; warm2·3 **<1100ms** 미달; 편차 **630ms**. **`deferSeedRecentMessagesFetchCap` 12→6 패치는 안정적 개선으로 채택하지 않음**(12 롤백). |
| 트랙 유지 / 종료 | **`composer_wall_ms` 서버 동일 축 트랙 종료** — 다음은 **클라이언트 gate / hydration / route transition blocking** 중 원인 **1개** 특정 트랙으로 전환. |

---

## 보류·무효 연속 카운터 (같은 병목·파일군)

헌장 [15]: 같은 병목에서 보류/무효 **3회 누적** 시 트랙 종료 후 상위 병목으로 이동.

| 대상 (병목/파일군) | 연속 보류·무효 횟수 | 비고 |
|--------------------|---------------------|------|
| 메신저 `composer_wall` / `service.ts` 첫 `Promise.all` | — | **트랙 종료**(2026-04-21)로 본 축 카운터 종료. |
| 메신저 room **`use-messenger-room-chat-virtualizer.ts` 단일 레버** (`overscan` / `estimateSize`) | **3** | **J·K·L** 누적 → 헌장 **[15]**에 따라 **이 파일에서 overscan·estimateSize만 바꾸는 미세 트랙 종료**. 다음 라운드는 **가상화 외** 축만. |

---

## 다음 후보 1개 (헌장 [8] 순서)

**다음 라운드(라운드 T) 후보 1개:** `GET /api/community-messenger/rooms/[roomId]/bootstrap`의 `room_silent` 경로(로그 **2.4~2.8s**)에서 **minimal 부트스트랩 쿼리 왕복(rooms/participants/profile hydrate) 1축**을 분리·축소하는 구조 개선 1건.

---

## 이번 라운드 (최신: 라운드 BN6 — 하단 탭 확인 후 즉시 push 전환 보장)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 하단 탭 이동 확인 모달에서 `확인`을 누른 뒤, cross-group 경로가 과거 exit 대기/intent 전달 순서에 묶이면 “이전 화면이 먼저 보인 뒤 다음 화면이 늦게 밀려오는” 체감이 발생할 수 있었다. |
| 측정/검증 명령 | `node scripts/verify-delivery-dial-navigation-contract.cjs`, `npx vitest run lib/main-menu/__tests__/main-bottom-nav-route-commit.test.ts`, `npx tsc --noEmit` |
| 완료 기준 | (1) 확인 직후 `beginMenuNavigation`이 동기로 기록되고 (2) push 축이 pathname 커밋 시점에 유실되지 않으며 (3) RSC/pathname 지연 중에도 목적지 경량 패널이 440ms로 들어와 이전 화면 snapback 이 없어야 한다. |
| 수정 파일 | `lib/main-menu/main-bottom-nav-route-commit.ts`, `lib/navigation/main-bottom-nav-domain-transition-dialog.tsx`, `components/route-transition/AppRouteTransition.tsx`, `components/layout/MainShellTabContentTransition.tsx`, `components/layout/BottomNav.tsx`, `lib/navigation/main-shell-push-axis-intent-ref.ts` |
| 이번 조치 | `beginMenuNavigation`을 commit 시점으로 앞당기고, confirm dialog는 `flushSync`로 먼저 제거한 뒤 진행한다. `AppRouteTransition`은 하단 탭 intent 직후 dual-panel push를 시작하고, RSC/pathname이 늦으면 `pendingPushNode`(경량 목적지 셸)를 들어오는 패널로 유지한다. router commit은 실제 push host가 있는 브라우저에서만 2 RAF 뒤 수행해 첫 paint를 보장하고, 12s safety release 로 영구 고정을 막는다. push 축은 canonical 탭 순서(ltr=좌측 탭·rtl=우측 탭) 단일 소스. |
| 검증 결과 | delivery dial contract PASS, route commit 테스트 11/11 PASS, push session 테스트 4/4 PASS, push axis 테스트 3/3 PASS, TypeScript PASS. |

### 라운드 BN6 — 3회 측정 (실측)

| 구간 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| 확인 클릭→커밋(`confirm_to_commit_ms`) | 88 | 173 | 125 | ≤200ms |
| 확인 클릭→push exit/enter 시작(`confirm_to_push_exit_ms`) | 125 | 104 | 110 | ≤120ms |
| 확인 클릭→경로 변경(`confirm_to_path_change_ms`) | 14732 | 18626 | 9160 | ≤1200ms |
| nav-perf 이벤트 수집(`__NAV_PERF_EVENTS`) | 0 | 0 | 0 | 1 이상 |

**비고(측정 환경):** `scripts/measure-bottom-nav-confirm-immediacy.mjs`(Playwright headless)로 `/stores`→`/philife` 확인 모달 3회. 동일 런에서 `confirm_events_count`는 1회씩 정상 기록되며 dialog 잔류는 0(`confirm_dialog_still_visible=false`).  
**추가 점검(2026-05-28):** 단일 실측에서 `/api/test-login` 제거(410)와 `.env.local` 미로드를 수정했고, 측정 selector를 `data-bottom-nav-tab-id`로 고정했다. 이후 측정 환경은 `/stores` address gate 상태에서 하단 탭이 mount 되지 않아 3회 실측 전제가 깨짐. 코드 검증은 `vitest` 18/18, `tsc --noEmit`, delivery dial contract PASS.
**판정:** **코드 완료 · 측정 보류** — 하단 탭이 mount 되는 정상 셸에서는 확인 직후 dual-panel/pending 목적지 셸 경로로 440ms push가 시작되도록 구조 고정. 현재 자동 실측은 address gate 로 하단 탭이 없어 보류이며, 체크시트 `[x]` 는 열지 않는다.

---

## 이번 라운드 (하단 탭: 라운드 BN7 — 5탭 pending enter panel + skeleton-free root fallback)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/market` 외 하단 탭은 `pendingPushNode` 가 없어 440ms push 시작 시 들어오는 패널이 현재 화면/route fallback 으로 잡혔다. 커뮤니티·거래·배달·메신저 이동 완료 직후 실제 route children/client loading 으로 교체되면서 카드 스켈레톤·빈 점멸·늦은 표시가 다시 보일 수 있었다. |
| 측정/검증 명령 | `npm run verify:trade-primary-tab-transition`, `npm run verify:stores-home-hub-contract`, `npx tsc --noEmit` |
| 완료 기준 | 하단 5탭 모두 pending enter panel 이 목적지 클라 허브를 즉시 마운트하고, 루트 `loading`/Suspense/client loading 이 `MainFeedRouteLoading`·`CommunityFeedSkeleton`·`CommunityMessengerHomeShellSkeleton`·`StoresHomeSkeleton` 을 렌더하지 않는다. |
| 수정 파일 | `MainShellTabContentTransition.tsx`, `CommunityFeed.tsx`, `StoresHomeHub.tsx`, `CommunityMessengerHomeListPane.tsx`, `community-messenger/page.tsx`, `mypage/page.tsx`, `(stores)/stores/loading.tsx`, `verify-trade-primary-tab-transition-contract.cjs`, `trade-perf-hot-path-changelog.md` |
| 이번 조치 | `/philife`, `/stores`, `/community-messenger`, `/mypage` 도 `/market` 처럼 pending enter panel 을 제공한다. 커뮤니티·배달·메신저 루트의 첫 loading 은 카드 스켈레톤 대신 빈 안정면으로 유지하고, 내정보 루트는 RSC await fallback 대신 클라 허브가 sessionStorage seed 후 백그라운드 fetch 한다. |
| 검증 결과 | `verify:trade-primary-tab-transition` PASS, `verify:stores-home-hub-contract` PASS, `npx tsc --noEmit` PASS. |

### 라운드 BN7 — 3회 측정

| 구간 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| 하단 5탭 실제 브라우저 탭 전환 | — | — | — | 스켈레톤 미노출 + 440ms push 유지 |

**판정:** **코드 완료 · 체감 측정 보류** — 구조상 루트 5탭 skeleton fallback 재등장 경로를 차단했다. 실제 기기/브라우저 3회 영상·콘솔 확인 전까지 체크시트 `[x]` 는 열지 않는다.

---

## 이번 라운드 (하단 탭: 라운드 BN8 — 방향 축 단일화 + handoff overlay)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `ltr/rtl` 축 의미가 dual-panel CSS 와 `(stores)` route group remount surface CSS 에서 반대로 쓰였다. 그래서 배달·메신저처럼 group 경계를 지나는 이동에서 한쪽으로 밀고 들어온 뒤 반대쪽 surface enter 가 다시 보이는 “이중 방향” 체감이 발생했다. |
| 측정/검증 명령 | `npm run verify:trade-primary-tab-transition`, route transition vitest 4종, `npm run verify:parity-gates`, `npm run build` |
| 완료 기준 | 현재 탭보다 왼쪽 탭 선택은 항상 좌→우, 오른쪽 탭 선택은 항상 우→좌. 첫 탭 커뮤니티에서 다른 탭은 우→좌, 마지막 내정보에서 다른 탭은 좌→우. push 종료 후 route child 교체 시 첫 접속 하얀 화면이 보이지 않도록 pending enter panel 을 짧게 유지. |
| 수정 파일 | `route-transition-enter-kind.ts`, `route-transition-config.ts`, `AppRouteTransition.tsx`, `globals.css`, `compute-main-bottom-nav-push-axis.ts`, `compute-trade-primary-push-axis.ts`, route transition/unit tests, `verify-trade-primary-tab-transition-contract.cjs`, `trade-perf-hot-path-changelog.md` |
| 이번 조치 | 축 산식을 뒤집어 `ltr=좌측 탭/좌→우`, `rtl=우측 탭/우→좌` 로 고정하고, cross-group surface from/exit transform 도 같은 의미로 맞췄다. push transition 종료 후 1.2초 handoff overlay 로 pending enter panel 을 유지해 route child 초기 blank 를 가린다. |
| 검증 결과 | `verify:trade-primary-tab-transition` PASS, route transition 관련 vitest 37건 PASS, `npx tsc --noEmit` PASS, `verify:parity-gates` PASS, `npm run build` PASS. |

### 라운드 BN8 — 3회 측정

| 구간 | Run1 | Run2 | Run3 | 목표 |
|------|------|------|------|------|
| 하단 5탭 실제 브라우저 방향/blank 확인 | — | — | — | 방향 단일 + 하얀 화면 미노출 |

**판정:** **코드 완료 · 체감 측정 보류** — 축 불일치 원인은 코드·검증으로 제거했다. 실제 브라우저 3회 확인 전까지 체크시트 `[x]` 는 열지 않는다.
