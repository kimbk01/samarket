# DIBAY Marketplace UI-4 LIST HARD LOCK

**HARD LOCK (2026-08-19).** Do not reopen UI-4. Next work is **UI-6 내 판매물품** (`MyProductCard` only), as a separate cut.

## Baseline

```text
UI-4 LIST CARD INFORMATION HIERARCHY: LOCKED

PRODUCT SHA:
08fd8bba1b3604ab637b426966bf50fb8350095e

PRODUCTION:
dpl_2kT6KMQGwaJvwxsBEfJUfX1Uenb1
https://samarket.vercel.app

RUNTIME:
Samsung + Xiaomi HOME hierarchy: PASS
CATEGORY hierarchy: PASS
SEARCH hierarchy + horizontal 100×100: PASS
status/spec/time removal: PASS
mobile layout (2-col HOME/CATEGORY, overflowX false): PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

PROMOTED overlay on LIST:
KEEP (CUT F) — empty fixture NOT_PROVEN, not a reopen

FAVORITES surface:
KEEP (PostCard reuse / CUT G) — empty fixture NOT_PROVEN, not a reopen

DB/SCHEMA:
UNCHANGED

MIGRATION:
NO

CUT A–J / UI-1 / UI-2 / UI-3 / UI-5:
PRESERVED

FINAL:
UI-4 LOCKED
```

- Commit: `08fd8bba1b3604ab637b426966bf50fb8350095e`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_2kT6KMQGwaJvwxsBEfJUfX1Uenb1`)

This cut changed **LIST / SEARCH card information order only**. It did not change composition SSOT (A), LIST sell-intent (B), SEARCH ranking (C), review UI (D), Buyer MY (E), promotion pin/order (F), heart/report writers (G), HOME freshness (H), 6-profile matrix (I), WRITE (UI-3), or DETAIL (UI-5).

## Product contract (KEEP)

```text
HOME / CATEGORY (PostCard, 2-col):
사진 → 가격 → 제목 → 지역 → ♡ → 홍보(해당 시) → ⋮ (existing menu)

SEARCH (ProductCard, horizontal KEEP):
사진 → 가격 → 제목 → 홍보(해당 시) → 지역 → ♡
h-[100px] w-[100px] · relative flex gap-3
⋮ / report menu 없음 (CUT G: SEARCH report is after DETAIL)

REMOVE from LIST cards:
판매중 badge · spec 요약 줄 · 등록 시간 · 문의중/예약중 등 상태성 정보

CUT F 홍보 badge KEEP; pin/order UNCHANGED
CUT G heart + LIST report (PostCard ⋮) KEEP
FavoritePostCard reuses PostCard
```

Authority: `components/post/PostCard.tsx` · `components/product/ProductCard.tsx`.

## Production runtime

Evidence: `.qa-logs/ui-4-prod-runtime-2026-08-19T05-13-08-676Z/REPORT.json`

Proof is **visible card DOM / text / screenshot**, not `data-ui4-slot`. Slot markers were not added during runtime.

| Device | Model | Result |
|---|---|---|
| Samsung | SM-M156S (`RFCY40PY2CA`) | PASS |
| Xiaomi | 24076RP19G (`8b37179f7d94`) | PASS |

Observed (both devices):

```text
HOME: ₱ 1,000 → Selling pesos → Makati City
      판매중/시간/extra 줄 없음 · 2-col · overflowX false · ♡ on page · ⋮ KEEP
CATEGORY 중고차: ₱35,000 → Toyota Vios · 2021 · 5,000 km → Makati City
      판매중/시간/extra 줄 없음 (연식·주행은 제목 본문, 별도 spec 행 아님)
SEARCH Toyota: 100×100 horizontal · 판매중/시간 없음
SEARCH pesos: ₱1,000 → Selling pesos → manila · m2
MY sales: 판매중 탭 KEEP (UI-6)
FAVORITES: empty → NOT_PROVEN (CUT G not reopened)
```

## Next (not this cut)

```text
UI-6 내 판매물품 — MyProductCard only
```

## DO NOT (without an explicit new cut)

- Restore 판매중 / spec 요약 / 등록 시간 on HOME / CATEGORY / SEARCH cards
- Restyle SEARCH as 2-col `PostCard` (reopens CUT C presentation)
- Add SEARCH ⋮ / report (CUT G)
- Cap or move CUT F pin order
- Restore member 관심 N / `posts.favorite_count` display
- Add product `data-*` markers to “prove” LIST
- Reopen CUT A–J or UI-1/2/3/5 to finish LIST chrome
- Start UI-6 inside UI-4 work
