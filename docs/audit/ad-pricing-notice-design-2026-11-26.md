# 유료 광고 전체 재감사 · 어드민 연동 · 개선 설계안 · 광고 요금 안내 시안 (2026-11-26 재작성)

> **Owner 지시 원문(2026-11-26, 재지시)**: 「1. 전체 광고를 확인해서, 정확히 해당 부분과 연동 부분을 확인 2. 해당 광고는 무조건 금액을 넣어야 하는 부분이다, 관리자가 임의로 하는 부분은 제외 3. 정확한 금액이 어드민-회원 간이 정확히 금액이 있어야 광고가 되는 부분이고 신청해서 적용 시점부터 적용되는 부분 4. … 금액은 어드민에 변경시 바로 적용 5. 변경하면 예전 부분은 같이 변경이 안되고 이전 부분으로 반영 … 7. 광고 하나하나 다시 감사하고 어드민과의 연동, 리스트 하나하나 시나리오별 정확히 확인해서 개선 설계안을 보고」 · 「이전의 광고 구매 이력 및 신청 대기 등은 테스트… 모두 삭제해도 상관없다」
>
> **이 문서가 대체하는 것**: 같은 파일의 1차 안(같은 날). 1차 안은 팝업·당김 후 광고·인트로를 확인 없이 뺐고, 「연동 확인」을 결제 창 읽기만 보고 판정했다 — **작업자 잘못**. 이번 판정은 아래 근거로만 한다.
>
> **근거 범위 (무엇으로 확인했나)**
> - 코드: 작업 트리(main `ab6c026` 과 광고 코드 동일)를 작업자가 직접 읽음 — 파일:줄 표기.
> - 운영 DB(`ckdosyydvgzqwpbwuhon`) 읽기 전용: 가격 표 값, **운영에 실제 깔린 DB 함수 정의**(`pg_get_functiondef`), 데이터 건수.
> - **실행 시험은 하지 않았다** — 운영에 시험 결제·가격 변경을 하면 운영 DB 쓰기다. 그래서 아래 판정은 「코드 + 운영 함수 정의」 판정이고, 실행 PASS 는 구현 뒤 §8 시험으로 받는다.

---

## 1. 광고 전체 목록 — 돈을 받는 것 / 운영자 전용

신청·결제 API 를 전부 찾아(`app/api/me/**`, `app/api/ads/**`) 돈이 빠지는 경로만 「유료」로 분류했다.

### 1-1. 유료 광고 (요금 안내에 반드시 금액이 있어야 하는 것)

| # | 광고 | 누가 | 결제 | 신청 API | 가격 표(운영 DB) | 어드민 가격 화면 | 지금 판매 |
|---|---|---|---|---|---|---|---|
| M1 | 거래 상위노출 | 회원 | 포인트 | `POST /api/me/points/promotion-orders` | `member_promotion_products` trade_promote_7·14 | `/admin/trade-ad-policies` | 판매 중 |
| M2 | 커뮤니티 상위노출 | 회원 | 포인트 | 같음 | 〃 community_promote_3·7 | 같음 | 판매 중 |
| M3 | 거래 배너 | 회원 | 포인트(보류→승인 때 확정) | `POST /api/me/feed-ad-requests` · 연장 `POST /api/me/feed-ad-campaigns/[id]/renew` | `feed_ad_products` feed_banner_trade_3·7 | `/admin/feed-ad-products` | 판매 중 |
| M4 | 커뮤니티 배너 | 회원 | 같음 | 같음 | 〃 feed_banner_community_3·7 | 같음 | 판매 중 |
| O1 | 배달 홈 상단 배너 | 매장 | 비즈 캐시(₱) | `POST …/delivery-ads/banner` → `…/[campaignId]/actions` submit | `delivery_ad_packages` STORES_HOME_HERO 7·15·30 | `/admin/delivery-ads/commercial-settings` | 판매 중 |
| O2 | 매장 홍보(배달 홈 목록) | 매장 | 비즈 캐시 | `POST …/delivery-ads` → actions submit | 〃 STORES_HOME_FEED 7·15·30 | 같음 | 판매 중 |
| O3 | 매장 홍보(업종 목록) | 매장 | 비즈 캐시 | 같음 | 〃 STORES_CATEGORY_FEED 7·15·30 | 같음 | 판매 중 |
| O4 | 광고 파트너(광고 할인 15%) | 매장 | 비즈 캐시 | `POST /api/me/delivery-ads/partner` op=apply | `delivery_ad_partner_config` 월 ₱120 | 같은 화면 파트너 설정 | 판매 중 |
| O5 | 배달 검색 상단 배너 | 매장 | 비즈 캐시 | — | 〃 STORES_SEARCH_TOP (3개 모두 꺼짐) | 같음 | **판매 안 함** — 사장님 API 가 코드로 제외(`app/api/me/delivery-ads/commercial/route.ts:62`, 계약 `delivery-ad-commercial-contract.ts:45-48`) |
| O6 | 매장 전역 팝업 | 매장 | 비즈 캐시 | `POST /api/me/platform-popup-requests` | `platform_popup_ad_packages` POPUP_7D ₱5,000/7일 (꺼짐) | **없음** | **판매 안 함** — 코드 상수 `OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED = false` (`lib/platform-popup/owner-popup-new-sales-gate.ts:16`), 신청 403 (`app/api/me/platform-popup-requests/route.ts:40-50`) |
| L1 | 옛 필라이프 상단고정·중간삽입·강조 | 회원 | 포인트 | `POST /api/ads/apply` | `ad_products` 7건 모두 꺼짐 | — | **판매 안 함** — 운영 7건의 종류가 top_fixed·mid_insert·highlight 뿐이고 셋 다 포인트 차감 **전** 410 (`app/api/ads/apply/route.ts:52-61`, `lib/ads/post-ads-authority.ts:40-47`) |
| L2 | 옛 거래 상세 광고 | 회원 | — | 회원 쓰기 API 없음 | `trade_post_ads` | — | **판매 안 함** |

