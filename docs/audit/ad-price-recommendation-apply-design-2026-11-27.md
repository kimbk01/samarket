# 광고 금액 권장안 적용 설계 (2026-11-27)

> 근거: `docs/audit/ad-pricing-notice-design-2026-11-26.md` §6 (금액 권장안) · §8 4단계 「금액 변경 — 어드민 화면에서 사유 저장 · 신규 기간 행 추가 (쓰기, 승인 필요)」.
> 운영 DB 읽기 전용 확인: 2026-11-27 00:4x PHT. 진행 중 광고 0건(시험 데이터 삭제 직후) → 금액을 바꿔도 영향받는 진행 건 없음.

## 1. 지금 → 바뀔 값

| 광고 | 상품 id | 지금 | 바뀔 값 | 방식 |
|---|---|---|---|---|
| 거래 상위노출 3일 | `trade_promote_3` | 없음 | **250P** | 새 상품 |
| 거래 상위노출 7일 | `trade_promote_7` | 500P (rev 3) | 500P | 변경 없음 |
| 거래 상위노출 14일 | `trade_promote_14` | 900P (rev 1) | 900P | 변경 없음 |
| 커뮤니티 상위노출 3일 | `community_promote_3` | 10,000P (rev 1) | **250P** | 금액 변경 |
| 커뮤니티 상위노출 7일 | `community_promote_7` | 20,000P (rev 1) | **500P** | 금액 변경 |
| 커뮤니티 상위노출 14일 | `community_promote_14` | 없음 | **900P** | 새 상품 |
| 거래 배너 3일 | `feed_banner_trade_3` | 8,000P | **750P** | 금액 변경 |
| 거래 배너 7일 | `feed_banner_trade_7` | 15,000P | **1,500P** | 금액 변경 |
| 거래 배너 14일 | `feed_banner_trade_14` | 없음 | **2,700P** | 새 상품 |
| 커뮤니티 배너 3일 | `feed_banner_community_3` | 10,000P | **750P** | 금액 변경 |
| 커뮤니티 배너 7일 | `feed_banner_community_7` | 20,000P | **1,500P** | 금액 변경 |
| 커뮤니티 배너 14일 | `feed_banner_community_14` | 없음 | **2,700P** | 새 상품 |
| 매장 광고 전부 · 파트너 | — | ₱ (§6-3) | 그대로 | 변경 없음 |

계산 규칙(§6-2): 같은 자리 같은 값 · 3일 = 7일 하루값 × 1.15 · 14일 = × 0.90 · 배너 = 상위노출 하루값 × 3 · 기준 = 거래 상위노출 7일 500P(계약 문서 값).

## 2. 적용 방법 (3단계 · 한 작업)

### 2-1. 코드 PR (웹만 · 먼저)
- `lib/points/promotion-products.ts`: 상위노출 상품 목록(seed)에 `trade_promote_3`(3일·250P·sort 5) · `community_promote_14`(14일·900P·sort 45) 추가. **이유(증거)**: 서버가 DB 행을 읽을 때 seed 에 없는 id 는 버린다(`member-promotion-products-server.ts:41` 「seed 에 없는 id 는 버린다」) → 코드에 없으면 DB 에 넣어도 화면·결제에 안 나옴.
- 같은 파일 `resolveLegacyPromotionProductId`(옛 기간 → 상품 id): 3일 거래 · 14일 커뮤니티 분기 추가.
- `lib/ads/feed-ad-products.ts` 대체 목록(표가 없을 때만 쓰는 값)에 14일 2개 추가 — 화면 원본은 DB.
- 이름은 이미 기간으로 만들어짐(「거래 상위노출 3일」 · 배너 `feedAdProductTitleKey` + 기간) → 이름 코드 변경 없음.
- 시험: 새 id 2개가 목록·결제 대조·요금 안내에 나오는지.
- 병합 후 운영 web-version 확인 → 2-2.

