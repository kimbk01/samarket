# DOMAIN CONTROL MATRIX

Authority: presentation rebuild around existing SSOT only.  
No new lifecycle tables / finance merges / ads mutation owners.

Evidence root: `docs/perf/admin-domain-control/`  
Operator labels: `lib/admin/operator-ux/operator-labels.ts`  
Ads CTA map: `lib/admin/domain-control/ads-operator-cta.ts`  
Finance ops map: `lib/admin/domain-control/finance-operator-ops.ts`

---

## 운영 (global)

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Cross-domain Action Center only — blockers that span domains |
| PRIMARY ENTITIES | Action queue items, system incidents |
| PRIMARY RISKS | Duplicate domain dashboards; hiding domain ownership |
| ACTIONABLE STATES | Unavailable sources, messenger/store/support blockers with count>0 |
| ADMIN AUTHORITY | Open exact domain queue; no domain mutation from here |
| READ-ONLY | Counts, deep links |
| MUTATIONS | None on this surface |
| MONEY | Indirect via Finance deeplinks |
| HISTORY | Via domain detail after jump |
| DASHBOARD | 지금 처리할 일 (global) · 도메인 상태 요약 · 최근 차단 |
| QUEUE | Action Center rows only |
| DETAIL | N/A — jump to owner domain |

---

## 배달

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Store intake, problem orders, catalog issues, operational stop |
| PRIMARY ENTITIES | Store, Order, Product |
| ACTIONABLE | Store pending approval, cancel/refund exception, stuck orders |
| ADMIN AUTHORITY | Approve/reject store; order intervention per existing APIs; product moderation |
| CONFIGURATION | Category/policy — secondary, not daily queue |
| MONEY | Settlement/fee context links only |
| DASHBOARD | 지금 처리할 일 · 문제 주문 · 입점 검토 · 문제 매장 |
| QUEUE | Orders / stores / products actionable-first |
| DETAIL | Order/store workspace with finance/ads/support context |

---

## 거래

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Reports, post moderation, hide/restore, delete policy |
| PRIMARY ENTITIES | Trade post, report, member |
| ACTIONABLE | Open reports, pending moderation |
| ADMIN AUTHORITY | Hide/restore; soft delete; hard delete only with typed DELETE + policy |
| DASHBOARD | 신고 · 처리 대기 · 숨김 · 삭제 상태 |
| DETAIL | Post + reporter + trade chat context |

---

## 커뮤니티

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Posts/comments reports, meeting reports, topics, promo/point **config** |
| ACTIONABLE | Open reports (one place only — no duplicate sections) |
| SEPARATION | Daily moderation vs configuration |
| DASHBOARD | 지금 처리할 신고 · KPI · 빠른 관리 · 설정 |

---

## 채팅

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | GENERAL / GROUP / TRADE / ORDER separately; reports; hide-list vs DB delete |
| IDENTITY | Participants + type — never UUID primary |
| ACTIONABLE | Reported rooms |
| CTA | 신고 검토; hide-list preference; hard delete with DELETE confirm |

---

## 재무

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Separate Point / Coin / Cash / Settlement / Fee / Refund |
| MUST SEPARATE | Coin→Cash (history, **no approve**) vs Coin 출금 (reject/mark_paid) vs Settlement (daily + store) vs Cash 충전 (approve/reject) vs Point 충전 (approve/reject/hold) vs Sale earn (read history) |
| NEVER MERGE | Balances across Point/Coin/Cash |
| DASHBOARD | 지금 처리할 요청 by money type · 통화별 KPI · 전문 큐 |
| DETAIL | Store statement / Point charge detail / Withdrawal panel |
| HISTORY | Human type labels; technical IDs collapsed |

---

## 광고 / 노출

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Full lifecycle: product · application · payment · creative · review · placement · schedule · execution · pause/resume · end · hide · delete policy · refund context · stats · audit |
| DOMAINS KEPT SEPARATE | Delivery / Feed / Popup / Trade promote (Partner ≠ AdProduct) |
| SSOT LIFECYCLE | `DeliveryAdLifecycleStatus` — UI translates only |
| PAYMENT | Delivery = Cash; Feed = Point; payment ≠ approval ≠ ACTIVE |
| CTA | Only `adminActionAllowed` actions; reason when required |
| HIDE | Not a lifecycle — list preference / non-exposure |
| DELETE | `delete_safe_draft` DRAFT+zero history only; else archive/end/terminate |
| DASHBOARD | 지금 처리할 광고 · 현재 집행 · 도메인별 · 문제 · 통계 |
| QUEUE | WHO/WHAT/WHERE/PAYMENT/PERIOD/REMAINING/EXPOSURE/CTA |
| DETAIL | Summary → state → action → payment → placement → period → preview → exposure → store → history → technical |

---

## 고객지원

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Member/Owner cases; reply ≠ resolve |
| CTA | 답변하기 · 계속 처리 · 처리 완료 |
| CONTEXT | Order/Ads/Finance/Store deeplinks |

---

## 알림

| Field | Contract |
|---|---|
| SEPARATION | Operational inbox vs notification **settings** |
| CTA | Open exact entity — no raw event key primary |

---

## 시스템

| Field | Contract |
|---|---|
| ADMIN RESPONSIBILITY | Staff, permissions, config, data mgmt, prelaunch reset, audit |
| DANGER | Reset clearly separated from normal ops |

---

## Implementation order

1 Ads · 2 Finance · 3 Delivery · 4 Trade · 5 Community · 6 Chat · 7 Support · 8 Notification · 9 Operation · 10 System
