import { describe, expect, it } from "vitest";
import { buildStoreOrderSummaryTimelineSteps } from "@/lib/store-order-chat/store-order-summary-timeline";
import { processStepIndex, processSteps } from "@/lib/stores/store-order-process-model";

describe("buildStoreOrderSummaryTimelineSteps", () => {
  it("delivery progress uses full processSteps length (7)", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: "preparing",
    });
    expect(steps).toHaveLength(processSteps("local_delivery").length);
    expect(steps[2]?.key).toBe("preparing");
    expect(steps[2]?.state).toBe("current");
  });

  it("pickup progress uses processSteps length (5 incl. completed)", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "pickup",
      orderStatus: "ready_for_pickup",
    });
    expect(steps).toHaveLength(processSteps("pickup").length);
    expect(steps[3]?.key).toBe("ready_for_pickup");
    expect(steps[3]?.state).toBe("current");
  });

  it("terminal order collapses to single step", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: "cancelled",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.key).toBe("cancelled");
    expect(steps[0]?.state).toBe("current");
  });

  it("fills preparing timestamp from ready_for_pickup event", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: "ready_for_pickup",
      statusEvents: [{ to_status: "ready_for_pickup", created_at: "2026-06-04T10:00:00.000Z" }],
    });
    const preparing = steps.find((s) => s.key === "preparing");
    expect(preparing?.at).toBe("2026-06-04T10:00:00.000Z");
  });

  it("current index aligns with processStepIndex for delivery preparing", () => {
    const status = "delivering";
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: status,
    });
    const idx = processStepIndex(status, "local_delivery");
    expect(steps[idx]?.state).toBe("current");
  });
});
