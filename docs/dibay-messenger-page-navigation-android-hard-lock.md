# DIBAY Messenger Page Navigation — Android HARD LOCK

**ACTIVE.** Cursor: `.cursor/rules/dibay-messenger-page-navigation-android-hard-lock.mdc`  
Close evidence: `.tmp/messenger-page-nav-ssot/owner-ensure-cold/FD9_DOCUMENT_REDIRECT_FINAL_CLOSE.md`

## FINAL AUTHORITY

| | |
|---|---|
| HEAD / ORIGIN / PRODUCTION | `e8296bae9e1762323b51f61a3071a9036dca075c` |
| DEPLOYMENT | `dpl_3y9wFBkuhK7fNCDkAxdvBgkBWMUm` |
| STATUS | Ready |
| ALIAS | `https://samarket.vercel.app` |

**DIBAY MESSENGER ANDROID PAGE NAVIGATION — HARD LOCKED**

FD-1 … FD-9 = **CLOSED** · CONFIRMED DEFECT = **NONE**

## Owner ensure (FINAL)

Path: `/stores/owner/order-chat/[orderId]`  
Authority: Route Handler GET → **HTTP 307** → canonical Messenger Room  
File: `app/(main)/stores/owner/order-chat/[orderId]/route.ts`

Soft RSC `page.redirect()`: **REMOVED** — do not restore without a new forensic audit.  
Domain SSOT / DB: unchanged.  
`/stores/owner/order-chats` is **not** the ensure route (normal Owner shell).

## Minimum SSOT

| | |
|---|---|
| FORWARD | RIGHT → LEFT |
| BACK | LEFT → RIGHT (exact inverse) |
| PILLAR | `MessengerPillarHierarchyMotionShell` |
| ROOM | `MessengerRoomSwipeBackShell` |
| ONE ACTION | one navigation · one motion owner · one visible page transition |
| COLD | Room shell owns first visible frame |
| LOADING | content inside owned surface (not a nav transition) |
| WHITE | unowned blank frame FORBIDDEN |
| REDIRECT/ENSURE | no independent visible transition |

## Do not reopen without new evidence

Without direct Production regression **or** a shared-consumer change, do **not** reopen FD-1…9, hub→pillar, list→Room forward, Room Back, cold shell ownership, white-frame, Owner ensure 307, `/order-chats` negative, or existing Android Page Navigation SSOT.

Do not rerun forensic audits merely because another Messenger feature changes.

## Future change gate

Before any Messenger work, ask: **does this change a HARD-LOCKED contract?**

Check: Pillar/Room shells · Room bootstrap/entry ownership · AppRouteTransition Messenger suppression · Owner `order-chat/[orderId]` Route Handler · Owner `/order-chats` · Messenger internal nav writers · redirect/ensure behavior.

| Answer | Action |
|---|---|
| NO | Do not reopen Page Navigation |
| YES | Regression-test **only** the directly affected contract |

Classify every changed file: `IN_SCOPE` / `SHARED_CONSUMER` / `OUT_OF_SCOPE`.  
OUT_OF_SCOPE / unrelated dirty: do not touch. Explicit `git add` only — never `git add .` / `-A`.

## Forbidden without newly proven first divergence

setTimeout · artificial delay · retry · duplicate navigation · ErrorBoundary masking · extra redirect/motion owner · extra spinner · global nav state · proxy/BusinessAdminShell bypass · fallback navigation · hardcoded visual patch.

Order remains: FIRST DIVERGENCE → ROOT OWNER → MINIMUM REPAIR → PRODUCTION PROOF → LOCK.

## Domain isolation

GENERAL · GROUP · TRADE · ORDER — presentation sharing ≠ business-domain coupling.

## Call

Call **functional** HARD LOCK: **PRESERVED**. Do not touch RTC / Agora / heartbeat / lease / CallKit / PushKit / establishment / terminal because of Page Navigation. Call presentation is a separate boundary.

## NOT_PROVEN (do not promote; do not reopen Android lock)

| IOS page navigation | NOT_PROVEN |
| Wide / split-pane | NOT_PROVEN |
| Cross-platform page navigation | NOT LOCKED |
| Call current-SHA presentation | NOT_PROVEN |
| Xiaomi owner / notification / group create | NOT_PROVEN_EXTERNAL_BLOCKER |

## Reopen Android HARD LOCK only if

A. actual Production Android regression, or  
B. future code directly modifies a locked navigation consumer, or  
C. Owner ensure HTTP document redirect authority changes, or  
D. Room bootstrap / first-frame ownership changes, or  
E. Messenger route/navigation architecture changes.

Otherwise: **PRESERVE HARD LOCK.** Baseline SHA `e8296bae9` / deploy `dpl_3y9wFBkuhK7fNCDkAxdvBgkBWMUm`.
