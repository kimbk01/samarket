import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("CM block enforcement hotfix contract", () => {
  it("sendCommunityMessengerMessage gates blocked_target before send", () => {
    const src = read("lib/community-messenger/service.ts");
    expect(src).toContain("assertDirectRoomCommunicationNotBlocked");
    expect(src).toContain('error: "blocked_target"');
  });

  it("atomic send path gates blocked_target before RPC", () => {
    const src = read("lib/community-messenger/service.ts");
    const fn = src.slice(src.indexOf("async function trySendCommunityMessengerTextAtomic"));
    expect(fn).toContain("assertDirectRoomCommunicationNotBlocked");
    expect(fn.indexOf("community_messenger_send_text_message")).toBeGreaterThan(
      fn.indexOf("assertDirectRoomCommunicationNotBlocked")
    );
  });

  it("startCommunityMessengerCallSession evaluates block gate before reuse return", () => {
    const src = read("lib/community-messenger/service.ts");
    const fn = src.slice(src.indexOf("export async function startCommunityMessengerCallSession"));
    const gateIdx = fn.indexOf("canStartDirectCallBetweenUsers");
    const reuseIdx = fn.indexOf("reused: true");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(reuseIdx).toBeGreaterThan(gateIdx);
  });

  it("message POST route gates blocked_target before send handler", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    expect(src).toContain("assertDirectRoomCommunicationNotBlocked");
    const gateIdx = src.indexOf("assertDirectRoomCommunicationNotBlocked");
    const sendIdx = src.indexOf("sendCommunityMessengerMessage");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(gateIdx);
  });

  it("post-ack notify filters blocked recipients", () => {
    const src = read("lib/community-messenger/server/community-messenger-send-post-ack-effects.ts");
    expect(src).toContain("isBlockedEitherWayActive");
  });
});
