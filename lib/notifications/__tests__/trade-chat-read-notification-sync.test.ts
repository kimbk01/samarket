import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("trade chat read notification sync contract", () => {
  const chatDetail = readFileSync(join(process.cwd(), "components/chats/ChatDetailView.tsx"), "utf8");
  const chatRoomScreen = readFileSync(join(process.cwd(), "components/chats/ChatRoomScreen.tsx"), "utf8");

  it("ChatDetailView gates read on tradeChatBootstrapReady and syncs trade_message thread read", () => {
    expect(chatDetail).toContain("tradeChatBootstrapReady");
    expect(chatDetail).toContain("postNotificationThreadRead");
    expect(chatDetail).toContain('threadType: "trade_room"');
    expect(chatDetail).toContain('categories: ["trade_message"]');
    expect(chatDetail).toContain("tradeChatRouteMatchesRoom");
  });

  it("ChatRoomScreen passes bootstrap-ready flag to ChatDetailView", () => {
    expect(chatRoomScreen).toContain("tradeChatBootstrapReady");
    expect(chatRoomScreen).toContain("tradeChatBootstrapReady={tradeChatBootstrapReady}");
  });

  it("CommunityMessengerHome manual mark_read syncs notification thread read", () => {
    const home = readFileSync(
      join(process.cwd(), "components/community-messenger/CommunityMessengerHome.tsx"),
      "utf8"
    );
    expect(home).toMatch(/markRoomRead[\s\S]*postNotificationThreadRead/);
  });
});
