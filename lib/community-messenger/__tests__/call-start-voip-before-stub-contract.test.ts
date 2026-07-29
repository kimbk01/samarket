/**
 * APK→iOS CallKit-before-messenger contract.
 * VoIP on critical path; no dialing stub on 1:1 start; viewer direction; single terminal history.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatCallEventForViewer,
  resolveCallEventCanonical,
} from "@/lib/community-messenger/call-event-presentation";
import { getCallMessageText, inferResolvedEventFromStoredCallStatus } from "@/lib/community-messenger/call-event-message";
import { appendCommunityMessengerCallStubMessage } from "@/lib/community-messenger/service";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import {
  dispatchIncomingCallVoipOnCriticalPath,
  resetIncomingCallVoipDispatchIdempotencyForTests,
  setIncomingCallVoipPushSenderForTests,
} from "@/lib/community-messenger/incoming-call-voip-dispatch";

const ROOT = path.resolve(__dirname, "../../..");

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

type DevState = {
  rooms: Array<{
    id: string;
    lastMessage?: string;
    lastMessageAt?: string;
    lastMessageType?: string;
  }>;
  messages: Array<{
    id: string;
    roomId: string;
    senderId: string;
    messageType: string;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  participants: Array<{ roomId: string; userId: string; unreadCount: number }>;
  calls: unknown[];
  callSessions: unknown[];
};

function resetDevState(): DevState {
  const state: DevState = {
    rooms: [{ id: "room-1", lastMessage: "hi", lastMessageAt: "2026-06-01T00:00:00.000Z", lastMessageType: "text" }],
    messages: [],
    participants: [
      { roomId: "room-1", userId: "caller", unreadCount: 0 },
      { roomId: "room-1", userId: "callee", unreadCount: 0 },
    ],
    calls: [],
    callSessions: [],
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function devState(): DevState {
  return (globalThis as unknown as { __samarketCommunityMessengerState: DevState }).__samarketCommunityMessengerState;
}

const STARTED_AT = "2026-07-29T01:00:00.000Z";
const SESSION = "session-contract-1";

describe("call start: VoIP critical path + no dialing stub (static)", () => {
  it("route does not defer incoming push with after()", () => {
    const route = readRepo("app/api/community-messenger/rooms/[roomId]/calls/route.ts");
    expect(route).toContain('from "next/server"');
    expect(route).not.toMatch(/^\s*after\s*\(/m);
    expect(route).not.toMatch(/after\s*\(\s*async/);
    expect(route).toContain("dispatchIncomingCallVoipOnCriticalPath");
    expect(route).not.toContain("sendIncomingCallPushBestEffort");
  });

  it("startCommunityMessengerCallSession does not publish dialing stub", () => {
    const service = readRepo("lib/community-messenger/service.ts");
    expect(service).toContain("do NOT publish in-flight dialing call_stub on start");
    expect(service).not.toMatch(
      /await appendCommunityMessengerCallStubMessage\(\{[\s\S]*?status:\s*"dialing"/
    );
  });

  it("stub-message API rejects in-flight statuses", () => {
    const route = readRepo("app/api/community-messenger/calls/stub-message/route.ts");
    expect(route).not.toMatch(/status === "dialing"/);
    expect(route).not.toMatch(/status === "incoming"/);
    expect(route).toContain("in-flight dialing/incoming stub publish blocked");
  });
});

describe("viewer direction labels", () => {
  it.each(["voice", "video"] as const)("%s: caller dialing → 발신 중; callee dialing → 수신 중", (kind) => {
    expect(
      resolveCallEventCanonical({
        resolvedEvent: null,
        callStatusFallback: "dialing",
        viewerRole: "caller",
      })
    ).toBe("outgoing_started");
    expect(
      resolveCallEventCanonical({
        resolvedEvent: null,
        callStatusFallback: "dialing",
        viewerRole: "callee",
      })
    ).toBe("incoming_received");

    const caller = formatCallEventForViewer({
      callKind: kind,
      resolvedEvent: null,
      callStatusFallback: "dialing",
      viewerRole: "caller",
    });
    const callee = formatCallEventForViewer({
      callKind: kind,
      resolvedEvent: null,
      callStatusFallback: "dialing",
      viewerRole: "callee",
    });
    expect(caller.resultLabel).toBe("발신 중");
    expect(callee.resultLabel).toBe("수신 중");
    expect(callee.fullLabel).not.toContain("발신 중");
    expect(callee.listPreview).not.toContain("발신 중");

    expect(inferResolvedEventFromStoredCallStatus("dialing", "callee")).toBe("incoming_received");
    expect(
      getCallMessageText({
        callKind: kind,
        eventType: "incoming_received",
        viewerUserId: "callee",
        initiatorUserId: "caller",
      })
    ).not.toContain("발신 중");
  });
});

describe("terminal history single stub (dev SSOT)", () => {
  beforeEach(() => {
    resetDevState();
  });

  async function terminalOnly(status: "cancelled" | "rejected" | "missed" | "ended", durationSeconds?: number) {
    await appendCommunityMessengerCallStubMessage({
      userId: "caller",
      roomId: "room-1",
      sessionId: SESSION,
      callKind: "voice",
      status,
      createdAt: STARTED_AT,
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: true,
      durationSeconds,
    });
  }

  it("cancel without prior dialing → exactly 1 stub", async () => {
    await terminalOnly("cancelled");
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.callStatus).toBe("cancelled");
  });

  it("reject without prior dialing → exactly 1 stub", async () => {
    await terminalOnly("rejected");
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.callStatus).toBe("rejected");
  });

  it("missed without prior dialing → exactly 1 stub", async () => {
    await terminalOnly("missed");
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.callStatus).toBe("missed");
  });

  it("connected ended without prior dialing → exactly 1 stub", async () => {
    await terminalOnly("ended", 42);
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.callStatus).toBe("ended");
  });

  it("same session terminal twice keeps one stub", async () => {
    await terminalOnly("cancelled");
    await terminalOnly("cancelled");
    expect(devState().messages).toHaveLength(1);
  });

  it("video terminal also single stub", async () => {
    await appendCommunityMessengerCallStubMessage({
      userId: "caller",
      roomId: "room-1",
      sessionId: "session-video-1",
      callKind: "video",
      status: "missed",
      createdAt: STARTED_AT,
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: true,
    });
    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.metadata.callKind).toBe("video");
  });
});

describe("home list drops in-flight call_stub tips", () => {
  it("dialing row yields null list preview", () => {
    expect(
      listPreviewFromMessengerMessageRow({
        id: "m1",
        room_id: "room-1",
        message_type: "call_stub",
        content: "음성 통화 · 발신 중",
        metadata: { sessionId: SESSION, callStatus: "dialing", callKind: "voice" },
        created_at: STARTED_AT,
      })
    ).toBeNull();
  });

  it("terminal call_stub still previews", () => {
    const preview = listPreviewFromMessengerMessageRow({
      id: "m2",
      room_id: "room-1",
      message_type: "call_stub",
      content: "음성 통화 · 취소됨",
      metadata: { sessionId: SESSION, callStatus: "cancelled", callKind: "voice" },
      created_at: STARTED_AT,
    });
    expect(preview?.lastMessageType).toBe("call_stub");
    expect(preview?.lastMessage).toContain("취소");
  });
});

describe("VoIP dispatch idempotency + failure contract", () => {
  beforeEach(() => {
    resetIncomingCallVoipDispatchIdempotencyForTests();
    setIncomingCallVoipPushSenderForTests(null);
  });

  afterEach(() => {
    setIncomingCallVoipPushSenderForTests(null);
    resetIncomingCallVoipDispatchIdempotencyForTests();
  });

  it("duplicate sessionId skips second dispatch", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    setIncomingCallVoipPushSenderForTests(send);
    const input = {
      recipientUserId: "callee",
      sessionId: "sess-idem-1",
      roomId: "room-1",
      callerId: "caller",
      callKind: "voice" as const,
      startedAt: STARTED_AT,
    };
    const first = await dispatchIncomingCallVoipOnCriticalPath(input);
    const second = await dispatchIncomingCallVoipOnCriticalPath(input);
    expect(first.started).toBe(true);
    expect(first.skippedDuplicate).toBe(false);
    expect(second.skippedDuplicate).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("dispatch failure does not throw (session create stays ok)", async () => {
    setIncomingCallVoipPushSenderForTests(async () => {
      throw new Error("apns_down");
    });
    const result = await dispatchIncomingCallVoipOnCriticalPath({
      recipientUserId: "callee",
      sessionId: "sess-fail-1",
      roomId: "room-1",
      callerId: "caller",
      callKind: "video",
      startedAt: STARTED_AT,
    });
    expect(result.failed).toBe(true);
    expect(result.failureReason).toContain("apns_down");
    expect(result.started).toBe(true);
  });
});
