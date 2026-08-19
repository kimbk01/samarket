# DIBAY Marketplace UI-3 WRITE HARD LOCK

**HARD LOCK (2026-08-19).** Do not reopen UI-3. Next work is **UI-5 DETAIL only**, as a separate cut.

## Baseline

```text
UI-3 WRITE VISUAL HIERARCHY: LOCKED

PRODUCT SHA:
320909776cf498de7208f38d438c9e0f0cde7121

PRODUCTION:
dpl_7p1Yrses6Fyf5PcJa8irMD9NB3b5
https://samarket.vercel.app

RUNTIME:
ROOT empty gate removed: PASS
Samsung + Xiaomi ungated / general / used-car / real-estate hierarchy: PASS
overflowX false: PASS
sticky submit + safe-bottom: PASS
GENERAL SELL submit → /api/posts/create: PASS
DETAIL title/price/content/region match: PASS
META no UI-3 key / no foreign-profile leak: PASS
owner-status hide cleanup: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

DB/SCHEMA:
UNCHANGED

MIGRATION:
NO

CUT A–J / UI-1 / UI-2:
PRESERVED

UI-5:
NOT STARTED

FINAL:
UI-3 LOCKED
```

- Commit: `320909776cf498de7208f38d438c9e0f0cde7121`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_7p1Yrses6Fyf5PcJa8irMD9NB3b5`)

This cut changed **WRITE screen order only**. It did not change composition SSOT (A), LIST sell-intent (B), SEARCH (C), review UI (D), Buyer MY (E), promotion (F), heart/report/share (G), HOME freshness (H), 6-profile matrix (I), or later J.

공통 가격 슬롯 = **화면 위치만**. `posts.price` 강제 없음. Profile writer 유지.

## Product contract (KEEP)

```text
사진 → 제목 → 가격 → 품목정보 → 설명 → 지역 → 등록
ROOT 미선택 = 빈 "카테고리를 선택하세요" gate 없음
ROOT 선택 = 해당 profile 옵션만
가격 writer = profile-specific (RE 보증금/월세, jobs 급여, exchange 페소, rent-car daily_price)
submit / composition / DB authority 불변
call-policy는 지역 뒤
```

Authority: `components/write/WriteSheetFlowInner.tsx` · `components/write/trade/TradeWriteForm.tsx`.

## Production runtime

Hierarchy: `.qa-logs/ui-3-prod-runtime-2026-08-18T15-33-03-518Z/REPORT.json`  
Submit: `.qa-logs/ui-3-submit-probe-2026-08-19T02-55-14-112Z/REPORT.json`

```text
GENERAL SELL id 951566ee-6a86-4344-abc4-e6b395a30a4f
POST /api/posts/create 200
price 15000
meta keys: direct_deal, trade_chat_call_policy
cleanup: POST /api/posts/:id/owner-status { status: hidden }
hard delete: NO
```

Public DETAIL `/post/{id}` matched inputs. Owner list saw the row. HOME latest auto-unshift is CUT H (not UI-3).

## UI-5 (next cut only — do not start inside UI-3)

```text
사진 → 가격 → 제목 → 지역·시간 → 품목정보 → 설명 → 판매자 → 찜/신고/공유 → sticky 채팅
related / seller-other = 아래 discovery
```

## DO NOT (without an explicit new cut)

- Restore empty ROOT gate
- Force all profiles onto `posts.price`
- Change submit / composition / taxonomy writers under UI-3
- Start UI-5 DETAIL reorder inside UI-3 work
- Reopen CUT A–J or UI-1/2 to finish WRITE chrome
- Prove lock with DB insert / service-role posts create / moderation bypass
