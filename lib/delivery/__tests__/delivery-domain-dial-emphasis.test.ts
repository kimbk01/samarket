import { describe, expect, it } from "vitest";
import { resolveHomeHubDialEmphasizedTabId } from "@/lib/delivery/delivery-domain-dial-emphasis";

describe("resolveHomeHubDialEmphasizedTabId", () => {
  it("거래 레일 — 거래(home) 칩 강조", () => {
    expect(resolveHomeHubDialEmphasizedTabId("trade")).toBe("home");
  });

  it("배달 레일 — 배달(stores) 칩 강조", () => {
    expect(resolveHomeHubDialEmphasizedTabId("delivery")).toBe("stores");
  });
});
