import { describe, expect, it } from "vitest";
import {
  buildStoreOrderSummaryTimelineSteps,
  formatStoreOrderSummaryTimelineTime,
  rebuildStoreOrderSummaryTimelineFromStored,
} from "@/lib/store-order-chat/store-order-summary-timeline";

/** 채팅 요약 카드 = 4칸 정본 + 칸마다 실제 진입 시각 (Owner 2026-11-04 · 설계안 v2 §3-4) */
describe("buildStoreOrderSummaryTimelineSteps", () => {
  it("배달 4칸 · 이름 · 지금 칸", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({ fulfillmentType: "local_delivery", orderStatus: "preparing", lang: "ko" });
    expect(steps.map((s) => s.label)).toEqual(["주문접수", "조리중", "배달중", "배달완료"]);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
  });

  it("픽업 4칸", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({ fulfillmentType: "pickup", orderStatus: "ready_for_pickup", lang: "ko" });
    expect(steps.map((s) => s.label)).toEqual(["주문접수", "조리중", "픽업대기", "픽업완료"]);
    expect(steps[2]?.state).toBe("current");
  });

  it("거절은 1줄 「주문 거절」", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: "cancelled",
      cancelKind: "rejected",
      lang: "ko",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.label).toBe("주문 거절");
  });

  it("「주문접수」 시각 = 접수 이벤트 시각 (주문 들어온 시각을 넣지 않음 · 3회차 D-6)", () => {
    const steps = buildStoreOrderSummaryTimelineSteps({
      fulfillmentType: "local_delivery",
      orderStatus: "accepted",
      orderCreatedAt: "2026-11-03T22:00:11.000Z",
      statusEvents: [{ to_status: "accepted", created_at: "2026-11-03T22:02:54.000Z" }],
      lang: "ko",
    });
    expect(steps[0]?.at).toBe("2026-11-03T22:02:54.000Z");
  });

  it("저장된 예전 7칸·영어 이름도 4칸 정본으로 다시 그림", () => {
    const steps = rebuildStoreOrderSummaryTimelineFromStored({
      stored: [
        { key: "pending", label: "Order received", at: "2026-11-03T22:00:11.000Z", state: "done" },
        { key: "accepted", label: "Confirmed", at: "2026-11-03T22:00:11.000Z", state: "done" },
        { key: "preparing", label: "Preparing", at: "2026-11-03T22:13:50.000Z", state: "done" },
        { key: "delivering", label: "Out for delivery", at: "2026-11-03T22:20:50.000Z", state: "done" },
        { key: "completed", label: "Delivered", at: "2026-11-03T22:21:03.000Z", state: "done" },
      ],
      fulfillmentType: "local_delivery",
      orderStatus: "completed",
      acceptedAt: "2026-11-03T22:02:54.000Z",
      lang: "ko",
    });
    expect(steps.map((s) => s.label)).toEqual(["주문접수", "조리중", "배달중", "배달완료"]);
    expect(steps.map((s) => formatStoreOrderSummaryTimelineTime(s.at))).toEqual(["06:02", "06:13", "06:20", "06:21"]);
  });
});
