import {
  SAMPLE_MEMBER_DISPLAY,
  SAMPLE_MEMBER_USER_ID,
  SAMPLE_OWNER_DISPLAY,
  SAMPLE_OWNER_USER_ID,
} from "@/lib/mock-auth/mock-users";
import { buildSharedLog } from "./order-log-utils";
import type { SharedOrder } from "./types";
import { SHARED_SIM_STORE_ID, SHARED_SIM_STORE_SLUG } from "./types";

const STORE_NAME = "서울한식당";
const OWNER_ID = SAMPLE_OWNER_USER_ID;
const OWNER_NAME = SAMPLE_OWNER_DISPLAY;

function iso(d: string, t: string) {
  return `${d}T${t}`;
}

function baseOrder(p: Omit<SharedOrder, "logs" | "created_at" | "updated_at"> & { created_at: string }): SharedOrder {
  return {
    ...p,
    updated_at: p.created_at,
    logs: [],
  };
}

/** 공유 시뮬 주문 5건 (FD-20260321-1001 ~ 1005) */
export function buildInitialSharedOrders(): SharedOrder[] {
  const orders: SharedOrder[] = [];

  const o1 = baseOrder({
    id: "sh-1001",
    order_no: "FD-20260321-1001",
    store_id: SHARED_SIM_STORE_ID,
    store_name: STORE_NAME,
    store_slug: SHARED_SIM_STORE_SLUG,
    owner_user_id: OWNER_ID,
    owner_name: OWNER_NAME,
    buyer_user_id: SAMPLE_MEMBER_USER_ID,
    buyer_name: SAMPLE_MEMBER_DISPLAY,
    buyer_phone: "+63 911 111 0001",
    order_type: "delivery",
    order_status: "pending",
    payment_status: "paid",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 250,
    option_amount: 30,
    delivery_fee: 50,
    discount_amount: 0,
    total_amount: 330,
    final_amount: 330,
    request_message: "덜 맵게 해주세요",
    delivery_address_summary: "Angeles, Block 3, Unit 12",
    delivery_address_detail: "",
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: [
      {
        id: "si-1a",
        menu_name: "김치찌개",
        options_summary: "보통맛",
        qty: 1,
        line_total: 250,
      },
      {
        id: "si-1b",
        menu_name: "공기밥추가",
        options_summary: "추가",
        qty: 1,
        line_total: 30,
      },
    ],
    created_at: iso("2026-03-21", "11:25:00.000Z"),
  });
  o1.logs.push(
    buildSharedLog({
      order_id: o1.id,
      actor_type: "system",
      actor_name: "시스템",
      action_type: "created",
      from_status: null,
      to_status: "pending",
      message: "주문이 생성되었어요",
      created_at: o1.created_at,
    })
  );
  orders.push(o1);

  const o2 = baseOrder({
    id: "sh-1002",
    order_no: "FD-20260321-1002",
    store_id: SHARED_SIM_STORE_ID,
    store_name: STORE_NAME,
    store_slug: SHARED_SIM_STORE_SLUG,
    owner_user_id: OWNER_ID,
    owner_name: OWNER_NAME,
    buyer_user_id: SAMPLE_MEMBER_USER_ID,
    buyer_name: SAMPLE_MEMBER_DISPLAY,
    buyer_phone: "+63 922 222 0002",
    order_type: "delivery",
    order_status: "accepted",
    payment_status: "paid",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 440,
    option_amount: 0,
    delivery_fee: 0,
    discount_amount: 0,
    total_amount: 440,
    final_amount: 440,
    request_message: null,
    delivery_address_summary: "Manila",
    delivery_address_detail: "Malate",
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: [
      {
        id: "si-2a",
        menu_name: "제육덮밥",
        options_summary: "기본",
        qty: 2,
        line_total: 440,
      },
    ],
    created_at: iso("2026-03-21", "11:00:00.000Z"),
  });
  o2.logs.push(
    buildSharedLog({
      order_id: o2.id,
      actor_type: "system",
      actor_name: "시스템",
      action_type: "created",
      from_status: null,
      to_status: "pending",
      message: "주문이 생성되었어요",
      created_at: iso("2026-03-21", "11:00:00.000Z"),
    }),
    buildSharedLog({
      order_id: o2.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "accepted",
      from_status: "pending",
      to_status: "accepted",
      message: "매장에서 주문을 확인했어요",
      created_at: iso("2026-03-21", "11:01:00.000Z"),
    })
  );
  orders.push(o2);

  const o3 = baseOrder({
    id: "sh-1003",
    order_no: "FD-20260321-1003",
    store_id: SHARED_SIM_STORE_ID,
    store_name: STORE_NAME,
    store_slug: SHARED_SIM_STORE_SLUG,
    owner_user_id: OWNER_ID,
    owner_name: OWNER_NAME,
    buyer_user_id: SAMPLE_MEMBER_USER_ID,
    buyer_name: SAMPLE_MEMBER_DISPLAY,
    buyer_phone: "+63 917 333 0003",
    order_type: "delivery",
    order_status: "preparing",
    payment_status: "paid",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 440,
    option_amount: 0,
    delivery_fee: 50,
    discount_amount: 0,
    total_amount: 490,
    final_amount: 490,
    request_message: null,
    delivery_address_summary: "BGC",
    delivery_address_detail: "High Street",
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: [
      {
        id: "si-3a",
        menu_name: "불고기정식",
        options_summary: "—",
        qty: 1,
        line_total: 320,
      },
      {
        id: "si-3b",
        menu_name: "계란말이",
        options_summary: "—",
        qty: 1,
        line_total: 120,
      },
    ],
    created_at: iso("2026-03-21", "10:40:00.000Z"),
  });
  o3.logs.push(
    buildSharedLog({
      order_id: o3.id,
      actor_type: "system",
      actor_name: "시스템",
      action_type: "created",
      from_status: null,
      to_status: "pending",
      message: "주문이 생성되었어요",
      created_at: iso("2026-03-21", "10:40:00.000Z"),
    }),
    buildSharedLog({
      order_id: o3.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "accepted",
      from_status: "pending",
      to_status: "accepted",
      message: "매장에서 주문을 확인했어요",
      created_at: iso("2026-03-21", "10:41:00.000Z"),
    }),
    buildSharedLog({
      order_id: o3.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "preparing",
      from_status: "accepted",
      to_status: "preparing",
      message: "조리를 시작했어요",
      created_at: iso("2026-03-21", "10:45:00.000Z"),
    })
  );
  orders.push(o3);

  const o4 = baseOrder({
    id: "sh-1004",
    order_no: "FD-20260321-1004",
    store_id: SHARED_SIM_STORE_ID,
    store_name: STORE_NAME,
    store_slug: SHARED_SIM_STORE_SLUG,
    owner_user_id: OWNER_ID,
    owner_name: OWNER_NAME,
    buyer_user_id: SAMPLE_MEMBER_USER_ID,
    buyer_name: SAMPLE_MEMBER_DISPLAY,
    buyer_phone: "+63 944 444 0004",
    order_type: "pickup",
    order_status: "ready_for_pickup",
    payment_status: "paid",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 370,
    option_amount: 0,
    delivery_fee: 30,
    discount_amount: 0,
    total_amount: 400,
    final_amount: 400,
    request_message: null,
    delivery_address_summary: null,
    delivery_address_detail: null,
    pickup_note: "카운터에서 이름 말씀해 주세요",
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: [
      {
        id: "si-4a",
        menu_name: "김치찌개",
        options_summary: "순한맛",
        qty: 1,
        line_total: 250,
      },
      {
        id: "si-4b",
        menu_name: "계란말이",
        options_summary: "—",
        qty: 1,
        line_total: 120,
      },
    ],
    created_at: iso("2026-03-21", "10:15:00.000Z"),
  });
  o4.logs.push(
    buildSharedLog({
      order_id: o4.id,
      actor_type: "system",
      actor_name: "시스템",
      action_type: "created",
      from_status: null,
      to_status: "pending",
      message: "주문이 생성되었어요",
      created_at: iso("2026-03-21", "10:15:00.000Z"),
    }),
    buildSharedLog({
      order_id: o4.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "accepted",
      from_status: "pending",
      to_status: "accepted",
      message: "매장에서 주문을 확인했어요",
      created_at: iso("2026-03-21", "10:16:00.000Z"),
    }),
    buildSharedLog({
      order_id: o4.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "preparing",
      from_status: "accepted",
      to_status: "preparing",
      message: "조리를 시작했어요",
      created_at: iso("2026-03-21", "10:25:00.000Z"),
    }),
    buildSharedLog({
      order_id: o4.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "ready_for_pickup",
      from_status: "preparing",
      to_status: "ready_for_pickup",
      message: "픽업 준비가 완료되었어요",
      created_at: iso("2026-03-21", "10:35:00.000Z"),
    })
  );
  orders.push(o4);

  const fee = Math.round(270 * 0.1);
  const o5 = baseOrder({
    id: "sh-1005",
    order_no: "FD-20260321-1005",
    store_id: SHARED_SIM_STORE_ID,
    store_name: STORE_NAME,
    store_slug: SHARED_SIM_STORE_SLUG,
    owner_user_id: OWNER_ID,
    owner_name: OWNER_NAME,
    buyer_user_id: SAMPLE_MEMBER_USER_ID,
    buyer_name: SAMPLE_MEMBER_DISPLAY,
    buyer_phone: "+63 955 555 0005",
    order_type: "delivery",
    order_status: "completed",
    payment_status: "paid",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 220,
    option_amount: 0,
    delivery_fee: 50,
    discount_amount: 0,
    total_amount: 270,
    final_amount: 270,
    request_message: null,
    delivery_address_summary: "Quezon City",
    delivery_address_detail: "Apt 5B",
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: {
      id: "st-sh-1005",
      gross_amount: 270,
      fee_amount: fee,
      settlement_amount: 270 - fee,
      settlement_status: "scheduled",
      scheduled_date: "2026-03-28",
    },
    items: [
      {
        id: "si-5a",
        menu_name: "제육덮밥",
        options_summary: "기본",
        qty: 1,
        line_total: 220,
      },
    ],
    created_at: iso("2026-03-20", "18:00:00.000Z"),
  });
  o5.logs.push(
    buildSharedLog({
      order_id: o5.id,
      actor_type: "system",
      actor_name: "시스템",
      action_type: "created",
      from_status: null,
      to_status: "pending",
      message: "주문이 생성되었어요",
      created_at: iso("2026-03-20", "18:00:00.000Z"),
    }),
    buildSharedLog({
      order_id: o5.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "accepted",
      from_status: "pending",
      to_status: "accepted",
      message: "매장에서 주문을 확인했어요",
      created_at: iso("2026-03-20", "18:05:00.000Z"),
    }),
    buildSharedLog({
      order_id: o5.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "preparing",
      from_status: "accepted",
      to_status: "preparing",
      message: "조리를 시작했어요",
      created_at: iso("2026-03-20", "18:10:00.000Z"),
    }),
    buildSharedLog({
      order_id: o5.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "delivering",
      from_status: "preparing",
      to_status: "delivering",
      message: "배달을 출발했어요",
      created_at: iso("2026-03-20", "18:22:00.000Z"),
    }),
    buildSharedLog({
      order_id: o5.id,
      actor_type: "owner",
      actor_name: OWNER_NAME,
      action_type: "completed",
      from_status: "delivering",
      to_status: "completed",
      message: "주문이 완료되었어요",
      created_at: iso("2026-03-20", "18:40:00.000Z"),
    })
  );
  orders.push(o5);

  return orders;
}

export const INITIAL_SHARED_ORDERS: SharedOrder[] = buildInitialSharedOrders();
