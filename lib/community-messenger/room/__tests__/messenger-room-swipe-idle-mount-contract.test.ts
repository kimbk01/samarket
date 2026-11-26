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

  it("allows PAGE enter while roomType is still null (cold shell continuity)", () => {
    expect(src).toMatch(/roomType may be null on cold BootstrapGate shell/);
    // 감사 11-26 §10: 움직임 생략 조건 = 분할·축소 모션·앱 시작 목적지 — roomType 은 조건이 아니다
    expect(src).toContain("const skipEnterMotion = splitPaneMode || reducedMotion || launchDestinationEntry;");
    expect(src).toMatch(/if \(skipEnterMotion\) return/);
    expect(src).not.toMatch(/skipEnterMotion = [^;]*roomType/);
  });
});
