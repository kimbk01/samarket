# FINANCE OPERATOR OPS

| Op | Admin approval? | CTA | Surface |
|---|---|---|---|
| Point 충전 | YES | approve / reject / hold | `/admin/point-charges` |
| Cash 충전 | YES | approve / reject | `/admin/delivery-ads/cash-charges` |
| Coin 판매 적립 | NO | history only | Finance CP Coin section |
| Coin → Cash | NO | history only | Finance CP Coin section |
| Coin 출금 | YES | reject / mark_paid | Coin withdrawals panel |
| Settlement | YES (review) | open settlement queue | `/admin/store-settlements` |
| Fee obligation | auto settle | store statement | Finance CP obligations |
| Refund | typed | history + context | Finance CP refunds |

Never merge Point/Coin/Cash balances.
