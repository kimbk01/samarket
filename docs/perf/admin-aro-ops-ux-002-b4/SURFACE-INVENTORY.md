# ARO-OPS-UX-002-B4 — Finance surface inventory

| ROUTE | PURPOSE | MONEY | ACTIONABLE | TARGET ROLE |
|---|---|---|---|---|
| `/admin/finance` | Common Finance Control Plane (B4) | Point/Coin/Cash/Settlement overview | Yes (queue entry) | Control Plane root |
| `/admin/finance?storeId=&view=statement` | Store Financial Statement (B3) | Store-level flow | No (RO) | Store detail |
| `/admin/finance#coin-withdrawals` | Coin withdrawal panel | Coin | Yes | Specialized queue |
| `/admin/point-charges` | Member Point charge queue | Point | Yes | Specialized |
| `/admin/delivery-ads/cash-charges` | Cash top-up queue | Cash | Yes | Specialized |
| `/admin/store-settlements` | Settlement ops | Settlement | Yes | Specialized |
| `/admin/store-point-ledger` | Archive | Legacy | No | Archive |

Read model: `lib/admin/finance-control-plane/load-finance-control-plane.ts`  
API: `GET /api/admin/finance-control-plane`  
NEW DB / ledger / mutation: NONE
