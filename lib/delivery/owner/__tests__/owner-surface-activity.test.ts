import { describe, expect, it } from "vitest";
import {
  isDeliveryOwnerSurfaceActive,
  markDeliveryOwnerSurfaceActive,
} from "@/lib/delivery/owner/owner-surface-activity";

describe("delivery owner surface activity", () => {
  it("activates only while Owner surfaces are mounted", () => {
    expect(isDeliveryOwnerSurfaceActive()).toBe(false);
    const release = markDeliveryOwnerSurfaceActive();
    expect(isDeliveryOwnerSurfaceActive()).toBe(true);
    release();
    expect(isDeliveryOwnerSurfaceActive()).toBe(false);
  });
});
