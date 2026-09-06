# DIBAY OWNER ADMIN — FINAL FULL SYSTEM AUDIT
# & HARD-LOCK RECONSTRUCTION PLAN

**MODE:** AUDIT + RECONSTRUCTION PLAN ONLY  
**Date:** 2026-09-06  
**CURRENT_SHA (git HEAD at audit):** `789a9ce9b`  
**Owner shell tip in history:** `e6b4f4b89` (WebKit height-0 selective SSOT; **NOT CLOSED** — local WebKit PASS ≠ human multi-page CLOSED)

**Authority:** Human-usable runtime overrides automation PASS / historical FINAL / CLOSED docs.  
**Status:** `OWNER ADMIN STORE OS = SYSTEMICALLY_UNTRUSTED` · **FAIL / NOT CLOSED**

**Implementation in this turn:** NONE (no patch / commit / push / deploy).

---

## A. BASELINE

| Label | SHA | Role |
|---|---|---|
| **PRE_STORE_OS** | `1771318be` (`7fd97bd07^`) | Last commit before Owner P0 shell + P1/P2 IA |
| **LAST_HUMAN_STABLE (layout pattern)** | `d4f512232` | Product = document-flow; no nested composer `100dvh` / `flex-1 basis-0` scroll owner (layout reference — May 2026 tree; not “yesterday’s Production”) |
| **FIRST_STORE_OS_PRESENTATION / FIRST_BAD_PRESENTATION** | `7fd97bd07` | Owner Admin P0 shell + ops IA rewrite begins |
| **FIRST_COMPOSER_HEIGHT_BAD** | `e41d44c73` | Nested composer height ownership → blank / height-0 class of bugs |
| **RECOVERED_PARTIAL (compensating)** | `ad7942be6` | Minimum height patch — **not** LAST_GOOD |
| **SELECTIVE_RESTORE_INTENDED** | `6ca1b3d46` → intended complete SSOT `3d9562dfe` / `d2d6d5a91` | Shared scroll + document-flow + ONE stack-shell — then re-regressed by nested root / rollback loop |
| **CURRENT** | `789a9ce9b` (includes `e6b4f4b89` Owner tip) | Still **SYSTEMICALLY_UNTRUSTED** |

**Naming hard rule:** Do **not** call `ad7942be6` LAST_GOOD. It is RECOVERED_PARTIAL / compensating.

---

## B. SYSTEMIC ROOT CAUSES

1. **Presentation ownership was rewritten without freezing ONE shell contract** (`7fd97bd07` onward). Viewport / header / scroll / bottom-nav / overlay became multi-writer.

2. **Nested height ownership** (composer `100dvh` + shell `100dvh` + `flex:1 1 0%` + `min-h-0`) — WebKit used-height **0** while Chromium “passes” → automation lies (`IOS-SAFARI-HEIGHT-VERIFY.json`).

3. **Compensating patch stack** instead of freeze: `ad7942` → selective restore → CSS SSOT → nested root regression → full rollback to `ad7942` → WebKit flex:none fix. User symptom: fix → return → fix → return.

4. **Dual header chrome:** `OwnerMobileAdminHeader` (hub/list) vs `StoresOwnerStackHeader` (composer / empty hub / apply) — both BodyPortal + `h-14`, but different mount rules → title/back/right-slot inconsistency by route class.

5. **BottomNav = delivery shell with overhang**, content clearance historically mismatched; CREATE eligibility wrong for stretches of history (BottomNav on Product New covering CTA).

6. **Store Preview = public route navigation** (`/stores/${slug}` via drawer `public_store` + composer external Link) — **no** `OwnerStorePreviewModal`. Leaves Owner context.

7. **Multiple `document.body` chrome/overlay roots:** fixed headers (BodyPortal), ops drawer portal, Tier1 notification portal (`overflow-hidden` on body), bottom nav portal, drawer body `position:fixed` lock in shell — lock/unlock leaks risk.