### 2-2. 새 상품 행 4개 (운영 DB 마이그레이션 · 승인 후)
어드민에 「상품 추가」 화면이 없어(§3 M3·M4 S11) 마이그레이션으로 넣는다.
```sql
-- 20271127140000_ad_price_new_periods.sql
INSERT INTO public.member_promotion_products (id, domain, placement, duration_days, point_cost, is_active, sort_order, revision)
VALUES ('trade_promote_3', 'trade', 'feed_boost', 3, 250, true, 5, 1),
       ('community_promote_14', 'community', 'community_top_pin', 14, 900, true, 45, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.member_promotion_product_changes (product_id, admin_id, before, after, reason)
SELECT id, NULL, NULL, to_jsonb(p), 'Owner 금액 권장안 적용 2026-11-27 — 새 기간 상품'
  FROM public.member_promotion_products p WHERE id IN ('trade_promote_3', 'community_promote_14');
INSERT INTO public.feed_ad_products (id, domain, duration_days, point_cost, title_ko, title_en, is_active, sort_order)
VALUES ('feed_banner_trade_14', 'trade', 14, 2700, '거래 피드 광고 14일', 'Trade feed ad 14 days', true, 25),
       ('feed_banner_community_14', 'community', 14, 2700, '커뮤니티 피드 광고 14일', 'Community feed ad 14 days', true, 45)
ON CONFLICT (id) DO NOTHING;
```
- 되돌리기: 4행 `is_active = false`(지우지 않음 — 결제 기록이 id 를 가리킬 수 있음).
- 확인: 운영 DB 4행 · 요금 안내·결제 화면에 3일/14일 줄.

### 2-3. 기존 6개 금액 변경 (어드민 화면 · 승인 후)
작업자가 운영 어드민 화면(로그인된 관리자 계정)에서 저장한다 — 화면 저장이 사유·변경 이력·동시 저장 보호(revision/수정 시각 409)·큰 변경 2차 확인(3배 이상)을 그대로 거친다.
- 상위노출 2개: `/admin/trade-ad-policies` 상위노출 가격 → 커뮤니티 3일 10,000→250 · 7일 20,000→500 (DB `admin_update_member_promotion_product` · 시작 revision 1).
- 배너 4개: `/admin/feed-ad-products` → 거래 3일 8,000→750 · 7일 15,000→1,500 · 커뮤니티 3일 10,000→750 · 7일 20,000→1,500 (시작 수정 시각 08-08·08-09).
- 사유(공통): 「Owner 금액 권장안 적용 2026-11-27 (§6-3)」.
- 운영 시험 저장 규칙(AGENTS 허위 보고 금지 8): ① 시작 전 「무엇을·언제」 알림 ② 시작 때 읽은 revision 으로만 저장, **409 나면 즉시 중단**(새 revision 으로 덮어쓰지 않음) ③ 끝나면 전 값 백업(위 1번 표) + 열 단위 대조 보고.
- 모든 금액 변경이 1/3 이하 → 어드민 2차 확인 창이 6번 뜬다(D-13 정상 동작).

## 3. 영향
| 대상 | 영향 |
|---|---|
| 진행 중 광고 | 0건 (시험 데이터 삭제 후) — 금액 고정 규칙(S4·S5)으로 앞으로도 진행 건은 안 바뀜 |
| 회원 결제 창 4곳 · 배너 신청·연장 | 다음 열기부터 새 금액. 열린 창에서 결제하면 「금액이 바뀌었어요」(S3 대조) |
| 광고 요금 안내 · 고객센터 FAB | 자동으로 새 금액·새 기간 |
| 포인트·Apple 결제 | 영향 없음 (포인트 충전 가격 그대로) |
| 수입 | 커뮤니티 상위노출·배너 단가 1/10~1/40 — §6-1 근거(하루당 47배·43~67배 차이)대로 의도된 인하 |
| 배너 자리 | 위치당 3자리 그대로 — 값이 내려가 신청이 늘면 「남은 자리」·검토 중 수가 먼저 참 |

## 4. 검증
| 항목 | 방법 |
|---|---|
| 코드 | 시험 + `ci:static`·`test:ci` · PR 자동 병합 → web-version 확인 |
| DB | 12개 상품 값 읽기 전용 조회 = 1번 표 |
| 화면 | 운영 요금 안내(회원 탭) 캡처 · 결제 창 1곳(상위노출) 금액 = 표 |
| 이력 | `member_promotion_product_changes` 2+2행 · 배너 감사 기록 4행 |
| NOT_PROVEN 남김 | Owner 계정·휴대폰 실기 |

## 5. Owner 결정 필요
- 위 금액표 그대로 적용할지 (다르게 원하면 표만 고치면 됨).
- 적용 시점: 승인 즉시(권장 — 진행 광고 0건이라 영향 없음).
