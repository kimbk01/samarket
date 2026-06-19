# 커뮤니티 메신저 — 거래·배달 채팅 목록 lifecycle (P1/P2)

거래(`trade`)·배달(`delivery`) CM 목록 dedupe, completed readonly, 7일 목록 노출 정책 및 enrich SSOT.

**연관:** [community-messenger-trade-chat-list.md](./community-messenger-trade-chat-list.md) · `lib/chat-domain/samarket-three-chat-pillars.ts`

---

## 현재 상태 (2026-06-19)

**개발·QA·문서 완료 — 커밋/푸시/배포/APK 미진행**

| 구분 | 상태 |
|------|------|
| P1 — dedupe·policy·UI·lifecycle enrich | **ACCEPT** (로컬 코드·테스트 완료) |
| P2 — staging/prod WebView Network QA | **PARTIAL** — 실기기 QA 완료; prod lifecycle payload **배포 후 재검증** 필요 |
| P3 — soft archive cron | **미착수** (P2 CLOSE 이후) |
| 30일 hard purge cron | **미착수** (P2 CLOSE 이후) |

### 파이프라인 진행 현황 (2026-06-19 확인)

| 단계 | 상태 | 비고 |
|------|------|------|
| 로컬 코드·테스트·문서 | **완료** | lifecycle enrich·policy·QA 스크립트·`docs/perf/*` 산출물 |
| **git commit** | **미진행** | lifecycle 변경 **working tree** (staged 없음). `origin/main` HEAD `5141d228` 에 미포함 |
| **git push** | **미진행** | commit 선행 필요 |
| **Vercel prod deploy** | **미진행** | push·빌드 후 prod WebView 재QA |
| **APK 빌드** | **미진행** | WebView QA는 prod URL 기준; lifecycle 전용 APK 산출물 없음 |

**다음 액션:** lifecycle 범위 파일 스테이징 → commit → push → Vercel deploy → `node scripts/qa/commerce-chat-lifecycle-p2-adb-qa.mjs` → P2 CLOSE 4조건 충족 시 CLOSE.

### P2 PARTIAL — 확인된 좋은 점

- 실기기 **RFCY40PY2CA** + APK WebView CDP QA 수행
- `home-sync` full/critical **200** 응답 확인
- lifecycle/dedupe 관련 logcat·CDP 콘솔 에러 **없음**
- local dev API — trade/delivery lifecycle enrich, readonly, 7일 숨김 **PASS**
- critical snapshot 경로 lifecycle enrich 누락 **보강 완료**
- QA 산출물·문서 기록 완료

### P2 PARTIAL — 막힌 원인 (배포 gap)

- prod WebView 응답에 `sellerId`, `buyerId`, `orderStatus`, `completedAt` 등 lifecycle 필드 **미포함**
- **코드 결함이 아닌 배포 gap** — prod가 아직 P1 lifecycle enrich 포함 버전 미사용
- timestamp 없을 때 7일 숨김 **안 함** — 현재 정책 정상 (추측 fallback 금지)

### P2 CLOSE 조건 (4항목 **모두** 만족 시에만 CLOSE)

| # | 조건 |
|---|------|
| 1 | prod WebView lifecycle payload **PASS** |
| 2 | logcat/CDP lifecycle·dedupe **오류 없음** |
| 3 | completed 방 **readonly PASS** |
| 4 | completed + timestamp 기준 **7일 숨김 PASS** |

**P2 CLOSE 절차**

1. P1 lifecycle enrich 포함 **commit hash** 확인
2. **main push → Vercel deploy** 완료 확인
3. prod WebView에서 재실행: `node scripts/qa/commerce-chat-lifecycle-p2-adb-qa.mjs`
4. 아래 필드 prod JSON 확인

**Trade `contextMeta` + room:** `sellerId`, `buyerId`, `tradeFlowStatus`, `sellerCompletedAt`, `buyerConfirmedAt`, `completedAt`, `isReadonly`

**Delivery `contextMeta` + room:** `storeOrderId`, `orderStatus`, `deliveryCompletedAt`, `completedAt`, `isReadonly`

5. 판매완료·배달완료 방 readonly·7일 숨김 정책 재확인
6. `tsc` FAIL (`CommunityMessengerCallClient.tsx:632`) — **본 트랙과 분리** 관리

