# DIBAY Marketplace CUT A HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT A. Next work is a **separate cut only**.

## Baseline

```text
DIBAY MARKETPLACE CUT A

PRODUCTION SHA:
38031d3dda9e44fd4c85c5c5ee5940020bbabd51

A1 OPTION ROOT SSOT:
LOCKED

A2 ADMIN TOPIC → CATEGORY → OPTION:
LOCKED

A1/A2 AUTHORITY LEAK:
CLOSED

A3 MEMBER TERMINOLOGY:
LOCKED

MIGRATION:
NO

P0-P5 / PREVIOUS LOCKS:
PRESERVED

FINAL:
CUT A LOCKED
```

- Commit: `38031d3dda9e44fd4c85c5c5ee5940020bbabd51`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_9yyp9gWfHGyArm1LfBrnHt1D3Y3D`)

## Product contract (KEEP)

```text
주제 (ROOT, parent_id IS NULL)  = option owner
카테고리 (CHILD)               = name / order / active / list narrowing only
posts.trade_category_id        = stored node (child if chosen, else root) — keep
?topic=                        = URL/cache key — keep, no rename
SUV                            = option (posts.meta.car_body_type / filters[body_type])
                               ≠ child category
```

WRITE / LIST / DETAIL / FILTER / SEARCH / EDIT all resolve **options from ROOT** while listing id stays **child** when a child is selected.

Internal names stay (`categories.parent_id`, `category_settings.field_composition`, `?topic=`). Product copy is 주제 → 카테고리 → 옵션.

Admin SSOT: `/admin/menus/trade`. `/admin/trade/feed-topics` redirects there. Child form has no option editor.

## DO NOT (without an explicit new cut)

- Reopen CUT A to rename schema, promote SUV to a child, or migrate `trade_category_id`
- Read child `field_composition` as product option authority (A1/A2 leak)
- Start CUT B (or any later cut) inside a CUT A change
- Declare a later marketplace cut LOCKED without that cut’s own Production runtime

## Next

CUT B — 판매글 중심 Marketplace 정리 — is a **separate cut**. Not opened by this lock.
