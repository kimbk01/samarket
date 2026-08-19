# DIBAY Marketplace UI-6 MY SELLING LISTINGS HARD LOCK

**HARD LOCK (2026-08-19).** Do not reopen UI-6. Marketplace member chrome UI-1~6 is closed. Next work is a separate cut if needed (not this lock).

## Baseline

```text
UI-6 MY SELLING LISTINGS: LOCKED

PRODUCT SHA:
5414ad87bcf3f95ba02704ace9c418ff5b226e4e

PRODUCTION:
dpl_E5TMyXumNZzHKzpCtGS4Z99hLhp7
https://samarket.vercel.app

RUNTIME:
Samsung + Xiaomi primary title: PASS
no secondary hub banner: PASS
filters 전체/판매중/판매완료/숨김/홍보: PASS
card photo → price → title → location → status·time: PASS
⋮ 수정/더 알리기/판매완료/숨김/삭제: PASS
4-state/끌올/판매취소 absent from ⋮: PASS
complete confirm no review leak: PASS
hidden tab: PASS
/mypage/trade/sales tabs: PASS
overflowX false / menu not clipped: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

PROMOTED badge fixture:
NOT_PROVEN — does not reopen CUT F

PostSellerTradeStrip:
PRESERVED (visible on Samsung + Xiaomi)

DB/SCHEMA:
UNCHANGED

MIGRATION:
NO

CUT A–J / UI-1 / UI-2 / UI-3 / UI-4 / UI-5:
PRESERVED

FINAL:
UI-6 LOCKED
```

- Product commit: `5414ad87bcf3f95ba02704ace9c418ff5b226e4e`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_E5TMyXumNZzHKzpCtGS4Z99hLhp7`)

This cut changed **MY selling listings presentation** (`/mypage/products`). It did not change LIST (UI-4), DETAIL (UI-5), WRITE (UI-3), SEARCH rank (C), sell-intent (B), taxonomy (A), Buyer MY (E), promotion writers (F), heart/report (G), or `/mypage/trade/sales` chat/flow authority.

## Product contract (KEEP)

```text
PRIMARY SURFACE: /mypage/products = 「내 판매물품」

ROLE: 판매자가 올린 매물 확인 → 수정 → 홍보 → 판매완료 → 숨김/삭제

CARD:
사진 → 가격 → 제목 → 지역 → 판매상태·시간 → 홍보(해당 시) → ⋮

⋮:
수정
더 알리기  (/mypage/points/promotions?postId=)
판매완료  (existing completed writer)
숨김
삭제

4-state data/writer (inquiry/negotiating/reserved/completed): PRESERVED
4-state items not in UI-6 1차 메뉴

CUT F promote writer/URL: UNCHANGED (presentation = 더 알리기)
/mypage/trade/sales: UNCHANGED
PostSellerTradeStrip: UNCHANGED
```

Authority: `MyProductsView.tsx` · `MyProductCard.tsx` · `MyProductActions.tsx`.

## Production runtime

Evidence: `.qa-logs/ui-6-prod-runtime-2026-08-19T06-07-29-298Z/REPORT.json`

| Device | Model | Result |
|---|---|---|
| Samsung | SM-M156S (`RFCY40PY2CA`) | PASS |
| Xiaomi | 24076RP19G (`8b37179f7d94`) | PASS |

Observed (both):

```text
Title: 내 판매물품
Banner: 보조 목록 / 판매 관리 허브 기준 없음
Filters: 전체 · 판매중 · 판매완료 · 숨김 · 홍보
Card: ₱1,000 → Selling pesos → Manila · Makati → 판매중 · N분/시간 전
Photo: 100×100
⋮: 수정 | 더 알리기 | 판매완료 | 숨기기 | 삭제
더 알리기 → /mypage/points/promotions?postId=e787f396-a00f-4008-b6cb-9ba8a9be1756
Complete confirm: 후기 작성 유도 없음 (실제 mutation 없음)
Hidden tab: owner listings with 숨김
Sales: 판매중 / 판매완료 / 판매취소 KEEP
overflowX: false · menu clipped: false
```

## DO NOT (without an explicit new cut)

- Restore “보조 목록 / 판매 관리가 기준” banner
- Restore 4-state items in UI-6 ⋮
- Restore 끌올 / 상위노출 / 판매취소 in UI-6 ⋮
- Restore review-write copy on complete confirm
- Change `/mypage/trade/sales` structure or PostSellerTradeStrip
- Change completed writer / promote URL
- Reopen CUT A–J or UI-1~5 to finish MY chrome
- Reintroduce buyer purchase list