포인트 환산: 계좌이체 충전 `point_plans` = 1,000P ↔ ₱1,000 (1P = ₱1). iPhone 은 Apple 결제로 충전하므로 ₱ 환산을 안내하지 않는다 → **회원 표는 포인트로만** 적는다.

### 1-2. 운영자 직접 등록 (돈을 받지 않음 · 요금 안내에서 제외 — Owner 지시 2번)

| 광고 | 판매 경로 | 근거 |
|---|---|---|
| 전역 팝업(운영자) | 없음 | `ads-canonical-product-ssot.ts:82-92` actor admin_direct · sellable false |
| 당김 후 광고(PTR 띠) | 없음 — 신청 API·가격 칸 0 | `lib/platform-popup/ptr-reveal-contract.ts` · `/admin/ptr-reveal-ads` |
| 인트로 | 없음 — 소재 묶음(광고·이벤트·안내) 운영자 등록, 가격 칸 0 | `lib/launch-intro/pool.ts` · `/admin/platform-promotion/intro` |
| 이벤트 히어로 배너 | 없음 | `lib/platform-promotion-distribution` |
| 마이 배너 | 없음 | `my_page_banners` · `/admin/banners` |
| 배달 홈 중간·업종 상단 배너 | 운영자 자체 배너만(가격 없음) | `lib/stores/advertising/admin-first-party-banner-inventory.ts:9-10` |

> 참고(결함 아님 · 정책 확인): 사장님 「이벤트 프로모션」 무료 신청에 「팝업 희망」 체크가 있다(`lib/.../event-promotion` 신청 채널). 승인해도 팝업이 자동으로 생기지 않는다 — 돈을 받지 않으므로 요금 안내 대상 아님.

---

## 2. 시나리오 정의 (모든 유료 광고에 같은 잣대)

| # | 시나리오 | 합격 조건 (Owner 지시 번호) |
|---|---|---|
| S1 | 금액 존재 | 판매 중인 모든 기간에 금액이 있고, 어드민 화면 값 = DB 값 = 회원·사장님 화면 값 (2·3) |
| S2 | 어드민 변경 즉시 반영 | 저장 직후 다음 화면 열기부터 새 금액 (캐시 없음) (4) |
| S3 | 열린 화면에서 변경 | 화면을 연 뒤 어드민이 바꾸면, 신청 버튼에서 **본 금액과 다르면 결제하지 않고** 새 금액 안내 (3) |
| S4 | 신청 시점 고정 | 신청(결제) 순간 금액·기간이 기록되고, 노출 시작~종료가 그 기록으로 계산 (3) |
| S5 | 과거 건 불변 | 어드민 변경이 이미 신청·진행 중인 건의 금액·기간·기록을 바꾸지 않음 (5) |
| S6 | 연장 | 연장 금액·기간 = 연장 순간 값 + 본 값 대조, 처음 신청 기록은 그대로 (3·5) |
| S7 | 판매 중지 | 끄면 새 신청 불가, 진행 중은 유지 (4) |
| S8 | 이름·기간 일치 | 기간을 바꿔도 화면의 상품 이름·문구가 새 기간과 맞음 (4) |
| S9 | 환급 | 반려·취소·운영 종료 환급이 **실제로 낸 금액** 기준 (5) |
| S10 | 자리 | 돈을 받으면 반드시 노출 자리가 있음 (3) |
| S11 | 어드민 저장 안전 | 동시 저장 덮어쓰기 막음 · 변경 이력 · 오타 방지 (4) |

---

## 3. 광고별 시나리오 결과

판정: **PASS**(코드·운영 함수로 확인) · **FAIL**(결함) · 실행 시험은 §8.

### M1 거래 상위노출 · M2 커뮤니티 상위노출

