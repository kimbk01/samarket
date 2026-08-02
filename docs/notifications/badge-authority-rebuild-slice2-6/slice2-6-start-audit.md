# Slice 2-6 — Native / FCM Start Audit

**Status:** Implementation baseline  
**HEAD (pre-slice tip):** post Slice 2-5 `3b8f836c5` / C_store RUNTIME PASS  
**Locked:** A_member · B_member · B_store · C_store — **not modified**

---

## Formula (unchanged Web Authority)

```text
MemberAppIconTotal = A_member + B_member
  A_member = Bell Authority (member unread notices)
  B_member = General + Group + Trade + Customer Order rooms + Missed Call
  B_store  = EXCLUDED
  C_store  = EXCLUDED
```

Native / FCM **do not compute** — absolute echo only.

---

## Path inventory (audit)

| Path | Role | Class |
|------|------|-------|
| `buildNotificationBadgeProjection` → `memberAppIconWebTotal` / `appIconTotal` | Web SSOT | **KEEP** |
| `domain-badge-surface-store.appIconTotal` | Cap runtime source | **KEEP** |
| `NativeBadgeSync` → `syncNativeBadgeCount` | Absolute Cap + Delivery | **KEEP** |
| `DibayAppIconDeliveryAdapter` (Android/iOS) | Absolute launcher/SpringBoard | **KEEP** |
| `notify-push-dispatcher` | FCM/APNS badge wire | **REWRITE** → resolve MemberAppIconTotal |
| FCM `badgeCount` omit when 0 | Clear gap | **REWRITE** → always send |
| Local ±1 / accumulate | Not found on product path | **DELETE** candidate (already absent) |
| Cap cache resume echo | Stale risk | **ROUTE** (not invent; Web Projection remains SSOT) |

---

## Implementation focus

1. Pure contract `native-fcm-member-app-icon-authority.ts`
2. FCM/campaign/ACK native totals use `resolveMemberAppIconTotalForNativeFcm`
3. Always encode `badgeCount` including `0`
4. No Bell UI · no A/B/C formula change · no PRODUCT/HARD LOCK
