# Slice 6 — Account STATUS

```text
SLICE 5 ACTIVITY LOCK 유지
PRODUCT BASELINE (pre-Slice6) = 251f945b8
SLICE 6 ACCOUNT AUTHORIZED (via 진행)
SLICE 6 IN PROGRESS
```

## Scope

Account / security IA only: account · addresses · payment · security · notifications · language · region · logout · leave.  
KEEP/MOVE/MERGE. 기능 삭제 금지. Runtime PASS 전 dead file 삭제 금지.  
Out: Auth OAuth rewrite · Messenger · Call · Badge · CMS · Activity · Admin Projection.

## Audit — KEEP / MOVE / MERGE

| Surface | Canonical | Action |
|---------|-----------|--------|
| Hub Account + logout menu_row | home ACCOUNT_ITEMS | KEEP (Slice 3) |
| Account detail | `/mypage/account` | KEEP SSOT |
| account-info section | `/mypage/section/account/account-info` | MERGE → redirect account |
| Addresses | `/mypage/addresses` | KEEP |
| settings/store address sections | section paths | MERGE → `/mypage/addresses` |
| Leave | `/mypage/section/settings/leave` | KEEP; MOVE into Account block |
| `/account/delete-request` | parallel | MERGE → leave redirect |
| Logout pages | `/mypage/logout` | KEEP redirect (Slice 2) |
| Payment stub | section/store/payment | KEEP stub |
| Region vs country | country = Account; bulk region → addresses | MERGE hop fix |

## Forbidden

Auth provider rewrite · dead console delete · Slice 7 Admin
