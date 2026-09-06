# ADS-PRODUCT-CONTRACT

HEAD: 4d95ca8ac  
Invalidates: prior ADS OPERATOR READY PARTIAL PASS (domain-control-final)

## WHAT IS DIBAY ADVERTISING

| Domain | What | Who applies | Pays | Currency | Approves | Placement | Exposure | Duration | Overlap | Admin | Legacy |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery | Store sponsored / banner | Owner | Store | Cash | Admin | delivery inventory | discovery renderer | schedule | capacity | Delivery lifecycle | store-insertions redirected |
| Trade | Feed banner | Member/Admin | Member | Point | Admin | TRADE_HOME / CATEGORY | feed renderer | product duration | slot max 3 | Feed approve/end | ≠ Trade promote |
| Trade | 더 알리기 (post boost) | Member | Member | Point | Admin | feed_boost | trade list pin | 7/14d products | pin cap | promote approve/reject | post_ads legacy |
| Community | Feed banner | Member/Admin | Member | Point | Admin | COMMUNITY_* | feed renderer | product | slot max | Feed | — |
| Community | Post promote | Member | Member | Point | Admin | community_top_pin | community feed | 3/7d | pin cap | promote | — |
| Popup | Platform popup | Owner/Admin | Owner Cash | Cash | Admin | popup surfaces | popup renderer | schedule | surface policy | popup transition | — |
| Chat | — | — | — | — | — | — | — | — | — | — | **NOT SUPPORTED** |

## Object model (never collapse)

AD PRODUCT ≠ APPLICATION ≠ CREATIVE ≠ REVIEW ≠ PAYMENT ≠ PLACEMENT ≠ SCHEDULE ≠ EXECUTION ≠ ELIGIBILITY ≠ ACTUAL EXPOSURE ≠ HISTORY

ACTIVE ≠ actual exposure. Payment ≠ approval. Approval ≠ schedule.

## Product vs Placement

| Product (buy) | Placement (render) |
|---|---|
| 배달 매장 상위 노출 | 배달 > 홈 > 매장 목록 상단 (`STORES_HOME_FEED`) |
| 배달 홈 배너 | 배달 > 홈 > 상단 배너 (`STORES_HOME_HERO`) |
| 거래 피드 광고 | 거래 > 홈 > 피드 배너 |
| 거래 게시물 더 알리기 | 거래 > 피드 목록 상위 핀 |
| 커뮤니티 피드 광고 | 커뮤니티 > 홈/주제 > 피드 배너 |
| 커뮤니티 게시물 홍보 | 커뮤니티 > 피드 상단 핀 |
| 팝업 | 지원 도메인 > 진입 팝업 |

## Admin action matrix (canonical only)

| Action | Delivery | Feed | Popup | Promote |
|---|---|---|---|---|
| APPROVE | Y | Y | Y | Y |
| REQUEST_CHANGE | Y | via update pending | — | — |
| HOLD | pause (`PAUSED_ADMIN`) | pause (`paused`) | paused | — |
| REJECT | Y | Y | Y | Y |
| SCHEDULE | Y | via dates | Y | product duration |
| PAUSE | Y | Y (not renderer-eligible) | Y | — |
| RESUME | Y | Y | Y | — |
| HIDE / SANCTION | **UNSUPPORTED** — no fake pause/end label | **UNSUPPORTED** | **UNSUPPORTED** | — |
| END | Y | Y | Y | — |
| FORCE TERMINATE | Y (`TERMINATED`) | end | end | — |
| EXTEND PAID | Admin `/extend` + Cash + snapshot + audit | Member `renewFeedAdCampaign` Point only | **UNSUPPORTED** | **UNSUPPORTED** |
| EXTEND COMPENSATION | Admin `/extend` + reason + snapshot + audit | Admin `extend_compensation` | **UNSUPPORTED** | **UNSUPPORTED** |
| EXTEND FREE SILENT | **UNSUPPORTED** | **UNSUPPORTED** | **UNSUPPORTED** | — |
| EDIT creative | Y | Y | Y | — |
| REFUND | finance link | point reverse if exists | finance | — |
| HARD_DELETE | draft only | no | no | no |

**Delivery hide:** No 「숨김」 CTA. Verbs: 일시중지 / 재개 / 강제 종료 / 종료 only.

## HOME / CATEGORY boundary

- HOME/CATEGORY: organic composition + **paid slot allowance/density** only  
- Ads: application/payment/approval/execution  
- Cross-link only; no cross-mutation

## Creative specs (SSOT pointers)

- Popup: 1440×1000 WebP via creative-pipeline; source limit raised only with evidence  
- Feed: 1200×400 3:1, feed-ad-geometry  
- Delivery banner: per-inventory in delivery-ad-open-event-commercial  

## Operator IA

광고 관제 / 신청 관리 / 집행 관리 / 노출 위치 / 광고 형태 / 상품·가격 / 광고 이력  

No generic 「캠페인」 in primary UI. No Runtime:Y primary.
