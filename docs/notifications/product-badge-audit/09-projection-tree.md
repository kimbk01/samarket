# 09 — Projection Tree

**Mode:** STOP · Product paths (intended) + live forks (audit)

---

## 1. Intended product tree

```text
Authority (facts)
  A: unread member notification_events (eligible)
  B: unread rooms by domain + unresolved missed (once)
  C: store ops attention by store_id
        │
        ▼
Projection (pure formulas)
  BellDigit              = A
  BottomChat             = |GD| + |Group|
  TradeHub               = |Trade|
  OrderHubCustomer       = |Customer SO|
  OwnerFabChat           = |Owner SO| @ active store
  OwnerFabOps            = C @ active store
  MemberAppIcon          = A + B_member (no B_store, no C)
        │
        ▼
UI Readers
  Header Bell / NC
  Bottom Nav
  Messenger Hubs / Rows
  Owner FAB / Hub
        │
        ▼
Native echo
  Capacitor Badge.set(MemberAppIcon)
  FCM / APNS badge_count = MemberAppIcon
        │
        ▼
App Icon (OS)
  Launcher digit / dot
```

**Rule:** Native and OS only **echo** MemberAppIcon. They never invent authority.

---

## 2. Live forks that break the product story

```text
HTTP badge-count payload
  ├─ projection.appIconTotal / memberAppIconAuthority  → Cap path (~20)
  └─ unifiedAttention.appIconTotal                     → larger (~22, owner rooms)
        │
        ▼
Product user sees one launcher number
        │
        ▼
Engineers / smoke can cite the other number
        │
        ▼
PRODUCT FAIL (two truths)
```

```text
Bell click
  └─ Gate 3 Step 8 → route Notification Center
       (popup path weakened)
```

```text
Messenger home UI
  └─ non-badge defect: red vertical stripe (chrome)
```

---

## 3. Path checklist (product)

| Path | Must be single-flight from authority |
|------|--------------------------------------|
| A → Bell Digit | Yes |
| A → NC list eligibility | Same filter as Bell |
| B domains → Hubs | Yes |
| B GD+Group → Bottom | Yes |
| A+B_member → App Icon → Cap → Launcher | One number |
| C / B_store → Owner only | Never member icon |

---

## 4. Diagram — Member vs Owner

```text
                    ┌──────────── Member ────────────┐
Facts ──► A ───────► Bell / NC                       │
      └──► B_member ► Bottom / Hubs / App Icon       │
                    └────────────────────────────────┘

                    ┌──────────── Owner ─────────────┐
Facts ──► B_store ─► Owner FAB chat / hub            │
      └──► C ───────► Owner FAB ops / dashboard      │
                    └────────────────────────────────┘
```

No arrow from C or B_store into Member App Icon / Bell / Bottom.
