# Surface Projection Contract (Gate 2)

Every surface reads from Domain authority projection only.

```text
Domain authority
→ A, B_*, C_*
→ surface projection
→ UI / Native adapter
```

---

## Member surfaces

| Surface | Projection input | Display |
|---------|------------------|---------|
| Bell digit | `A` | integer (UI may show 99+) |
| Bell list | same filter/type/recipient as A; optional include read | rows |
| Bell Popup / Notification Center | **A list only** — no `important_room`, no chat | rows |
| Bottom Chat | `B_general + B_group` | room count |
| Trade Hub | `B_trade` | room count |
| Customer Order Hub | `B_order` | room count |
| Chat rows | `roomUnreadMessages` | message count |
| App Icon | `A + B` with component payload | `appIconTotal` |

---

## Owner surfaces

| Surface | Input |
|---------|-------|
| Owner Ops FAB / Hub | `C_operational(activeStoreId)` (± inquiry per product UI contract) |
| Owner Chat Hub/FAB | `C_chat(activeStoreId)` room count |
| Owner order row | ops state + that order room `roomUnreadMessages` |

Member Bell / Bottom / App Icon: **0 contribution from C**.

---

## Forbidden projections

```text
attentionKeys.length as Bell digit
Bell digit + Bottom + Trade + Order re-sum as App Icon
Σ roomUnreadMessages as hub digit
legacy unread + events unread sum/max
FCM badge_count as write-back authority
Cap prefs / lastApplied as server authority
owner_intake user_id rows in A
chat important rooms in Bell
```

---

## App Icon payload (required)

See `badge-authority-contract.md` JSON fields.  
Native consumes `appIconTotal` + must reject/apply only if `authorityVersion` ≥ last applied.
