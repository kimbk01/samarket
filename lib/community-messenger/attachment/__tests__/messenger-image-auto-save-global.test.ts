/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messengerMediaRouteUrlFor } from "@/lib/community-messenger/media/messenger-media-ref";
import type { MessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

const saveMessengerImages = vi.fn();
const resolveMessengerImageSaveMode = vi.fn(async () => "native");

vi.mock("@/lib/community-messenger/attachment/messenger-image-save", async (orig) => {
  const actual = await orig<typeof import("@/lib/community-messenger/attachment/messenger-image-save")>();
  return {
    ...actual,
    saveMessengerImages: (urls: string[]) => saveMessengerImages(urls),
    resolveMessengerImageSaveMode: () => resolveMessengerImageSaveMode(),
  };
});
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUserIdForDb: vi.fn(async () => "viewer-1") }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn(() => null) }));

const VIEWER = "viewer-1";
const PEER = "peer-1";
const P = "https://x/storage/v1/object/public/post-images/u/r";

function row(id: string, createdAt: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    room_id: "room-a",
    sender_id: PEER,
    message_type: "image",
    content: `${P}/${id}.thumb.webp`,
    metadata: { image_original_url: `${P}/${id}.jpg` },
    created_at: createdAt,
    deleted_at: null,
    deleted_for_everyone_at: null,
    is_hidden_by_admin: false,
    ...over,
  };
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("auto-save candidates (pure query builder / filter / mapper)", () => {
  it("normalizes since: invalid → null, future → now, too old → 7d lookback", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(m.normalizeMessengerImageAutoSaveSince(null, now)).toBeNull();
    expect(m.normalizeMessengerImageAutoSaveSince("nope", now)).toBeNull();
    expect(m.normalizeMessengerImageAutoSaveSince("2027-01-01T00:00:00Z", now)).toBe("2026-10-15T12:00:00.000Z");
    expect(m.normalizeMessengerImageAutoSaveSince("2020-01-01T00:00:00Z", now)).toBe(
      new Date(now - m.MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_LOOKBACK_MS).toISOString(),
    );
    expect(m.normalizeMessengerImageAutoSaveSince("2026-10-15T11:00:00Z", now)).toBe("2026-10-15T11:00:00.000Z");
  });

  it("selects only active (left_at null), non-blocked participant rooms; dedupes; caps", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const r = m.selectMessengerAutoSaveCandidateRooms([
      { room_id: "a", left_at: null },
      { room_id: "a", left_at: null },
      { room_id: "left", left_at: "2026-10-01T00:00:00Z" },
      { room_id: "blocked", left_at: null, blocked_hidden_at: "2026-10-01T00:00:00Z" },
      { room_id: "c", left_at: null, cleared_at: "2026-10-15T10:00:00Z" },
    ]);
    expect(r.roomIds).toEqual(["a", "c"]);
    expect(r.clearedAtMsByRoom.get("c")).toBe(Date.parse("2026-10-15T10:00:00Z"));
    expect(m.selectMessengerAutoSaveCandidateRooms([{ room_id: "x" }, { room_id: "y" }], 1).roomIds).toEqual(["x"]);
    expect(m.chunkMessengerAutoSaveRoomIds(["1", "2", "3"], 2)).toEqual([["1", "2"], ["3"]]);
  });

  it("builds the scoped read-only query: rooms in, image, not deleted, sender ≠ viewer, since, asc, limit+1", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const calls: Array<[string, ...unknown[]]> = [];
    const q: any = new Proxy(
      {},
      {
        get: (_t, prop: string) => (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return q;
        },
      },
    );
    m.buildMessengerAutoSaveCandidatesQuery(q, { roomIds: ["a", "b"], viewerUserId: VIEWER, sinceIso: "2026-10-15T10:00:00.000Z" });
    expect(calls).toEqual([
      ["select", m.MESSENGER_IMAGE_AUTO_SAVE_CANDIDATE_MESSAGE_COLUMNS],
      ["in", "room_id", ["a", "b"]],
      ["eq", "message_type", "image"],
      ["is", "deleted_at", null],
      ["is", "deleted_for_everyone_at", null],
      ["neq", "sender_id", VIEWER],
      ["gte", "created_at", "2026-10-15T10:00:00.000Z"],
      ["order", "created_at", { ascending: true }],
      ["order", "id", { ascending: true }],
      ["limit", 51],
    ]);
  });

  it("filters defensively, sorts asc, caps at limit with hasMore", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const since = Date.parse("2026-10-15T10:00:00Z");
    const out = m.filterMessengerAutoSaveCandidateRows(
      [
        row("late", "2026-10-15T10:05:00Z"),
        row("early", "2026-10-15T10:01:00Z"),
        row("dup", "2026-10-15T10:02:00Z"),
        row("dup", "2026-10-15T10:02:00Z"),
        row("old", "2026-10-15T09:00:00Z"),
        row("mine", "2026-10-15T10:01:00Z", { sender_id: VIEWER }),
        row("del", "2026-10-15T10:01:00Z", { deleted_at: "2026-10-15T10:03:00Z" }),
        row("delall", "2026-10-15T10:01:00Z", { deleted_for_everyone_at: "2026-10-15T10:03:00Z" }),
        row("hidden", "2026-10-15T10:01:00Z", { is_hidden_by_admin: true }),
        row("txt", "2026-10-15T10:01:00Z", { message_type: "text" }),
        row("otherroom", "2026-10-15T10:01:00Z", { room_id: "not-mine" }),
        row("cleared", "2026-10-15T10:01:00Z", { room_id: "room-c" }),
      ],
      {
        viewerUserId: VIEWER,
        sinceMs: since,
        allowedRoomIds: new Set(["room-a", "room-c"]),
        clearedAtMsByRoom: new Map([["room-c", Date.parse("2026-10-15T10:04:00Z")]]),
        limit: 2,
      },
    );
    expect(out.rows.map((r) => r.id)).toEqual(["early", "dup"]);
    expect(out.hasMore).toBe(true);
  });

  it("maps a DB/realtime row to a message with original image url", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const { messengerImageOriginalUrls } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const msg = m.messengerAutoSaveMessageFromRow(row("a", "2026-10-15T10:01:00Z"), VIEWER)!;
    expect(msg).toMatchObject({ id: "a", roomId: "room-a", senderId: PEER, isMine: false, messageType: "image" });
    /** C-4: 저장 URL 은 첨부 조회 라우트로 투영된다. */
    expect(messengerImageOriginalUrls(msg)).toEqual([
      messengerMediaRouteUrlFor({ roomId: "room-a", messageId: "a", src: `${P}/a.jpg` }),
    ]);
    expect(m.messengerAutoSaveMessageFromRow(row("t", "2026-10-15T10:01:00Z", { message_type: "text" }))).toBeNull();
    expect(m.messengerAutoSaveMessageFromRow(row("me", "2026-10-15T10:01:00Z", { sender_id: VIEWER }), VIEWER)?.isMine).toBe(true);
  });
});

