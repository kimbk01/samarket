import type { OwnerOrder, OwnerOrderLog } from "./types";

const STORE_ID = "mock-seoul-korean";
const STORE_SLUG = "seoul-korean-house";
const STORE_NAME = "서울한식당";
const OWNER_NAME = "서울한식당 사장님";

function iso(d: string, t = "10:30:00.000Z") {
  return `${d}T${t}`;
}

function log(
  id: string,
  orderId: string,
  from: OwnerOrderLog["from_status"],
  to: OwnerOrderLog["to_status"],
  message: string,
  createdAt: string,
  actor: OwnerOrderLog["actor_type"] = "system",
  actorName = "시스템"
): OwnerOrderLog {
  return {
    id,
    order_id: orderId,
    from_status: from,
    to_status: to,
    actor_type: actor,
    actor_name: actorName,
    message,
    created_at: createdAt,
  };
}

/** 샘플 오너 주문 6건 — 서울한식당 전용 */
export const INITIAL_OWNER_ORDERS: OwnerOrder[] = [
  {
    id: "own-1",
    order_no: "FD-20260321-0001",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "BK",
    buyer_phone: "+63 911 111 0001",
    order_type: "delivery",
    order_status: "pending",
    product_amount: 250,
    option_amount: 30,
    delivery_fee: 50,
    total_amount: 330,
    request_message: "덜 맵게 해주세요",
    delivery_address: "서울 마포구 샘플동 12-3 (101호)",
    pickup_note: null,
    created_at: iso("2026-03-21", "11:05:00.000Z"),
    updated_at: iso("2026-03-21", "11:05:00.000Z"),
    items: [
      {
        id: "oi-1a",
        menu_name: "김치찌개",
        options_summary: "보통맛",
        qty: 1,
        line_total: 250,
      },
      {
        id: "oi-1b",
        menu_name: "공기밥추가",
        options_summary: "추가",
        qty: 1,
        line_total: 30,
      },
    ],
    logs: [log("ol-1a", "own-1", null, "pending", "주문이 접수되었습니다.", iso("2026-03-21", "11:05:00.000Z"))],
  },
  {
    id: "own-2",
    order_no: "FD-20260321-0002",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "user02",
    buyer_phone: "+63 922 222 0002",
    order_type: "pickup",
    order_status: "accepted",
    product_amount: 440,
    option_amount: 0,
    delivery_fee: 0,
    total_amount: 440,
    request_message: null,
    delivery_address: null,
    pickup_note: "30분 후 픽업 예정",
    created_at: iso("2026-03-21", "10:40:00.000Z"),
    updated_at: iso("2026-03-21", "10:45:00.000Z"),
    buyer_cancel_request: {
      reason: "일정이 바뀌어 취소 요청드립니다.",
      requested_at: iso("2026-03-21", "10:50:00.000Z"),
    },
    items: [
      {
        id: "oi-2a",
        menu_name: "제육덮밥",
        options_summary: "기본",
        qty: 2,
        line_total: 440,
      },
    ],
    logs: [
      log("ol-2a", "own-2", null, "pending", "주문이 접수되었습니다.", iso("2026-03-21", "10:40:00.000Z")),
      log(
        "ol-2b",
        "own-2",
        "pending",
        "accepted",
        "주문 수락",
        iso("2026-03-21", "10:45:00.000Z"),
        "owner",
        OWNER_NAME
      ),
    ],
  },
  {
    id: "own-3",
    order_no: "FD-20260321-0003",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "user03",
    buyer_phone: "+63 933 333 0003",
    order_type: "delivery",
    order_status: "preparing",
    product_amount: 440,
    option_amount: 0,
    delivery_fee: 50,
    total_amount: 490,
    request_message: "문 앞에 놔주세요",
    delivery_address: "경기 성남시 샘플로 10",
    pickup_note: null,
    created_at: iso("2026-03-21", "10:20:00.000Z"),
    updated_at: iso("2026-03-21", "10:28:00.000Z"),
    items: [
      {
        id: "oi-3a",
        menu_name: "불고기정식",
        options_summary: "—",
        qty: 1,
        line_total: 320,
      },
      {
        id: "oi-3b",
        menu_name: "계란말이",
        options_summary: "—",
        qty: 1,
        line_total: 120,
      },
    ],
    logs: [
      log("ol-3a", "own-3", null, "pending", "주문이 접수되었습니다.", iso("2026-03-21", "10:20:00.000Z")),
      log(
        "ol-3b",
        "own-3",
        "pending",
        "accepted",
        "주문 수락",
        iso("2026-03-21", "10:22:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-3c",
        "own-3",
        "accepted",
        "preparing",
        "조리 시작",
        iso("2026-03-21", "10:28:00.000Z"),
        "owner",
        OWNER_NAME
      ),
    ],
  },
  {
    id: "own-4",
    order_no: "FD-20260321-0004",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "user04",
    buyer_phone: "+63 944 444 0004",
    order_type: "delivery",
    order_status: "delivering",
    product_amount: 230,
    option_amount: 0,
    delivery_fee: 50,
    total_amount: 280,
    request_message: null,
    delivery_address: "인천 연수구 샘플타워 5층",
    pickup_note: null,
    created_at: iso("2026-03-21", "09:50:00.000Z"),
    updated_at: iso("2026-03-21", "10:05:00.000Z"),
    items: [
      {
        id: "oi-4a",
        menu_name: "된장찌개",
        options_summary: "보통맛",
        qty: 1,
        line_total: 230,
      },
    ],
    logs: [
      log("ol-4a", "own-4", null, "pending", "주문이 접수되었습니다.", iso("2026-03-21", "09:50:00.000Z")),
      log(
        "ol-4b",
        "own-4",
        "pending",
        "accepted",
        "주문 수락",
        iso("2026-03-21", "09:52:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-4c",
        "own-4",
        "accepted",
        "preparing",
        "조리 시작",
        iso("2026-03-21", "09:58:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-4d",
        "own-4",
        "preparing",
        "delivering",
        "배달 시작",
        iso("2026-03-21", "10:05:00.000Z"),
        "owner",
        OWNER_NAME
      ),
    ],
  },
  {
    id: "own-5",
    order_no: "FD-20260321-0005",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "user05",
    buyer_phone: "+63 955 555 0005",
    order_type: "pickup",
    order_status: "ready_for_pickup",
    product_amount: 370,
    option_amount: 0,
    delivery_fee: 30,
    total_amount: 400,
    request_message: null,
    delivery_address: null,
    pickup_note: "카운터에서 이름 말씀해 주세요",
    created_at: iso("2026-03-21", "09:30:00.000Z"),
    updated_at: iso("2026-03-21", "09:48:00.000Z"),
    items: [
      {
        id: "oi-5a",
        menu_name: "김치찌개",
        options_summary: "순한맛",
        qty: 1,
        line_total: 250,
      },
      {
        id: "oi-5b",
        menu_name: "계란말이",
        options_summary: "—",
        qty: 1,
        line_total: 120,
      },
    ],
    logs: [
      log("ol-5a", "own-5", null, "pending", "주문이 접수되었습니다.", iso("2026-03-21", "09:30:00.000Z")),
      log(
        "ol-5b",
        "own-5",
        "pending",
        "accepted",
        "주문 수락",
        iso("2026-03-21", "09:32:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-5c",
        "own-5",
        "accepted",
        "preparing",
        "조리 시작",
        iso("2026-03-21", "09:40:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-5d",
        "own-5",
        "preparing",
        "ready_for_pickup",
        "픽업 준비 완료",
        iso("2026-03-21", "09:48:00.000Z"),
        "owner",
        OWNER_NAME
      ),
    ],
  },
  {
    id: "own-6",
    order_no: "FD-20260321-0006",
    store_id: STORE_ID,
    store_slug: STORE_SLUG,
    store_name: STORE_NAME,
    buyer_name: "user06",
    buyer_phone: "+63 966 666 0006",
    order_type: "delivery",
    order_status: "completed",
    product_amount: 220,
    option_amount: 0,
    delivery_fee: 50,
    total_amount: 270,
    request_message: "수저는 필요 없어요",
    delivery_address: "부산 해운대구 샘플길 8",
    pickup_note: null,
    created_at: iso("2026-03-20", "18:00:00.000Z"),
    updated_at: iso("2026-03-20", "18:42:00.000Z"),
    items: [
      {
        id: "oi-6a",
        menu_name: "제육덮밥",
        options_summary: "기본",
        qty: 1,
        line_total: 220,
      },
    ],
    logs: [
      log("ol-6a", "own-6", null, "pending", "주문이 접수되었습니다.", iso("2026-03-20", "18:00:00.000Z")),
      log(
        "ol-6b",
        "own-6",
        "pending",
        "accepted",
        "주문 수락",
        iso("2026-03-20", "18:05:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-6c",
        "own-6",
        "accepted",
        "preparing",
        "조리 시작",
        iso("2026-03-20", "18:12:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-6d",
        "own-6",
        "preparing",
        "delivering",
        "배달 시작",
        iso("2026-03-20", "18:25:00.000Z"),
        "owner",
        OWNER_NAME
      ),
      log(
        "ol-6e",
        "own-6",
        "delivering",
        "completed",
        "배달 완료 처리",
        iso("2026-03-20", "18:42:00.000Z"),
        "owner",
        OWNER_NAME
      ),
    ],
  },
];

export const OWNER_SAMPLE_STORE_SLUG = STORE_SLUG;
export const OWNER_SAMPLE_STORE_ID = STORE_ID;
export const OWNER_ACTOR_NAME = OWNER_NAME;
