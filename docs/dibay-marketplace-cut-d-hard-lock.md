# DIBAY Marketplace CUT D HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT D. Next work is a **separate cut only**.

## Baseline

```text
DIBAY MARKETPLACE CUT D

PRODUCTION SHA:
0824300da9edc2aab60f22b3ba983948f13d8903

MEMBER REVIEW WRITE UI:
REMOVED (UI gate only — not API/DB writer removal)

REVIEW_WAIT TAB / PENDING HUB:
REMOVED

REVIEW=1 DEEP-LINK:
REMOVED

COMPLETION NOTIFICATION COPY:
LOCKED (no Marketplace review prompt)

NOTIFICATION DEEP-LINK:
MESSENGER TRADE ROOM — no review=1

SUBMIT-REVIEW API / REVIEW DB / TRUST / ADMIN / STORE REVIEW:
PRESERVED (not called from member Marketplace UI)

MIGRATION:
NO

CUT A / CUT B / CUT C / P0–P5:
PRESERVED

FINAL:
CUT D LOCKED
```

- Commit: `0824300da9edc2aab60f22b3ba983948f13d8903`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_7CUwHkWKouEpL4z8x5KgF4Vwpsgg`)

This cut removed **Marketplace member review write paths** only. It did **not** delete `submit-review`, review tables, Trust/Manner, Admin review, or store order review.

## Product contract (KEEP)

```text
Trade flow ends at 판매완료 / 거래완료 — no member “next step = write review”
canOpenTradeReviewSheet / canShowPurchaseReviewSend = false (member UI gate)
buyer_confirmed / review_pending → 구매완료 tab (no review_wait)
/mypage/trade/reviews = received + written read-only (no pending / write tab)
Sales cards: no 구매자 후기 대기 / 후기 없음 progress badge
buyer-confirm / seller-complete notifications: completion copy only
notification link_url = tradeChatNotificationHref → messenger room (no ?review=1)
tradeHubChatRoomHref / tradeItemChatMessengerHrefIfLinked ignore review opts
Legacy /mypage/trade/chat/...?review=1 redirect strips review query
```

Authority: `lib/trade/can-open-trade-review-sheet.ts` · `lib/mypage/buyer-manage-tabs.ts` · `lib/mypage/purchase-history-ui.ts` · `lib/chats/surfaces/trade-chat-surface.ts` · notification routes under `app/api/trade/product-chat/[roomId]/`.

## Production runtime

Evidence: `.qa-logs/cut-d-prod-runtime-2026-08-17T22-37-28-710Z/REPORT.json`

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0

1 판매완료 후 — no review CTA / no auto sheet / flow = 거래완료
2 구매 MY — no review_wait; buyer_confirmed/review_pending → 구매완료; read past reviews OK
3 /mypage/trade/reviews — received/written read-only; no pending/write entry
4 판매 MY — no review wait/none badge; chat/seller-complete/reserved flow OK
5 알림 — no review prompt; destination = trade chat room; no review=1
6 회귀 — A/B/C / Store / Admin / Trust unchanged (out of CUT D diff)
```

## DO NOT (without an explicit new cut)

- Restore member review write sheet / CTA / `review_wait` tab / pending hub tab
- Re-append `?review=1` on trade chat hrefs or completion notifications
- Restore buyer-confirm / seller-complete review-prompt notification copy
- Delete `submit-review` API or review DB as part of CUT D cleanup
- Treat `canOpenTradeReviewSheet === false` as “writer removed” for Admin/Store/API scope
- Reopen CUT A / B / C inside CUT D work
- Start CUT E (or later) inside a CUT D change

## Gate

```bash
npx vitest run lib/trade/__tests__/marketplace-cut-d-member-review-ui.test.ts lib/mypage/__tests__/buyer-manage-tabs.test.ts lib/mypage/__tests__/seller-manage-tabs.test.ts
```

## Next

Later marketplace cuts are **separate**. Do not reopen A / B / C / D.