8. **Scroll host inconsistency:** most pages via `OwnerAdminPageScrollShell` → `.owner-compact-shell__scroll`; Orders / Order-chats apply scroll class **directly**; chat slide / order panel use private `100dvh` / `overflow-y-auto` — competing models.

9. **PASS inflation:** Chromium QA / Playwright “form mounted + scrollDelta” treated as CLOSED while human / WebKit / multi-page scroll FAIL.

---

## C. WHAT THE LAST ~3 DAYS ACTUALLY IMPROVED (KEEP candidates)

Evidence-backed **business / IA** (not presentation geometry):

| Area | Evidence class | Verdict |
|---|---|---|
| Customer canonical hub / care routing | Continuity commits (`a5f78fe24`, care hub) | **KEEP** if still in tree |
| Reviews single-flight / JSON parse | Business fix commits | **KEEP** |
| Ads greeting i18n `t(key,{name})` | Business fix | **KEEP** |
| Holiday `note`↔`holidays` dual-write | Business fix | **KEEP** |
| Finance server summary + Cash debit sign | Business fix | **KEEP** |
| Notification settings discovery / classification work | Mixed | **KEEP** domain rules; **REWORK** presentation of settings under shell freeze |
| sold_out / product_status contracts | Product domain | **KEEP** when API/Buyer already proven |
| Drawer discovery completeness (IA items) | Nav registry | **KEEP** IA content; **REWORK** chrome |
| Ops IA / Action Center concepts | Separate Admin ARO | **KEEP** Admin; do not let Owner shell chase Admin ARO |

Presentation “improvements” that repeatedly re-broke Product: **do not count as KEEP**.

---

## D. WHAT THE LAST ~3 DAYS BROKE

| Defect | Domains hit | Shared? |
|---|---|---|
| Product New blank / height-0 / WebKit scroll collapse | Product CREATE/EDIT | Yes (shell) |
| Dual top clearance / large top gap | Product + form pages | Yes |
| BottomNav on CREATE covering Register/Save | Product (+ risk on other composers) | Yes |
| Multi-page vertical scroll death under body lock | Forms / lists under compact shell | Yes (≥2) |
| Header class inconsistency (composer vs hub) | All stack routes | Yes |
| APK BottomNav vs content overlap (overhang) | BottomNav-eligible pages | Yes |
| Fix↔regress loop (rollback to ad7942 then re-patch) | Entire Owner presentation | Systemic |
| Public store preview ejects Owner session context | Preview / return | Product contract FAIL |

**ROLLBACK THRESHOLD (§30):** ≥2 independent domains share scroll lock / header / BottomNav / CTA obstruction → **PAGE PATCHING FORBIDDEN.** **TRIGGERED.**

---

## E. WHAT WAS ACCIDENTALLY REMOVED / DEGRADED

| Item | Status |
|---|---|
| Document-flow Product under stable shell (pre-nested-100dvh) | Repeatedly lost then partially restored |
| CREATE without BottomNav | Lost then restored in contracts; human still not CLOSED |
| Trustworthy single scroll owner | Lost during nested height experiments |
| Owner-controlled store preview (if ever intended as in-app) | **Never present as modal** — only public Link; product requirement now unmet |
| Consistent header for all page classes | Split across two header components |

Exact field-level Product/Store capability loss needs implementation-phase matrix against PRE_STORE_OS — **do not claim empty** without that pass; treat as **MUST_AUDIT_IN_IMPLEMENTATION_GATE**.

---

## F. LEGACY / DEAD / DUPLICATE (presentation)

