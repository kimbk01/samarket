# Phase A 전수 감사 결과 (수정 0)

**기준 commit:** `e5e44fcd5` (2026-07-23, 롤백 tip `da5ad3fdb` + deploy trigger)  
**범위:** Phase A만 · 코드 diff 0 · 커밋/푸시/배포 없음  
**복원 금지 확인:** `36bd68ada` 이후 Domain Authority / Phase R / Projection cutover / Atomic **현재 트리에 없음** — 복원할 대상 없음  
**Native Call:** 본 감사에서 수정·삭제 제안 없음  

**판정:** `PASS` (감사 완료) · **구현 STOP** — Phase B는 승인 후

---

## 표 1 — 영역 SSOT

| 영역 | 현재 source of truth | writer 전체 (요약) | reader 전체 (요약) | Domain 구분 | 중복/오염 위험 | 수정 필요 |
|------|---------------------|-------------------|-------------------|-------------|----------------|-----------|
| 채팅 홈 목록 (CM) | `home-list-patch.applyHomeListPatch` + bootstrap/home-sync 응답 | critical/full bootstrap, home-sync silent, RT, multi-tab bus, optimistic mark_read, trade-meta | `use-community-messenger-home-state`, Home UI | **없음** — GD+group+trade+delivery가 한 `chats` bag | **HIGH** | REFACTOR→Domain별 store |
| 일반/그룹 목록 | 위와 동일 (UI 필터) | 동일 | 동일 | UI `roomType`만 | **HIGH** | Domain split |
| 거래 채팅 목록 | `/api/chat/rooms?segment=trade` + `get_chat_rooms_snapshot` | snapshot refresh, list-core assemble, dedupe | hub trade UI, `getChatRoomsFromDb` | **부분** — CM과 **이중 ledger** | **MED–HIGH** (pc+item_trade) | 단일 ledger+identity |
| 주문 목록 (고객) | buyer store-orders snapshot | SOL1 refresh | `/api/me/store-orders` | buyer 분리 | **LOW–MED** | KEEP→Domain bootstrap |
| 주문 목록 (오너) | owner store-orders snapshot+cache | OOL1 / fetch deduped | Owner orders UI | owner 분리 | **LOW–MED** | KEEP→Domain bootstrap |
| CM 안 store_order/trade 행 | CM home `chats` | CM bootstrap/RT | Home filter | 오염 | **HIGH** | REMOVE from CM home bag |
| room preview | list row + bus message patch | RT insert, outbound sync, home-sync | list UI | 없음 | **MED** | Domain envelope |
| unread (방) | DB `participants.unread_count` + list patch | mark_read service, send bump, bus, RT participants, optimistic 0 | list, hub RPC | 없음 | **HIGH** | 원자 read+projection |
| Header Bell | `notification-unread-badge-store` + surface API | poll 75s, RT bridge, mark-all, adminNotice supplement | PhilifeHeader inbox | surface 단위 (4 Domain 아님) | **HIGH** | 단일 notification projection |
| Bottom Chat | `owner-hub-badge-store.communityMessengerUnread` | fetch hub API, optimistic +1, poll 180s, bus resync, RT refresh | BottomNav / side nav | **없음** (방 수 합; trade/SO 포함 가능) | **HIGH** | GD+group만 · writer 1 |
| Domain list badge | list `unreadCount` / pillar attrs | home-list-patch 계열 | pillar rows | 부분 | **HIGH** | Domain projection |
| App Icon | `notification-badge-count-store` → NativeBadgeSync | poll 45s, resync, read patch, push payload | OS Badge | category 합 (room count와 단위 다름) | **HIGH** | 단일 projection · 이중합산 금지 |
| notification read | DB `notification_events` (+ legacy `notifications`) | repository mark*, inbox bridge, room-read client | Bell, badge-count | thread/category | **MED–HIGH** | dual table 정리 |
| room entry chrome | 다단 셸 (표 5) | layout / Suspense / Gate / Pass* | 사용자 시선 | n/a | **HIGH** (2번 진입) | 단일 chrome |
| bootstrap critical/full | CM service + home-sync bundle | API routes, silent fetch | home bootstrap hooks | bag | **HIGH** | Domain별 bootstrap |
| realtime CM home | `bindCommunityMessengerHomeRealtimeChannels` | Supabase channels + bus emit | home-realtime-bootstrap-list | fingerprint에 trade 방 포함 | **HIGH** | Domain channel |
| multi-tab bus | `multi-tab-bus` `samarket:community-messenger` | Phase1/send/RT/mark_read | list + badge | 전역 | **HIGH** | Domain envelope |
| cache | bootstrap sessionStorage v1/critical/minimal; room snapshot IDB | prime/patch | hydrate | bag | **MED** — authority 아님이어야 함 | cache≠SSOT 강제 |

