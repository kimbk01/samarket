# Badge Surface Authority Audit (stub)

**기준 HEAD:** post-`08056fc60` · B1 Bottom Chat live  
**범위:** 전수 §18 표는 이후 확장. 이번은 Bottom / App Icon / Bell 3행만.

| Surface | 숫자 의미 | reader | writer (현재) | Domain 필터 | 상태 |
|---------|-----------|--------|---------------|-------------|------|
| Bottom Chat | GD + group **unread 방 수** | hub `communityMessengerUnread` via `resolveMessengerChatTabBadgeCount` | participant → recount + hub resync · **RPC B3 domain filter** | GD/group only · trade/SO fail-closed | **B3 (클라+RPC)** |
| App Icon | 미확인 notification **event** total | `notification-badge-count-store` | Bell projection funnel | event 축 (방 수 혼용 금지) | 유지 · B4 |
| Header Bell | surface unread + adminNotice | `notification-unread-badge-store` + badge-count admin | poll / patch | participant 직접 재합산 금지 | B4 |

## B1 변경 요약

- `lib/community-messenger/notifications/bottom-chat-live-room-count.ts`
- `use-cm-participants-hub-sync`: 0→>0 / >0→0 시 Domain-aware ±1
- 캐시에 Domain 없으면 live bump 안 함 (resync 권위)

## B3 변경 요약 (이번)

- `get_community_messenger_unread_room_count` → rooms join, `chat_domain` GD+group only · commerce `direct_key` 제외
- migration: `20261006120000_cm_unread_room_count_bottom_chat_domains.sql` (**APPLY는 운영 별도**)
- legacy PostgREST fallback도 동일 필터 (`roomSummaryCountsForBottomChat`)
- 잔여: null `chat_domain` + context_meta-only trade/delivery → item 5 backfill

## STOP

B4 Bell/App Icon · Push/sound · projection 행 소스 · backfill APPLY — **다음 순서·별도 승인**.
