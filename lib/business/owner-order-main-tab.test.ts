import { describe, expect, it } from "vitest";
import { ownerOrderMainTabForStatus } from "@/lib/business/owner-order-main-tab";

describe("ownerOrderMainTabForStatus", () => {
  it("maps pending to new", () => {
    expect(ownerOrderMainTabForStatus("pending")).toBe("new");
  });

  it("maps in-flight to progress", () => {
    expect(ownerOrderMainTabForStatus("preparing")).toBe("progress");
    expect(ownerOrderMainTabForStatus("delivering")).toBe("progress");
  });

  it("maps terminal states", () => {
    expect(ownerOrderMainTabForStatus("completed")).toBe("done");
    expect(ownerOrderMainTabForStatus("cancelled")).toBe("cancelled");
  });
});