---

## 표 2 — writer inventory (surface 핵심)

| 상태/데이터 | writer 함수 | 호출 조건 | 저장 위치 | Domain 정보 | 충돌 | 유지/삭제/교체 |
|-------------|-------------|-----------|-----------|-------------|------|----------------|
| Bottom CM unread | `applyOwnerHubBadgePayload` | hub GET / broadcast / cache | memory hub snapshot | 없음 | vs optimistic | **REFACTOR→단일 projection** |
| Bottom CM unread | `applyCommunityMessengerUnreadOptimistic` | participant 0→>0 | hub snapshot | 없음 | vs fetch 감소 가드 | **REMOVE** (quarantine→삭제) |
| Bottom refresh | `requestMessengerHubBadgeResync` | mark_read, RT, list, notif read… | event→hub **+** badge-count | reason 태그만 | hub+icon 동시 | **REFACTOR** (projection만) |
| Bottom poll | hub store 180s poll | subscribe | hub snapshot | 없음 | 다발 refresh | **REMOVE or 약화** (projection 후) |
| Bell total | unread-badge-store `doFetch`/`setSnap` | 75s poll, RT, mark-all | memory per surface | surface | vs adminNotice overlay | **REFACTOR** |
| Bell overlay | `tier1-admin-notice-bell-supplement` | header | overlays App Icon field | 없음 | Bell≠단일 store | **REMOVE/흡수** |
| App Icon | badge-count-store `doFetch`/`setSnap` | 45s poll, resync | memory→NativeBadge | category | vs Chat room count | **REFACTOR** |
| App Icon patch | `applyNotificationBadgeCountFromReadResponse` | after read APIs | snap | 없음 | 이후 full resync | **REFACTOR** |
| List unread | `applyHomeListPatch` (local_unread, merge, seed…) | bootstrap/RT/bus/home-sync | React list + bootstrap cache | roomType 부분 | 다 writer | **REFACTOR** Domain store |
| List unread | `applyHomeListSummaryPatchUnread` | bus summary_patch | list | 없음 | vs guard | 계약에 맞게 **REFACTOR** |
| List unread 0 | `applyCmHomeOptimisticMarkRead` / room-open optimistic | 방 진입·홈 스와이프 | bus→list | 없음 | vs critical 양수 | **REFACTOR** (authority 아님) |
| Stale suppress | `local-read-guard` Map TTL 20s | enter/bus/merge | memory | 없음 | TTL 후 통과 | **REFACTOR** (version 기반) |
| Hub room count RPC | `get_community_messenger_unread_room_count` / aggregate | hub API | DB counter/RPC | 필터 불명확 | vs targets | **REFACTOR** GD+group만 |
| Targets bottom_nav | `build-owner-hub-badge-from-targets` | hub payload | targets | chat_room policy | dual SSOT | **REFACTOR** 단일화 |
| DB unread | `markCommunityMessengerRoomAsRead` / send +1 | PATCH mark_read, send | `participants.unread_count` | room | list lag | **KEEP** (fact) + projection |
| Notif read | `notification-event-repository` mark* | inbox/room/category | `notification_events` | thread | legacy dual | **KEEP** + bridge 정리 |
| Notif legacy | inbox-read-bridge → `notifications.is_read` | mark-all | legacy table | mixed | dual | **REMOVE/흡수** 후보 |
| Trade list rows | `assembleChatRoomsList` + `dedupeTradeChatRoomRows` | `/api/chat/rooms` | response | trade 부분 | pc+cr | **REFACTOR** |
| CM trade rows | `dedupeTradeMessengerRoomSummaries` | CM list | CM chats | 이중 | hub와 중복 | CM home에서 **REMOVE** |
| Bus emit | `postCommunityMessengerBusEvent` | many | BroadcastChannel | 전역 | cross-domain | **REFACTOR** envelope |

---

## 표 3 — 의심 A~D (코드 경로 · 가설 금지)

### A. 새로고침 시 뱃지 flash

| T | 경로 | 무엇이 채워지나 |
|---|------|----------------|
| T0 | SSR/shell · BottomNav hub subscribe | hub in-memory 또는 빈값 |
| T1 | (hub는 durable session seed 없음) · list는 `bootstrap-cache` sessionStorage | list unread 가능 / hub는 네트워크 대기 |
| T2 | hub GET + badge-count GET + critical bootstrap | 세 surface 각기 도착 → **숫자 점프** |
| T3 | full bootstrap / home-sync | list·RPC 재기록 |
| T4 | RT subscribe + NotificationsBadgeRealtimeBridge | INSERT→hub refresh 추가 |
| T5 | bus replay / optimistic 잔여 | local_unread vs server |
| T6 | poll 45s/75s/180s | 또 덮어씀 |

