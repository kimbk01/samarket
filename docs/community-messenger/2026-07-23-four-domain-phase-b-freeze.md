# Phase B — 4 Domain 계약 freeze + 파일 락 초안

**기준 HEAD:** `e5e44fcd5` (7/14 `36bd68ada` 이전 롤백 tip + 배포 트리거)  
**근거 감사:** `docs/community-messenger/2026-07-23-four-domain-phase-a-audit.md`  
**기계 검증:** `npm run verify:chat-domain-file-lock`  
**코드 상수:** `lib/chat-domain/four-domain-freeze.ts`  
**상태:** freeze 완료 · **제품 런타임 변경 없음** · Phase C 승인 전 구현 금지

---

## 1. ChatDomain (확정 · 4개만)

| Domain | 제품 의미 | 레거시 혼동 금지 |
|--------|-----------|------------------|
| `general_direct` | 친구 1:1 DM | pillars의 `community`에 묶지 않음 |
| `group` | 그룹 | 동일 |
| `trade` | **상품 단위** (item×seller×buyer) | 친구 1:1과 merge 금지 · 홈에 trade 섞기 금지(목표) |
| `store_order` | **주문 단위** | 친구 DM과 merge 금지 · customer/owner identity 분리 |

**금지:** Domain 추론을 SSOT로 사용 · 기본 Domain fallback · 런타임 Domain 재분류.

**레거시 (Phase C~D에서 축소):** `SamarketChatPillarId` `trade|community|store_order`, `MessengerDomain` community 백.  
→ 제품 SSOT는 위 4 Domain. pillars/`community`는 호환 레이어만.

---

## 2. Domain Identity (확정문 · DB 충돌 반영)

| Domain | Canonical identity | 현재 DB | Phase C+ migration 방향 |
|--------|--------------------|---------|-------------------------|
| `general_direct` | `gd:{sorted(userA,userB)}` | `community_messenger_rooms.direct_key` UNIQUE (GD만) | room에 `chat_domain`+`domain_identity` 컬럼 추가 후 identity=`direct_key` 정규화 |
| `group` | `group:{roomId}` (생성 시 roomId 확정) | PK만 · domain 컬럼 없음 | `chat_domain='group'`, identity=`group:{id}` |
| `trade` | `trade:{itemId}:{sorted(sellerId,buyerId)}` | CM `context_type=trade` UNIQUE **없음**; `product_chats` UNIQUE(product,seller,buyer) | **단일 ledger 선택 후** identity UNIQUE; CM↔pc 이중 생성 금지 |
| `store_order` (room) | `so:order:{orderId}` | CM `store_order:` + `order_chats` 이중 | **1 order = 1 room** UNIQUE |
| `store_order` (viewer) | `so:customer\|owner:{orderId}:{userId}` | participant role | projection only · room UNIQUE 아님 |

**불변식**

1. Domain·Identity는 **방 생성 시 1회** 기록, 이후 변경·재추론 금지.  
2. Identity 누락·불일치 → **fail-closed** (목록/뱃지/알림에 넣지 않음).  
3. `pathname`·`roomType`·제목·summary로 Domain 재분류 금지.  
4. Native Call Runtime / Voice·Video LOCK — **본 계약 범위 밖 · 수정 금지**.

---

## 3. Surface → 단일 writer (목표 매핑)

| Surface | **목표 단일 writer** (신설·Phase H) | **현재 multi (A 감사 · REMOVE 대상)** | 목표 읽기 전용 |
|---------|-------------------------------------|----------------------------------------|----------------|
| BottomNav Hub | `lib/chat-domain/projections/hub-badge-projection.ts` (미신설) | `owner-hub-badge-store` fetch + poll180 + optimistic + participants sync | `getOwnerHubBadgeState` / selector만 |
| Bell | `lib/chat-domain/projections/bell-badge-projection.ts` (미신설) | `notification-badge-count-store` + adminNotice supplement | store get만 |
| App Icon | `lib/chat-domain/projections/app-icon-badge-projection.ts` (미신설) | `notification-unread-badge-store` poll45 + hub resync 교차 | apply 단일 진입만 |
| Domain list (GD) | `lib/chat-domain/list/general-direct-list-writer.ts` (미신설) | CM home bootstrap + home-sync + RT + bus + optimistic tip | applyHomeListPatch 축소→Domain writer |
| Domain list (group) | `…/group-list-writer.ts` | 동일 홈 파이프 | 동일 |
| Domain list (trade) | `…/trade-list-writer.ts` | CM trade 탭 + trade pc ledger | CM 홈에서 trade 제거(목표) |
| Domain list (store_order) | `…/store-order-list-writer.ts` | CM SO 탭 + order_chats | 동일 |
| Room chrome | Domain별 단일 entry shell (Phase I) | LayoutInline→Deferred→RouteEntry→Gate→Pass0/1→Stable→Body | chrome 1단 |

