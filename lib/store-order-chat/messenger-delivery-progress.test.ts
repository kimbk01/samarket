import { describe, expect, it } from "vitest";
import {
  messengerDeliveryProgressCurrentStep,
  messengerDeliveryProgressFillRatio,
  messengerDeliveryProgressSteps,
} from "@/lib/store-order-chat/messenger-delivery-progress";

/** 주문 채팅 위 진행 표시 = 사장님 카드와 같은 4칸 (Owner 2026-11-04) */
describe("messenger delivery progress", () => {
  it("배달·픽업 4칸 이름", () => {
    expect(messengerDeliveryProgressSteps("local_delivery", "ko")).toEqual(["주문접수", "조리중", "배달중", "배달완료"]);
    expect(messengerDeliveryProgressSteps("pickup", "ko")).toEqual(["주문접수", "조리중", "픽업대기", "픽업완료"]);
  });
  it("주문접수 = 1칸 · 1/4", () => {
    expect(messengerDeliveryProgressCurrentStep("accepted", "local_delivery")).toBe(0);
    expect(messengerDeliveryProgressFillRatio("accepted", "local_delivery")).toBeCloseTo(1 / 4, 5);
  });
  it("접수 대기 = 강조 없음 · 0", () => {
    expect(messengerDeliveryProgressCurrentStep("pending", "local_delivery")).toBe(-1);
    expect(messengerDeliveryProgressFillRatio("pending", "local_delivery")).toBe(0);
  });
  it("완료 = 끝 칸 · 가득", () => {
    expect(messengerDeliveryProgressCurrentStep("completed", "local_delivery")).toBe(3);
    expect(messengerDeliveryProgressFillRatio("completed", "local_delivery")).toBe(1);
  });
});
