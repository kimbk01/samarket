# Badge Surface Authority Audit (stub)

**기준 HEAD:** post-`08056fc60` · B1 Bottom Chat live  
**범위:** 전수 §18 표는 이후 확장. 이번은 Bottom / App Icon / Bell 3행만.

| Surface | 숫자 의미 | reader | writer (현재) | Domain 필터 | 상태 |
|---------|-----------|--------|---------------|-------------|------|
| Bottom Chat | GD + group **unread 방 수** | hub `communityMessengerUnread` via `resolveMessengerChatTabBadgeCount` | participant → `applyBottomChatLiveRoomCountDelta` + hub resync | GD/group only · trade/SO fail-closed | **B1** |
| App Icon | 미확인 notification **event** total | `notification-badge-count-store` | Bell projection funnel | event 축 (방 수 혼용 금지) | 유지 · B4 |
| Header Bell | surface unread + adminNotice | `notification-unread-badge-store` + badge-count admin | poll / patch | participant 직접 재합산 금지 | B4 |

## B1 변경 요약

- `lib/community-messenger/notifications/bottom-chat-live-room-count.ts`
- `use-cm-participants-hub-sync`: 0→>0 / >0→0 시 Domain-aware ±1
- 캐시에 Domain 없으면 live bump 안 함 (resync 권위)

## STOP

B2 리스트 · B3 Domain 허브 · B4 Bell/App Icon · Push/sound — **별도 승인**.
