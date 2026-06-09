import { afterEach, describe, expect, it, vi } from "vitest";
import { allowCommunityMessengerFriendInMemoryDevFallback } from "@/lib/community-messenger/friend-store-policy";

describe("allowCommunityMessengerFriendInMemoryDevFallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks in-memory fallback in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(allowCommunityMessengerFriendInMemoryDevFallback()).toBe(false);
  });

  it("allows in-memory fallback outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(allowCommunityMessengerFriendInMemoryDevFallback()).toBe(true);
  });
});
