# Gate 3 Mid-Report 01 — Contract Test + Writer Freeze + Identity

**HEAD:** `f438f37e2`  
**Approval:** Gate 3 implementation approved (Authority rebuild, not patch chain)

---

## Declared this report

| Declaration | Status |
|-------------|--------|
| CODE PASS (Identity Layer pure module + tests) | **YES** (scoped) |
| CODE PASS (full Badge Authority) | **NO** |
| RUNTIME PASS | **FORBIDDEN** |
| PRODUCT PASS | **FORBIDDEN** |
| HARD LOCK | **FORBIDDEN** |

---

## Step 1 — Authority Contract Test

**Files:**
- `lib/notifications/badge-authority-rebuild/authority-a-set-heads.ts`
- `lib/notifications/badge-authority-rebuild/__tests__/authority-a-set-contract.test.ts`

**HEAD FAIL proof (vitest):**

| Check | Result |
|-------|--------|
| Digit count = \|attentionKeys\| | PROVEN on fixture |
| Same product → 2 unread events → digitCount **2**, unread list ids **3** | PROVEN inequality |
| `gate2ASetsEqual` false on HEAD | PROVEN |
| `it.fails` CONTRACT equality | Documents contract not yet met (expected fail on HEAD) |

Command:

```bash
npx vitest run lib/notifications/badge-authority-rebuild/__tests__/authority-a-set-contract.test.ts
# → 3 passed (includes it.fails documenting contract breach)
```

---

## Step 2 — Writer Inventory Freeze

**File:** `docs/notifications/badge-gate3-impl/writer-inventory-freeze.md`

| Surface | Frozen writer groups |
|---------|----------------------|
| Bell digit | 5 |
| mark-all | 2 (legacy+events) |
| App Icon (+resume) | 7 |
| Bottom / Trade / Order | 3 / 2 / 2 |
| Owner | 4 (incl. contaminant) |

---

## Step 3 — Identity Layer

**Files:**
- `lib/notifications/badge-authority-rebuild/badge-authority-identity.ts`
- `__tests__/badge-authority-identity.test.ts` (7 tests PASS)

**Provides:** member/store/delivery_only · A/B vs C axis guards · forbid owner user_id as store ops · App Icon axis allowlist · multi-store isolation.

**Does not yet:** rewire notifyStoreOwner writers (that is Owner C / A steps).

---

## Next (order locked)

```text
4. Notification Authority (A)  ← digit=list=mark-all event ids
5. Conversation Authority (B)
6. App Icon Projection
7. Owner Authority (C)
8. Notification Center
9. Push Routing
10. Runtime QA
```

No UI / App Icon product rewire before A.