describe("global hook source selection (pure)", () => {
  it("incoming_message for this viewer from a peer → messages; others ignored; bump → catch_up", async () => {
    const { selectMessengerImageAutoSaveSourceAction } = await import(
      "@/lib/community-messenger/attachment/use-messenger-image-auto-save-global"
    );
    const incoming = (over: Record<string, unknown> = {}, viewerUserId = VIEWER): MessengerBusEvent => ({
      type: "cm.room.incoming_message",
      roomId: "room-a",
      viewerUserId,
      messageRow: row("a", "2026-10-15T10:01:00Z", over),
      at: 1,
    });
    const a = selectMessengerImageAutoSaveSourceAction(incoming(), VIEWER);
    expect(a?.kind).toBe("messages");
    expect(a && a.kind === "messages" ? a.messages.map((m) => m.id) : []).toEqual(["a"]);
    expect(selectMessengerImageAutoSaveSourceAction(incoming({}, "someone-else"), VIEWER)).toBeNull();
    /** own / non-image rows only mark the room as delivered (no save, no catch-up needed) */
    expect(selectMessengerImageAutoSaveSourceAction(incoming({ sender_id: VIEWER }), VIEWER)).toEqual({
      kind: "room_signal",
      roomId: "room-a",
    });
    expect(selectMessengerImageAutoSaveSourceAction(incoming({ message_type: "text" }), VIEWER)).toEqual({
      kind: "room_signal",
      roomId: "room-a",
    });
    expect(selectMessengerImageAutoSaveSourceAction({ type: "cm.room.bump", roomId: "room-a", at: 1 }, VIEWER)).toEqual({
      kind: "catch_up",
      roomId: "room-a",
    });
    expect(
      selectMessengerImageAutoSaveSourceAction({ type: "cm.room.read", roomId: "room-a", viewerUserId: VIEWER, at: 1 }, VIEWER),
    ).toBeNull();
    expect(selectMessengerImageAutoSaveSourceAction(incoming(), "")).toBeNull();
  });

  it("aggregates batch summaries into one short notice", async () => {
    const { messengerImageAutoSaveAggregateNotice } = await import(
      "@/lib/community-messenger/attachment/use-messenger-image-auto-save-global"
    );
    expect(messengerImageAutoSaveAggregateNotice({ saved: 3, failed: 1, denied: false })).toEqual({
      key: "cm_ui_photo_auto_saved_count",
      params: { count: 3 },
      variant: "success",
    });
    expect(messengerImageAutoSaveAggregateNotice({ saved: 0, failed: 0, denied: true })?.action).toBe("open_settings");
    expect(messengerImageAutoSaveAggregateNotice({ saved: 0, failed: 2, denied: false })?.key).toBe("cm_ui_photo_save_failed");
    expect(messengerImageAutoSaveAggregateNotice({ saved: 0, failed: 0, denied: false })).toBeNull();
  });
});