| Item | Path / note | Action class |
|---|---|---|
| Dual headers | `OwnerMobileAdminHeader` + `StoresOwnerStackHeader` | **REWORK → ONE chrome API** |
| Unused headers | `OwnerOrdersPageHeader` / `OwnerDashboardHeader` (not wired under `app/(main)/stores/owner/*`) | **DELETE_DEAD after import proof** |
| Nested composer height pattern | Banned by contract; may reappear in history | **DELETE_LEGACY pattern** |
| Direct scroll class bypass | `OwnerStoreOrdersMobileBody`, `OwnerStoreOrderChatsView` | **REWORK → shared ScrollShell** |
| `${OWNER_COMPACT_SHELL_MAX_TW}:h-[100dvh]` JIT | Historical | **FORBIDDEN** |
| Public preview as primary | `owner-nav-registry` `public_store` | **REWORK → modal primary** |
| Multiple body locks | Shell drawer lock + Tier1 `overflow-hidden` | **REWORK → ONE overlay lock SSOT** |

Deletion only after ZERO import / route / API / native proof (§24).

---

## G. SHELL VERDICT

# **SELECTIVE_SHELL_RESTORE**

**Not** KEEP_CURRENT_SHELL (architecture still multi-writer + human multi-page FAIL).  
**Not** BROADER_OWNER_RESTORE as default (business KEPs separable).  
**Not** “fix Product a little and Store a little.”

**Meaning:**

- Freeze presentation to **ONE** documented end-state (below).
- Prefer layout ownership principles of **document-flow + single scroll host + single viewport root** (aligned with `d4f512232` pattern + `6ca1b3d46`/`3d9562dfe` *intent*).
- Discard compensating height/padding stacks (`ad7942` private 100dvh, dual `pt-[calc…]`, nested `data-owner-stack-shell`).
- Preserve proven **business** KEPs (§C / §Q).
- Reconstruct Header / Scroll / BottomNav / Transition / Overlay / Preview as **one continuous program** after approval — not page patches.

---

## H. HEADER TARGET CONTRACT

**ONE Owner chrome API** (implementation name TBD; retire dual mount rules).

| Token / rule | Spec |
|---|---|
| Height | `3.5rem` (`h-14`) + `1px` border → `--owner-header-height` / `--owner-shell-header-border` |
| Safe-top | `--owner-safe-top` once |
| Content top | `--owner-content-top` = safe-top + header + border = `--owner-shell-main-pt` **only** |
| Position | Fixed BodyPortal; z-index from Owner overlay ladder |
| ROOT | No fake back; store identity + ops |
| LIST | Back optional by hierarchy; title; contextual trailing |
| CREATE/EDIT | Back; title; **no** BottomNav; no second in-page title bar pretending to be header |
| Back icon / title baseline | Identical within page class |
| Hard rule | `FIRST_VISIBLE_CONTENT_TOP >= HEADER_BOTTOM` (+ canonical gap only) |

**Forbidden:** route-local second `pt-[calc(safe-top+3.5rem+…)]`, duplicate page H1 as chrome.

---

## I. SCROLL TARGET CONTRACT

| Rule | Spec |
|---|---|
| Body lock | Compact Owner stack: document locked |
| Page scroll | **ONE** `.owner-compact-shell__scroll` (via `OwnerAdminPageScrollShell` only) |
| Default forms/lists | Document-flow children inside that host |
| Internal scroll | Only structural exceptions (order chat timeline, picker dropdown, overlay panels) — listed in SSOT |
| Product CREATE/EDIT | Document-flow under ScrollShell; **no** form-local `100dvh` / `flex-1 overflow-y-auto` |
| Prove | Human wheel/touch changes scrollTop; CTA reachable |

---

## J. BOTTOM NAV TARGET CONTRACT

| Page class | BottomNav |
|---|---|
| ROOT / primary LIST (hub, orders, products hub, customers hub, finance hub, …) | Allowed |
| CREATE (product, ads apply forms, …) | **Hidden** |
| EDIT (product, basic-info, profile, …) | **Hidden** when save CTA can be obstructed |
| DETAIL | Only if hierarchy requires **and** CTA unobstructed |
| SETTINGS | Follow hierarchy SSOT, not ad hoc |

**Geometry (ONE):**

