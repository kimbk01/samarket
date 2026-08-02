# Notices · Campaigns Domain (DOCUMENT CONTRACT DRAFT)

**Status:** DOCUMENT CONTRACT DRAFT — 2026-08-02  
**Identity:** Member vs Store APPROVED — campaigns must not write Store ops into member Bell/App Icon  
**NOT declared:** CODE PASS · Slice 7 implementation Yes  
**Implementation:** forbidden until separate Slice 7 approval.

**Related:** [`notification-badge-authority.md`](./notification-badge-authority.md),  
[`docs/admin-notification-campaigns-phase-b.md`](./admin-notification-campaigns-phase-b.md),  
[`docs/notifications/notification-event-ssot.md`](./notifications/notification-event-ssot.md).

---

## 0. Member Identity vs Store Operational Identity

| Campaign / notice audience | Inbox | Bell / badge |
|----------------------------|-------|--------------|
| Member (consumer) | Personal `/notifications` A | `memberNotificationUnreadTotal` |
| Store owner/admin | Store admin ops inbox / owner dashboard | `storeOwnerAttentionTotal(storeId)` — **not** personal Bell |
| Store-scoped ops (new order, accept reminder) | **Not** service `/notices` content | Operational identity — see badge authority §0 |

Service `/notices` and marketing `/events` are **content** domains.  
They must not be used as the store order intake queue.  
Store order intake stays commerce notify + `notification_targets` / store admin UI.

Campaign send targeting an owner must set `store_id` + `recipient_role` when the intent is operational; member marketing campaigns must not silently write owner intake attentions.

---

## 1. Separation principle

Admin **inquiry / Q&A** must not be reused as the service notice archive.  
Store **owner order attention** must not be reused as member notice archive.

| Concern | Purpose | Lifecycle |
|---------|---------|-----------|
| OS push | Delivery channel only | ephemeral |
| User notification inbox | Per-user unread/read/delete (A axis) | personal |
| Notice content | Canonical multi-reader content | publish/unpublish |
| Campaign / promotion content | Offer detail, CTA, validity | schedule/end + marketing consent |

---

## 2. LIVE inventory (do not confuse)

| Existing path | Role today | Draft class |
|---------------|------------|-------------|
| `app/admin/app/notices` · `AdminAppNoticesPage` · `app_notices` | App notices CRUD | **ROUTE candidate** for service notices admin — verify schema fitness before reuse |
| `app/(main)/my/settings/notices` → redirect settings notices | User settings notices feed | **LEGACY / partial** — not full `/notices/[id]` product |
| Store / meeting notices APIs (`/api/stores/.../notices`, philife meeting notices) | Domain-scoped notices | **KEEP domain-local**; not global service notice SSOT |
| Admin notification campaigns Phase B | `sendCampaignToUser` → `admin_notice` / banner; cron claim | **KEEP push path**; add `persist_to_inbox` / landing contract |
| `admin_notice` events | A inbox + Bell digit | KEEP as inbox projection of notice/campaign |
| `admin_marketing_banner` | Foreground banner; digit excluded | KEEP digit exclude; persist policy OPEN |
| Admin inquiry / contact flows | Support | **LEGACY ONLY for notices** — do not migrate notices into inquiry |

---

## 3. Target routes (IA)

| Route | Role |
|-------|------|
| `/notifications` (or existing my notifications) | Personal A inbox |
| `/notices` · `/notices/[id]` | Service notice list/detail (policy, maintenance, updates) |
| `/events` or `/benefits` · `/[id]` | Promo / coupon / campaign detail |
| `/admin/notices` (or evolve `admin/app/notices`) | Notice authoring publish/schedule/end |
| `/admin/campaigns` (evolve existing campaign admin) | Push campaign: audience, copy, image, deep link, **persist_to_inbox** |

Exact path names are **DRAFT** — must not collide silently with store/meeting notices.

---

## 4. Campaign fields (candidate)

```text
campaign_id
category
title
body
image_url
deep_link
landing_type          # notice | event | order | trade | settings | custom
persist_to_inbox      # boolean
notice_id | event_id  # optional content FK
audience
starts_at
ends_at
marketing_consent_required
dedupe_key
created_by
published_at
```

LIVE today: campaigns create `notification_events` via `sendCampaignToUser` with dedupe like `admin_campaign:{id}:{userId}` (`notification-event-ssot.md`). Draft extends with explicit persist + landing_type.

---

## 5. Persist policy

| Kind | `persist_to_inbox` | A digit / Bell | Tap |
|------|--------------------|----------------|-----|
| Ephemeral ad push | false | no | deep link / app screen only |
| Preserved event | true | yes (혜택·이벤트) | `/events/[id]` or benefits |
| Service notice | true | yes (공지) | `/notices/[id]` |
| Required critical notice | true + separate ack flag | unread ≠ forced consent | ack field **≠** App Icon field |

---

## 6. Push → inbox → content

```text
Campaign send
  → (optional) create A inbox row if persist_to_inbox
  → FCM/APNs delivery (badge_count = appIconTotal Projection)
  → Tap: read inbox row if any → open canonical notice/event
```

Push body is never the content SSOT. Canonical body lives in notices/campaigns tables.

---

## 7. Marketing consent

- If `marketing_consent_required`, send only to consented users (wire to existing consent stores — no new consent invention in this draft).  
- Operational / security notices may bypass marketing consent under policy (document per campaign category).

---

## 8. Conflicts / OPEN (no arbitrary choice)

| Topic | LIVE | Draft options | Status |
|-------|------|---------------|--------|
| Global `/notices` | settings redirect + `app_notices` admin | New public IA vs evolve `app_notices` | **OPEN — decision required before Slice 7** |
| Inquiry reuse | none as notice SSOT | Forbidden | DRAFT fixed |
| Banner vs inbox | `admin_marketing_banner` digit exclude | persist_to_inbox=false default for pure ads | DRAFT lean |

---

## 9. Verdict

**DOCUMENT CONTRACT DRAFT only.** No admin schema migration in this tranche.