| # | 판정 | 근거 |
|---|---|---|
| S1 | PASS | 운영 DB: trade 7일 500P · 14일 900P · community 3일 10,000P · 7일 20,000P. 앱은 `GET /api/me/points/promotion-orders?catalog=1`(`route.ts:42`, `force-dynamic` :33) → `loadMemberPromotionProducts`(`lib/points/member-promotion-products-server.ts:62-85`) — 금액·기간·사용 여부는 DB 값(`:42-59`) |
| S2 | PASS | 서버 캐시 없음(`force-dynamic`), 화면 fetch `cache:"no-store"`(`TradeAdQuickSheet.tsx:94`) |
| S3 | PASS (보완 1건) | 결제 화면 4곳(거래 광고 창·커뮤니티 창·`/mypage/points/promotions`·`/mypage/ads/apply`) 모두 본 금액·기간 전송 → `memberPromotionPriceMatches` 409 `price_changed`(`route.ts:226-233`). 운영 함수 `purchase_member_content_promotion_v2`·`purchase_member_community_promotion` 이 가격 행을 `FOR SHARE` 로 잠그고 다시 대조. **보완**: 본 금액을 안 보내면 서버가 대조를 건너뜀(`member-promotion-products-server.ts:98-108` 「보내지 않았으면 확인하지 않는다」) |
| S4 | PASS | 주문에 `duration_days`·`point_cost`·`start_at=now()`·`end_at=start+기간` 기록(운영 함수 `purchase_member_community_promotion` 새 주문 INSERT) |
| S5 | PASS | 운영 `admin_update_member_promotion_product` 는 가격 행만 UPDATE, 주문 표를 건드리지 않음 |
| S6 | FAIL(낮음) | 광고 중 재결제 = 같은 주문 연장(`end_at += 기간`, `point_cost += 금액`) · 대조 있음. **그러나 주문의 `point_cost`·`duration_days` 가 합계로 바뀌어 「처음 결제 금액」 이 주문 행에서 사라짐**(원장에는 남음). 다른 기간 상품으로 연장해도 주문 `product_id` 는 처음 것 |
| S7 | PASS | 꺼진 상품: 앱 목록 제외 · 서버 400 `invalid_product`(`route.ts:186-188`) · 운영 함수도 `is_active` 확인 |
| S8 | **FAIL(높음)** | 상품 이름이 코드 고정 문구 「7일 거래 상위노출」「14일 거래 상위노출」「커뮤니티 3일 상위 노출」「커뮤니티 7일 상위 노출」(`lib/points/promotion-products.ts:54,73,92,112`). 회원 화면 `MemberPostPromoteSheet.tsx:395-396`·`PointPromotionOrderForm.tsx:169`, 어드민 `AdminMemberPromotionProductsPage.tsx:102`·`AdminUserPointsSection.tsx:422,526`·`AdminPointLedgerPage.tsx:138` 이 그대로 보여 줌. 어드민이 기간을 바꾸면(어드민은 기간 변경 가능 — 운영 함수 `p_duration_days`) **이름은 옛 기간, 결제는 새 기간** |
| S9 | PASS | 운영 `admin_promotion_end` 환급 = 원장 실제 결제 합계(spend+promotion_extend) × 남은 비율 |
| S10 | PASS(규칙) | 위쪽 1자리는 최근 결제 순, 나머지는 일반 자리에 「광고」/「포인트 노출」 표시(계약 `dibay-promotion-advertisement-product-contract.md` §7b) — 결제하면 표시는 항상 붙음 |
| S11 | PASS (보완 1건) | revision 409·이력 표 `member_promotion_product_changes`·사유 2자 이상(운영 함수). **보완**: 금액 상한 없음(오타 0 하나 더 = 그대로 저장) |
| 기타 | FAIL(낮음) | 커뮤니티 주문은 가격 버전(`product_revision`)을 기록하지 않음(거래는 기록 — 운영 v2 함수 끝부분). 원장 설명이 한국어 고정(「커뮤니티 게시물 상위 노출 (N일)」) |

### M3 거래 배너 · M4 커뮤니티 배너

| # | 판정 | 근거 |
|---|---|---|
| S1 | PASS | 운영 DB: trade 3일 8,000P · 7일 15,000P · community 3일 10,000P · 7일 20,000P. 신청 화면 `app/(main)/mypage/ads/feed-request/page.tsx:141` → `GET /api/me/feed-ad-requests` catalog(DB) · 금액·기간은 DB 값 사용 |
| S2 | PASS (보완) | `force-dynamic`(`route.ts:30`), Next 는 동적 응답을 서버에 저장하지 않음(`next/dist/build/templates/app-route.js` 비 ISR 분기). **보완**: 목록 응답·화면 fetch 에 `no-store` 명시 없음(`page.tsx:141`) |
| S3 | **FAIL(높음)** | 신청 POST 가 본 금액을 받지도 대조하지도 않음 — 그 순간 DB 금액으로 보류(`app/api/me/feed-ad-requests/route.ts:296, 489-490, 544-548`). 회원이 화면을 연 뒤 어드민이 올리면 **본 적 없는 금액이 묶임** |
| S4 | PASS | 신청서에 `duration_days`·`point_cost` 기록(`route.ts:489-490`), 승인 때 그 기록으로 종료일 계산(`lib/ads/approve-feed-ad-request.ts:148-149`) — 노출은 **승인 시점부터** |
| S5 | PASS | 어드민 저장은 상품 행만(`lib/ads/feed-ad-products.ts:112-160`) |
| S6 | **FAIL(중)** | 운영 `member_feed_ad_renew`: ① 금액만 대조, **기간은 대조 안 함** ② 연장하면 신청서의 `duration_days`·`point_cost`·`product_id` 를 **연장 값으로 덮어씀** → 처음 신청 기록이 사라짐(Owner 지시 5 위반). 환급은 원장 기준이라 금액 손해는 없음 |
| S7 | PASS | 꺼진 상품 `product_not_found`(`feed-ad-products.ts:95`), 연장도 `is_active` 확인 |
| S8 | **FAIL(중)** | 상품 제목 `title_ko/en`(DB 「거래 피드 광고 3일」)이 연장 창에 그대로(`MyAdsPageClient.tsx:861`), 어드민 화면엔 제목 입력칸이 없어 기간을 바꾸면 고칠 수 없음 |
| S9 | PASS | 반려 = 보류 해제, 운영 종료 = 원장 실제 결제 × 남은 비율(운영 `admin_feed_ad_end`) |
| S10 | FAIL(중) | 자리 위치당 3. 「검토 중」 은 자리를 안 차지 → 자리보다 많은 신청이 포인트를 묶은 채 대기 가능(`approve-feed-ad-request.ts:153-164` 가득 차면 승인 안 하고 보류 유지). **검토 중 신청을 자동으로 끝내는 작업이 없음**(cron 목록에 피드 광고 없음 — `app/api/cron`) |
| S11 | PASS (보완) | `expectedUpdatedAt` 409(`feed-ad-products.ts:143-153`)·사유·감사 기록. 보완: 금액 상한 없음 · 상품 추가 화면 없음(새 기간은 DB 직접) |