- `--owner-bottom-nav-height` (60px)
- Footprint includes delivery overhang + safe-bottom (shared with FAB)
- `--owner-content-bottom` = footprint + gap
- No page-local `pb-32` guessing

---

## K. PAGE TRANSITION TARGET CONTRACT

| Direction | Behavior |
|---|---|
| Forward | RIGHT → LEFT (`OwnerStackPageSlideShell` / `owner-stack-route-enter-rtl-forward`) |
| Back | LEFT → RIGHT (`…ltr-back`); popstate-aware |
| Duration | 270ms (existing token) |
| Suppression | Must not double with `AppRouteTransition` |
| Header/BottomNav | Shell-owned; do not re-animate as page chrome per route |

Current: `OwnerStackPageSlideShell` exists — **KEEP mechanism, HARD-LOCK + prove no double slide / no header drift**.

---

## L. STORE PREVIEW TARGET CONTRACT

**PRIMARY (required):**

`OWNER → Preview CTA → Owner-controlled PREVIEW MODAL/SHEET → reuse public Buyer store renderer → CLOSE → exact Owner route + scroll context restored`

**SECONDARY (optional):** “Open public page externally” — never primary.

**Current FAIL:** drawer `public_store` + composer Link → `/stores/${slug}` (full navigation). **`OwnerStorePreviewModal` does not exist.**

Android Back / iOS: close preview first. Desktop: modal X/backdrop.

---

## M. CTA TARGET CONTRACT

| Page type | Primary CTA rule |
|---|---|
| CREATE | Register / Save — always reachable above keyboard; no BottomNav |
| EDIT | Save — same |
| LIST | Add / Open detail |
| DETAIL | Domain next action (accept order, reply, …) |
| FINANCE | Convert / withdraw / top-up — real only |
| SETTINGS | Save |

No decorative primary. No danger CTA dominating normal work. Human-visible reachability only (no force:true proof).

---

## N. FULL DOMAIN GAP MATRIX (presentation vs product)

| Domain | Routes (canonical under `/stores/owner`) | Shell risk | Product contract risk | Audit note |
|---|---|---|---|---|
| **Hub / ROOT** | `/` | Header + scroll host | Ops discovery | Dual chrome |
| **Product** | `/products`, `/products/new`, `/products/[id]/edit`, `/menu-categories` | **CRITICAL** (create/edit scroll/CTA) | Full merchant matrix must re-prove | Highest regression density |
| **Store** | `/basic-info`, `/profile`, `/settings`, `/edit`, `/menu` | Form BottomNav hide / scroll | Edit/persist/buyer effect | Shares shell with Product |
| **Orders** | `/orders`, `/order-chats`, `/order-chat/[id]` | Private scroll + slide overlays | Transition SSOT preserve | Direct scroll class bypass |
| **Customer** | `/customer-care/*`, `/inquiries`, `/reviews`, `/order-chats` | Hub continuity | Chat/inquiry/review/support split | KEEP hub IA |
| **Finance** | `/finance`, `/settlements`, `/points`→finance, `/business-cash`→finance | Pad / scroll | No fake accounting | KEEP server facts |
| **Promotion** | `/coupons`, `/gift-certificates`, `/banners`, `/notices`, `/ads/*` | Create forms BottomNav | Separate products — do not merge | Ads preview ≠ store preview |
| **Notifications** | `/notifications`, `/notification-settings` | Overlay lock vs drawer | Category isolation | Tier1 body lock |
| **Apply** | `/apply` | Alternate header path | Onboarding | Stack header |
| **Ops** | `/ops-status` | — | Status | |

**40** `page.tsx` files under `app/(main)/stores/owner/**` — none may remain unaudited in implementation gate (this audit lists classes; per-route measurement table is implementation Day-0 checklist).

---

## O. SSOT MAP (TARGET — ONE OWNER EACH)

