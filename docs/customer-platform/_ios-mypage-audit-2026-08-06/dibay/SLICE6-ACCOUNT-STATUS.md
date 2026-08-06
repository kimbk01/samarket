# Slice 6 — Account STATUS

```text
SLICE 5 ACTIVITY LOCK 유지
PRODUCT BASELINE (pre-Slice6) = 251f945b8
SLICE 6 ACCOUNT CODE LOCKED
SLICE 6 DEPLOYED
SLICE 6 RUNTIME PASS
SLICE 6 ACCOUNT LOCK
```

## Production / Git

| Item | Value |
|------|-------|
| Product + LOCK SHA | `2676cc333dc302050b975f24f1e89a09046eebc5` |
| Deploy | `dpl_2QFu22roSW9uBDgVNHfh8fPzp45h` |
| Alias | `https://samarket.vercel.app` · Ready |
| Prior product | Slice 5 `251f945b8` · `dpl_4a9tKg2NbDfzp7YLKF7VhQw5SdJc` |
| `origin/main` | = product SHA (docs tip may follow) |

## Commits

1. `2676cc333` — Account MERGE (leave → Account, address/account-info/delete-request HTTP 307, back links)

## Audit (KEEP / MOVE / MERGE)

| Surface | Canonical | Action |
|---------|-----------|--------|
| Hub Account + logout menu_row | home ACCOUNT_ITEMS | KEEP (Slice 3) |
| Account detail | `/mypage/account` | KEEP SSOT |
| account-info section | `/mypage/section/account/account-info` | MERGE → HTTP 307 account |
| Addresses | `/mypage/addresses` | KEEP |
| settings/store address sections | section paths | MERGE → HTTP 307 addresses |
| Leave | `/mypage/section/settings/leave` | KEEP; MOVE into Account block |
| `/account/delete-request` | parallel | MERGE → HTTP 307 leave |
| Logout pages | `/mypage/logout` | KEEP redirect (Slice 2) |
| Payment stub | section/store/payment | KEEP stub |
| Region vs country | country = Account; bulk region → addresses | MERGE hop fix |

## Runtime evidence

`.qa-logs/customer-platform-slice6-runtime-2026-08-06T08-24-17-138Z/`

| Gate | Result |
|------|--------|
| HTTP 307 settings/store address → addresses | PASS |
| HTTP 307 account-info → account | PASS |
| HTTP 307 delete-request → leave | PASS |
| Account surfaces 200 | PASS |
| Windows Playwright | PASS |

## Forbidden / out of scope

Auth provider rewrite · dead console delete · Messenger · Call · Badge · CMS · Activity reopen · Slice 7 Admin Projection
