import { describe, expect, it } from "vitest";
import {
  buildMessengerContextMetaFromStoreOrder,
  deliveryContextStepLabel,
} from "@/lib/community-messenger/store-order-messenger-context";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";

describe("buildMessengerContextMetaFromStoreOrder", () => {
  it("uses delivery kind for local_delivery", () => {
    const m = buildMessengerContextMetaFromStoreOrder({
      fulfillmentType: "local_delivery",
      productTitle: "라면",
      paymentAmount: 150,
      orderStatusLabel: "배송 중",
    });
    expect(m.kind).toBe("delivery");
    expect(m.headline).toBe("라면");
    expect(m.stepLabel).toBe("배송 중");
    expect(m.priceLabel).toBeDefined();
  });

  it("keeps pickup orders in delivery/store_order pillar", () => {
    const m = buildMessengerContextMetaFromStoreOrder({
      fulfillmentType: "pickup",
      productTitle: "커피",
    });
    expect(m.kind).toBe("delivery");
    expect(m.fulfillmentType).toBe("pickup");
  });
});

describe("deliveryContextStepLabel — 배달 방 상태 글자는 보는 사람 언어 (언어 사후 검토)", () => {
  it("원 상태 코드가 있으면 저장 stepLabel(기본 언어 고정) 대신 보는 사람 언어로 그린다", () => {
    const meta = {
      orderStatus: "preparing",
      stepLabel: buyerOrderStatusLabel("preparing", "en", "local_delivery"),
      fulfillmentType: "local_delivery",
    };
    expect(deliveryContextStepLabel(meta, "ko")).toBe(buyerOrderStatusLabel("preparing", "ko", "local_delivery"));
    expect(deliveryContextStepLabel(meta, "en")).toBe(buyerOrderStatusLabel("preparing", "en", "local_delivery"));
  });

  it("포장 주문은 포장 이름으로", () => {
    expect(deliveryContextStepLabel({ orderStatus: "ready_for_pickup", fulfillmentType: "pickup" }, "ko")).toBe(
      buyerOrderStatusLabel("ready_for_pickup", "ko", "pickup")
    );
  });

  it("상태 코드가 없는 옛 행은 저장 글자 그대로, 둘 다 없으면 null", () => {
    expect(deliveryContextStepLabel({ stepLabel: "배송 중" }, "en")).toBe("배송 중");
    expect(deliveryContextStepLabel({}, "en")).toBeNull();
    expect(deliveryContextStepLabel(null, "en")).toBeNull();
  });
});
