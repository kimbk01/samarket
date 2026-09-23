import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("messenger room swipe — PAGE_HIERARCHY enter/exit SSOT", () => {
  const src = readFileSync(
    resolve(root, "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx"),
    "utf8"
  );

  it("mounts with enter → enter-active (RIGHT→LEFT)", () => {
    expect(src).toContain('"enter"');
    expect(src).toContain('"enter-active"');
    expect(src).toContain("MESSENGER_LIST_ROOM_ENTER_MS");
    expect(src).toMatch(/phase === "enter"\s*\?\s*"messenger-enter"/);
    expect(src).toContain("messenger-enter-active");
  });

  it("UI back uses snap-away (LEFT→RIGHT) same as swipe", () => {
    expect(src).toContain('setPhase("snap-away")');
    expect(src).toContain("ONE return presentation owner");
  });

  it("keeps exit / swipe phases", () => {
    expect(src).toContain('"exit-active"');
    expect(src).toContain("messenger-exit-active");
    expect(src).toContain("snap-away");
    expect(src).toContain("snap-back");
    expect(src).toContain("dragging");
  });
});
