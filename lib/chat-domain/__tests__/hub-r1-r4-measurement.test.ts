import { describe, expect, it } from "vitest";
import {
  HUB_R1_R4_MEASUREMENT,
  hubQuarantineIdsMarkedRemoveNow,
} from "@/lib/chat-domain/projections/hub-r1-r4-measurement";

describe("Hub R1–R4 measurement", () => {
  it("marks only R1 for remove_now; R2–R4 keep as wired sources", () => {
    expect(hubQuarantineIdsMarkedRemoveNow()).toEqual(["R1"]);
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R2")?.verdict).toBe("keep");
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R3")?.verdict).toBe("keep");
    expect(HUB_R1_R4_MEASUREMENT.find((r) => r.id === "R4")?.verdict).toBe("keep");
  });
});
