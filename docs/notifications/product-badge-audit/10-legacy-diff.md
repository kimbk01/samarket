# 10 — Legacy Diff

**Mode:** STOP · Product comparison  
**Sources:** Phase 0 map, Phase 1 contract, Slice 2-x rebuild, Gate 3 freeze, 2026-08-03 screenshots

---

## 1. What changed (product-facing)

| Area | Legacy (pre-rebuild) | Current (Gate 3 era) | Why changed | Product require? |
|------|----------------------|----------------------|-------------|------------------|
| Bell content | Mixed attention incl. chat families / marketing edge cases | A-oriented digit + NC filters; chat excluded from Bell path | Rebuild A purity | **Yes** (product) |
| Bell UX | Header popup inbox common | Click often → NC page (Step 8) | Implementation / Gate step | **Partially** — product never locked “popup required”; user expectation still popup |
| App Icon | ChatAttention + NotificationAttention (owner rooms often inside chat total) | Member path A+B_member via Cap; **unifiedAttention still dual** | Slice 2-3 member icon | **Yes** A+B_member; dual field = **implementation residue**, not product |
| Bottom Chat | GD+Group rooms | Same intent | Continuity | **Yes** |
| Trade Hub | Unread trade rooms | Same | Continuity | **Yes** |
| Owner on member icon | Often included via chat total | Cap excludes owner SO; unified may still count | Slice 2-3 exclusion | **Yes** exclude; dual = fail |
| Owner ops on Bell | owner_intake risk on user_id | Contract forbids; runtime separation Slice 2-5 | Product C isolation | **Yes** |
| Notification Center tabs | Chat/marketing tabs existed | Chat/marketing tabs removed | Slice 2-2 | **Yes** |
| Identity / quarantine | Weak | Content identity + quarantine rows | Gate 3 / backfill | Infrastructure for product purity |
| Backfill | N/A | 789 A inserts + incident repair | Production completeness | Ops; not UX polish |

---

## 2. Product vs convenience

| Change | Classification |
|--------|----------------|
| Chat out of Bell | Product |
| A+B_member App Icon | Product |
| Owner rooms off member Cap icon | Product |
| Keeping `unifiedAttention.appIconTotal` larger | **Implementation convenience / migration residue** |
| Bell → NC route instead of popup | **Implementation convenience** unless product signs off |
| API smoke as Device PASS | **Process error** (not a product feature) |
| Red list stripe | Defect / regression — not a product decision |

---

## 3. What users feel now vs legacy

| Feeling | Legacy risk | Current risk |
|---------|-------------|--------------|
| “Icon number mystery” | Owner+chat inflation | Dual 20 vs 22 still mystery |
| “Bell full of chat” | High | Lower on audited account |
| “Bottom vs Trade confusion” | Medium | Trade/Order correctly off Bottom; users may still expect Bottom = all chats |
| “Inbox click surprise” | Popup habit | Full-page NC |

---

## 4. Audit conclusion on legacy

Rebuild direction (A / B / C) is the **correct product direction**.  
Shipping state is **not** Product PASS because residue dual totals + UX incompleteness + visual defect remain.
