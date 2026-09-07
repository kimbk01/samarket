import { describe, expect, it } from "vitest";
import { resolveMessengerAttachmentCapabilities } from "@/lib/community-messenger/attachment/attachment-action-capability";

describe("resolveMessengerAttachmentCapabilities", () => {
  it("DIRECT friend: photo gift call map; money never", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: false,
      roomChatDomain: "general_direct",
      peerUserId: "u1",
      giftVisible: true,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo", "gift", "call", "map"]);
    expect(caps.money).toBe(false);
  });

  it("GROUP: no gift; call optional; money never", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: true,
      roomChatDomain: "private_group",
      peerUserId: "",
      giftVisible: false,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo", "call", "map"]);
    expect(caps.gift).toBe(false);
  });

  it("GROUP without call capability hides call", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: true,
      roomChatDomain: "private_group",
      peerUserId: "",
      giftVisible: false,
      callVisible: false,
    });
    expect(caps.actions).toEqual(["photo", "map"]);
  });
});
