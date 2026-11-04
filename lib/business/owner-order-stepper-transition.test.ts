import { describe, expect, it } from "vitest";
import {
  ownerOrderForwardTransition,
  ownerOrderCardStepColumnLabel,
  ownerOrderCardStepperModel,
  resolveOwnerStepperClickAction,
} from "@/lib/business/owner-order-stepper-transition";

/** 4단계 정본 (Owner 2026-11-04 · 설계안 v2 §3-2) — 배달: 주문 접수 → 조리 시작 → 배달 출발 → 배달 완료 */
describe("ownerOrderForwardTransition (delivery)", () => {
  it("preparing → delivering (포장 완료 단계 없음)", () => {
    expect(ownerOrderForwardTransition("preparing", "local_delivery")).toBe("delivering");
  });
  it("예전 ready_for_pickup → delivering", () => {
    expect(ownerOrderForwardTransition("ready_for_pickup", "local_delivery")).toBe("delivering");
  });
  it("delivering → completed", () => {
    expect(ownerOrderForwardTransition("delivering", "local_delivery")).toBe("completed");
  });
  it("arrived → completed", () => {
    expect(ownerOrderForwardTransition("arrived", "local_delivery")).toBe("completed");
  });
});

describe("ownerOrderForwardTransition (pickup)", () => {
  it("preparing → ready_for_pickup → completed", () => {
    expect(ownerOrderForwardTransition("preparing", "pickup")).toBe("ready_for_pickup");
    expect(ownerOrderForwardTransition("ready_for_pickup", "pickup")).toBe("completed");
  });
});

describe("ownerOrderCardStepperModel (delivery)", () => {
  it("delivering = 3칸(배달중) 현재 · 다음 칸 3", () => {
    const m = ownerOrderCardStepperModel("local_delivery", "delivering");
    expect(m.visual).toEqual(["done", "done", "current", "upcoming"]);
    expect(m.actionableIndex).toBe(3);
  });
  it("칸 이름 = 단계 이름 (버튼 이름으로 바꾸지 않음)", () => {
    expect([0, 1, 2, 3].map((i) => ownerOrderCardStepColumnLabel(i, "delivering", "local_delivery", 3, "ko"))).toEqual([
      "주문접수",
      "조리중",
      "배달중",
      "배달완료",
    ]);
    expect([0, 1, 2, 3].map((i) => ownerOrderCardStepColumnLabel(i, "preparing", "pickup", 2, "ko"))).toEqual([
      "주문접수",
      "조리중",
      "픽업대기",
      "픽업완료",
    ]);
  });
});

describe("resolveOwnerStepperClickAction", () => {
  it("delivering tap on column 3 confirms completed with 「배달 완료」", () => {
    const action = resolveOwnerStepperClickAction("delivering", "local_delivery", 3, "홍길동", "ko");
    expect(action?.kind).toBe("confirm");
    if (action?.kind === "confirm") {
      expect(action.nextStatus).toBe("completed");
      expect(action.stepLabel).toBe("배달 완료");
      expect(action.message).toBe("배달 완료로 바꿀까요?");
    }
  });
  it("pending → accept sheet", () => {
    expect(resolveOwnerStepperClickAction("pending", "local_delivery", 0, "홍길동", "ko")).toEqual({ kind: "accept_sheet" });
  });
});