### O1 배달 홈 상단 배너 · O2·O3 매장 홍보

| # | 판정 | 근거 |
|---|---|---|
| S1 | PASS (표기 결함은 S8) | 운영 DB(₱): 상단 배너 7일 350·15일 650·30일 1,100 / 홈 목록 120·220·390 / 업종 목록 100·180·320. 사장님 화면 → `GET /api/me/delivery-ads/commercial`(`force-dynamic` :21) → `loadDeliveryAdCommercialCatalog`(DB) |
| S2 | PASS | 서버 캐시 없음 |
| S3 | PASS | 서버 견적(`calculateDeliveryAdCommercialQuote` `delivery-ad-commercial-contract.ts:252-340`) + 화면 금액과 다르면 `quote_stale`(`owner-delivery-ad-commercial-bind.ts` 「client_payable_mismatch」) |
| S4 | PASS | 제출 때 금액 기록(스냅샷) → 운영 `business_cash_delivery_ad_spend` 가 **그 기록 금액**(`final_payable_minor`)으로 차감, 운영 `admin_delivery_ad_transition` 승인 때 `start=max(지금, 희망 시작)`, `end=start+기록 기간` |
| S5 | PASS | 어드민 저장은 패키지 행만(`delivery-ad-commercial-admin-writer.ts:115-119`), 스냅샷을 고치는 코드 없음 |
| S6 | 해당 없음 | 사장님 연장 없음(운영 `delivery_ad_extension_policy.extension_enabled=false`) |
| S7 | PASS | 패키지 끔·지면 판매 끔·상품 신청 받기 끔 → 견적 거부 |
| S8 | **FAIL(중)** | DB 이름이 영어 「7 days」「Banner」「Store sponsored」. 배너 확인 화면(`OwnerBannerCreateView.tsx:633`, 없으면 코드 안 한국어 `${days}일` — i18n 규정 위반)·광고 상세(`OwnerDeliveryAdDetailView.tsx:578`)·매장 홍보 상품명(`OwnerStoreSponsoredCreateView.tsx:322,696`)에 **번역 없이** 그대로. 판매 준비 카드 7·15·30 고정(`components/stores/advertising/DeliveryAdOwnerPackageCardGrid.tsx:44`) |
| S9 | PASS | 반려 환급 = 확보 금액, 운영 종료 `admin_delivery_ad_end_with_refund` = 실제 결제 × 남은 비율 |
| S10 | **FAIL(높음)** — O2·O3 | 매장 홍보는 판매 때 자리 검사가 없고, 화면은 정책 최대(홈 기본 5 — `stores-composition-insertion-live.ts:260-267`)만 끼움(`:176` `capItems`). 고르는 순서 = **종료일 빠른 순**(`store-paid-ad-campaign-authority.ts:67-78`) → 초과분은 돌아가며 나오지도 않고 **돈을 내고 0회 노출** 가능. O1 상단 배너는 제출 때 기간 겹침 자리 검사 있음(`owner-banner-writer.ts:542-556`) |
| S11 | **FAIL(중)** | 패키지 저장에 동시 저장 보호 없음(마지막 저장이 이김 `writer:115-119`) · 금액 상한 없음 · 어드민 「판매 가능」 체크가 검색 상단(O5)에는 효과 없음 |
| 제출 실패 | **FAIL(높음)** | 금액 기록(스냅샷)이 **차감 함수 밖에서 먼저** 저장된다(`actions/route.ts:170-186` → 그 뒤 차감 RPC). 캐시 부족·자리 없음으로 제출이 실패해도 기록이 남고, 지우는 코드가 없다. 그 뒤 어드민이 금액을 바꾸거나 사장님이 다른 기간을 고르면 `existing_snapshot_mismatch` → `quote_stale` 이 **영원히** 나서 그 신청은 제출 불가(`owner-delivery-ad-commercial-bind.ts:154-189`) |

### O4 광고 파트너 (월 ₱120 · 광고 할인 15%)

| # | 판정 | 근거 |
|---|---|---|
| S1 | PASS | 운영 `delivery_ad_partner_config`: 켜짐 · 월 ₱120 · 할인 15% · 새 가입 받음 |
| S3 | **FAIL(중)** | 가입 POST 가 본 금액을 받지 않음 — 운영 `owner_apply_partner_membership` 이 그 순간 설정값으로 차감 |
| S4 | **FAIL(중)** | 신청 때 고정되는 것은 회비뿐(`fee_snapshot_minor`). **할인율은 신청 때 0 으로 저장되고 승인 때의 설정값**으로 정해지며(운영 `admin_partner_membership_decide` 56행), **기간도 승인하는 운영자가 1~366일 중 입력**(46~47행, 기본 30) → 사장님이 낸 「월 회비」 와 받는 기간·할인이 신청 시점과 다를 수 있음 |
| S9 | PASS | 반려 환급 기록 있음(운영 데이터 partner REFUNDED 1건) |

