# Push Routing / Read Contract (Gate 2)

**FCM/APNs = transport only.** Never authority.

---

## Required payload fields

```text
eventId
eventType
recipientScope          // member | store | delivery_only
recipientMemberId       // when member
recipientStoreId        // when store
storeId                 // optional alias when store
chatDomain              // when chat
roomId                  // when chat
notificationId          // when A event
targetRoute
dedupeKey
```

`badge_count` / APNs badge = **derived echo of App Icon** after Domain compute — not a second ledger.

---

## Pipelines

### Member notification push

```text
Source: OS tap
→ load notification by notificationId/eventId
→ Recipient Scope member matches session
→ Authority: set read_at SUCCESS
→ Projection: A, App Icon
→ Final Route: targetRoute
```

### Chat push

```text
Source: OS tap
→ Final Route: room
→ timeline mount + read cursor ACK (chat read contract)
→ Authority: room unread 0
→ Projection: B surfaces, App Icon
```

**Forbidden:** tap alone sets room unread 0 before timeline mount + ACK.

### Owner push

```text
Source: OS tap
→ verify recipientStoreId
→ set active store context
→ Final Route: owner admin route
→ Projection: that store C only
```

**Forbidden:** mutate member A/Bell/App Icon.

### Push-only promotion

```text
no notification event
A/B/C unchanged
Final Route: targetRoute only
```

---

## Cold / warm / resume

```text
Authority refresh = Domain snapshot with authorityVersion
Native apply only if version ≥ lastApplied
resume MUST NOT apply Cap prefs as authority when Domain fetch fails
```
