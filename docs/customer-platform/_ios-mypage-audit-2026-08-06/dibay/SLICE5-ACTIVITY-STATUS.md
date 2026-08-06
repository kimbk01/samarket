# Slice 5 — Activity STATUS

```text
SLICE 4 LOCK 유지
PRODUCTION ALIGNED @ c79b880d2
PRODUCT BASELINE = c79b880d2
origin/main tip may include docs-only after align
SLICE 5 ACTIVITY AUTHORIZED
SLICE 5 CODE IN PROGRESS
```

## Scope

Activity only: 거래·구매·판매·관심·후기·작성글 등 KEEP/MOVE/MERGE.  
기능 삭제 금지. Runtime PASS 전 dead file 삭제 금지.  
Out: Auth · Messenger · Call · Badge · CMS · Slice 1–4 LOCK churn.

## Audit — KEEP / MOVE / MERGE

| Surface | Canonical | Action | Notes |
|---------|-----------|--------|-------|
| Home trade block | `MYPAGE_HOME_TRADE_ITEMS` | KEEP | Slice 3 MERGE 유지 |
| Trade hub | `/mypage/trade/*` | KEEP SSOT | |
| Purchases | `/mypage/trade` | KEEP | MERGE `/mypage/purchases` → redirect |
| Sales | `/mypage/trade/sales` | KEEP | MERGE `/mypage/sales` → redirect |
| Favorites | `/mypage/trade/favorites` | KEEP | `/my/favorites` already redirects |
| Reviews (mgmt) | `/mypage/trade/reviews` | KEEP | MERGE `/mypage/reviews` → redirect |
| Recent | `/mypage/recent-viewed` | KEEP | MERGE section `trade:recent` → same |
| Offers | `/mypage/offers*` | KEEP | Chrome unify only |
| Products | `/mypage/products` | MERGE → sales hub redirect | Dual seller UI |
| Community posts/activity | hub paths | KEEP | QUICK; not trade MERGE |
| Trade chat | `/mypage/trade/chat*` | KEEP | Messenger boundary — no change |
| Purchase detail | `/mypage/purchases/[chatId]` | MOVE back → trade shell | KEEP detail route |

## Product baseline

| Item | Value |
|------|-------|
| Product deploy | `c79b880d2` |
| Git tip (pre-Slice5) | `978e17a26` docs-only |

## Forbidden until Runtime PASS

Dead file deletion · Auth/Messenger/Call/Badge/CMS edits · Slice 6 Account
