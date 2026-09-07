import { describe, expect, it } from "vitest";
import { resolveMessengerAttachmentCapabilities } from "@/lib/community-messenger/attachment/attachment-action-capability";

describe("resolveMessengerAttachmentCapabilities", () => {
  it("GENERAL eligible: photo + gift; call/map never in attachment menu", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: false,
      roomChatDomain: "general_direct",
      peerUserId: "u1",
      giftVisible: true,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo", "gift"]);
    expect(caps.photo).toBe(true);
    expect(caps.gift).toBe(true);
    expect(caps.call).toBe(false);
    expect(caps.map).toBe(false);
    expect(caps.money).toBe(false);
  });

  it("GENERAL non-eligible: photo only; gift/call/map absent", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: false,
      roomChatDomain: "general_direct",
      peerUserId: "u1",
      giftVisible: false,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo"]);
    expect(caps.gift).toBe(false);
    expect(caps.call).toBe(false);
    expect(caps.map).toBe(false);
  });

  it("GROUP: photo only; gift/call/map absent", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: true,
      roomChatDomain: "group",
      peerUserId: "",
      giftVisible: false,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo"]);
    expect(caps.gift).toBe(false);
    expect(caps.call).toBe(false);
    expect(caps.map).toBe(false);
  });

  it("TRADE: photo only; gift/call/map absent", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: false,
      roomChatDomain: "trade",
      peerUserId: "seller",
      giftVisible: false,
      callVisible: true,
    });
    expect(caps.actions).toEqual(["photo"]);
    expect(caps.gift).toBe(false);
    expect(caps.call).toBe(false);
    expect(caps.map).toBe(false);
  });

  it("ORDER: photo only; gift/call/map absent", () => {
    const caps = resolveMessengerAttachmentCapabilities({
      isGroupRoom: false,
      roomChatDomain: "store_order",
      peerUserId: "owner",
      giftVisible: false,
      callVisible: false,
    });
    expect(caps.actions).toEqual(["photo"]);
    expect(caps.gift).toBe(false);
    expect(caps.call).toBe(false);
    expect(caps.map).toBe(false);
  });
});
