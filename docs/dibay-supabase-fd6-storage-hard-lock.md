# DIBAY Supabase — FD6 Storage HARD LOCK

**Status:** PRODUCTION CLOSED · HARD LOCK  
**Declared:** 2026-09-25  
**Owner accepted:** YES  
**Evidence:** `.tmp/supabase-forensic-audit/fd6-storage/FD6_FINAL.md`

## Meaning of HARD LOCK (this domain)

HARD LOCK means:

- Current Product Storage defect = **NONE PROVEN**
- Canonical writers/readers stay fail-closed on ephemeral/invalid media refs
- Historical rolling error totals **cannot** unlock FD6
- It does **not** mean every historical object is referenced or every historical 400 is gone

```text
blob: / localhost / undefined  → never persist as canonical DB media
invalid ref                    → never prefix onto /storage/v1/object/public/
AVIF original                  → do not invent .feed.webp
historical missing object      → do not invent a replacement path
```

## AUTHORITY (baseline)

| Item | Value |
|---|---|
| HEAD / ORIGIN / PRODUCTION | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| Deployment | `dpl_BCiszFHAiNMuK6q1USWwVNRySJXH` |
| Status | Ready |
| Alias | `samarket.vercel.app` |
| Supabase | `ckdosyydvgzqwpbwuhon` |
| CURRENT P0 | 0 |
| CURRENT P1 | 0 |

Start of FD6 audit: `3d4c89e2b` / `dpl_GaPLsKxKc3ZMp26HuKwUEZZ1tZPt`.  
Vercel `githubCommitSha` meta may be missing — **not** a product divergence.

## Preserved prior locks

| Gate | Status |
|---|---|
| FD1 | CLOSED — PRESERVED |
| FD2 | CLOSED — PRESERVED |
| FD3 Storage Security (`20270125171000_fd3_drop_post_images_public_insert`) | CLOSED — PRESERVED |
| FD4 local-only legitimate divergence 35 | CLOSED — PRESERVED · DO NOT TOUCH |
| FD5 | CLOSED — PRESERVED |
| FD6 Storage | CLOSED — PRODUCTION LOCKED |

## Functional baseline (LOCKED)

| Gate | Status |
|---|---|
| Live buckets classified | 8 / 8 · UNCLASSIFIED=0 |
| Persistable media ref gate | LOCKED (`lib/media/persistable-storage-media-ref.ts`) |
| Post/trade writers filter ephemeral URLs | LOCKED |
| Reader must not prefix blob/localhost | LOCKED |
| Canonical resolver eligible-original only (no AVIF derivative invention) | LOCKED |
| One-row blob post repair | DONE (`ab58bb51-ccd7-48f1-9ac6-db141d1b29b7`) · no migration |
| Upload canonical rollback | LOCKED (documented; no new cleanup campaign) |
| Delete best-effort | LOCKED (do not convert to destructive hard delete) |

## Historical windows (do NOT mix · do NOT zero-target)

| Window | Count | Rule |
|---|---:|---|
| Owner Dashboard Storage warnings | 175 | Separate rolling window. Not added to 294. |
| Forensic edge storage 400 | 294 | `2026-09-24T07:55Z`–`2026-09-25T07:55Z` |
| QA_FORENSIC (external-board log-truncated) | 184 | Objects exist (HTTP 200). |
| PRODUCT (repaired) | 45 | blob persist+prefix 42 + invented AVIF feed 3. |
| OLD/STALE missing avatar family | 65 | Do not invent replacement. |
| UNKNOWN | 0 | Captured snapshot closed. |

Old rolling aggregate remaining non-zero ≠ current Product defect.

## NOT HARD LOCK blockers

| Item | Rule |
|---|---|
| Historical missing avatar `3bcab786….webp` | OLD/STALE; no invented path; no automatic NULL |
| Classified unreferenced Storage objects | Harmless leftovers allowed; **no bulk orphan delete** |
| Full 7949-key object→DB ownership | NOT_PROVEN — do not promote; do not unlock |
| Store/menu/ads/gift full existence scan | NOT_PROVEN (blob/localhost already 0) |
| New edge-log API window after deploy | NOT_PROVEN — same class as missing Vercel commit-sha meta |

## Forbidden follow-ups (without Owner product FAIL)

- Re-audit full Storage / reopen FD6 because 175 or 294 is non-zero
- Bulk orphan delete · bucket reset · mass path rewrite
- Mass NULL of media columns to hide broken/historical refs
- Image URL “fallback” that hides broken data
- Catch-and-ignore Storage errors to suppress logs
- RLS / public-bucket / policy change unless a **new** Storage security contradiction (then reopen **FD3 Storage gate only**)
- Real-user file deletion for QA or cost cleanup before ownership proof
- Treat NOT_PROVEN orphan/log slices as CURRENT FAIL or CURRENT PASS inflation

## Allowed later work

- Regression-only fix on a **new** first divergence in persistable writers/readers
- Safe fixture-backed upload/read without destructive Production deletes
- FD7 Realtime (separate scope; do not reopen FD6 to start it)

## Change gate

Touch Storage buckets, object keys, persistable media refs, public/signed URL builders, post-images, upload/delete lifecycle, or image resolvers:

1. Assume this HARD LOCK holds
2. Prove **regression only** on the touched invariant
3. Do **not** reopen broad Storage forensic / orphan cleanup / 400-zeroing unless Owner declares PRODUCT FAIL first divergence

## Reopen only if

- A new Production contradiction
- A reproduced Storage regression
- A Storage schema / security authority change

Production cutover remains: `git push origin main` → Vercel Git Integration only.