| Concern | Canonical owner (target) | Remove / demote |
|---|---|---|
| OWNER SHELL viewport | `BusinessAdminShell` + `.owner-stack-shell` CSS only | Nested stack-shell, JIT 100dvh |
| OWNER HEADER | Single chrome component API | Dual header mount rules |
| OWNER SCROLL | `OwnerAdminPageScrollShell` / `.owner-compact-shell__scroll` | Direct scroll class on orders/chats; form 100dvh |
| OWNER BOTTOM NAV | Shell eligibility + CSS footprint tokens | Page `pb-*` hacks |
| OWNER NAV ROUTES | `owner-nav-registry` | Parallel registries |
| OWNER DRAWER | `OwnerMobileOpsMenuDrawer` + shell lock SSOT | Ad hoc locks |
| OWNER OVERLAY | ONE overlay ladder (Tier1 / dibay overlay / Owner) | Competing body class writers |
| OWNER TRANSITIONS | `OwnerStackPageSlideShell` | Double with AppRouteTransition |
| STORE PREVIEW | **New** Owner preview modal host + Buyer renderer | Primary public Link |
| PRODUCT FORM | `OwnerProductForm` only | Legacy forms |
| PRODUCT STATUS | Existing product_status SSOT | Parallel enums |
| ORDER STATE | `store-order-process-model` | New transition model |
| STORE SETTINGS | Profile/basic-info forms | Duplicate settings pages without redirect |
| CUSTOMER | Customer-care hub | Orphan inquiry-only UX as primary |
| FINANCE / SETTLEMENT | Finance views + server summary | Client-invented numbers |
| PROMOTION | Per-product surfaces | Merged “promo blob” |
| NOTIFICATION | Owner notifications + settings | Cross-domain badge mix |
| CTA CLASSES | Shared footer actions tokens | One-off bars |

---

## P. LEGACY / DEAD REMOVAL LIST (with proof requirements)

Before delete, prove ZERO: imports, routes, API, native, Admin, Buyer.

1. Unwired `OwnerOrdersPageHeader` / `OwnerDashboardHeader` (if still unused).  
2. Any restored nested `h-[calc(100dvh-(var(--safe-top)+…))]` product roots.  
3. Dead compatibility wrappers under `/my/business/*` only after redirect proof.  
4. Obsolete QA-only Production probes mistakenly imported by app (none assumed — prove).  

---

## Q. GOOD FIXES TO PRESERVE

See §C. Explicit list for reconstruction:

- Customer hub + care routing  
- Reviews payload/single-flight  
- Ads greeting i18n  
- Holiday dual-write  
- Finance server summary + Cash sign  
- Notification classification / settings reachability  
- sold_out / Buyer product_status where proven  
- Drawer IA discovery set  
- Long-pending / ops semantics if already backend-true  

---

## R. CHANGES TO REVERT (presentation)

- Private Product composer `100dvh` height ownership (`ad7942` pattern)  
- Dual `pt-[calc(safe-top+3.5rem+…)]` on main  
- Nested second `data-owner-stack-shell`  
- BottomNav on CREATE/EDIT composers  
- Treating Chromium-only scroll as CLOSED  
- Primary navigation to public `/stores/[slug]` as “preview”  

---

## S. CHANGES TO REWORK

- Unify header chrome  
- Unify all list/form pages onto ScrollShell  
- Overlay/body-lock single owner  
- Store Preview → modal  
- BottomNav eligibility table as code SSOT (not scattered ifs)  
- Transition suppression vs AppRouteTransition  
- Orders/chats scroll bypass  

---

## T. IMPLEMENTATION SEQUENCE (ONE continuous program — after approval only)

1. **Freeze** Owner presentation: ban page-local height/pad patches.  
2. **Restore shell end-state** (viewport + scroll + header clearance + BottomNav eligibility) as one PR slice.  
3. **Unify header API** (all page classes).  
4. **Unify scroll host** (migrate Orders/chats).  
5. **Overlay lock SSOT** (drawer ↔ Tier1).  
6. **Store Preview modal** (Buyer renderer reuse).  
7. **Transition hard-lock + tests**.  
8. **Domain re-proof** Product → Store → Orders → Customer → Finance → Promotion → Notification (human matrix).  
9. **Dead file purge** with import proofs.  
10. **Hard-lock tests** (§U) that FAIL on known broken states.  

