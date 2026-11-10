import { describe, expect, it } from "vitest";
import { toSemaphoreApiNumber } from "@/lib/auth/semaphore-sms";

describe("toSemaphoreApiNumber", () => {
  it("converts 09 local format", () => {
    expect(toSemaphoreApiNumber("09171234567")).toBe("639171234567");
  });

  it("converts +63 E.164 format", () => {
    expect(toSemaphoreApiNumber("+639171234567")).toBe("639171234567");
  });

  it("keeps 639 format", () => {
    expect(toSemaphoreApiNumber("639171234567")).toBe("639171234567");
  });
});
