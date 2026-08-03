# Badge Rollback Audit — Options

**Mode:** AUDIT ONLY · no execution until approval

---

## Option 0 — Do nothing / audit only (current)

Keep HEAD `f438f37e2`. No revert. No patch.  
Use when verdict needs source/filter work next (after approval).

---

## Option 1 — FULL ROLLBACK to `1e2a560c1`

| | |
|--|--|
| Pros | Removes all Slice 2-* surface changes |
| Cons | Restores **known FAIL**: owner_intake Bell, owner rooms in Member App Icon, mixed axes |
| Meets “전체 롤백 금지 조건”? | **YES — forbidden by evidence** |
| Decision | **REJECT** |

---

## Option 2 — Selective revert Slice 2-6 only (`e2cb00ec8` + maybe `f438f37e2`)

| | |
|--|--|
| What reverts | FCM always-send badgeCount · `resolveMemberAppIconTotalForNativeFcm` · ACK resolver wiring · docs/tests |
| What stays | A/B/C projections, Bell A digit, list filters, Member App Icon formula |
| Fixes Bell 3 / list empty? | **NO** (proved: e2cb does not touch Bell/list) |
| Fixes Cap lag alone? | **Unlikely** (Web→Cap logic comment-only in e2cb) |
| When justified | Independent FCM regression proven worse than pre-2-6 wire |
| Classification now | **REVERT_CANDIDATE**, not DEFINITE for current Bell FAIL |

---

## Option 3 — Selective revert Slice 2-2 (`d6dbb91d4` + fix chain)

| | |
|--|--|
| Risk | Reopens owner_intake / chat into Bell digit — **regression to baseline pollution** |
| Fixes empty list? | Unknown — may restore old mixed list, not “correct A list” |
| Decision | **Not recommended** without separate A-inbox identity audit + approval |

---

## Option 4 — Selective revert Slice 2-3 App Icon formula

| | |
|--|--|
| Risk | Reintroduces B_store rooms into Member App Icon |
| Fixes Bell↔list? | **NO** |
| Decision | **REJECT** for Bell FAIL |

---

## Option 5 — No rollback — source/filter/reader fix (future, after approval)

| | |
|--|--|
| Target | Digit↔list identity · popup vs A · Cap refresh freshness |
| Keep A/B/C | If surface maps stay correct |
| This audit phase | Document only — **no patch yet** |

---

## Comparison vs user expected lean

| User lean | This audit |
|-----------|------------|
| Full rollback NO | **Agreed** |
| Slice 2-6 selective YES possible | **Possible as FCM wire candidate only** — **does not fix Bell↔list** |
| A/B/C keep pending surface audit | **A/B/C keep if reader/filter is the break** — evidence leans that way |
