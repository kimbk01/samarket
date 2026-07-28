/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/unread/messenger-room-unread-authority", () => ({
  resolveMessengerRoomChatDomain: vi.fn(),
}));

import { resolveMessengerRoomChatDomain } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { resolveCmInAppSoundNotificationDomain } from "@/lib/community-messenger/notifications/cm-in-app-sound-domain";

describe("resolveCmInAppSoundNotificationDomain", () => {
  beforeEach(() => {
    vi.mocked(resolveMessengerRoomChatDomain).mockReset();
  });

  it("maps general_direct to community_direct_chat", () => {
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValue("general_direct");
    expect(resolveCmInAppSoundNotificationDomain("room-1", "user-1")).toBe("community_direct_chat");
  });

  it("maps group to community_group_chat", () => {
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValue("group");
    expect(resolveCmInAppSoundNotificationDomain("room-g", "user-1")).toBe("community_group_chat");
  });

  it("does not disguise trade/store_order/unknown as direct", () => {
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValue("trade");
    expect(resolveCmInAppSoundNotificationDomain("room-t", "user-1")).toBeNull();
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValue("store_order");
    expect(resolveCmInAppSoundNotificationDomain("room-s", "user-1")).toBeNull();
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValue(null);
    expect(resolveCmInAppSoundNotificationDomain("room-x", "user-1")).toBeNull();
  });
});
