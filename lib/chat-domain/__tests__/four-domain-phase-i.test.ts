import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDomainRoomDockModel,
  buildDomainRoomHeaderModel,
  PHASE_I_ROOM_CHROME_REMOVE_CANDIDATES,
  PHASE_J_DELETED_CHROME,
  planDomainRoomChrome,
  planDomainRoomEntry,
} from "@/lib/chat-domain/room-chrome";

describe("Phase I domain room chrome / entry", () => {
  it("plans entry as not_wired legacy multi-shell", () => {
    const plan = planDomainRoomEntry({ chatDomain: "general_direct", roomId: "r1" });
    expect(plan).toMatchObject({
      href: "/community-messenger/rooms/r1",
      chromeMode: "legacy_multi_shell",
      status: "not_wired",
    });
  });

  it("plans single-frame chrome as not_wired", () => {
    const chrome = planDomainRoomChrome({ chatDomain: "trade", roomId: "r1" });
    expect(chrome).toMatchObject({
      singleFrameActive: false,
      status: "not_wired",
      slots: { header: "legacy", body: "legacy", dock: "legacy" },
    });
  });

  it("header/dock builders stay not_wired", () => {
    expect(
      buildDomainRoomHeaderModel({
        chatDomain: "group",
        roomId: "r1",
        title: "G",
      }).status,
    ).toBe("not_wired");
    expect(
      buildDomainRoomDockModel({
        chatDomain: "group",
        roomId: "r1",
        composerEnabled: true,
      }).status,
    ).toBe("not_wired");
  });

  it("REMOVE remaining candidates still exist; Phase J deleted stay gone", () => {
    const root = resolve(__dirname, "../../..");
    for (const c of PHASE_I_ROOM_CHROME_REMOVE_CANDIDATES) {
      expect(existsSync(resolve(root, c.path)), c.path).toBe(true);
    }
    for (const c of PHASE_J_DELETED_CHROME) {
      expect(existsSync(resolve(root, c.path)), `deleted ${c.path}`).toBe(false);
    }
  });
});
