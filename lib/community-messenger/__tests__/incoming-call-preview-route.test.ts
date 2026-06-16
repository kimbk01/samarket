import { describe, expect, it } from "vitest";
import {
  buildIncomingCallPreviewHref,
  INCOMING_CALL_PREVIEW_QUERY,
  isIncomingCallPreviewRoute,
} from "@/lib/community-messenger/incoming-call-preview-route";

describe("incoming-call-preview-route", () => {
  it("builds preview href without accept action", () => {
    expect(buildIncomingCallPreviewHref("sess-1")).toBe(
      `/community-messenger/calls/sess-1?${INCOMING_CALL_PREVIEW_QUERY}`
    );
    expect(buildIncomingCallPreviewHref("sess-1")).not.toContain("action=accept");
  });

  it("detects incomingPreview=1 query", () => {
    expect(isIncomingCallPreviewRoute(new URLSearchParams("incomingPreview=1"))).toBe(true);
    expect(isIncomingCallPreviewRoute(new URLSearchParams("action=accept"))).toBe(false);
  });
});
