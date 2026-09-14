# DIBAY Community External Import — PHASE D Product Design Lock

**Status:** PHASE D OWNER APPROVED / LOCKED  
**Declared:** 2026-09-14  
**Owner PHASE D approval:** APPROVED — 2026-09-14  
**Mode:** PRODUCT CONTRACT FREEZE (authority for PHASE E)  
**PHASE E:** EXPLICITLY OPEN (implementation of this lock)

```text
PHASE A = PASS / LOCKED
PHASE B = PASS / LOCKED
PHASE C = PASS / LOCKED (Owner sample approval 2026-09-14)
PHASE D = OWNER APPROVED / LOCKED (2026-09-14)
PHASE E = OPEN — implement this lock in real Admin
PHASE F = NOT STARTED (requires Owner open after E report)
```

---

## 0. Authority chain

| Layer | Authority | Role |
|---|---|---|
| Owner intent + sequence | `docs/owner-execute-now-template.md` | CLEAN RESET → FRESH REBUILD order |
| Fresh product principles | same doc — **FRESH PRODUCT CONTRACT** | WHAT the product must do |
| **Approved operator sample** | `.tmp/phase-c-owner-sample/` (+ screenshots) | **HOW it must look/operate** (Owner-approved) |
| **PHASE D lock (this file)** | product design for Admin rebuild | PHASE E must implement **this**, not OLD UI |

```text
HISTORICAL OLD External Import UI / worker / schema = NOT authority
PHASE C .tmp sample = Owner-approved operating model
PHASE D locks that model as product contract
PHASE E = real DIBAY Admin implementation of THIS lock only
PHASE F = Production E2E after E
```

---

## 1. PHASE C Owner sample approval (closed)

**Owner decision (2026-09-14):**  
Approved sample operating direction is the intended Admin workflow.  
PHASE C closes with Owner approval.

| Field | Value |
|---|---|
| Sample URL (historical local) | `http://127.0.0.1:8765/index.html` |
| Sample root | `.tmp/phase-c-owner-sample/` |
| Source | PHILSAMO / travel |
| Article | wr_id=71 |
| Real content / images | PASS (11 content images) |
| Production Community write | NONE |
| Full Admin implementation at C close | NOT STARTED |
| Report | `.tmp/phase-c-owner-sample/PHASE-C-FINAL-REPORT.json` |

**Approval meaning:**

```text
“실제 어드민에서도 이 방식으로 적용한다”
= PHASE E must implement the locked operator model below
≠ PHASE E has started
≠ Production publish exists
≠ .tmp sample is Production Admin
```

---

## 2. Locked operator screen (product shape)

PHASE E Admin MUST be desktop-operator oriented.  
Do **not** stretch mobile Community UI into Admin.

### Layout (required)

| Region | Role | Must show |
|---|---|---|
| **LEFT** | Source / Board | Human labels (예: 필사모 / 필리핀 여행). No worker/job/claim/adapter/RPC/engine |
| **CENTER** | Real article list | Real rows + selection |
| **RIGHT / main workspace** | Selected article work | BEFORE / transform / AFTER / topic / save·publish |

### Forbidden UI

- OLD 8-step stacked cards (`1국가…8게시`)
- Empty configuration panels as the page center
- Giant numbered workflow shells without real content
- Exposing crawler infrastructure as normal operator steps

### Center of the product

```text
REAL CONTENT + PREVIEW + ADMIN DECISION
```

Not crawler infrastructure.

---

## 3. Locked list / selection contract

### List rows (required fields)

- checkbox  
- thumbnail (only if actually available)  
- title  
- author  
- source published date  

### Selection (required)

- select one  
- select several  
- select all visible  
- clear selection  
- selected count explicit (`선택: N개`)  

### Publish selection rule

```text
Collection ≠ approval
Preview ≠ approval
Transform ≠ approval
Save ≠ publish
Publish operates ONLY on explicit selection
No “publish all collected”
```

---

## 4. Locked article workspace contract

When an article is selected, Admin MUST show actual collected content:

- TITLE  
- AUTHOR  
- SOURCE DATE  
- BODY (semantic blocks)  
- CONTENT IMAGES in source order  

**Forbidden:** title-only approval/publish.

### BEFORE

- SOURCE NORMALIZED content  
- Strip site chrome (header/nav/footer/ads/theme/background/recommendations)  
- Keep title/author/date/paragraphs/images/order  
- Do not copy source site design  
- Do not invent pixel transparency for source backgrounds  

### AFTER

- Approximate **current** DIBAY Community post presentation  
- No imported-only public card/detail  
- No public source attribution block (unless Owner later changes this)  
- Canonical source URL/provenance = **internal/admin only**

### Transform (required capabilities)

Where applicable:

- title edit  
- author display edit  
- date display confirmation  
- text replacement  
- image include/exclude  
- image order confirmation  
- DIBAY topic selection  

```text
No silent rewrite
No auto-invented author/date/title
Only explicit operator changes apply
```

---

## 5. Locked CTA meanings (Korean operator language)

| CTA | Meaning | Must NOT mean |
|---|---|---|
| **미리보기** | Show resulting DIBAY content without publishing | Publish |
| **수정/치환** | Configure the change | Auto-apply + publish |
| **적용** | Apply pending edits into the import draft | Publish / DB Production post |
| **취소** | Discard **unapplied** pending edits | Delete already-applied draft wholesale |
| **임시저장** | Preserve reviewed draft without publishing | Publish |
| **게시** | Explicit publish of **selected** article(s) + chosen topic + current AFTER draft | Save / collect / preview |

