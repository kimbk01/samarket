# DIBAY PROMOTION PROGRAM — SSOT LOCK

**STATUS:** LOCKED (Phase 0)  
**BASE HEAD:** `9ef106a62b15d8c135e91cb211f9f2b414895c75`  
**ORIGIN:** `68baceeb943af32c33b076d641dd921f5223dce6`  
**DATE:** 2026-09-20  

ONE PROGRAM ≠ ONE MONSTER. Domains stay separate; adapters connect them.

---

## CONTENT_SSOT

What is announced.

| Kind | Authority |
|------|-----------|
| EVENT | First-class CMS (Phase 2) — not popup payload |
| PROMOTION | Platform popup campaign creative + copy |
| BENEFIT / COUPON | Existing wallet/coupon SSOTs; presentation may reference |
| NOTICE | `app_notices` / admin notice — not popup creative |

---

## DISTRIBUTION_SSOT

Independent ON/OFF channels. Never auto-link.

| Channel | Engine (reuse) |
|---------|----------------|
| POPUP | `platform_popup_*` + `GlobalPopupHost` |
| BANNER | Feed / placement ads (non-interruptive) |
| PUSH | `admin_notification_campaigns` → `dispatchPushForUser` |
| BELL | `notification_events` |

---

## PLACEMENT_SSOT

Reuse `platform_popup` surface registry:

`GLOBAL` · `HOME` · `COMMUNITY` · `TRADE` · `DELIVERY` · `DELIVERY_OWNER` · `ADMIN` · `MYPAGE`

Banner placements remain on Ads inventory SSOT — do not merge winner pools with interruptive popup.

---

## PRESENTATION_SSOT

| Code | Role | Host |
|------|------|------|
| ARTWORK_MODAL (A) | Interruptive | `GlobalPopupHost` / `DibayPopupAd` |
| PROMOTION_CARD (B) | Interruptive | same |
| BOTTOM_SHEET (C) | Interruptive | same |
| BENEFIT_DIALOG (D) | Interruptive | same |
| FULL_SCREEN_EVENT (E) | Destination page | Event Detail route (Phase 2) — **not** overlay |
| FULL_SCREEN_ENTRY (F) | Campaign entry | Separate from Native First Entry |

Non-interruptive: `inline_banner` / `hero_banner` reserved — Ads hosts only.

---

## AUDIENCE_SSOT

Reuse existing popup / notification audience authority. **No new segment engine.**

---

## FREQUENCY_SSOT

Canonical suppress authority (Admin `frequency_mode`):

| Mode | On dismiss (X / Back / ESC / explicit close) |
|------|-----------------------------------------------|
| `once_per_session` | SESSION |
| `once_per_day` | TODAY |
| `once_campaign` | CAMPAIGN |
| `close_only` | CLOSE only (no frequency suppress) |

`suppression_mode` is **legacy storage** for rare explicit DURATION chrome — **not** default UI. Frequency owns product suppress.

---

## DESTINATION_SSOT

Resolver-owned. Renderers must not assemble routes.

Reserved / live: `event_detail` · `store` · `product` · `delivery` · `community_post` · `trade_listing` · `coupon` · `internal_route` · `external_url`

Contract stub: `lib/platform-popup/destination-contract.ts`  
Live CTA validation: `lib/platform-popup/cta.ts` (extend in Phase 2 for `event_detail`).

---

## DISMISS_SSOT

Single entry:

```
X | Android Back | ESC | explicit close | (CTA close lifecycle)
  → frequencyModeToDismissSuppressMode(frequency)
  → /api/platform-popup/suppress
```

Default chrome: **floating X only**. Suppression footer DEFAULT = **NONE**.

CTA: records CLICK → navigates → applies **same frequency dismiss** (re-entry prevention). Analytics distinguish click vs dismiss.

---

## ANALYTICS_SSOT

| Event | Meaning |
|-------|---------|
| IMPRESSION | Stable visible presentation (not suppress) |
| CLICK | CTA activated |
| DISMISS / SUPPRESS | User/policy close write |
| DESTINATION_OPEN | `landing_success` / failure |

**IMPRESSION ≠ SUPPRESS.**

---

## EVENT_CONTENT_AUTHORITY

**MISSING until Phase 2.** No `/events/[id]` CMS. Destination kind reserved only.

## POPUP_AUTHORITY

`platform_popup_campaigns` / creatives / surfaces / suppress / events · `GlobalPopupHost` · `DibayPopupAd` compositions A–D.

## BANNER_AUTHORITY

Existing Ads / feed banner placements. Event link = destination adapter only (Phase 3).

## PUSH_AUTHORITY

`admin_notification_campaigns` · `dispatchPushForUser` · marketing consent · native route resolver. Optional; Event adapter Phase 3/5.

## BELL_AUTHORITY

`notification_events`. Optional; independent of Push.

## OWNER_AUTHORITY

Reuse `platform_popup_owner_requests` · paid package · Admin approve → campaign. Do **not** clone Admin CMS to Owner.

## ADMIN_AUTHORITY

Campaign CRUD · presentation · frequency · surfaces · approve Owner requests · (Phase 2+) Event CMS · Push/Bell toggles.

---

## REUSED_EXISTING

- Popup resolve / rotation / suppress API / First Entry deferral  
- Owner request approval pipeline  
- Push / Bell / Ads inventory  
- Shared `DibayPopupAd` Admin preview  
- Composition A/B/C from `9ef106a62`

## NEW_REQUIRED

| Phase | Item |
|-------|------|
| 1 | Dismiss≠Impression · footer OFF · Back · Type D |
| 2 | Event CMS + Detail + RLS |
| 3 | Distribution toggles / adapters |
| 4 | Operator UX polish |
| 5 | Cross-channel re-entry |
| 6–7 | Device proof · Production |

---

## DB_PLAN

- Phase 1: additive CHECK for `presentation_type = benefit_dialog` (`20261220130000_platform_popup_benefit_dialog_phase1.sql`; Production apply at Phase 7).  
- Phase 2: Event content table — only after reuse audit; no duplicate media/CTA schemas.

## RLS_PLAN

Reuse Admin write helpers. Published Event read for members/public; draft/expired fail-closed. No service-role on client.

---

## PHASE_1_FILES

- `docs/dibay-promotion-program-ssot-lock.md`  
- `lib/platform-popup/dismiss-ssot.ts`  
- `lib/platform-popup/presentation-contract.ts`  
- `lib/platform-popup/popup-suppression-ui.ts`  
- `lib/platform-popup/popup-suppression-ux-contract.ts`  
- `lib/platform-popup/resolve-presentation-composition.ts`  
- `components/platform-popup/GlobalPopupHost.tsx`  
- `components/platform-popup/DibayPopupAd.tsx`  
- `components/platform-popup/presentations/*`  
- `app/platform-popup.css`  
- Admin picker + tests + Phase 1 migration SQL

## PHASE_1_FIRST_DIVERGENCE

1. Impression → auto-suppress  
2. X → CLOSE only (frequency ignored)  
3. Default suppression footer chrome  
4. Android Back not on dismiss SSOT  

---

## CONFLICTS

**NONE** vs Owner FINAL PROGRAM. Prior dual authority (`frequency_mode` vs footer `suppression_mode`) resolved: frequency owns dismiss suppress; footer default off.

## NOT_PROVEN (Phase 1 exit)

- Production SHA / device APK·iOS matrix  
- Guest→member suppress merge (Phase 5)  
- Push/Banner↔popup re-entry (Phase 5)  
- Live DB `benefit_dialog` until migration applied  
