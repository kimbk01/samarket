# Badge Surface Authority Audit

**기준:** `ada4104aa` · **LOCK:** `PASS — BADGE / NOTIFICATION DOMAIN AUTHORITY LOCKED`  
**문서:** `2026-07-24-badge-notification-domain-authority-lock.md`  
**Phase J inventory:** `2026-07-24-badge-bell-phase-j-inventory.md`

| Surface | 숫자 의미 | reader | writer | Domain 필터 | 상태 |
|---------|-----------|--------|--------|-------------|------|
| Bottom Chat | GD + group **unread 방 수** | hub CM unread | B3 RPC + live room-count | GD/group only | **LOCKED** |
| App Icon | Domain App Icon projection | NativeBadgeSync / store | Domain projection funnel | Bell mirror 금지 | **LOCKED** |
| Header Bell | Domain projection `badge-count.total` | `resolveTier1HeaderBellBadgeTotal` | `buildNotificationBadgeProjection` | rooms + orphan + non-chat | **LOCKED** |
| Target facts | Domain snapshot on `notification_targets` | Domain loaders fail-closed | `upsert_notification_target_unread` + room authority | NULL pair 제외 | **LOCKED** |

## Residuals (track, do not reopen LOCK)

- **R-SO-DUAL:** buyer_order + owner_order_chat dual attention  
- **R-TRADE-MULTI:** multi-trade unread / room-read clear scope  

## STOP

- Badge/Bell 공식·writer 경로 **변경 금지** (unlock 승인 전)  
- Phase J: inventory ✅ → quarantine / call-0 / import-ban / delete 는 **슬라이스별 승인**  
- Legacy 일괄 실삭제 금지  
