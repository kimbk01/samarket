# DIBAY Marketplace CUT E HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT E. Next work is a **separate cut only** (CUT F).

## Baseline

```text
CUT E BUYER PURCHASE SURFACE: LOCKED

PRODUCT SHA:
89a3f87929b7db3b18dbbbc1f43f2926c11caccf

PRODUCTION:
dpl_8uz72ReurjjXvYUF1qu2pK2j7AiZ
https://samarket.vercel.app

RUNTIME:
A /mypage/trade → sales: PASS
B legacy list → trade-chats: PASS
C legacy detail → Messenger room: PASS
D buyer-confirm / issue / chat: PASS
E Sales MY: PASS
F salesCount + 판매 내역 + badge 유지: PASS
G CUT D 후기 UX 0: PASS
H A/B/C untouched: PASS
I 404: 0

purchaseCount API/data:
PRESERVED

PRODUCT CODE MODIFIED DURING RUNTIME:
0

MIGRATION:
NO

CUT A / CUT B / CUT C / CUT D / P0–P5:
PRESERVED

FINAL:
CUT E LOCKED
```

- Commit: `89a3f87929b7db3b18dbbbc1f43f2926c11caccf`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_8uz72ReurjjXvYUF1qu2pK2j7AiZ`)

CLI `githubCommitSha` may be empty. LOCK authority is alias → this deployment plus Production runtime of CUT E behavior.

This cut removed **duplicate Buyer MY surfaces**. It did **not** delete purchase tables, purchase APIs, buyer-confirm, buyer-issue, chat history, `sold_buyer_id`, dispute evidence, Trust, or review DB.

## Product contract (KEEP)

```text
Goal = 중복 Buyer MY surface 제거 — not 구매 데이터 삭제
MY Marketplace default = SALES (/mypage/trade → /mypage/trade/sales)
Buyer action SSOT = Messenger trade chat
legacy list /philife/purchases / /mypage/purchases / /mypage/trade/purchases
  → /community-messenger/trade-chats
legacy detail /mypage/purchases/[chatId] / /philife/purchases/[chatId]
  → tradeHubChatRoomHref → /community-messenger/rooms/[roomId]
no buyer purchase primary tab/CTA
AccountTab: value = salesCount only; label = 판매 내역 (not 진행중 거래)
GET /api/my/purchases · GET /api/my/trade-counts (purchaseCount field) KEEP
buyer-confirm / buyer-issue / chat / sold_buyer_id / dispute KEEP
```

Authority: `lib/chats/surfaces/trade-chat-surface.ts` · `lib/mypage/trade-hub-paths.ts` · `app/(main)/mypage/trade/page.tsx` · `components/mypage/tabs/AccountTab.tsx`.

## Production runtime

Evidence: `.qa-logs/cut-e-prod-runtime-2026-08-18T00-20-35-562Z/REPORT.json`

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0
```

## DO NOT (without an explicit new cut)

- Restore member buyer purchase list / tab / CTA / philife purchases surface
- Send legacy purchase list URLs to `/mypage/trade/sales` (buyer→seller meaning switch)
- Delete purchase API / `purchaseCount` / purchase tables under CUT E cleanup
- Remove buyer-confirm / buyer-issue / chat history / `sold_buyer_id` / dispute
- Reopen CUT A / B / C / D inside CUT E work
- Start CUT F (seller promotion) inside a CUT E change

## Gate

```bash
npx vitest run lib/trade/__tests__/marketplace-cut-e-buyer-purchase-surface.test.ts lib/trade/__tests__/marketplace-cut-d-member-review-ui.test.ts lib/mypage/__tests__/slice5-activity-route-merge.test.ts
```

## Next

CUT F (seller promotion unification) is a **separate cut**. Do not reopen A–E.