**최초 충돌:** Chat tab(방 수) vs App Icon(event SUM) vs Bell(surface unread) **단위·소스 삼중**.  
`requestMessengerHubBadgeResync`가 hub+badge-count를 **동시에** 건드림.

### B. 거래 목록 중복

| 확인 | 결과 | 경로 |
|------|------|------|
| message JOIN으로 room row 증식 | **아니오** (CR1 snapshot) | `get_chat_rooms_snapshot` — messages는 side map |
| list key = messageId | sender lookup Map만 messageId | `chat-rooms-snapshot-assemble` |
| dual ledger | **예** — `product_chats` + `chat_rooms` item_trade | `dedupeTradeChatRoomRows` |
| CM에도 trade | **예** | `dedupeTradeMessengerRoomSummaries` |

**불변식 위험:** pc+cr 키 약하면 중복 가능. message join 복제는 현 경로에서 아님.

### C. 읽음 후 뱃지 재등장

| 단계 | 경로 |
|------|------|
| optimistic 0 | `use-messenger-room-open-mark-read-effect` → bus `local_unread(0)` |
| DB | `markCommunityMessengerRoomAsRead` → participants |
| 가드 | `setLocalReadGuard` TTL 20s |
| 재등장 후보 | hub optimistic; home-sync/participant 양수; TTL 만료 후 stale; badge-count poll; targets≠participant |

**최초 충돌:** list optimistic 0 vs **다발 hub/icon resync·poll** vs (과거) home_sync 가드 우회 — HEAD에도 dual SSOT·optimistic·poll 병존.

### D. user vs owner identity

| identity | 주문 채팅에서 |
|----------|----------------|
| auth user id | 세션 |
| customer / owner | 경로 분기 (buyer snapshot vs owner snapshot) |
| store / order | order list · CM `store_order:` direct_key |
| 표시 | 매장 vs 개인 — **코드에 혼용 위험 지점** (CM home에 SO 행 + 오너 hub refresh from RT) |

**분리:** buyer/owner **목록 API는 분리됨**. CM home bag·hub badge·notif receiver에 **역할 혼용 잔존**.

---

## 표 4 — REMOVE 격리·삭제 계획 (후보 · 삭제 미실행)

| 파일/심볼 | quarantine 방법 | 삭제 전 증명 | 대체 |
|-----------|-----------------|--------------|------|
| `applyCommunityMessengerUnreadOptimistic` | 호출부 제거 + import ban test | `rg` 호출 0 | Domain projection apply only |
| hub 180s poll이 surface 직접 set | poll 제거 또는 projection-only refresh | 단일 writer 테스트 | projection scheduler 1곳 |
| badge-count 45s + Bell 75s 병렬 authority | surface write 금지, read-only drift check | contract test | 단일 projection tick |
| `tier1-admin-notice-bell-supplement` Bell overlay | Bell을 projection 필드로만 | overlay 호출 0 | Builder 필드 |
| CM home에 trade/SO row 포함 | list filter→나중 bootstrap 분리 | home chats에 commerce 0 | Domain lists |
| `CommunityMessengerRoomRouteEntryShell` | Stable에 흡수 | import 0 | StableEntryShell |
| `Pass0Shell` / `Pass1StableShell` 중복 chrome | OpeningOverlay 또는 layout과 단일화 | paint 1단 측정 | 단일 ShellChromeFrame |
| `SegmentShellLayout` (제품 import 0) | quarantine | import 0 | 삭제 |
| legacy `notifications.is_read` dual write | inbox bridge 단일화 | write 경로 1 | events only |
| `inferMessengerDomainFromChatRoom` 런타임 SSOT | Domain 컬럼 후 추론 금지 | 호출 축소 | DB chat_domain |

**절차:** quarantine → 호출 0 → **실삭제** → import 락 CI. Phase J에서 실행. Phase A에서 삭제하지 않음.

---

## 표 5 — 방 진입 셸 inventory

