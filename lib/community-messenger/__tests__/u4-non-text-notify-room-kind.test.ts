/**
 * U4 — NOTIF-03: non-text CM messages (image/sticker/file/voice/share) use the same
 * roomKind authority as the text path (stored chat_domain → legacy room_type/direct_key).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const notifyMessagePipeline = vi.fn(async () => ({ decisionSnapshotsByRecipientId: {}, deferredPushes: [] }));
vi.mock("@/lib/notifications/pipeline/notify-message-pipeline", () => ({
  notifyMessagePipeline: (...args: unknown[]) => notifyMessagePipeline(...(args as [])),
}));

import { notifyCommunityMessengerMessageRecipients } from "@/lib/community-messenger/service";

function sbWithRoom(room: Record<string, unknown> | null, error: { message: string } | null = null) {
  const eq = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: room, error })) }));
  const select = vi.fn(() => ({ eq }));
  return { sb: { from: vi.fn(() => ({ select })) } as never, select, eq };
}

const base = { roomId: "room-1", messageId: "m-1", senderUserId: "u-s", preview: "[img]", recipientUserIds: ["u-r"] };

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("NOTIF-03 non-text roomKind", () => {
  beforeEach(() => notifyMessagePipeline.mockClear());

  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["group chat_domain", { chat_domain: "group", room_type: "private_group", direct_key: null }, "group"],
    ["trade chat_domain", { chat_domain: "trade", room_type: "direct", direct_key: "trade_item:x" }, "trade"],
    ["store_order chat_domain", { chat_domain: "store_order", room_type: "direct", direct_key: "store_order:o" }, "store_order"],
    ["general_direct chat_domain", { chat_domain: "general_direct", room_type: "direct", direct_key: "a:b" }, "direct"],
    ["legacy open_group (no chat_domain)", { chat_domain: null, room_type: "open_group", direct_key: null }, "group"],
    ["legacy trade direct_key (no chat_domain)", { chat_domain: null, room_type: "direct", direct_key: "trade_pc:1" }, "trade"],
  ];
  for (const [label, room, kind] of cases) {
    it(label, async () => {
      const { sb, select, eq } = sbWithRoom(room);
      notifyCommunityMessengerMessageRecipients(sb, base);
      await flush();
      expect(select).toHaveBeenCalledWith("chat_domain, room_type, direct_key");
      expect(eq).toHaveBeenCalledWith("id", "room-1");
      expect(notifyMessagePipeline).toHaveBeenCalledTimes(1);
      const input = (notifyMessagePipeline.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(input.roomKind).toBe(kind);
      expect(input.directKey).toBe(room.direct_key ?? null);
      expect(input).toMatchObject(base);
    });
  }

  it("room lookup failure → previous behavior (no roomKind), still notifies", async () => {
    const { sb } = sbWithRoom(null, { message: "boom" });
    notifyCommunityMessengerMessageRecipients(sb, base);
    await flush();
    const input = (notifyMessagePipeline.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(input).not.toHaveProperty("roomKind");
    expect(input.directKey).toBeNull();
  });

  it("all 5 non-text senders go through the helper (no direct pipeline call)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(src.match(/void notifyCommunityMessengerMessageRecipients\(/g)?.length).toBe(5);
  });
});