### O5 배달 검색 상단 · O6 매장 팝업 · L1·L2 옛 경로

| 광고 | 판정 | 내용 |
|---|---|---|
| O5 | 판매 안 함(정상) + 어드민 표기 FAIL | 사장님 쪽 코드 제외라 어드민 「판매 가능」 체크가 아무 효과 없음(오해 유발) |
| O6 | 판매 안 함(정상) + 재개 시 FAIL | 가격·기간을 고칠 어드민 화면·API 가 **없음**(저장소 전체에 `platform_popup_ad_packages` 쓰기 코드 0). 마이그레이션 주석 「어드민 상업 설정에서 다시 켤 수 있다」(`20271103220000…sql:7`)는 사실과 다름. 신청 거절 문구가 한국어 고정 + 개발 용어 「Owner Popup」(`route.ts:47`) |
| L1 | 판매 안 함(정상) | 운영 7건 모두 닫힌 종류 → 차감 전 410 |
| L2 | 판매 안 함(정상) | 회원 쓰기 API 없음 · DB 회원 INSERT 정책 제거 |

### 공통

| 판정 | 내용 |
|---|---|
| FAIL(중) | 회원 iPhone: 포인트는 Apple 결제 충전이라 ₱ 환산이 다름 → 요금 안내에 ₱ 를 같이 쓰면 틀린 안내가 됨(§1-1 결정: 포인트만) |
| 참고 | 매장 광고 결제는 iPhone 앱에서 서버·화면 모두 막힘(`blockIosAppDigitalPurchase` — actions·partner·business-cash 라우트, 문구 `owner_ios_cash_purchase_unavailable`). 사장님 광고 화면은 iPhone 에서도 금액은 보여 줌 — 요금 안내도 같은 방식 |

---

## 4. 결함 모음 (우선순위)

| 등급 | # | 광고 | 결함 | Owner 지시 |
|---|---|---|---|---|
| P0 | D-01 | M3·M4 | 배너 신청이 본 금액을 대조하지 않음 | 3 |
| P0 | D-02 | O1~O3 | 실패한 제출의 금액 기록이 남아 그 신청이 영구 제출 불가 | 3 |
| P0 | D-03 | O2·O3 | 매장 홍보 자리 검사 없이 판매 → 돈 내고 0회 노출 가능 | 3 |
| P0 | D-04 | M1·M2 | 상품 이름에 기간 고정 → 기간 바꾸면 이름·결제 불일치 | 4 |
| P1 | D-05 | M3·M4 | 배너 연장이 기간을 대조하지 않음 | 3 |
| P1 | D-06 | M3·M4 | 배너 연장이 처음 신청 기록(금액·기간·상품)을 덮어씀 | 5 |
| P1 | D-07 | M1·M2 | 상위노출 연장이 주문 금액·기간을 합계로 바꿈(처음 결제 기록 사라짐) | 5 |
| P1 | D-08 | M3·M4 | 배너 제목(DB)에 기간 고정 · 어드민에서 못 고침 | 4 |
| P1 | D-09 | O1~O3 | 매장 상품·기간 이름이 DB 영어 원문 그대로 | 1·4 |
| P1 | D-10 | O4 | 파트너: 본 금액 대조 없음 · 할인율·기간이 승인 때 정해짐 | 3·5 |
| P1 | D-11 | O1~O3 | 매장 가격 저장 동시 덮어쓰기 · 상한 없음 | 4 |
| P1 | D-12 | M3·M4 | 검토 중 신청이 포인트를 무기한 묶음 | 3 |
| P2 | D-13 | M1~M4·O1~O3 | 금액 오타 방지(상한·확인창의 이전→새 금액) 없음 | 4 |
| P2 | D-14 | M2 | 커뮤니티 주문 가격 버전 미기록 | 5 |
| P2 | D-15 | M1·M2 | 본 금액을 안 보내면 서버 대조 생략(지금 화면은 모두 보냄) | 3 |
| P2 | D-16 | O5 | 어드민 「판매 가능」 체크 효과 없음 | 4 |
| P2 | D-17 | O6 | 팝업 가격 어드민 화면 없음 · 주석 사실과 다름 · 문구 규정 위반 | 2 |
| P2 | D-18 | 전체 | 가격 목록 응답에 `no-store` 명시 없음 | 4 |

---

## 5. 개선 설계 (결함별 · 바뀌는 곳 · 영향)

