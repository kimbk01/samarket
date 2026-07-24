# Badge Surface Authority Audit (stub)

**기준 HEAD:** post-`08056fc60` · B1 Bottom Chat live  
**범위:** 전수 §18 표는 이후 확장. 이번은 Bottom / App Icon / Bell 3행만.

| Surface | 숫자 의미 | reader | writer (현재) | Domain 필터 | 상태 |
|---------|-----------|--------|---------------|-------------|------|
| Bottom Chat | GD + group **unread 방 수** | hub `communityMessengerUnread` via `resolveMessengerChatTabBadgeCount` | participant → recount + hub resync · **RPC B3 domain filter** | GD/group only · trade/SO fail-closed | **B3 (클라+RPC)** |
| App Icon | 미확인 notification **event** total | `notification-badge-count-store` | Bell projection funnel | event 축 (방 수 혼용 금지) | **slice-1 유지** |
| Header Bell | notification **event** total (`badge-count.total`) | `notification-badge-count-store` | Bell projection / patch / R3 poll | participant targets 직접 합산 금지 | **B4 (Header 단일 읽기)** |

## B1 변경 요약

- `lib/community-messenger/notifications/bottom-chat-live-room-count.ts`
- `use-cm-participants-hub-sync`: 0→>0 / >0→0 시 Domain-aware ±1
- 캐시에 Domain 없으면 live bump 안 함 (resync 권위)

## B3 변경 요약

- `get_community_messenger_unread_room_count` → rooms join, `chat_domain` GD+group only · commerce `direct_key` 제외
- migration: `20261006120000_cm_unread_room_count_bottom_chat_domains.sql` (**APPLY 완료**)
- legacy PostgREST fallback도 동일 필터 (`roomSummaryCountsForBottomChat`)
- 잔여: null `chat_domain` + context_meta-only trade/delivery → item 5 backfill

## B4 변경 요약 (이번)

- Header `tier1_inbox_bell` 표시 = `badge-count.total` 단일 (`resolveTier1HeaderBellBadgeTotal`)
- `adminNotice` **재가산 제거** (total에 이미 포함)
- `notification-unread-badge-store` **삭제 안 함** · 타 surface·mark refresh 유지
- R3 45s poll / R4 clearOptimistic **소스 유지**

## STOP

Push/sound/read QA · projection 행 소스 · backfill APPLY 잔여 · R2 — **다음 순서·별도 승인**.
