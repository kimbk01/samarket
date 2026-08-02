# Slice 2-5 — C_store Surface Contract

**Status:** AUTHORITY CONTRACT LOCK  
**HEAD:** `c673ac444`

---

## 1. Allowed surfaces (C_store digit)

| Surface | Role |
|---------|------|
| Owner Operations Hub | Hub badge ops segment |
| Owner Operations FAB | FAB orders / FAB store (ops only) |
| Owner Dashboard action section | Action Required / Urgent KPIs |
| Owner order action-required list | list / header bridge from ops state |

Mapped foundation surfaces: `OWNER_OPERATION_BADGE`, `OWNER_ADMIN_OPERATION`, `OWNER_DELIVERY_BOTTOM` (ops shell — not chat).

---

## 2. Forbidden surfaces

| Surface | Authority instead |
|---------|-------------------|
| Member Bell | A_member |
| Member App Icon | A + B_member |
| Native Member App Icon | Slice 2-6 echo of member icon |
| Bottom Chat | B_member |
| Customer Order Hub | B_member |
| Owner Chat Hub / FAB chat digit | **B_store** |
| Chat list row | B_store / B_member |

---

## 3. Separation on Owner shell

```text
OwnerChatBadge          = B_store          # unread rooms
OwnerOperationBadge     = C_store          # Action Required
OwnerPresentationTotal  = B_store + C_store  # UI only
```

**Forbidden:** using `OwnerPresentationTotal` as API · DB · FCM · Native authority.

Live anti-pattern (ROUTE/DELETE in CODE):

```text
resolveOwnerOperationsCenterAttentionCount
  = orders + store + chat   # mixes B into “ops”
```

---

## 4. Dashboard CTA vs Hub badge

| Class | Surfaces | In C badge? |
|-------|----------|-------------|
| Action Required (pending/refund/cancel/inquiry) | Hub + FAB + Dashboard | **YES** |
| Cooking / delivery workflow CTA | Dashboard only | **NO** (OUT_OF_BADGE) |
| Review reply | Dashboard may show KPI | **NO** until REVIEW unlocked |
