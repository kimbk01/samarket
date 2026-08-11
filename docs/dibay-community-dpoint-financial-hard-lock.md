# DIBAY Community D-Point Financial HARD LOCK

**Status:** PRODUCT OPEN until Slice 8 runtime gate  
**Locked at:** 2026-08-11  
**Companion rule:** `.cursor/rules/dibay-community-dpoint-financial-hard-lock.mdc`  
**Gate:** `npm run verify:community-dpoint-financial-hard-lock`

포인트는 금전성 자산이다. UI debounce · client validation · `Math.random` · fire-and-forget credit · reclaim skip은 금융 방어가 아니다.

---

## 0. Approved facts (do not re-litigate)

Proven before this LOCK:

- Content INSERT then void reward side-effect
- `Math.random()` amount
- `point_ledger` no financial UNIQUE for community reward
- execution and ledger not one TX
- Q&A self-comment rewarded
- `.` / punctuation-only accepted and rewarded
- Admin delete reclaim policy missing
- insufficient-balance reclaim skipped
- Member = `point_ledger`, Admin = executions
- topic override missing

Replacement chain:

```
CONTENT → VALIDATION → ELIGIBILITY → POLICY RESOLUTION
  → ONE REWARD DECISION → ATOMIC LEDGER
  → MEMBER/ADMIN SAME EVENT → REVERSAL
```

---

## 1. Authority

| Concern | Owner | Forbidden |
|---|---|---|
| Level 1 acceptance | `lib/community-points/content-acceptance.ts` (server) | client-only block; raw length as sole test |
| Level 2 eligibility | `lib/community-points/reward-eligibility.ts` | coupling INSERT success = credit |
| Policy resolve | `lib/community-points/policy-resolver.ts` | hidden fallback; client board_key/amount |
| Random amount | `deterministicIntInRange(source+policy version)` | `Math.random`; probability-bucket reroll |
| Credit / debit | `apply_community_point_reward` / `apply_community_point_reclaim` RPC | TS `creditUserPoints` then separate execution insert |
| Spend (member) | `spendUserPoints` — insufficient if sum < cost | negative spend for user purchases |
| System reversal | reclaim RPC — **negative balance allowed** | 0 clamp; skip reclaim; block delete for points |
| Member history | `point_ledger` projection | Community-only balance/page |
| Admin history | same `point_ledger` row (+ execution snapshot join) | executions as a second truth |
| Comment report writer | **HOLD** | new comment-report authority |
| Community report → sanction | **HOLD** | sanction writer from this work |
| Business Credit | untouched | mixing store/business ledger |

---

## 2. Content acceptance (Level 1) — BLOCK register

Server normalization (authority):

1. trim  
2. Unicode NFKC  
3. strip zero-width / format chars  
4. collapse whitespace  
5. meaningful-character analysis  
6. punctuation/symbol-only  
7. excessive repeated-character  

BLOCK: empty, whitespace-only, punctuation/symbol-only, zero-width-only, repeated-char-only junk (`.` `......` `?` `ㅋㅋㅋㅋ` `aaaaaaaa` `11111111`).

AI meaning detection: **forbidden**.

Client validation: UX only.

---

## 3. Reward eligibility (Level 2) — ALLOW content, POINT NO

CONTENT VALID ≠ POINT ELIGIBLE.

NO point (content stays):

- short / denylisted: `감사합니다` `네` `확인했습니다` `test` `asdf`
- below Admin min meaningful threshold (seed: post 10 / comment 8)
- self-comment (`post.user_id === comment.user_id`) — **all boards, not Q&A-only**
- same user + action + normalized text hash inside 24h window
- daily reward cap exceeded (separate from `max_posts_per_day` content limit)
- reward cooldown
- board/policy reward disabled or resolved amount 0
- source already decided (success or blocked)

Seeded defaults (Admin-editable): daily rewarded posts **10**, comments **30**. UTC calendar day.

---

## 4. Q&A

No new answer entity. `community_comments` only.

| Actor | Action | Point |
|---|---|---|
| A | valid question create | qna write policy |
| A | `.` question | BLOCK / no point |
| A | comment on own question | ALLOW / **NO** |
| B | valid comment on A's question | qna comment policy |
| B | duplicate normalized answer | ALLOW* / **NO** |
| A | `감사합니다` | ALLOW / **NO** |
| any | delete then rewrite | new row, **re-evaluate** eligibility; self still NO |

\* content ops may still BLOCK spam separately.

---

## 5. Policy hierarchy

```
TOPIC OVERRIDE (inherit_global=false)
  else Q&A default (is_question or topic slug question|qna)
  else GLOBAL default (board_key=general)
```

Admin must show **전체 설정 사용** vs **이 게시판 별도 설정**. No hidden fallback.

Event: `final = round(base * multiplier)`. Do **not** expand random min/max. Snapshot stores base, multiplier, final.

Random: `write_random_min/max` / `comment_random_min/max` only. `point_probability_rules` is **not** product authority.

---

## 6. Financial invariants

| ID | Rule |
|---|---|
| F-01 | One eligible source action → at most one credit |
| F-02 | Ledger event has source type/id/action |
| F-03 | Ledger insert + execution row one DB TX |
| F-04 | Random decided once per source+policy version; reproducible |
| F-05 | Retry does not change awarded amount |
| F-06 | Reversal links to original execution |
| F-07 | Same execution reversed at most once |
| F-08 | Member and Admin show the same `point_ledger.id` |
| F-09 | UI hide is not fraud defense |
| F-10 | Client does not choose amount |
| F-11 | Member cannot set policy key/amount |
| F-12 | Server resolves policy |
| F-13 | System reversal may go negative; member spend may not |
| F-14 | Later credits offset negative sum (`-3 + 10 = 7`) |
| F-15 | Edit to Level 1 invalid → PATCH BLOCK |
| F-16 | Edit to Level 2 ineligible → reverse original once; no re-reward on same source |

Reward identity: `community_{post|comment}:create:{id}`

---

## 7. Reversal

Delete is never blocked for insufficient points.

Reclaim is never skipped for insufficient points.

Example: balance 2, reward 5, full reversal → balance **-3**. Member UI: 회수로 인한 미정산 포인트.

Triggers: member delete, admin_remove (post+comment), post `report_confirmed`, comment edit eligibility_lost.

Comment `report_confirmed` policy **row may exist**. Comment report **writer stays HOLD**.

---

## 8. DO NOT (without reopen)

- `Math.random` for awarded D-Point
- void/fire-and-forget as the credit writer
- SELECT-before-INSERT as the only idempotency
- 0-clamp to hide reversal debt
- Community-only balance table
- Business Credit
- New answer entity
- New comment-report or sanction writers
- Probability-bucket random as product
- Treat feed `max_posts_per_day` as reward cap

---

## 9. Verify

```bash
npm run verify:community-dpoint-financial-hard-lock
```

Includes contract tests T1–T27 (pure + source) and writer-path greps.
