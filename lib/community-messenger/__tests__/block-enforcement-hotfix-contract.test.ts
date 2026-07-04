import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("CM block enforcement hotfix contract", () => {
  it("sendCommunityMessengerMessage gates blocked_target once before atomic RPC", () => {
    const src = read("lib/community-messenger/service.ts");
    const sendStart = src.indexOf("export async function sendCommunityMessengerMessage");
    const atomicStart = src.indexOf("async function trySendCommunityMessengerTextAtomic");
    const atomicFn = src.slice(atomicStart, sendStart);
    const sendFn = src.slice(sendStart, sendStart + 4000);
    expect(sendFn).toContain("assertDirectRoomCommunicationNotBlocked");
    expect(sendFn).toContain('error: "blocked_target"');
    expect(atomicFn).not.toContain("assertDirectRoomCommunicationNotBlocked");
    expect(sendFn.indexOf("assertDirectRoomCommunicationNotBlocked")).toBeLessThan(
      sendFn.indexOf("trySendCommunityMessengerTextAtomic")
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

  it("message POST route maps blocked_target to 403 without duplicate gate", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    expect(src).toContain('responsePayload.error === "blocked_target"');
    expect(src).toContain("403");
    expect(src).not.toContain("assertDirectRoomCommunicationNotBlocked");
  });

  it("post-ack notify filters blocked recipients", () => {
    const postAck = read("lib/community-messenger/server/community-messenger-send-post-ack-effects.ts");
    expect(postAck).toContain("notifyMessagePipeline");
    const pipeline = read("lib/notifications/pipeline/notify-message-pipeline.ts");
    expect(pipeline).toContain("isNotificationBlockedForRecipient");
  });

  it("P3 bilateral block hide sets blocked_hidden_at for blocker and blocked peer", () => {
    const src = read("lib/community-messenger/participant-block-hide.ts");
    expect(src).toContain("const participantUserIds = [viewer, peer]");
    expect(src).toContain("hideDirectRoomForParticipantUser");
    expect(src).toContain("restoreDirectRoomForParticipantUser");
  });

  it("community block-relations route invokes bilateral hide and restore", () => {
    const src = read("app/api/community/block-relations/route.ts");
    expect(src).toContain("hideDirectRoomsOnBlockForViewer");
    expect(src).toContain("restoreDirectRoomsOnUnblockForViewer");
  });
});