**P3** (`room_status='archived'` cron, 30일 purge cron) — **P2 CLOSE 이후** 시작. P2에서 cron 구현 금지.

---

## P1 완료 인정 범위 (ACCEPT)

- trade / delivery dedupe 분리 (`trade-list-canonical-key`, `dedupe-delivery-messenger-room-summaries`)
- `post:{postId}` 단독 dedupe 제거 → `trade:{postId}:{sellerId}:{buyerId}` fallback
- 7일 lifecycle policy pure function (`chat-room-list-lifecycle-policy.ts`)
- readonly vs 목록 숨김 분리 (`isCompletedChatReadonly` / `shouldHideCompletedChatFromList`)
- completed UI label·preview (`commerce-chat-list-presentation`, `chats.ts` ko/en)
- trade lifecycle enrich (`trade-context-meta-lifecycle-enrich.ts`)
- delivery lifecycle enrich (`delivery-context-meta-lifecycle-enrich.ts`, `order_completed` event 최신 `created_at`)
- `completedAt` DB 원장만 사용 (추측 fallback 없음; timestamp 없으면 7일 숨김 **안 함**)
- `deferTradeMetaEnrich` 경로 lifecycle 보강 (`commerce-chat-room-lifecycle-enrich.ts`)
- home-list patch diff key 반영 (`home-list-patch.ts`)
- `tsc` / `lint` / `build` / vitest PASS

### 구현 앵커

| 영역 | 파일 |
|------|------|
| 정책 | `lib/community-messenger/chat-room-list-lifecycle-policy.ts` |
| enrich 진입 | `lib/community-messenger/commerce-chat-room-lifecycle-enrich.ts` |
| trade enrich | `lib/community-messenger/trade-chat-list/trade-context-meta-lifecycle-enrich.ts` |
| delivery enrich | `lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich.ts` |
| 목록 조립 | `lib/community-messenger/use-community-messenger-home-state.ts` |
| bootstrap hook | `lib/community-messenger/service.ts` → `enrichTradeRoomContextMetaForBootstrap` 종료, defer 분기 |

### payload lifecycle 필드 (enrich 후)

**거래 `contextMeta`**

| 필드 | 원장 |
|------|------|
| `sellerId`, `buyerId` | `product_chats` |
| `tradeFlowStatus` | `product_chats.trade_flow_status` |
| `sellerCompletedAt` | `product_chats.seller_completed_at` |
| `buyerConfirmedAt` | `product_chats.buyer_confirmed_at` |
| `completedAt` | 위 두 시각 중 **늦은 쪽** |
| `isReadonly` (room) | `community_messenger_rooms.is_readonly` **OR** `product_chats.chat_mode = 'readonly'` |

**배달 `contextMeta`**

| 필드 | 원장 |
|------|------|
| `storeOrderId` | `store_orders.id` / direct_key |
| `orderStatus` | `store_orders.order_status` (raw) |
| `deliveryCompletedAt` | `store_order_events` `event_type = 'order_completed'` 최신 `created_at` |
| `completedAt` | `deliveryCompletedAt` 와 동일 |
| `isReadonly` (room) | `order_status === 'completed'` |

---

## P1 미완 / P3 이후

- DB `room_status = 'archived'` soft archive **cron** — P2 CLOSE 이후
- 30일 hard purge cron — P2 CLOSE 이후 (`COMPLETED_CHAT_HARD_PURGE_ELIGIBLE_MS` 상수만 예약)

---

## P2 — 실기기·Network QA

### 목표

1. 실기기 prod WebView Network/CDP — **`GET /api/community-messenger/home-sync`** 응답 확인 ✅ (PARTIAL)
2. trade/delivery `contextMeta` lifecycle 필드 prod JSON — ⏳ 배포 후 재검증
3. 판매완료·배달완료 readonly / 7일 숨김 — local dev PASS; prod 배포 후 재확인
4. P2 **CLOSE** 후 → P3 soft archive cron 설계

### QA 시나리오

| # | 조건 | 기대 |
|---|------|------|
| 1 | 판매완료 직후 | 목록 표시 · readonly · 「판매완료」 라벨 · 완료 preview |
| 2 | 완료 + 6일 23시간 | 목록 **표시** 유지 · readonly 유지 |
| 3 | 완료 + 7일 초과 | 목록 **숨김** · readonly 유지(방 진입 경로 별도) |
| 4 | 배달 `order_status=completed` + `order_completed` event | 동일 7일 정책 |
| 5 | completed timestamp **없음** | readonly만(해당 시) · 7일 숨김 **없음** |

