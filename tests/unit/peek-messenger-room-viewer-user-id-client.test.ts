import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMessengerRoomE2eDiagEnabledClient,
  peekMessengerRoomViewerUserIdClient,
} from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";

const UUID = "e6c03412-eabf-4dd9-ba52-d33a10a1f54b";

describe("peek-messenger-room-viewer-user-id-client", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads kasama_dev_uid_pub", () => {
    document.cookie = `kasama_dev_uid_pub=${UUID}`;
    expect(peekMessengerRoomViewerUserIdClient()).toBe(UUID);
  });

  it("detects e2e diag cookie in non-production", () => {
    vi.stubEnv("NODE_ENV", "development");
    document.cookie = "samarket_e2e_room_diag=1";
    expect(isMessengerRoomE2eDiagEnabledClient()).toBe(true);
  });
});
