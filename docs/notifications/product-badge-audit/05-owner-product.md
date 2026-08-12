# 05 — Owner Product

**Mode:** STOP · Product requirement  
**Rule:** Owner is fully separated from Member.

---

## 1. Separation matrix

| Surface / Authority | Member Badge | Owner Badge | Notes |
|---------------------|--------------|-------------|-------|
| A Member Notification | YES | NO (as owner ops) | Owner may also be a member on personal account — personal A only |
| B Member Conversation | YES | NO | GD/Group/Trade/Customer SO for the person |
| B_store Order Chat | NO | YES | Per `store:{id}` |
| C Store Ops | NO | YES | Per `store:{id}` |
| App Icon (Member) | A + B_member | **C / B_store never** | Critical |
| Bell (Member) | A only | C / B_store never | |
| Bottom Chat (Member) | GD + Group | Owner rooms never | |
| Trade Hub (Member) | Trade B | Owner SO never | |
| Owner FAB Chat | — | B_store | |
| Owner FAB Orders | — | C | |

---

## 2. Store-scoped separation

```text
Owner attention is always store:{store_id}.

Store A switch → badges for store A only.
Store B switch → badges for store B only.
No cross-store sum on a single FAB digit unless product explicitly says “all stores”.
Default product: active store only.
```

| Item | Product |
|------|---------|
| Writer identity | store_id + owner role |
| Quarantine | Events with missing/wrong store_id never project |
| Member user_id owner_intake on Bell | **Forbidden** |

---

## 3. Owner surface definitions (product)

### Owner FAB Chat

| # | Definition |
|---|------------|
| ① Display | Unread customer→store chat rooms for active store |
| ② Meaning | B_store room count |
| ③ Increase | Customer message in SO room |
| ④ Decrease | Owner Read ACK in room |
| ⑤ Read | Room enter + ACK |
| ⑥ Delete | Room archive / leave policy |
| App Icon (member) | **No** |
| Bell (member) | **No** |
| Bottom (member) | **No** |

### Owner FAB Orders / Ops (C)

| # | Definition |
|---|------------|
| ① Display | Action-required ops count (or prioritized count) |
| ② Meaning | C store attention items needing owner action |
| ③ Increase | New order / status requiring action |
| ④ Decrease | Owner completes action / dismiss policy |
| ⑤ Read | Action completion ≠ “notification read” — ops clear |
| ⑥ Delete | Cancelled / expired ops |
| App Icon (member) | **No** |
| Bell (member) | **No** |
| Bottom (member) | **No** |

### Owner Hub / Row

Same authorities as FAB, room = message unread, hub = room or ops unit per UI contract.

---

## 4. Dual role (same human)

One person can be Member and Owner.

| Role context | Badge set |
|--------------|-----------|
| Using app as member (Community / Market) | Member A + B → App Icon, Bell, Bottom |
| Using Owner shell for store X | B_store(X) + C(X) on Owner surfaces only |

Switching into Owner shell must **not** dump C into Member Bell.

---

## 5. Live audit gap

Owner store UI was not the primary screenshot set for asas55 community home.  
Member path showed Cap App Icon excluding owner rooms (20) while unified chat total included them (22) — proves product still exposes **two truths**. That alone fails Owner/Member separation as a **user-visible story**.
