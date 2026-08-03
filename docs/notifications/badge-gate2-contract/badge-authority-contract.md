# Badge Authority Contract (Gate 2)

**Status:** CONTRACT  
**Gate 1:** `AUTHORITY REBUILD REQUIRED` (approved)  
**Scope:** Badge / Notification authority layer only · not full-repo reset  
**Mode:** No implementation in this gate

---

## Pipeline (mandatory shape)

```text
Source Event
→ Recipient Scope          // member:{userId} | store:{storeId} | delivery_only
→ Authority Mutation       // A | B | C_operational | C_chat | none
→ Projection               // surface digits / lists
→ Read/Delete Mutation     // canonical only
→ Final Route              // targetRoute | room | owner admin | deep link
```

Forbidden language in implementations of this contract: “전체 unread”, “관련 알림”, “적절히”.

---

## A — Member Notification Authority

```text
A = COUNT(notification events) WHERE
      recipient_scope = member
  AND recipient_member_id = current_member_id
  AND deleted_at IS NULL
  AND read_at IS NULL
  AND event is persistent (not push-only)
  AND event type ∈ A_INCLUDE set
```

**Canonical store (fixed):** `notification_events` (semantic fields may map from existing columns: `user_id`→`recipient_member_id`, soft-dismiss→`deleted_at` until schema rename).

**Forbidden digit authority:** attention-key set, legacy `notifications` unread sum, list row count with different filters, popup room counts.

### Surfaces

| Surface | Value |
|---------|-------|
| Bell digit | `A` |
| Bell list base set | same recipient/filter/type policy as A (may include read rows) |
| Bell unread count check | `A = count(list rows where read_at IS NULL AND deleted_at IS NULL)` |
| App Icon notification component | `A` |

### A_INCLUDE (event types)

```text
trade_status
buyer order_status / delivery progress / payment / refund (buyer recipient)
system_notice / service_notice / policy_notice / maintenance_notice / security_notice
admin_notice (persistent)
persistent marketing when badge_policy.includes_in_A = true
orphan_missed_call (see missed-call policy — A only)
community_activity / meeting notices when product marks persistent member notice
```

### A_EXCLUDE

```text
chat_message, group_message, trade_message, store_order_message
owner_intake / store operational events
owner chat messages
push-only promotion
FCM/APNs send attempts
room-bound missed_call (B only)
```

---

## B — Member Conversation Authority

```text
roomUnreadMessages(roomId) = unread message count for member participant
B_domain = COUNT(rooms in domain where roomUnreadMessages > 0)
B = B_general + B_group + B_trade + B_order
```

Domains:

```text
general_direct → B_general
group          → B_group
trade          → B_trade
store_order_customer → B_order
```

Surfaces:

| Surface | Value |
|---------|-------|
| Row | `roomUnreadMessages(roomId)` |
| Bottom Chat | `B_general + B_group` |
| Trade Hub | `B_trade` |
| Customer Order Hub | `B_order` |
| App Icon conversation component | `B` |

Parent badges use **room counts**, never Σ messages.

---

## C — Store Owner Authority

```text
recipient_key = store:{storeId}
C_operational(storeId) = unresolved store Action Required items
C_chat(storeId) = COUNT(owner order-chat rooms with roomUnreadMessages > 0 for that store)
```

Forbidden:

```text
record store ops under owner user_id as authority
sum multiple stores into one member digit
add C to Bell A or Member App Icon
```

Surfaces: Owner FAB / Admin Hub / order row / owner chat hub for **active storeId only**.

---

## Member App Icon

```text
Member App Icon = A + B
```

Payload **must** expose components (not total alone):

```json
{
  "memberNotificationUnread": 0,
  "generalUnreadRooms": 0,
  "groupUnreadRooms": 0,
  "tradeUnreadRooms": 0,
  "orderUnreadRooms": 0,
  "memberConversationUnreadRooms": 0,
  "appIconTotal": 0,
  "computedAt": "",
  "authorityVersion": ""
}
```

```text
memberConversationUnreadRooms = general + group + trade + order
appIconTotal = memberNotificationUnread + memberConversationUnreadRooms
```

Native: display `appIconTotal` only · no ±1 · no prefs-as-authority · no resume publish of older `authorityVersion`.
