import { describe, expect, it } from "vitest";
import {
  allowedOrderTransitions,
  STORE_ORDER_STATUS_LIST,
} from "@/lib/stores/order-status-transitions";
import {
  buyerDetailSixStepStates,
  storeOrderTimelineCurrentStep,
} from "@/lib/stores/store-order-process-criteria";
import {
  chatMessageKey,
  ownerNextAction,
  processFlowStepStates,
  processStatusLabel,
  processStepIndex,
  processStepLabel,
  processSteps,
  type StoreOrderProcessStepKey,
} from "@/lib/stores/store-order-process-model";

const DELIVERY_PROGRESS = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
] as const;

const PICKUP_PROGRESS = ["pending", "accepted", "preparing", "ready_for_pickup", "completed"] as const;

describe("processSteps", () => {
  it("delivery has 7 keys pickup has 5", () => {
    expect(processSteps("local_delivery")).toEqual(DELIVERY_PROGRESS);
    expect(processSteps("pickup")).toEqual(PICKUP_PROGRESS);
  });
});

describe("processStepIndex regression", () => {
  it("matches storeOrderTimelineCurrentStep for delivery progress statuses", () => {
    for (const status of DELIVERY_PROGRESS) {
      expect(processStepIndex(status, "local_delivery")).toBe(
        storeOrderTimelineCurrentStep("local_delivery", status)
      );
    }
  });

  it("matches storeOrderTimelineCurrentStep for pickup progress statuses", () => {
    for (const status of PICKUP_PROGRESS) {
      expect(processStepIndex(status, "pickup")).toBe(storeOrderTimelineCurrentStep("pickup", status));
    }
  });
});

describe("processFlowStepStates", () => {
  it("marks current step from order_status", () => {
    const states = processFlowStepStates("local_delivery", "preparing");
    expect(states[2]).toBe("current");
    expect(states[1]).toBe("done");
    expect(states[3]).toBe("upcoming");
  });
});

describe("ownerNextAction", () => {
  it("next status is allowed transition", () => {
    for (const status of DELIVERY_PROGRESS) {
      const action = ownerNextAction(status, "local_delivery", "en");
      if (!action) continue;
      expect(allowedOrderTransitions(status, "local_delivery")).toContain(action.status);
    }
    for (const status of PICKUP_PROGRESS) {
      const action = ownerNextAction(status, "pickup", "en");
      if (!action) continue;
      expect(allowedOrderTransitions(status, "pickup")).toContain(action.status);
    }
  });
});

describe("processFlowStepStates index alignment", () => {
  it("marks current at processStepIndex for delivery", () => {
    for (const status of DELIVERY_PROGRESS) {
      const idx = processStepIndex(status, "local_delivery");
      const states = processFlowStepStates("local_delivery", status);
      if (status === "completed") {
        expect(states[states.length - 1]).toBe("current");
        continue;
      }
      expect(states[idx]).toBe("current");
    }
  });
});

describe("ready_for_pickup labels by audience", () => {
  it("buyer delivery uses dispatch label key path", () => {
    const label = processStepLabel("ready_for_pickup", "local_delivery", "buyer", "en");
    expect(label.toLowerCase()).toContain("dispatch");
  });
  it("buyer pickup keeps pickup wording", () => {
    const delivery = processStepLabel("ready_for_pickup", "local_delivery", "buyer", "en");
    const pickup = processStepLabel("ready_for_pickup", "pickup", "buyer", "en");
    expect(pickup).not.toBe(delivery);
  });
});

describe("terminal status labels", () => {
  it("buyer cancelled is translated not raw slug", () => {
    const label = processStatusLabel("cancelled", "local_delivery", "buyer", "en");
    expect(label).not.toBe("cancelled");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("chatMessageKey policy A", () => {
  it("completed delivery uses completed body key only", () => {
    expect(chatMessageKey("completed", "local_delivery")).toBe("store_delivery_ops_body_completed_delivery");
  });
});

describe("ready_for_pickup same step key", () => {
  it("delivery maps to ready_for_pickup in processSteps", () => {
    const keys = processSteps("local_delivery");
    expect(keys).toContain("ready_for_pickup");
    const idx = keys.indexOf("ready_for_pickup" as StoreOrderProcessStepKey);
    expect(processStepIndex("ready_for_pickup", "local_delivery")).toBe(idx);
  });
});

describe("STORE_ORDER_STATUS_LIST coverage", () => {
  it("progress statuses have flow index on delivery", () => {
    for (const status of DELIVERY_PROGRESS) {
      expect(processStepIndex(status, "local_delivery")).toBeGreaterThanOrEqual(0);
    }
  });

  it("terminal statuses do not break buyerDetailSixStepStates", () => {
    for (const status of ["cancelled", "refund_requested", "refunded"] as const) {
      expect(() => buyerDetailSixStepStates("local_delivery", status)).not.toThrow();
    }
  });

  it("exports full status list", () => {
    expect(STORE_ORDER_STATUS_LIST.length).toBeGreaterThan(7);
  });
});
