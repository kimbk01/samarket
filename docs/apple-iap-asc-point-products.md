# Apple IAP — App Store Connect Point 상품 등록안 (Build 23)

Cash IAP 는 등록하지 않는다. 아래 「ASC 확인」 칸은 ASC 에서 실제로 본 값으로만 채운다 (추정 금지).

## 1. 상품 3종 (소모성 · Consumable)

| 참조 이름 | 상품 ID (제안) | 기준 가격 (필리핀) | 지급 | 운영 `point_plans` |
|---|---|---|---|---|
| DIBAY Point 1,000 | `com.dibay.app.point.1000` | ₱1,000 | 1,000P | `a1000001-0001-4000-8000-000000000001` (1,000 + 0) |
| DIBAY Point 5,250 | `com.dibay.app.point.5000` | ₱5,000 | 5,250P | `a1000002-0002-4000-8000-000000000002` (5,000 + 250) |
| DIBAY Point 11,000 | `com.dibay.app.point.10000` | ₱10,000 | 11,000P | `a1000003-0003-4000-8000-000000000003` (10,000 + 1,000) |

- 지급 Point 는 서버가 `point_plans.point_amount + bonus_amount` 로 계산한다 (앱·Apple 금액으로 계산하지 않음).
- 상품 ID 는 한 번 쓰면 재사용할 수 없다 — ASC 생성 전에 확정.
- ASC 확인: 상품 ID ☐ · 필리핀 가격 단계(₱1,000/₱5,000/₱10,000 존재 여부) ☐ · 다른 국가 가격 자동 환산 ☐

## 2. 현지화 (표시 이름 ≤ 35자 · 설명 ≤ 55자)

| 상품 | ko 이름 | ko 설명 | en 이름 | en 설명 |
|---|---|---|---|---|
| 1000 | 1,000 포인트 | 광고·홍보에 쓰는 DIBAY 포인트 1,000P | 1,000 Points | 1,000 DIBAY Points for ads and promotions |
| 5000 | 5,250 포인트 | 광고·홍보에 쓰는 DIBAY 포인트 5,250P | 5,250 Points | 5,250 DIBAY Points for ads and promotions |
| 10000 | 11,000 포인트 | 광고·홍보에 쓰는 DIBAY 포인트 11,000P | 11,000 Points | 11,000 DIBAY Points for ads and promotions |

## 3. 심사 메모 (상품 공통 · App Review Information)

```
DIBAY Points are a consumable in-app currency used only for digital services inside the app
(feed ads, post promotion). Points bought with In-App Purchase cannot be used for physical goods,
gift certificates or store orders, and do not expire.
To test: sign in with the review account in App Review Information → My Page → Points → Charge →
choose a package. Purchased Points appear in the Points history immediately after the purchase.
```

- 화면 경로(코드 확인): `/mypage/points/charge` (`PointChargeForm`). 메뉴 이름은 Build 23 화면에서 다시 확인 ☐

- 심사용 스크린샷: Point 충전 화면(Apple 결제 버튼이 보이는 상태) 1장 — Build 23 Sandbox 에서 촬영.
- 심사 계정은 관리자 「Apple 결제 → 테스트 계정」 탭에 등록해야 Sandbox 결제가 지급된다 (누적 11,000P 상한).
- 첫 IAP 는 앱 버전과 함께 심사받는다 — Build 23 버전 페이지의 「앱 내 구입」에 3종을 연결.

## 4. 계약·세금·은행 (ASC → 비즈니스)

- 유료 앱 계약(Paid Apps Agreement) 활성 ☐ · 세금 양식 ☐ · 은행 계좌 ☐ — 셋 다 활성이어야 Sandbox 상품 조회·판매 가능.

## 5. App Store 서버 알림 V2

- Production·Sandbox URL 모두: `https://samarket.vercel.app/api/webhooks/apple-app-store` · 버전 V2 ☐

## 6. ASC 확정 후 DB 등록 (Owner 승인 후 · 운영 DB 적용과 같은 단계)

```sql
INSERT INTO public.apple_iap_products (product_id, kind, point_plan_id, is_active, sort_order) VALUES
  ('com.dibay.app.point.1000',  'point', 'a1000001-0001-4000-8000-000000000001', true, 10),
  ('com.dibay.app.point.5000',  'point', 'a1000002-0002-4000-8000-000000000002', true, 20),
  ('com.dibay.app.point.10000', 'point', 'a1000003-0003-4000-8000-000000000003', true, 30);
```

상품 ID 가 ASC 에서 달라지면 위 값만 바꾼다. Cash 상품 행은 DB 제약(`kind = 'point'`)으로 들어가지 않는다.
