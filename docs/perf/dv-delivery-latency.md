# dibaY 배달 — 실측 성능 측정 / End-to-End Latency Trace

## 활성화

- **클라이언트 로그 활성화**: `NEXT_PUBLIC_DV_DELIVERY_LATENCY=1`
- **서버 로그 활성화(선택)**: `DV_DELIVERY_LATENCY=1`

로그 prefix는 고정입니다.

- `[dv-delivery-latency]`

## 수집되는 핵심 이벤트(예)

- **구매자**
  - `buyer_order_click_ms`
  - `buyer_order_api_done_ms`
  - `buyer_order_click_to_list_visible_ms`
  - `buyer_order_click_to_detail_visible_ms`
- **오너 Realtime**
  - `owner_realtime_received_ms` (commit_timestamp 기준 WS receive 지연)
- **구매자 Realtime**
  - `buyer_realtime_received_ms`
- **배달(deliveries) Realtime**
  - `delivery_realtime_received_ms`
- **라이더**
  - `rider_realtime_received_ms`
- **관리자**
  - `admin_ops_refresh_ms`
  - `admin_action_done_ms`
- **API(Server)**
  - `request_start_ms`
  - `request_body_parsed_ms`
  - `db_query_done_ms` (step 포함)
  - `order_created_db_ms`

## 콘솔에서 p95/평균/최대 계산

브라우저 콘솔에서 실행:

```js
// 모든 value_ms 이벤트 요약
dvDeliveryLatencySummarizeClientValues();

// 특정 prefix만(예: buyer)
dvDeliveryLatencySummarizeClientValues("buyer_");

// 최근 이벤트 raw 확인
window.__dv_delivery_latency_events?.slice(-30);
```

## 판정 기준

- 매우 좋음: < 500ms
- 좋음: < 900ms
- 허용: < 1500ms
- 위험: > 2500ms