No parallel page patch streams.

---

## U. HARD-LOCK TEST PLAN (must FAIL on current broken classes)

| ID | Intent |
|---|---|
| OWNER_HEADER_GEOMETRY | Same page class → identical height / back / title baseline |
| OWNER_CONTENT_TOP_CLEARANCE | First content ≥ header bottom |
| OWNER_SCROLL_WORKS | Human wheel/touch changes scrollTop; ch>0 |
| OWNER_BOTTOM_NAV_CLEARANCE | At max scroll, CTA not covered |
| OWNER_PAGE_FORWARD_TRANSITION | RTL enter |
| OWNER_PAGE_BACK_TRANSITION | LTR back |
| OWNER_CREATE_NO_BOTTOM_NAV | Product new/edit |
| PRODUCT_REGISTER_VISIBLE / SCROLL / CTA | WebKit + Chromium |
| STORE_SAVE_CTA | basic-info/profile |
| ORDER_PRIMARY_CTA / CUSTOMER_REPLY_CTA / FINANCE_ACTION_CTA | Reachable |
| DRAWER_OPEN_CLOSE / NOTIFICATION_OPEN_CLOSE | Exclusive + unlock |
| STORE_PREVIEW_MODAL / RETURN_CONTEXT | No Owner unmount |
| OVERLAY_SCROLL_UNLOCK | No leaked overflow-hidden |

Invalid if PASS on human-broken page.

---

## V. PLATFORM PLAN

Same product contract on: Windows/Mac browsers, 390/430/768/1024/1280+, Android APK, iOS WebView.

Differences allowed: density only.  
Not allowed: parallel layout ownership, iOS-only CSS forks, APK-only pad hacks.

Input: mouse wheel, trackpad, touch, Android back (preview closes first), iOS keyboard, safe-area, gesture/3-button nav.

---

## W. RISK

| Wrong choice | Consequence |
|---|---|
| KEEP_CURRENT + page patches | Another 3-day loop |
| BROADER_OWNER_RESTORE without KEPs list | Lose real business fixes |
| Modal preview without Buyer reuse | Fake second store |
| Freeze without WebKit in hard-lock | Chromium PASS / iOS FAIL again |
| Touch Admin ARO while Owner reconstructs | Deploy / authority collision |

---

## X. FINAL RECOMMENDATION

1. **Declare** Owner Admin presentation **SYSTEMICALLY_UNTRUSTED** — do not ship CLOSED claims from automation.  
2. **Choose** **SELECTIVE_SHELL_RESTORE** — one continuous reconstruction of Header → Content → Scroll → CTA → BottomNav → Overlay → Transition → Back → Preview → Return.  
3. **Preserve** business KEPs (§Q); **discard** compensating presentation patches (§R).  
4. **Require** Store Preview as **Owner modal** (Buyer renderer), not public route eject.  
5. **Implement only after** explicit user approval of this plan — single program, no page-by-page 땜빵.  
6. **Human QA** on iOS Safari + Android APK + Windows before any CLOSED language.

---

### Decision answers (the four questions)

| Question | Answer |
|---|---|
| Keep current Store OS shell as-is? | **No** — untrusted; restore/freeze selective shell end-state |
| Can Header/Scroll/BottomNav/Transition/Overlay become ONE SSOT each? | **Yes** — targets mapped in §H–L / §O; requires continuous rebuild |
| Store preview as Owner-context modal? | **Yes, required** — currently **missing**; public Link is FAIL |
| Separate 3-day business KEPs vs trash patches? | **Yes** — §C/§Q vs §D/§R |

**STOP.** No implementation in this turn.