describe("auto-save dedupe across sources (realtime + catch-up)", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    saveMessengerImages.mockReset();
    resolveMessengerImageSaveMode.mockReset();
    resolveMessengerImageSaveMode.mockResolvedValue("native");
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.__resetMessengerImageAutoSaveForTests();
  });

  it("same message id from realtime bus row and catch-up API is saved exactly once (concurrent and later)", async () => {
    const auto = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const cand = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    const { selectMessengerImageAutoSaveSourceAction } = await import(
      "@/lib/community-messenger/attachment/use-messenger-image-auto-save-global"
    );
    auto.syncMessengerImageAutoSaveEnabled(true, Date.now() - 60_000, VIEWER);
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    const createdAt = new Date().toISOString();

    const fromRealtime = selectMessengerImageAutoSaveSourceAction(
      { type: "cm.room.incoming_message", roomId: "room-a", viewerUserId: VIEWER, messageRow: row("m1", createdAt), at: 1 },
      VIEWER,
    );
    /** API returns JSON of the server mapper output */
    const fromCatchUp = JSON.parse(JSON.stringify([cand.messengerAutoSaveMessageFromRow(row("m1", createdAt), VIEWER)]));

    const summaries: Array<{ saved: number }> = [];
    auto.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: fromRealtime && fromRealtime.kind === "messages" ? fromRealtime.messages : [],
      onNotice: (n) => summaries.push(n.summary),
    });
    /** catch-up arrives while the realtime save is still in flight */
    auto.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: fromCatchUp, onNotice: (n) => summaries.push(n.summary) });
    await flush();
    /** and again after it completed (next foreground) */
    auto.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: fromCatchUp, onNotice: (n) => summaries.push(n.summary) });
    await flush();

    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
    expect(saveMessengerImages).toHaveBeenCalledWith([
      messengerMediaRouteUrlFor({ roomId: "room-a", messageId: "m1", src: `${P}/m1.jpg` }),
    ]);
    expect(summaries).toEqual([{ saved: 1, failed: 0, denied: false }]);
  });

  it("catch-up cursor: since = enabledAt until a page is noted, then first unsettled item, then last item", async () => {
    const auto = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const enabledAt = Date.now() - 600_000;
    auto.syncMessengerImageAutoSaveEnabled(true, enabledAt, VIEWER);
    expect(auto.messengerImageAutoSaveCatchUpSinceMs(VIEWER)).toBe(enabledAt);

    const t1 = enabledAt + 1_000;
    const t2 = enabledAt + 2_000;
    auto.noteMessengerImageAutoSaveCatchUpPage(VIEWER, [
      { id: "p1", createdAt: new Date(t1).toISOString() },
      { id: "p2", createdAt: new Date(t2).toISOString() },
    ]);
    /** nothing settled yet → cursor stays at the first unsettled item */
    expect(auto.messengerImageAutoSaveCatchUpSinceMs(VIEWER)).toBe(t1);

    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    const cand = await import("@/lib/community-messenger/attachment/messenger-image-auto-save-candidates");
    auto.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [cand.messengerAutoSaveMessageFromRow(row("p1", new Date(t1).toISOString()), VIEWER)!],
    });
    await flush();
    expect(auto.messengerImageAutoSaveCatchUpSinceMs(VIEWER)).toBe(t2);
    auto.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [cand.messengerAutoSaveMessageFromRow(row("p2", new Date(t2).toISOString()), VIEWER)!],
    });
    await flush();
    expect(auto.messengerImageAutoSaveCatchUpSinceMs(VIEWER)).toBe(t2);

    /** OFF→ON later: new enabledAt wins over an older cursor */
    const later = Date.now() + 5_000;
    auto.syncMessengerImageAutoSaveEnabled(true, later, VIEWER);
    expect(auto.messengerImageAutoSaveCatchUpSinceMs(VIEWER)).toBe(later);
  });
});
