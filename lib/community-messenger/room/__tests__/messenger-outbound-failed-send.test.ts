import { describe, expect, it, vi } from "vitest";
import {
  clearMessengerOutboundFailedSend,
  disposeMessengerOutboundFailedSends,
  getMessengerOutboundFailedSend,
  markMessengerOutboundRowFailed,
  markMessengerOutboundRowRetrying,
  nextUnconfirmedTextSendAfterFailure,
  nextUnconfirmedTextSendAfterSuccess,
  pickTextSendClientMessageId,
  planMessengerMediaSendFailure,
  registerMessengerOutboundFailedSend,
  runMessengerSequentialSends,
  type MessengerOutboundRow,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const ME = "11111111-1111-4111-8111-111111111111";

function row(over: Partial<MessengerOutboundRow>): MessengerOutboundRow {
  return {
    id: "m1",
    roomId: "r",
    senderId: ME,
    senderLabel: "me",
    messageType: "image",
    content: "blob:x",
    createdAt: "2026-10-15T00:00:00.000Z",
    isMine: true,
    callKind: null,
    callStatus: null,
    ...over,
  } as MessengerOutboundRow;
}

describe("C-5 text cid reuse policy", () => {
  const attempt = { content: "hi", clientMessageId: "cid-1" };
  it("keeps (content,cid) after indeterminate failure (5xx/timeout/network)", () => {
    expect(nextUnconfirmedTextSendAfterFailure(null, attempt, "indeterminate")).toEqual(attempt);
  });
  it("clears the kept cid after a definitive 4xx rejection of that cid", () => {
    expect(nextUnconfirmedTextSendAfterFailure(attempt, attempt, "definitive")).toBeNull();
  });
  it("definitive failure of an unrelated cid keeps the existing one", () => {
    const other = { content: "x", clientMessageId: "cid-2" };
    expect(nextUnconfirmedTextSendAfterFailure(other, attempt, "definitive")).toBe(other);
  });
  it("manual resend of same content reuses the cid; different content gets a new one", () => {
    const create = vi.fn(() => "new");
    expect(pickTextSendClientMessageId(attempt, "hi", create)).toBe("cid-1");
    expect(pickTextSendClientMessageId(attempt, "other", create)).toBe("new");
    expect(pickTextSendClientMessageId(null, "hi", create)).toBe("new");
  });
  it("success clears only the matching cid", () => {
    expect(nextUnconfirmedTextSendAfterSuccess(attempt, "cid-1")).toBeNull();
    expect(nextUnconfirmedTextSendAfterSuccess(attempt, "cid-9")).toBe(attempt);
  });
});

describe("C-3 / C-10 media failure plan", () => {
  it("indeterminate keeps the row, bytes (voice Blob) and preview for retry", () => {
    expect(planMessengerMediaSendFailure("indeterminate")).toEqual({
      keepRowAsFailed: true,
      keepBytesForRetry: true,
      releasePreview: false,
    });
  });
  it("definitive drops row and bytes", () => {
    expect(planMessengerMediaSendFailure("definitive")).toEqual({
      keepRowAsFailed: false,
      keepBytesForRetry: false,
      releasePreview: true,
    });
  });
});

describe("failed row marking", () => {
  it("marks failed / retrying while staying pending (merge keeps pending rows)", () => {
    const rows = [row({ id: "p1", pending: true, clientMessageId: "c1" }), row({ id: "m2" })];
    const failed = markMessengerOutboundRowFailed(rows, "p1");
    expect(failed[0]).toMatchObject({ pending: true, sendFailed: true });
    expect(failed[1]).toBe(rows[1]);
    const merged = mergeRoomMessages(failed, []);
    expect(merged.find((m) => m.id === "p1")).toMatchObject({ sendFailed: true });
    const retrying = markMessengerOutboundRowRetrying(failed, "p1");
    expect(retrying[0]).toMatchObject({ pending: true, sendFailed: false });
    expect(markMessengerOutboundRowFailed(rows, "nope")).toBe(rows);
  });
});

describe("C-2 media pending row removed by cid when the confirmed row arrives", () => {
  it("image / file / voice pending with cid are replaced (no double bubble)", () => {
    for (const messageType of ["image", "file", "voice"] as const) {
      const pending = row({ id: `pending:${messageType}`, messageType, pending: true, clientMessageId: "cid-x", content: "blob:1" });
      const confirmed = row({
        id: "real",
        messageType,
        clientMessageId: "cid-x",
        content: "https://cdn/x",
        createdAt: "2026-10-15T00:01:00.000Z",
      }) as CommunityMessengerMessage;
      const merged = mergeRoomMessages([pending], [confirmed]);
      expect(merged.map((m) => m.id)).toEqual(["real"]);
    }
  });
  it("failed row with a different cid survives", () => {
    const pending = row({ id: "p", pending: true, sendFailed: true, clientMessageId: "cid-a" });
    const merged = mergeRoomMessages([pending], [row({ id: "real", clientMessageId: "cid-b" }) as CommunityMessengerMessage]);
    expect(merged.map((m) => m.id).sort()).toEqual(["p", "real"]);
  });
});

describe("C-3 sequential sends continue on failure", () => {
  it("one failure (false or throw) does not abort the rest and is summarized", async () => {
    const seen: number[] = [];
    const r = await runMessengerSequentialSends([1, 2, 3, 4], async (n) => {
      seen.push(n);
      if (n === 2) return false;
      if (n === 3) throw new Error("network");
      return true;
    });
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(r).toEqual({ sent: 2, failed: 2 });
  });
});

describe("failed send registry", () => {
  it("register / get / clear / dispose", () => {
    const dispose = vi.fn();
    registerMessengerOutboundFailedSend("t1", { retry: vi.fn(), discard: vi.fn(), dispose });
    expect(getMessengerOutboundFailedSend("t1")).not.toBeNull();
    clearMessengerOutboundFailedSend("t1");
    expect(getMessengerOutboundFailedSend("t1")).toBeNull();
    registerMessengerOutboundFailedSend("t2", { retry: vi.fn(), discard: vi.fn(), dispose });
    disposeMessengerOutboundFailedSends(["t2"]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(getMessengerOutboundFailedSend("t2")).toBeNull();
  });
});
