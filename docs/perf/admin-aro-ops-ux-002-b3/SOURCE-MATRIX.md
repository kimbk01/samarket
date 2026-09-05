# ARO-OPS-UX-002-B3 — Store-level source matrix

Composition only. No new ledger / aggregate / mutation.

| Item | Canonical source | Table/API | Reference | Notes |
|---|---|---|---|---|
| STORE | stores | stores | stores.id | name, approval_status, region/city, owner |
| OWNER | profiles | profiles | owner_user_id | nickname/username |
| ORDERS / SALES | store_settlements + order join | loadStoreSettlementFinancialFacts | settlement_id / order_id | Period = settlement_created |
| ORDER TOTAL / COMPLETED AMOUNT | settlement gross / confirmed_sale | store_settlements.gross_amount | order_id | Not guessed |
| SALE FEE RATE | platform_fee_percent snapshot | store_settlements | settlement_id | Display as applied %; never live policy × sales |
| SALE FEE AMOUNT | platform_fee_amount (+ fixed) | store_settlements | settlement_id | commission_amount from fact |
| FEE OBLIGATION | Option B unpaid | store_sale_fee_obligations | obligation id / order_id | open outstanding sum |
| COIN CREDIT | SALE_EARN / ECONOMIC_INFLOW | store_economic_point_ledger | related_id | Period filter |
| COIN BALANCE | account | store_economic_point_accounts | store_id | Point-in-time |
| COIN → CASH | CONVERT_TO_BUSINESS_CASH / CONVERT_FROM_STORE_POINTS | coin + cash ledgers | related_id | 1:1 applied from ledger amounts |
| CASH TOP-UP | TOP_UP + charge requests | business_cash_ledger + business_cash_charge_requests | charge request id | Request ↔ ledger |
| CASH BALANCE | account | business_cash_accounts | store_id | Point-in-time |
| AD DEBIT | AD_SPEND debit | business_cash_ledger | related ad/campaign | Cash only |
| PARTNER DEBIT | PARTNER_SPEND debit | business_cash_ledger | partner related | ≠ AdProduct |
| FEE DEBIT | SALE_FEE / SALE_FEE_SETTLEMENT | business_cash_ledger | order related | |
| REFUND | AD_REFUND / PARTNER_REFUND (+ settlement refund_amount) | cash ledger / settlements | related | Distinguish cash vs settlement refund |
| SETTLEMENT * | store_settlements statuses + summary | loadStoreSettlementFinancialFacts | settlement_id | Stored net — no recomputed fake net |
| TIMELINE | union of above | read-model only | event id | Limit 100/ledger |

API: `GET /api/admin/store-financial-statement?storeId=&period=`
UI: `/admin/finance?storeId=&view=statement`