### Network 캡처 체크리스트

- [x] home-sync `chats[]` — prod: trade `sellerId`/`buyerId`/`completedAt` **미배포**; 로컬 dev full: **PASS**
- [x] delivery — prod: `orderStatus`/`deliveryCompletedAt` **미배포**; 로컬 dev full: **PASS** (4건 completed + timestamp)
- [x] completed delivery — 로컬 dev: `isReadonly: true` **PASS**; prod: **FAIL** (false)
- [ ] `/community-messenger/trade-chats` · `/delivery-chats` pillar 행 수 — P2 범위에서 home-sync 응답 + 클라 policy 시뮬레이션으로 대체

### P2 결과 기록 (2026-06-19)

| 항목 | 결과 | 비고 |
|------|------|------|
| Network 캡처 일시 | 2026-06-19 KST | `scripts/qa/commerce-chat-lifecycle-p2-adb-qa.mjs` |
| 환경 (staging/prod/기기) | **prod** `https://samarket.vercel.app` · Samsung **RFCY40PY2CA** · APK WebView CDP · login `aaaa` | origin 확인됨 |
| trade `sellerId`/`buyerId`/`completedAt` | **FAIL (prod)** / **PASS (local dev API)** | prod: `tradeFlowStatus`만 75%; `sellerId`/`buyerId` 0%. 로컬 dev full: trade 7/7 seller+buyer |
| delivery `orderStatus`/`deliveryCompletedAt` | **FAIL (prod)** / **PASS (local dev API)** | prod: `storeOrderId` 90%만 존재. 로컬 dev: delivery 10/10 `orderStatus`, 4/4 completed `completedAt` |
| 7일 목록 숨김 | **PASS (policy sim, local dev)** | completed delivery 4건 모두 `completedAt` 7일 초과 → `shouldHideCompletedChatFromList` true. 서버는 목록에仍 반환(클라 필터). trade completed 실데이터 0건 |
| readonly vs 숨김 분리 | **PASS (local dev)** / **FAIL (prod)** | 로컬: completed delivery `isReadonly=true` + 7일 초과 hide. prod: `isReadonly=false`, lifecycle timestamp 없음 → hide 안 함(정책상 안전) |
| adb logcat / CDP lifecycle·dedupe 에러 | **PASS** | lifecycle/dedupe/home-sync-fail **0건**. `NativeIncomingCall.then()` 미구현만(통화 플러그인, 본 트랙 무관) |
| QA 산출물 | | `docs/perf/commerce-chat-lifecycle-p2-prod-qa-report.json` · `docs/perf/commerce-chat-lifecycle-p2-local-api-audit.json` · `docs/perf/commerce-chat-lifecycle-p2-adb-qa-run.log` |

**P2 follow-up (배포)**

1. **prod 배포** — P1 lifecycle enrich 포함 commit → main → Vercel → §P2 CLOSE 절차 3~5 재실행
2. **critical snapshot enrich** — 2026-06-19 보강 완료. 로컬 dev critical tier PASS 확인됨
3. APK WebView는 `127.0.0.1` 전환 불가 → prod 재검증은 **동일 QA 스크립트 + prod origin** 만 사용

---

## 변경 이력 (append-only)

| 날짜 | 단계 | 요약 |
|------|------|------|
| 2026-06-19 | P1 ACCEPT | dedupe·7일 policy·UI·lifecycle enrich·mock/integration test PASS |
| 2026-06-19 | P2 open | 실기기 Network QA 대기 — 본 문서 §P2 |
| 2026-06-19 | P2 PARTIAL | prod WebView CDP QA — lifecycle 필드 미배포 FAIL; 로컬 dev API PASS; critical snapshot enrich 보강; QA 스크립트 `commerce-chat-lifecycle-p2-adb-qa.mjs` |
| 2026-06-19 | P2 PARTIAL 유지 | 사용자 확인 — 배포 gap; 상태 「P1 코드 완료 + 실기기 QA 완료 + prod 배포 대기」; P2 CLOSE 4조건·절차 명시; P3는 CLOSE 이후 |
| 2026-06-19 | dev-side 완료 | 개발·QA·문서 완료 확정; commit/push/Vercel/APK **미진행** 확인 (`main` @ `5141d228`) |
