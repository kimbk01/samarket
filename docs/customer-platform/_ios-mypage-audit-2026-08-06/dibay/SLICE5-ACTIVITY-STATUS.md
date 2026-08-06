# Slice 5 — Activity STATUS

```text
SLICE 4 LOCK 유지
PRODUCT BASELINE (pre-Slice5) = c79b880d2
SLICE 5 ACTIVITY CODE LOCKED
SLICE 5 DEPLOYED
SLICE 5 RUNTIME PASS
SLICE 5 ACTIVITY LOCK
```

## Production / Git

| Item | Value |
|------|-------|
| Product + LOCK SHA | `251f945b83d1032e15be6d7e3cd59768e66ab9c6` |
| Deploy | `dpl_4a9tKg2NbDfzp7YLKF7VhQw5SdJc` |
| Alias | `https://samarket.vercel.app` · Ready |
| Prior product commit | `e3937f8b4` · `dpl_7UkoLLkSbfottkpj3ipt3nT9e8sf` (RSC-only redirect; fixed by HTTP redirects) |
| `origin/main` | = HEAD |

## Commits

1. `e3937f8b4` — Activity MERGE (trade hub SSOT, CTAs, empty chrome, offers shell)  
2. `251f945b8` — `next.config.js` HTTP 307 for `/mypage/purchases|sales|reviews`

## Audit (KEEP / MOVE / MERGE)

| Surface | Action |
|---------|--------|
| Home trade block | KEEP |
| `/mypage/trade/*` | KEEP SSOT |
| `/mypage/purchases` · `/sales` · `/reviews` | MERGE → HTTP 307 to trade hub |
| `/mypage/purchases/[chatId]` | KEEP detail · back → `/mypage/trade` |
| Offers · recent · products · community | KEEP |
| Trade chat | KEEP (Messenger boundary) |
| Dead files | NOT deleted (Runtime PASS 전 금지) |

## Runtime evidence

`.qa-logs/customer-platform-slice5-runtime-2026-08-06T08-03-05-364Z/`

| Gate | Result |
|------|--------|
| HTTP 307 purchases→trade · sales · reviews | PASS |
| Activity pages 200 | PASS |
| Windows Playwright redirect | PASS |
| APK / Tablet devices present | PASS (HTTP primary) |
| iOS | PASS (HTTP parity) |

## Out of scope (unchanged)

Auth · Messenger · Call · Badge · CMS · Slice 6 Account · dead-file delete
