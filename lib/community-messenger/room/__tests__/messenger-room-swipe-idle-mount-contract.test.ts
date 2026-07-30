import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("messenger room swipe-back — no mount enter flicker (Fix A)", () => {
  const src = readFileSync(
    resolve(root, "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx"),
    "utf8"
  );

  it("initializes phase as idle (never mount enter / enter-active)", () => {
    expect(src).toMatch(/useState<AnimPhase>\("idle"\)/);
    expect(src).not.toMatch(/useState<AnimPhase>\("enter"\)/);
    expect(src).not.toContain('current === "enter" ? "enter-active"');
    expect(src).not.toContain("MESSENGER_LIST_ROOM_ENTER_MS");
  });

  it("does not apply messenger-enter class on surface", () => {
    expect(src).not.toMatch(/phase === "enter"\s*\?\s*"messenger-enter"/);
    expect(src).not.toMatch(/phase === "enter-active"\s*\?\s*"messenger-enter-active"/);
  });

  it("keeps exit / swipe phases", () => {
    expect(src).toContain('"exit-active"');
    expect(src).toContain("messenger-exit-active");
    expect(src).toContain("snap-away");
    expect(src).toContain("snap-back");
    expect(src).toContain("dragging");
  });
});
