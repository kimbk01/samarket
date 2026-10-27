/**
 * 배달 화면 스코프 표식 — 배달 전용 CSS(상태색 AA·눌림 기본값 등)가 걸리는 범위.
 * 화면 셸(소비자 `/stores`·주문 내역·사장님·관리자 배달 워크스페이스)과, 그 셸에서 연 포털(시트·다이얼로그)에
 * 같은 값으로 붙는다 (`OverlayScopeProvider`). `.delivery-ui` 는 메신저 주문 채팅방도 쓰므로 스코프로 쓰지 않는다.
 * CSS: `app/delivery-tokens.css` · `app/delivery-components.css` 의 `[data-delivery-scope]`.
 */
export type DeliveryScope = "consumer" | "orders" | "owner" | "admin";

export function deliveryScopeAttrs(scope: DeliveryScope): { "data-delivery-scope": DeliveryScope } {
  return { "data-delivery-scope": scope };
}