| # | 수정 | 바뀌는 파일·DB | 영향받는 곳 | DB 변경 |
|---|---|---|---|---|
| D-01 | 신청 POST 에 `expectedPointCost`·`expectedDurationDays` 필수, 다르면 409 `price_changed`(새 값 포함). 신청 화면·거래 광고 창이 보낸 값 전송, 409 면 목록 새로 읽고 「금액이 바뀌었어요」 | `app/api/me/feed-ad-requests/route.ts` · `feed-request/page.tsx` · `TradeAdQuickSheet.tsx` | 배너 신청 2곳 | 없음 |
| D-02 | 금액 기록 저장을 **차감 함수 안으로** 옮김(기록 INSERT + 차감 + 상태 전이 = 한 트랜잭션). 이미 남은 「차감 안 된 기록」은 제출 때 새 견적으로 교체 | `owner_submit_delivery_ad_with_business_cash`(새 인자: 패키지·금액) · `actions/route.ts` · `owner-delivery-ad-commercial-bind.ts` | 사장님 배너·홍보 제출 | **있음**(함수 교체) |
| D-03 | 매장 홍보도 제출 때 자리 검사: 같은 지면·기간이 겹치는 「승인·심사 중」 수 ≥ 정책 최대면 `capacity_full`(배너와 같은 방식). 사장님 화면에 「남은 자리」 와 전용 문구 | `owner_submit…`/트랜잭션 안 검사 · `capacity-gate.ts` · `OwnerStoreSponsoredCreateView.tsx` | 매장 홍보 제출 | **있음** |
| D-04 | 상품 이름을 `durationDays` 로 만든다: i18n 키 `promo_product_trade_title {days}`·`promo_product_community_title {days}` · `fallbackTitle*` 사용 6곳 교체 | `promotion-products.ts` · 위 6개 화면 · 카탈로그 | 회원 결제 창·어드민 | 없음 |
| D-05 | `member_feed_ad_renew` 에 `p_expected_days` 추가, 다르면 `price_changed` | DB 함수 · `renew` 라우트 · `MyAdsPageClient.tsx` | 배너 연장 | **있음** |
| D-06 | 연장마다 새 기록 표 `feed_ad_request_renewals`(연장 금액·기간·상품·시각) 에 쌓고, 신청서 행은 처음 값 유지(종료일만 갱신) | DB 표·함수 · 내 광고 화면 「연장 내역」 | 배너 연장·내역 | **있음** |
| D-07 | 상위노출 연장도 `point_promotion_order_extensions` 에 쌓고, 주문 행은 처음 금액·기간 유지(종료일만 갱신). 환급은 지금처럼 원장 합계 | DB 표·두 결제 함수 · 어드민 상세 | 상위노출 연장·어드민 | **있음** |
| D-08 | 배너 이름도 `durationDays` 로 만들고 `title_ko/en` 화면 사용 중단 | `MyAdsPageClient.tsx:861` · 어드민 목록 | 연장 창·어드민 | 없음 |
| D-09 | 매장 상품·기간 이름을 i18n 키로(`owner_ads_period_duration_days {days}`, 상품 키) — DB `display_name` 화면 사용 중단 · 판매 준비 카드 7·15·30 고정 제거(카드 없이 「판매 준비 중」 한 줄) | 사장님 배너·홍보·상세 화면 · `DeliveryAdOwnerPackageCardGrid.tsx` | 사장님 광고 화면 | 없음 |
| D-10 | 가입 POST 에 본 회비 전송·대조 · 신청 때 할인율·기간(30일 고정) 함께 기록, 승인 때 그 기록 사용 | `owner_apply_partner_membership`·`admin_partner_membership_decide` · 파트너 화면 | 파트너 가입·승인 | **있음** |
| D-11 | 패키지 저장에 `expectedUpdatedAt` 409(배너 상품과 같은 방식) · 저장 실패 시 부분 저장 안내 | `delivery-ad-commercial-admin-writer.ts` · 어드민 화면 | 어드민 매장 가격 | 없음 |
| D-12 | 검토 중 7일 지나면 자동 반려 + 보류 해제(하루 1회 작업), 회원에게 알림 | 새 cron 1개 · `vercel.json` | 배너 신청 | 없음(기존 반려 함수 사용) |
| D-13 | 모든 가격 저장 확인창에 「이전 → 새 금액(배수)」 · 3배 이상 바뀌면 다시 확인 · 상한(포인트 1,000,000P · ₱100,000) | 어드민 가격 화면 3곳 · 각 저장 함수 | 어드민 | 상위노출만 함수 검사 추가 |
| D-14 | 커뮤니티 결제 함수가 `product_revision` 기록 | DB 함수 | — | **있음** |
| D-15 | 본 금액 누락 시 400 | `promotion-orders/route.ts` | 옛 화면 없음(4곳 모두 전송 확인) | 없음 |
| D-16 | 검색 상단 「판매 가능」 체크를 「판매 미지원」 표시로 바꾸고 잠금 | 어드민 화면 | 어드민 | 없음 |
| D-17 | 팝업은 **판매 안 함 유지**(요금 안내에 넣지 않음). 다시 팔려면 가격 화면부터 만든다는 메모를 계약 문서에 기록 · 주석 정정 · 거절 문구 키로 | 문서·주석·`route.ts` | — | 없음 |
| D-18 | 가격 목록 응답 3곳 + 요금 안내 응답에 `Cache-Control: private, no-store` · 화면 fetch `no-store` | 라우트 3개 · 신청 화면 | — | 없음 |

---

## 6. 금액 권장안 (기간 기준)

### 6-1. 지금 금액의 하루당 값 (운영 DB)

