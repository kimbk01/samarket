# Gate 3 Step 7 — HEAD Owner C failure proof

**Code-path evidence (not Runtime).** After Steps 4–6 CODE PASS.

---

## F1 — No unified store Owner Authority snapshot

| Evidence | `C_store` (ops) and `B_store` (owner chat) live in separate modules |
|----------|---------------------------------------------------------------------|
| Gap | No `resolveStoreOwnerAuthority` returning `C_operational` + `C_chat` + surfaces + `store:{storeId}` + versions together |
| Breach | FAB/Hub can compose axes inconsistently |

## F2 — Multi-store isolation not enforced at one authority gate

| Evidence | Per-store helpers exist but callers can still sum `byStoreId` |
| Breach | Same owner userId across stores must never merge into one member digit |

## F3 — owner_intake / fab_owner_* dual paths historically polluted member A

| Evidence | Gate 1/2: `notifyStoreOwner*` → user_id events; `fab_owner_orders` targets |
| Mitigation so far | Step 4 A excludes owner_intake; Step 6 App Icon rejects owner C |
| Gap | Step 7 must lock Owner C as sole store-scoped authority for Owner surfaces |

## F4 — Owner push recipient store not gated in C authority layer

| Evidence | Push routing separate; no pure `assertOwnerPushRecipientStore` in C module |
| Breach | Wrong-store admin entry possible without C-layer check |

## F5 — Member A/B/App Icon leakage risk if C counted as member axes

| Evidence | Without explicit XOR tests, new order / owner chat can be re-added to member surfaces |
| Breach | Must prove C ↛ A, C ↛ member B, C ↛ App Icon |

---

Runtime / Product / Hard Lock / full Badge Authority CODE PASS: **not claimed**.