**규칙:** Surface는 Domain projection **결과만** 표시. clear/refresh/invalidate/Domain 분류 금지.

---

## 4. KEEP / REFACTOR / REMOVE (동결)

### KEEP (당분간 유지 · 무단 삭제 금지)

- `lib/community-messenger/**` 메시지·룸 API·Realtime 구독 인프라 (Domain 분리 전까지)
- `lib/chats/**` trade product_chats·order_chats (ledger 통합 전까지)
- `lib/order-chat/**`, `lib/shared-order-chat/**`
- Native Call / FCM / Agora native 경로 전부
- `applyHomeListPatch` 단일 진입 계약 (`verify:messenger-home-list-owner`) — Domain writer로 이전 **전**까지 유지

### REFACTOR (Phase C~I · 계약만 동결, 구현은 승인 후)

- pillars `community` → `general_direct` + `group` 분리
- CM 홈 통합 목록 → Domain별 bootstrap/list
- Hub/Bell/AppIcon → projection 1 writer
- 방 진입 다단 셸 → Domain별 1단 chrome
- trade/store_order ledger 단일화

### REMOVE (호출 0 증명 후 삭제 · Phase J · **지금 실삭제 금지**)

| ID | 심볼/경로 | 비고 |
|----|-----------|------|
| R1 | `applyCommunityMessengerUnreadOptimistic` | hub 우회 set |
| R2 | Hub 180s `OWNER_HUB_BADGE_POLL_MS` poll이 surface 직접 갱신 | projection 후 제거 또는 서버 health만 |
| R3 | App Icon 45s poll + hub resync 교차 write | 단일 writer로 흡수 후 제거 |
| R4 | Bell `adminNotice` supplement가 badge-count와 병행 write | 단일 writer로 흡수 |
| R5 | `CommunityMessengerRoomRouteEntryShell` | chrome 1단화 후 |
| R6 | `CommunityMessengerRoomPass0Shell` | 동일 |
| R7 | `CommunityMessengerRoomPass1StableShell` / `Pass1ComposerShell` | 동일 |
| R8 | `CommunityMessengerRoomStableEntryShell` (+Light) | 동일 |
| R9 | `CommunityMessengerRoomDeferred` (다단 중간층) | 측정 후 paint-only면 |
| R10 | `CommunityMessengerRoomSegmentShellLayout` | **이미 호출 0** — Phase J 삭제 후보 1순위 |
| R11 | CM 홈에 trade/store_order를 GD·group과 같은 writer로 merge하는 경로 | Domain 분리 후 |

### 절대 복원 금지 (7/14 `36bd68ada` 이후 trash · file-lock FAIL)

| 경로 |
|------|
| `lib/community-messenger/realtime/domain-room-state-store.ts` |
| `lib/community-messenger/realtime/reduce-domain-room-event.ts` |
| `lib/notifications/build-notification-badge-projection.ts` |
| `lib/messenger/contracts/domain-badge-surface-store.ts` |
| `lib/chat-domain/chat-domain.ts` (구 Domain Authority 덤프 — 본 freeze의 `four-domain-freeze.ts`와 별개) |

---

## 5. Phase B Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | identity 문자열·unique 규칙 문서화 | PASS (본 문서 §2) |
| 2 | Surface → 단일 writer 목표 매핑 | PASS (본 문서 §3) |
| 3 | KEEP/REFACTOR/REMOVE 동결 | PASS (본 문서 §4) |
| 4 | `verify:chat-domain-file-lock` CI 실행 가능 | PASS (스크립트) |
| 5 | 제품 런타임 diff (동작 변경) | **0** (의도) |
| 6 | REMOVE 실삭제 | **0** (의도) |
| 7 | 7/14 trash 복원 | **0** |

**판정:** `PASS (freeze)` · **STOP** — 사용자 승인 전 Phase C 금지.

---

## 6. Phase C 킥오프 (승인 후만)

```
Phase C만. Domain+identity 컬럼·API create/find Domain별.
migration 작성만(적용은 별도 승인).
제품 Surface writer 교체·REMOVE 실삭제 금지.
Native Call LOCK 수정 금지.
```