| 광고 | 기간·금액 | 하루당 | 7일 대비 |
|---|---|---|---|
| 거래 상위노출 | 7일 500P · 14일 900P | 71 · 64 | 1.00 · 0.90 |
| 커뮤니티 상위노출 | 3일 10,000P · 7일 20,000P | 3,333 · 2,857 | 1.17 · 1.00 |
| 거래 배너 | 3일 8,000P · 7일 15,000P | 2,667 · 2,143 | 1.24 · 1.00 |
| 커뮤니티 배너 | 3일 10,000P · 7일 20,000P | 3,333 · 2,857 | 1.17 · 1.00 |
| 배달 홈 상단 배너 | 7·15·30일 ₱350·650·1,100 | 50 · 43 · 37 | 1.00 · 0.87 · 0.73 |
| 매장 홍보(홈) | ₱120·220·390 | 17 · 15 · 13 | 1.00 · 0.86 · 0.76 |
| 매장 홍보(업종) | ₱100·180·320 | 14 · 12 · 11 | 1.00 · 0.84 · 0.75 |

**문제(증거)**
1. 같은 「상위노출」 인데 커뮤니티가 거래의 **하루당 47배**(3,333 vs 71).
2. 회원 배너가 매장 상단 배너(앱 첫 화면급 자리)의 **하루당 43~67배**.
3. 회원 금액은 옛 상품표 값과 숫자가 같다: 커뮤니티 상위노출 10,000·20,000 = 옛 「필라이프 상단고정 3일·7일」 10,000·20,000, 거래 배너 8,000·15,000 = 옛 「거래 리스트 상단 광고 3일」 8,000 · 「거래 프리미엄 광고 7일」 15,000(`ad_products`, 모두 꺼짐). 옛 값을 옮긴 것으로 보인다(옮긴 의도는 기록에 없음).
4. 매장 쪽은 기간이 길수록 하루당 0.86·0.75 로 일정한 할인 구조가 이미 있다 → 이것을 기준선으로 쓴다.

### 6-2. 권장 규칙

- **R1 같은 자리 = 같은 값**: 거래·커뮤니티 같은 종류는 같은 금액.
- **R2 기간 할인 = 매장 구조와 동일**: 3일 = 7일 하루값 × 1.15, 14·15일 = × 0.86~0.90, 30일 = × 0.75.
- **R3 자리 등급**: 배너(위치당 3자리, 승인 후) = 상위노출(1자리, 뒤 결제에 밀림) 하루값의 **3배** — 매장의 상단 배너 : 목록 홍보 = 50 : 17 ≈ 3배와 같은 비율.
- **R4 기준값**: 거래 상위노출 7일 500P 는 계약 문서가 정한 값(`dibay-promotion-advertisement-product-contract.md` §3) → 유지하고 나머지를 맞춘다.

### 6-3. 권장 금액표

| 광고 | 3일 | 7일 | 14일 | 바뀌는 것 |
|---|---|---|---|---|
| 거래 상위노출 | **250P (신규)** | 500P (유지) | 900P (유지) | 3일 상품 추가 |
| 커뮤니티 상위노출 | **250P** (10,000→) | **500P** (20,000→) | **900P (신규)** | 금액 인하 · 14일 추가 |
| 거래 배너 | **750P** (8,000→) | **1,500P** (15,000→) | **2,700P (신규)** | 인하 · 14일 추가 |
| 커뮤니티 배너 | **750P** (10,000→) | **1,500P** (20,000→) | **2,700P (신규)** | 인하 · 14일 추가 |
| 배달 홈 상단 배너 | — | ₱350 | 15일 ₱650 · 30일 ₱1,100 | 유지 |
| 매장 홍보(홈) | — | ₱120 | 15일 ₱220 · 30일 ₱390 | 유지 |
| 매장 홍보(업종) | — | ₱100 | 15일 ₱180 · 30일 ₱320 | 유지 |
| 광고 파트너 | — | — | 30일 ₱120 (할인 15%) | 유지(기간 30일 고정 — D-10) |

- 기간 묶음 통일: 회원 = 3·7·14일, 매장 = 7·15·30일.
- 「신규」 기간은 상품 행 추가가 필요하다: 상위노출은 코드 처음 값 목록(`promotion-products.ts`)에 id 추가 + DB 행 추가, 배너는 DB 행 추가(어드민에 상품 추가 화면 없음 — §3 M3·M4 S11).
- 금액 변경은 어드민 화면에서 사유와 함께 저장(이력 남음) — 운영 설정 저장이므로 Owner 승인 후 작업자가 시작 revision 으로 저장하고 열 단위 대조 보고.

---

## 7. 광고 요금 안내 — 화면 설계 (게시물 시안: `docs/audit/ad-pricing-notice-mockup-2026-11-26.html`)

**게시물(공지 글)로 쓰지 않는 이유(증거)**: 공지 본문은 표를 지원하지 않고(`lib/notices/customer-center-safe-markdown.ts` 지원 형식: 제목·굵게·기울임·목록·인용·링크·사진), 글에 쓴 금액은 어드민 금액과 연결되지 않는다(Owner 지시 4 위반).

