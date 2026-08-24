# DIBAY STORES — HOME + CATEGORY PRODUCT RECOVERY CONTRACT

**STATUS:** OWNER SIGN-OFF — LOCKED (2026-08-24)  
**MODE:** Implementation authority — re-audit of this contract is FORBIDDEN unless Owner reopens.

## One-line goal

HOME = purpose-driven store shelves · CATEGORY = industry store lists · Admin = real CTA control for HOME shelves + CATEGORY primary/secondary exposure policy. Organic ranking/order NEVER changes.

## Owner corrections (LOCKED)

### 1. UNAVAILABLE shelves

칭찬 리뷰 많은 가게 / 줄 서는 맛집 / 타임세일(카운트다운):

- 가짜 metric/ranking 구현 **금지**
- Admin: 목록 표시 · status=UNAVAILABLE · CTA disabled · unavailable reason 표시
- Customer HOME: **노출 금지**

### 2. 배달팁 명칭

`deliveryFeeStrikePhp` ≠ 배달팁 0원 authority.

- zero-fee canonical authority 없으면 Owner/Admin/Customer 명칭 = **「배달팁 할인」**
- 실제 zero-fee authority 생기면 그때만 **「배달팁 0원」** 승격
- UI 목표로 데이터 의미 조작 **금지**

### 3. CATEGORY inheritance (APPROVED)

`sub=all` → primary policy · specific sub → secondary override → primary → platform default · field-level inherit.

## FINAL CLOSE (all required)

| Gate | Requirement |
|---|---|
| HOME | Admin save → reload → Production `/stores` |
| CATEGORY PRIMARY | Admin 1차 → Production `/stores/browse/{primary}` |
| CATEGORY SECONDARY | Admin 2차 override → Production `?sub={sub}` |
| ADMIN CTA | Sidebar menu — Direct URL only = FAIL |
| UI | A-VIS measured anatomy — not “Baemin feel” |
| COUPON/AD | Store card benefit — no separate text-box cards |
| ORGANIC | IDs/order preserved |
| Discovery | UNTOUCHED |

HOME only / CATEGORY only / Admin save only / local only → **NOT_CLOSED**

## ABSOLUTE KEEP

Discovery candidate/ranking/sort/pagination/sub-filter · composeStoresHomeFeed eligibility/metric · composition DB/CAS · W backend · paid-ad/coupon writer · checkout/redemption · taxonomy authority · CATEGORY organic IDs/order

## IMPLEMENTATION ORDER

1. Product SSOT + DB policy extensions
2. Admin IA (HOME 관리 / 카테고리 관리 / 광고·쿠폰 관리)
3. HOME shelf CMS + customer presentation + card coupon/ad
4. CATEGORY primary/secondary Admin + scoped insertion + card benefit
5. Production close evidence

## Visual authority

`docs/dibay-stores-baemin-visual-ssot-a-vis.md`
