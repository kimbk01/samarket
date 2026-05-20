import { describe, expect, it } from "vitest";
import {
  ownerOrderForwardTransition,
  ownerOrderCardStepColumnLabel,
  ownerOrderCardStepperModel,
  resolveOwnerStepperClickAction,
} from "@/lib/business/owner-order-stepper-transition";

describe("ownerOrderForwardTransition (delivery)", () => {
  it("ready_for_pickup → delivering", () => {
    expect(ownerOrderForwardTransition("ready_for_pickup", "local_delivery")).toBe("delivering");
  });

  it("delivering → completed (not stuck on arrived-only)", () => {
    expect(ownerOrderForwardTransition("delivering", "local_delivery")).toBe("completed");
  });

  it("arrived → completed", () => {
    expect(ownerOrderForwardTransition("arrived", "local_delivery")).toBe("completed");
  });
});

describe("ownerOrderCardStepperModel (delivery)", () => {
  it("delivering highlights column 3 (배달완료)", () => {
    const m = ownerOrderCardStepperModel("local_delivery", "delivering");
    expect(m.actionableIndex).toBe(3);
  });

  it("delivering column 3 label is 배달완료", () => {
    expect(
      ownerOrderCardStepColumnLabel(3, "delivering", "local_delivery", 3)
    ).toBe("배달완료");
  });

  it("ready_for_pickup column 2 label is 배달 시작", () => {
    expect(
      ownerOrderCardStepColumnLabel(2, "ready_for_pickup", "local_delivery", 2)
    ).toBe("배달 시작");
  });
});

describe("resolveOwnerStepperClickAction", () => {
  it("delivering tap on column 3 confirms completed", () => {
    const action = resolveOwnerStepperClickAction(
      "delivering",
      "local_delivery",
      3,
      "홍길동"
    );
    expect(action?.kind).toBe("confirm");
    if (action?.kind === "confirm") {
      expect(action.nextStatus).toBe("completed");
    }
  });
});
