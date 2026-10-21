import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  planMessengerTextSendFailure,
  shouldRestoreComposerTextOnFailure,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";

const root = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("M-8 text send failure plan", () => {
  it("indeterminate keeps a failed row (no input restore); definitive removes row and restores", () => {
    expect(planMessengerTextSendFailure("indeterminate")).toEqual({ keepRowAsFailed: true, restoreInputIfEmpty: false });
    expect(planMessengerTextSendFailure("definitive")).toEqual({ keepRowAsFailed: false, restoreInputIfEmpty: true });
  });
  it("restore only into an empty input (never overwrite new typing)", () => {
    expect(shouldRestoreComposerTextOnFailure("", "hi")).toBe(true);
    expect(shouldRestoreComposerTextOnFailure("  ", "hi")).toBe(true);
    expect(shouldRestoreComposerTextOnFailure(undefined, "hi")).toBe(true);
    expect(shouldRestoreComposerTextOnFailure("new text", "hi")).toBe(false);
    expect(shouldRestoreComposerTextOnFailure("", "  ")).toBe(false);
  });
});

describe("M-8 / K-3 / K-4 controller contract", () => {
  const controller = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
  const sheets = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx");
  const composer = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx");

  it("text failure uses the shared failed-row registry with same cid retry", () => {
    const attempt = controller.slice(
      controller.indexOf("const runTextSendAttempt = async"),
      controller.indexOf("const sendRawText = useCallback(")
    );
    expect(attempt).toContain("planMessengerTextSendFailure(failure)");
    expect(attempt).toContain("registerMessengerOutboundFailedSend(tempId");
    expect(attempt).toContain("markMessengerOutboundRowFailed(prev, tempId)");
    expect(attempt).toContain("runTextSendAttemptRef.current({ tempId, clientMessageId, trimmed, replyId })");
    expect(attempt).toContain('handleFailure("indeterminate")');
    expect(attempt).not.toMatch(/setMessage\(restoreOnFail\)/);
  });

  it("K-3: edit returns success boolean and sendMessage restores on failure", () => {
    expect(controller).toContain("async (messageId: string, content: string): Promise<boolean> =>");
    const send = controller.slice(controller.indexOf("const sendMessage = useCallback("), controller.indexOf("const sendEmojiText"));
    expect(send).toContain("const ok = await editRoomMessageText(editTarget.id, raw);");
    expect(send).toContain("if (!ok) restoreComposerTextIfEmpty(raw);");
    expect(send).toContain("return ok;");
  });

  it("K-4: emoji sheet sends through raw path, not the edit path", () => {
    expect(sheets).toContain("vm.sendEmojiText(emoji)");
    expect(sheets).not.toContain("vm.sendMessage(emoji)");
    const emoji = controller.slice(controller.indexOf("const sendEmojiText = useCallback("));
    expect(emoji.slice(0, 800)).toContain("sendRawText(content, undefined");
    expect(emoji.slice(0, 800)).not.toContain("editRoomMessageText");
  });

  it("composer no longer overwrites input on failure by itself", () => {
    expect(composer).not.toContain("if (!ok) setDraft(text)");
  });
});
