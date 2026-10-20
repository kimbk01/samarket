import { describe, expect, it } from "vitest";
import {
  buildBuyerStoreOrderDetailResponseBody,
  sanitizeBuyerDeliveryPublic,
  stripStoreOrderDeliveryForClient,
} from "@/lib/stores/store-order-detail-snapshot-assemble";

/** Full prod-shape delivery row (cached pre-20270602140200 payloads still carry every column). */
const fullDelivery = {
  order_id: "o1",
  store_id: "s1",
  buyer_user_id: "b1",
  rider_id: null,
  delivery_status: "delivered",
  assigned_at: null,
  picked_up_at: null,
  delivered_at: "2026-10-21T01:00:00Z",
  admin_note: "INTERNAL",
  created_at: "2026-10-21T00:00:00Z",
  updated_at: "2026-10-21T01:00:00Z",
  rider_accepted_at: null,
  customer_arrived_at: null,
  rider_decline_reason: "too far",
  delivered_proof_image_url: "https://x/p.jpg",
  delivered_proof_note: "left at door",
  delivered_receiver_name: "Juan",
  delivered_confirmed_at: null,
  delivered_proof_lat: 14.6,
  delivered_proof_lng: 121.0,
  failure_proof_image_url: "https://x/f.jpg",
  failure_note: "gate",
  rider_failure_reported_at: null,
  rider_failure_report_reason: "closed",
  failure_report_lat: 14.7,
  failure_report_lng: 121.1,
  failed_at: null,
  delivered_proof_image_path: "proofs/p.jpg",
  failure_proof_image_path: "proofs/f.jpg",
};

const INTERNAL = [
  "admin_note",
  "delivered_proof_image_url",
  "delivered_proof_image_path",
  "failure_proof_image_url",
  "failure_proof_image_path",
  "delivered_proof_lat",
  "delivered_proof_lng",
  "failure_report_lat",
  "failure_report_lng",
];

describe("ORD-07 ⊃ DLV-04 — shared delivery strip", () => {
  it("owner/buyer common strip removes admin note, proof storage and coordinates", () => {
    const out = stripStoreOrderDeliveryForClient(fullDelivery)!;
    for (const k of INTERNAL) expect(out).not.toHaveProperty(k);
    expect(out.delivery_status).toBe("delivered");
    expect(out.rider_decline_reason).toBe("too far");
    expect(fullDelivery.admin_note).toBe("INTERNAL"); // input not mutated
    expect(stripStoreOrderDeliveryForClient(null)).toBeNull();
  });

  it("buyer sanitize also drops rider-internal reasons/notes and masks the receiver", () => {
    const out = sanitizeBuyerDeliveryPublic(fullDelivery)!;
    for (const k of [
      ...INTERNAL,
      "rider_decline_reason",
      "rider_failure_report_reason",
      "rider_failure_reported_at",
      "failure_note",
      "delivered_proof_note",
      "delivered_receiver_name",
    ]) {
      expect(out).not.toHaveProperty(k);
    }
    expect(out.delivered_receiver_hint).toBe("J**");
    expect(out.delivered_at).toBe("2026-10-21T01:00:00Z");
  });

  it("buyer response body carries no internal order or delivery keys", () => {
    const body = buildBuyerStoreOrderDetailResponseBody({
      order: {
        id: "o1",
        order_status: "delivering",
        admin_note: "x",
        admin_flagged: true,
        dispute_status: "open",
        commission_base_amount: 1,
        store_funded_amount: 2,
        platform_funded_amount: 3,
        admin_locked: false,
        needs_admin_attention: true,
      },
      items: [],
      store: { store_name: "S", slug: "s", owner_user_id: "u" },
      delivery: fullDelivery,
      review: null,
      reviewsUnavailable: false,
    });
    for (const k of ["admin_note", "admin_flagged", "dispute_status", "commission_base_amount", "store_funded_amount", "platform_funded_amount"]) {
      expect(body.order).not.toHaveProperty(k);
    }
    expect(body.order.admin_locked).toBe(false);
    expect(body.order.needs_admin_attention).toBe(true);
    for (const k of INTERNAL) expect(body.delivery).not.toHaveProperty(k);
  });
});
