# Announcement Domain Contract (Gate 2)

**No migration in Gate 2.** Reuse audit only.

---

## Classes

| Class | Event? | A | Bell list | Deep link |
|-------|--------|---|-----------|-----------|
| Persistent announcement | yes | +1 | yes | yes / detail |
| Push-only promotion | no | 0 | no | yes |
| Persistent marketing | yes | iff `badge_policy.includes_in_A` | 혜택 filter | yes |

---

## Existing assets (reuse decision)

| Asset | Fits? | Decision |
|-------|-------|----------|
| `notification_events` | recipient, read_at, dismiss, dedupe | **Canonical A store** |
| Admin campaigns (`admin_notice` / `admin_marketing_banner`) | types exist | **Reuse** with explicit `badge_policy` / preference gates |
| `notification_targets` | hub targets; not A digit | **Keep for hubs** · never sum into A |
| Separate `announcements` table | not required if events cover fields | **Defer** — only if detail/image/schedule cannot map |

---

## Mapping

```text
system/service/policy/security/admin_notice → persistent announcement → A
admin_marketing_banner + push-only campaign flag → delivery_only → A=0
admin_marketing_banner + persistent + consent → marketing → badge_policy
```

Gate 3 may add columns; Gate 2 forbids writing migrations.
