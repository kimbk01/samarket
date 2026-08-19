# DIBAY Marketplace UI-5 DETAIL HARD LOCK

**HARD LOCK (2026-08-19).** Do not reopen UI-5. Next work is **UI-4 LIST card simplification**, then **UI-6 내 판매물품**, as separate cuts.

## Baseline

```text
UI-5 DETAIL VISUAL HIERARCHY: LOCKED

PRODUCT SHA:
d9ad0d6b913aea660372897627424c0f7d0ece64

PRODUCTION:
dpl_EVAWPH2iY3MxvsnaXconBBW5NHZS
https://samarket.vercel.app

RUNTIME:
Samsung + Xiaomi 8 gate: PASS
일반/환전 hierarchy: PASS
중고차 intent in 품목정보: PASS
부동산 location + item → description: PASS
일자리 급여 → 제목: PASS
BUYER 찜/신고/공유 + sticky 채팅 + ⋯ no dup: PASS
OWNER authority preserved: PASS
discovery below core: PASS
overflowX false + sticky safe-bottom: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

RELATED LOADER:
UNCHANGED

DB/SCHEMA:
UNCHANGED

MIGRATION:
NO

CUT A–J / UI-1 / UI-2 / UI-3:
PRESERVED

FINAL:
UI-5 LOCKED
```

- Commit: `d9ad0d6b913aea660372897627424c0f7d0ece64`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_EVAWPH2iY3MxvsnaXconBBW5NHZS`)

This cut changed **DETAIL presentation order only**. It did not change composition SSOT (A), LIST sell-intent (B), SEARCH (C), review UI (D), Buyer MY (E), promotion (F), heart/report/share writers (G), HOME freshness (H), 6-profile matrix (I), WRITE hierarchy (UI-3), related data loader, or chat CTA authority.

## Product contract (KEEP)

```text
BUYER DETAIL
사진 → 가격 → 제목 → 지역·시간 → 품목정보 → 설명 → 판매자 → 찜 / 신고 / 공유
DISCOVERY: 판매자 다른 상품 / 광고 / 관련
VIEWPORT FIXED: 채팅 CTA

중고차: 상태/팝니다·삽니다는 제목 아래가 아니라 품목정보
부동산: 지역·시간 전용 행, 품목정보 → 설명
일자리: 급여 → 제목 → 지역 → 품목 → 설명

BUYER ⋯: 신고/공유 중복 없음 (이 사용자의 글 보지 않기 유지)
OWNER: buyer 찜/신고/채팅 강제 없음
OWNER: 수정 / 삭제 / 더 알리기 authority 유지
sticky CTA는 overlay — related를 sticky 아래 DOM으로 옮기지 않음
```

Authority: `components/post/PostDetailView.tsx` · `components/jobs/JobDetailHeader.tsx`.

CUT G reuse: `toggleFavorite` · `ReportReasonModal` · `shareOrCopyTradeListing` — presentation entry is one.

## Production runtime

Evidence: `.qa-logs/ui-5-prod-runtime-2026-08-19T03-54-15-860Z/REPORT.json`

| Device | Model | Result |
|---|---|---|
| Samsung | SM-M156S (`RFCY40PY2CA`) | PASS |
| Xiaomi | 24076RP19G (`8b37179f7d94`) | PASS |

Fixtures (other-user unless noted):

```text
general buyer  c88a2f7e-8d5a-453c-be81-8eeb3df8203d
used-car       7753c59c-aba7-4224-b49e-cc6b441b67c8  (owner listing; presentation only)
real-estate    0d9debc9-b1bc-479e-80f2-c04e7411a5fa
jobs           8266ba34-544a-48b7-bfc2-115ebdfd3c45
owner          e787f396-a00f-4008-b6cb-9ba8a9be1756
```

`data-ui5-slot` order proven:

```text
photos → price → title → location → item → description → seller → actions → discovery
jobs: price → title → location → item → description → seller → actions → discovery
used-car item: 판매중 / 팝니다 under 품목정보, not between title and location
buyer ⋯ dialog: 이 사용자의 글 보지 않기 only (no 신고/공유)
owner ⋯: 수정 / 삭제 / 물품 판매 취소
sticky buyer: 채팅 이어가기
sticky owner: 더 알리기
```

## Next (not this cut)

```text
UI-4 LIST card simplification
UI-6 내 판매물품
```

## DO NOT (without an explicit new cut)

- Restore chips between title and location
- Restore real-estate description before item facts
- Restore jobs intro/description before location
- Put buyer 찜/신고 on owner DETAIL, or buyer 채팅 CTA on owner sticky
- Duplicate 신고/공유 into buyer `⋯`
- Move related into sticky DOM / change `getTradeDetailRelatedData`
- Touch CUT G writers, CUT F promote authority, chat create path
- Reopen CUT A–J or UI-1/2/3 to finish DETAIL chrome
- Start UI-4 LIST or UI-6 inside UI-5 work