Developer terms (`worker`, `job`, `claim`, `adapter`, `RPC`, `engine`) MUST NOT appear as CTA or primary UI copy.

---

## 6. Locked topic / publish contract

- Use **real** Community topic SSOT  
- No free-text topic  
- No fake topic  
- No automatic 자유게시판 fallback  
- No default topic auto-select  
- Admin must explicitly choose topic before publish  

### Publish target (must be explicit)

```text
selected article(s)
+ Admin-selected DIBAY topic
+ current AFTER draft
```

Only selected articles. Never “all collected”.

---

## 7. PHASE E implementation boundary (not started)

PHASE E may begin **only after** Owner approves this PHASE D lock and explicitly opens PHASE E.

### PHASE E MUST

- Implement this lock inside real DIBAY Admin visual language (no full redesign)  
- Keep real content as the screen center  
- Use FRESH architecture (no OLD External Import resurrection by default)  
- Prove operator questions in §9 remain answerable  

### PHASE E MUST NOT (without new Owner phase)

- Reuse OLD worker/job/claim/adapter/Admin 8-step flow/schema as authority  
- Start from wireframe-only divergence from this lock  
- Skip BEFORE/AFTER / selection / topic explicitness  
- Treat collection success as product PASS  

### Still deferred to later proof (PHASE E/F design detail)

These are **not** unlocked by PHASE D:

- crawler engine choice (open-source tools re-evaluated fresh)  
- Production schema  
- queue/worker necessity (if any) — must be justified with new evidence, not OLD habit  
- multi-site adapter framework  
- bulk publish backend beyond explicit selection semantics  

PHASE D locks **operator product contract**, not crawler internals.

---

## 8. PHASE F boundary

PHASE F = Production E2E on a real site:

```text
collect → list → select → real content → edit/replace → topic → save/publish
```

Only after PHASE E implements this lock.

---

## 9. Owner acceptance questions (product FAIL if unclear)

Admin product is acceptable only if Owner can visibly answer:

1. 어느 실제 게시판에서 가져왔는가?  
2. 어떤 실제 글들이 들어왔는가?  
3. 어떤 글을 선택했는가?  
4. 선택한 실제 원문 내용은 무엇인가?  
5. 이미지가 정확히 들어왔는가?  
6. 무엇을 치환/삭제/수정했는가?  
7. 적용 후 DIBAY에서는 어떻게 보이는가?  
8. 어느 DIBAY 주제로 들어가는가?  
9. 저장만 한 것인가, 게시한 것인가?  
10. 정확히 선택한 게시물만 게시되는가?  

---

## 10. Evidence anchors (do not delete casually)

| Kind | Path |
|---|---|
| PHASE B normalized article 71 | `.tmp/phase-b-philsamo-proof/normalized-article-71.json` |
| PHASE C sample | `.tmp/phase-c-owner-sample/index.html` |
| PHASE C screenshots | `.tmp/phase-c-owner-sample/screenshots/` |
| PHASE C report | `.tmp/phase-c-owner-sample/PHASE-C-FINAL-REPORT.json` |
| Owner sequence SSOT | `docs/owner-execute-now-template.md` |

`.tmp` artifacts are **design evidence**, not Production Admin.

---

## 11. PHASE D FINAL REPORT template

```text
PHASE A: PASS / LOCKED
PHASE B: PASS / LOCKED
PHASE C: PASS / LOCKED (Owner sample approved)
PHASE D DESIGN LOCK DOC: docs/dibay-community-external-import-phase-d-product-design-lock.md
OPERATOR MODEL: LEFT source · CENTER list · RIGHT workspace
OLD 8-STEP UI: FORBIDDEN
CTA CONTRACT: 미리보기 / 수정·치환 / 적용 / 취소 / 임시저장 / 게시
TOPIC CONTRACT: real Community SSOT · no default · no 자유게시판 fallback
PUBLISH CONTRACT: selected only + topic + AFTER draft
SAMPLE AUTHORITY: PHASE C Owner-approved .tmp sample
FULL ADMIN IMPLEMENTATION: NOT STARTED
PRODUCTION COMMUNITY WRITE: NONE
CRAWLER ARCHITECTURE: NOT STARTED
PHASE E: NOT STARTED (blocked until Owner approves PHASE D + opens E)
PHASE F: NOT STARTED
OWNER PHASE D APPROVAL: PENDING
FINAL: READY_FOR_OWNER_REVIEW
STOP.
```

---

## 12. Change gate

Any change that weakens §2–§9 requires **Owner decision**.

Allowed without reopening PHASE D:

- typo / clarity edits that do not change operator meaning  
- adding evidence links  

Not allowed without Owner:

- restoring OLD 8-step cards  
- dropping BEFORE/AFTER or selection explicitness  
- default topic / 자유게시판 fallback  
- publish-all-collected  
- starting PHASE E “while drafting” this lock  

```text
PHASE D = LOCK THE APPROVED SAMPLE AS PRODUCT CONTRACT
PHASE E = IMPLEMENT THAT CONTRACT IN REAL ADMIN
Do not skip Owner PHASE D approval.
```
