import { describe, expect, it } from "vitest";
import {
  HUB_R1_R4_MEASUREMENT,
  hubQuarantineIdsMarkedRemoveNow,
} from "@/lib/chat-domain/projections/hub-r1-r4-measurement";

describe("Hub R1–R4 measurement", () => {
  it("marks only R1 for remove_now; R2 keep; R3–R4 defer", () => {
    expect(hubQuarantineIdsMarkedRemoveNow()).toEqual(["R1"]);
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R2")?.verdict).toBe("keep");
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R3")?.verdict).toBe("defer_surface_cutover");
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R4")?.verdict).toBe("defer_surface_cutover");
  });
});
