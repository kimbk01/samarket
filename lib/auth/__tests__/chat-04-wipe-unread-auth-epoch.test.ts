import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyGeneralDirectListProjection,
  clearDomainListProjectionsForAuthEpoch,
  getDomainListProjection,
} from "@/lib/chat-domain/list/domain-list-writers";
import {
  applyMessengerRoomUnreadFact,
  clearMessengerRoomUnreadFactsForAuthEpoch,
  peekMessengerRoomUnreadFact,
  recountBottomChatUnreadRoomCount,
} from "@/lib/community-messenger/unread/messenger-room-unread-authority";

describe("CHAT-04 wipe unread auth-epoch clear", () => {
  afterEach(() => {
    clearMessengerRoomUnreadFactsForAuthEpoch();
    clearDomainListProjectionsForAuthEpoch();
  });

  it("wipe source calls both auth-epoch clears from resetInMemoryClientStores path", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth/client-session-wipe.ts"), "utf8");
    expect(src).toContain("clearMessengerRoomUnreadFactsForAuthEpoch");
    expect(src).toContain("clearDomainListProjectionsForAuthEpoch");
    const resetIdx = src.indexOf("function resetInMemoryClientStores");
    expect(resetIdx).toBeGreaterThan(-1);
    const snippet = src.slice(resetIdx, resetIdx + 900);
    expect(snippet).toContain("clearMessengerRoomUnreadFactsForAuthEpoch()");
    expect(snippet).toContain("clearDomainListProjectionsForAuthEpoch()");
  });

  it("clears prior-user facts and domain projections so recount for next viewer is 0", () => {
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: Date.now(),
      items: [
        {
          roomId: "room-a-unread",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 3,
          lastMessageAt: "2026-01-01T00:00:00.000Z",
          title: "peer",
        },
      ],
    });
    applyMessengerRoomUnreadFact({
      roomId: "room-a-unread",
      unreadCount: 3,
      lastMessageAt: "2026-01-01T00:00:00.000Z",
    });

    expect(peekMessengerRoomUnreadFact("room-a-unread")?.unreadCount).toBe(3);
    expect(getDomainListProjection("general_direct")?.items.length).toBe(1);
    expect(recountBottomChatUnreadRoomCount("user-b")).toBeGreaterThan(0);

    clearMessengerRoomUnreadFactsForAuthEpoch();
    clearDomainListProjectionsForAuthEpoch();

    expect(peekMessengerRoomUnreadFact("room-a-unread")).toBeNull();
    expect(getDomainListProjection("general_direct")).toBeNull();
    expect(recountBottomChatUnreadRoomCount("user-b")).toBe(0);
  });
});