| 컴포넌트 | paint 역할 | 제거/병합 후보 | 비고 |
|----------|------------|----------------|------|
| `PageClientEntry` | 오케스트레이터 | **KEEP** | |
| `PageClientEntryDeferred` | chunk + Gate | **KEEP/인라인 검토** | loading=RouteEntry → 이중 |
| `RouteEntryShell` | Stable segment 래퍼 | **MERGE→REMOVE** | |
| `BootstrapGate` | snapshot 전 차단 | **KEEP** 게이트 / pending shell **MERGE** | |
| `Pass0Shell` | in-route full chrome | **REMOVE 후보** | OpeningOverlay와 겹침 |
| `Pass1StableShell` | Pass0 후 chrome | **MERGE→REMOVE** | |
| `Pass1ComposerShell` | composer 조기 | **KEEP→단일 footer** | |
| `StableEntryShell(+Light)` | 공통 chrome | **KEEP 1개로 통합** | |
| `LayoutInlineShell` | layout z-0 | **KEEP** canonical first | |
| `OpeningOverlayHost` | pre-route chrome | **KEEP 또는 Pass0와 단일** | |
| `SegmentShellLayout` | 미사용 | **REMOVE** | |

**메시지 전 full chrome 가능:** LayoutInline, RouteEntry, Gate pending, Stable, Pass0, Pass1Stable, OpeningOverlay → **체감 “두 번 진입”의 구조 원인.**

---

## 표 6 — DB 불변식 vs 현재 schema

| 불변식 | 현재 | 충돌 | migration 필요 | 데이터 손실 위험 |
|--------|------|------|----------------|------------------|
| room `chat_domain` NOT NULL | **컬럼 없음** | 목표 계약과 충돌 | **예** (backfill) | 오분류 시 목록/뱃지 |
| domain identity NOT NULL | **없음** | 충돌 | **예** | 동일 |
| domain 변경 금지 | 앱 추론·`room_type`만 | 추론으로 사실상 흔들림 | 컬럼+트리거/앱 금지 | — |
| GD pair unique | `direct_key` UNIQUE | commerce 키 동일 공간 | identity 체계 정리 | merge 실수 |
| group unique | room PK | `group:{id}` 컬럼 없음 | 문서화 또는 컬럼 | 낮음 |
| trade triple unique | `chat_rooms` UNIQUE (item_trade); CM `trade_item`/`trade_pc` 이중; product_chats UNIQUE **미증명** | **예** | UNIQUE 확인+단일 키 | 방 병합 |
| store_order order unique | `order_chat_rooms.order_id` UNIQUE; CM direct_key; `store_orders.cm_room_id` **UNIQUE 아님** | 이중 ledger | FK UNIQUE + Domain | 중복 방 정리 |
| participants unread | `unique(room_id,user_id)` + unread_count | vs targets 이중 | projection | 재계산 |
| notification_targets | UNIQUE(user,type,id) | vs participant 합산 | projection 계약 | 낮음 |
| generated DB types | `database.types.ts` 없음 | drift | gen types | — |

**운영 DB에 migration 미적용.** Phase C에서 작성·별도 승인.

---

## Root cause 요약 (측정 아닌 구조 확정)

1. **Surface당 writer ≥2** (hub optimistic+fetch+poll, Bell+supplement, icon poll+resync, list bus+bootstrap+RT).  
2. **4 Domain SSOT 부재** — pillars/`room_type`/추론만 존재.  
3. **CM home이 commerce 방을 같은 bag·RT fingerprint에 포함.**  
4. **방 진입 다단 chrome** — 뱃지와 무관한 이중 페인트.  
5. **Chat 방 수 vs App Icon event SUM vs Bell surface** 단위 불일치.

→ 패치로 닫을 수 있는 단일 버그가 아니라 **재설계(계획 Phase B+) 대상.**

---

## KEEP (초기)

- DB participants unread / mark_read service (fact)  
- buyer/owner **주문 목록** snapshot API 분리  
- `ShellChromeFrame` 시각 골격 (단, 호출 경로 단일화)  
- BootstrapGate의 “데이터 없이 RoomClient 금지” 의도  
- Native Call 경로 (비범위)

---

## Phase B 착수 전 막힘

| 항목 | 상태 |
|------|------|
| `chat_domain` 컬럼 없음 | migration 설계 필요 (적용 승인 별도) |
| trade 이중 ledger 정책 | pc vs cr **폐기 순서** 결정 필요 |
| Bottom Chat에 trade/SO 포함 여부 | RPC/집계 실측 1회 권장 (구현 전) |
| 운영 backfill 오분류 위험 | dry-run 계획 |

---

## STOP

- Phase A **PASS** (감사)  
- **구현·커밋·푸시·배포·파일 삭제 하지 않음**  
- 다음: 사용자 승인 후 **Phase B** (계약 freeze + 파일락 초안만)

계획 문서: `docs/community-messenger/2026-07-23-four-domain-redesign-plan.md`
