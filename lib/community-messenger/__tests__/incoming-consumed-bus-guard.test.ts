import { describe, expect, it } from "vitest";
import {
  isIncomingConsumedBusDismissOnly,
  resolveIncomingConsumedBusSealReason,
} from "@/lib/community-messenger/call-events/incoming-consumed-bus-guard";

describe("incoming-consumed-bus-guard", () => {
  it("maps gateway accept/decline reasons to seal", () => {
    expect(resolveIncomingConsumedBusSealReason("accepted")).toBe("accepted");
    expect(resolveIncomingConsumedBusSealReason("declined")).toBe("declined");
    expect(resolveIncomingConsumedBusSealReason("rejected")).toBe("declined");
  });

  it("empty or unknown reason stays dismiss-only", () => {
    expect(resolveIncomingConsumedBusSealReason(undefined)).toBeNull();
    expect(resolveIncomingConsumedBusSealReason("")).toBeNull();
    expect(resolveIncomingConsumedBusSealReason("banner_minimize")).toBeNull();
    expect(isIncomingConsumedBusDismissOnly("banner_minimize")).toBe(true);
    expect(isIncomingConsumedBusDismissOnly("accepted")).toBe(false);
  });
});
