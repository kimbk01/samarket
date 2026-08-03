# 10 — Final Verdicts

**Mode:** AUDIT ONLY · no code change · no revert · no deploy  
**HEAD / origin/main / Production:** `f438f37e2e07b6c7dcb49faed37c72de0bbfbc8f`  
**Baseline:** `1e2a560c102cc3605a2ef29dcf68ccda0bd08a14` (failed pre-rebuild state)

---

## Design verdict (exactly one)

# DESIGN VALID — IMPLEMENTATION REBUILD REQUIRED

---

## Rollback verdict (exactly one)

# PARTIAL ROLLBACK

**Meaning (scoped):**

- **Not** full reset to `1e2a560c1` (revives owner/chat pollution).
- **Not** “Bell filter only” / NO ROLLBACK local-fix as the plan.
- **Not** contract discard / E restart.
- **Yes:** approval-gated selective reverts **only where a slice wire is proven harmful** (e.g. FCM always-send / Cap path candidates), **plus** planned rewrite of A surface identity (digit≡list≡popup≡mark-all) and dual-source collapse — treating Slice PASS/LOCK as **revoked for product**.

Execution of any revert **awaits explicit user approval** after this audit.

---

## Answers to mandatory questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Original product demand? | A persistent member notices; B member rooms+missed; B_store owner chat; C Action Required; ads no badge — see `00` |
| 2 | A/B/C design match? | **YES** at clear-rule / formula level |
| 3 | Why Bell digit ≠ list? | Dual unit (attention keys vs event rows) + dual filters/tabs + possible cache; **not** Slice 2-6; live ID dump still needed to pin exact account |
| 4 | Why popup 중요대화? | Messenger home builds `important_room` from unread pin/trade/delivery rooms — **not A inbox** |
| 5 | App Icon members? | Code: A + GD/Group/Trade/Customer rooms + unresolved missed; exclude owner rooms/C/ads — **live 23 membership UNPROVEN dump** |
| 6 | Why iOS lags server? | Cap prefs + resume re-echo before Web Authority; absolute path can skip same; Web/Cap desync observed |
| 7 | Only source/filter? | **No** — structural dual-source / dual-unit / popup mix / legacy mark-all |
| 8 | Implementation collapsed? | **Yes** — accumulative patches around valid contract |
| 9 | PASS/LOCK validity? | Product LOCKs **무효/강등**; axis harness PARTIAL — see `06` |
| 10 | Rollback needed? | **Partial / selective**, not full baseline |
| 11 | How far? | Not to `1e2a560c1`; rebuild A surfaces; selective slice wires only with proof |
| 12 | If rewind to pre-impl? | owner_intake Bell, owner rooms App Icon, dual max history return |
| 13 | Safest rebuild order? | See `11` — freeze patches → prove A ID sets → collapse dual → Cap freshness → optional FCM revert |

---

## Forbidden this phase (confirmed not done)

Product code patch · revert · cherry-pick · reset · migration change · data fix · TTL · force 0 · deploy · APK/iOS build · PRODUCT/HARD LOCK · dirty tree cleanup