**설계: 공지 게시판에 고정 게시물 카드 1개 → 누르면 「광고 요금 안내」 게시물 화면(자동 표)**
- 위치: 내정보 › 고객센터 › 공지사항(`/mypage/customer-center/notice`) 목록 맨 위 고정. 게시물 화면 경로 `/mypage/customer-center/notice/ad-pricing`(공지 글 상세와 같은 머리·글꼴).
- 금액: 화면을 열 때마다 서버가 **결제 창과 같은 함수**로 읽는다 — `loadMemberPromotionProducts` · `listActiveFeedAdProducts` · 사장님 견적 목록과 같은 거르기(사장님 API 의 거르기 조건을 공용 함수로 빼서 두 곳이 같이 씀). 응답 `no-store`. 어드민 저장 → 다음 열기부터 새 금액(지시 4).
- 판매 중인 것만 줄로 나온다(꺼진 상품·O5·O6·L1·L2 자동 제외 — 지시 2).
- 탭 2개: **회원 광고**(포인트) / **매장 광고**(₱ · 비즈 캐시). 매장 사장님은 매장 탭이 먼저.
- 표 칸: 광고 · 나오는 곳 · 기간 · 금액 · 시작. 「시작」 = 상위노출 「결제 즉시」, 배너 「승인 후」, 매장 「승인 후(희망 시작일부터)」(지시 3).
- 표 아래 고정 안내 2줄(키 문구): ① 「금액은 신청(결제)할 때 금액으로 확정됩니다. 이후 금액이 바뀌어도 진행 중인 광고는 바뀌지 않습니다.」(지시 5) ② 매장 탭 iPhone: 기존 문구 `owner_ios_cash_purchase_unavailable`.
- 버튼: **광고 문의하기** → 고객센터 창을 열고 유형 자동 선택(회원 탭 → `AD` 「광고」, 매장 탭 → 매장 있음 `DELIVERY_AD` 「배달 광고」 / 매장 없음 `STORE_PARTNERSHIP` 「입점 문의」). 기존 `navigateToSupportCenter(context)`.
- 기준 시각: 「11월 26일 18:00 기준」(`formatPhtDisplayDateTime`).

**고객센터 FAB**: 문의 쓰기 화면(`components/support/SupportTicketViews.tsx` `SupportTicketCompose` — 맨 위 「진행 중인 문의」, 그 아래 유형·세부 줄) 에서 유형이 「광고」/「배달 광고」 이면 유형 줄 바로 아래에 **「광고 금액 확인 ›」** 줄. 누르면 창 안에서 같은 표(회원/매장 탭 자동)를 보여 주고, 아래 「이 내용으로 문의하기」 = 유형 유지한 채 쓰기 화면으로 복귀.

**바뀌는 파일**: 새 `lib/ads/ad-pricing-guide.ts`(3개 표 읽기·거르기·이름 키) · 새 `app/(main)/mypage/customer-center/notice/ad-pricing/page.tsx` · `components/mypage/cs/CustomerCenterBoardListClient.tsx`(notice 일 때 고정 카드) · `SupportTicketViews.tsx`(광고 유형일 때 줄·보기 전환) · i18n 카탈로그(ko·en) · `lib/perf/request-budget.ts`(새 경로: 열 때 DB 3회). 통화·메신저·네이티브 무관, 웹만.

---

## 8. 구현 순서·검증 (한 작업 = 한 PR, DB 함수 적용은 Owner 승인 후)

| 단계 | 내용 | 운영 DB |
|---|---|---|
| 1 | 시험 데이터 정리 (Owner 「모두 삭제해도 상관없다」) — 백업 후 삭제 대상: `point_promotion_orders` 30, `feed_ad_requests` 61(+소재·보류 61·회원 캠페인 33), 매장 유료 캠페인(배너 3·홍보 38)·금액 기록(사장님 유료) 14·자금 기록 24(배너 1·홍보 15·파트너 4·팝업 4), 파트너 가입 4, 팝업 신청 4. **포인트·비즈 캐시 원장은 지우지 않는다**(잔액 원본). 삭제 SQL·건수표를 먼저 보고하고 승인 후 실행 | 쓰기(승인 필요) |
| 2 | 코드만 고치는 결함: D-01·D-04·D-08·D-09·D-11·D-12·D-13(화면)·D-15·D-16·D-17·D-18 + 요금 안내 화면·공지 카드·FAB 줄 | 없음 |
| 3 | DB 함수·표: D-02·D-03·D-05·D-06·D-07·D-10·D-14 마이그레이션 | 적용 승인 필요 |
| 4 | 금액 변경(§6-3) — 어드민 화면에서 사유 저장 · 신규 기간 행 추가 | 쓰기(승인 필요) |
| 5 | 검증 — 아래 표 | — |

**검증 표 (구현 후 운영 · Owner 계정 · 휴대폰 · 실행 10회 상한)**

| 시나리오 | 방법 | 증거 |
|---|---|---|
| S1·S2 | 어드민 값 ↔ 요금 안내 ↔ 결제 창 3곳 숫자 대조 | 캡처 3장 + DB 조회 |
| S3 | 결제 창을 연 채 어드민 금액 변경 → 결제 버튼 → 「금액이 바뀌었어요」 | 캡처 + 409 응답 |
| S4·S5 | 신청 1건 후 금액 변경 → 그 건 금액·종료일 불변 | DB 행 전후 |
| S6 | 연장 → 처음 신청 행 불변 + 연장 기록 1줄 | DB |
| S8 | 기간 변경 → 이름·문구가 새 기간 | 캡처 |
| S10 | 매장 홍보 자리 가득 → 제출 거부 문구 | 캡처 |
| 시험 뒤 | 바꾼 금액 원래대로 · 열 단위 대조 보고 | DB |

현재 판정 상태: §3 은 **코드·운영 함수 정의 판정**이다. 운영·실기 PASS 는 위 표로 받는다.
