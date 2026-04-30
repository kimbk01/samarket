# 가격 제안 알림 DB 매핑

스펙의 단순 `type` / `read` 필드 대신, 프로젝트 표준 `notifications` 행을 다음처럼 사용합니다.

| 스펙·개념 | DB / 구현 |
|-----------|-----------|
| `type` | `notification_type` (예: `"status"`) + `meta.kind` (`"trade_offer"`) + `meta.event` (`offer_created` \| `offer_accepted` \| `offer_rejected`) |
| `read` | `is_read` |
| 제안·상품 참조 | `ref_id` = `price_offers.id`; `meta.product_id`, `meta.offer_id` 등 보조 필드 |
| 링크 | `link_url` (상품 상세 `POST`, 거래 채팅 알림 허브 URL, 또는 `/my/offers/sent`) |

새 테이블을 두지 않으며, 인박스 UI는 `meta.kind === "trade_offer"` 및 `meta.event`로 분기합니다 (`MyNotificationsView`).
