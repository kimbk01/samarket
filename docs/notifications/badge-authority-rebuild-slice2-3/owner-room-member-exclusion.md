# Owner Room Member Exclusion (Slice 2-3)

## Problem

```text
partition(owner) → ownerOrderRoomIds
  → ChatAttention
  → storeOrderForAppIcon = owner + buyer
  → Member App Icon
```

## Fix (this slice)

`buildNotificationBadgeProjection`:

```text
storeOrderForAppIcon = buyer   // customer only
storeOrderOwnerUnreadRooms = ownerForHub  // unchanged for Owner FAB / hub
```

Member B room count:

```text
memberUnreadRoomCount = GD + Group + Trade + Customer
```

Owner rooms must not appear in:

- Member App Icon web/server total
- Bottom Chat
- Customer Order Hub

Owner rooms may still appear in:

- `storeOrderOwnerUnreadRooms`
- Owner FAB / Hub GET store-scoped shell
- Explain matrix owner bags
- ChatAttention.ownerOrderRoomIds (diagnostic)

## Guard

`buildMemberAppIconWebProjection` rejects contaminated inputs that pass `ownerStoreOrderUnreadRooms > 0` or `storeActionRequiredCount > 0` into the member total builder.

## Not this slice

Full B_store product implementation · Owner FAB redesign · C_store — Slice 2-4 / 2-5.
