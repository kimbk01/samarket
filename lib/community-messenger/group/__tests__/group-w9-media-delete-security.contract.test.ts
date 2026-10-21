/**
 * W9 (audit 2026-10-21 B-9 / H-6 / H-3 M-15) — A-1, D-1, S-1, S-2, X-2, G-2, G-4, M-15.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMocks = vi.hoisted(() => ({
  sb: null as unknown,
  participant: { id: "p1" } as unknown,
}));

vi.mock("@/lib/community-messenger/group/group-room-repository", () => ({
  resolveGroupRoomSupabase: () => repoMocks.sb,
  fetchActiveParticipant: async () => repoMocks.participant,
}));

import {
  filterGroupMediaRows,
  parseGroupMediaCursorStrict,
} from "@/lib/community-messenger/group/group-room-media-index";
import {
  GROUP_MEDIA_BAD_CURSOR,
  listGroupRoomMedia,
} from "@/lib/community-messenger/group/group-room-media-service";
import {
  COMMUNITY_MESSENGER_REPLY_PREVIEW_TYPE_DELETED,
  formatReplyQuoteForMessage,
  resolveDeletedMessagePlaceholder,
} from "@/lib/community-messenger/message-actions/message-reply-policy";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

type Call = { table: string; method: string; args: unknown[] };

function makeSupabase(tables: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    for (const m of ["select", "eq", "is", "not", "or", "in", "order", "limit"]) builder[m] = chain(m);
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
    return builder;
  };
  return { sb: { from }, calls };
}

function sliceFn(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\nexport async function ", start + signature.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("S-2 media cursor validation", () => {
  it("accepts ISO timestamp | uuid and empty", () => {
    expect(parseGroupMediaCursorStrict(null)).toEqual({ ok: true, cursor: null });
    expect(parseGroupMediaCursorStrict("")).toEqual({ ok: true, cursor: null });
    const ok = parseGroupMediaCursorStrict(`2026-10-21T01:02:03.123456+00:00|${UUID_A}`);
    expect(ok).toEqual({ ok: true, cursor: { createdAt: "2026-10-21T01:02:03.123456+00:00", messageId: UUID_A } });
    expect(parseGroupMediaCursorStrict(`2026-10-21T01:02:03Z|${UUID_A}`).ok).toBe(true);
  });

  it("rejects PostgREST filter injection and malformed parts", () => {
    for (const bad of [
      `2026-10-21T01:02:03Z),or(id.neq.0|${UUID_A}`,
      `2026-10-21T01:02:03Z|${UUID_A}),deleted_at.not.is.null`,
      `not-a-date|${UUID_A}`,
      "2026-10-21T01:02:03Z|m1",
      "2026-10-21T01:02:03Z",
      `|${UUID_A}`,
      "2026-13-45T99:99:99Z|" + UUID_A,
    ]) {
      expect(parseGroupMediaCursorStrict(bad).ok, bad).toBe(false);
    }
  });

  it("service returns bad_cursor before querying; route maps it to 400", async () => {
    const { sb, calls } = makeSupabase({});
    repoMocks.sb = sb;
    repoMocks.participant = { id: "p1" };
    const res = await listGroupRoomMedia({ userId: "u1", roomId: "r1", cursor: "x),or(id.neq.0|y" });
    expect(res).toEqual({ ok: false, error: GROUP_MEDIA_BAD_CURSOR });
    expect(calls.filter((c) => c.table === "community_messenger_messages")).toHaveLength(0);
    const route = read("app/api/community-messenger/group-rooms/[roomId]/media/route.ts");
    expect(route).toMatch(/GROUP_MEDIA_BAD_CURSOR\)\s*\{\s*return jsonError\([^)]*400/);
  });
});

describe("A-1 media album excludes hidden/deleted/viewer-hidden", () => {
  beforeEach(() => {
    repoMocks.participant = { id: "p1" };
  });

  it("filterGroupMediaRows drops admin-hidden, deleted-for-everyone and viewer-hidden rows", () => {
    const base = { message_type: "image", content: "u", created_at: "2026-10-21T00:00:00Z", sender_id: "s", metadata: {} };
    const rows = filterGroupMediaRows(
      [
        { ...base, id: UUID_A },
        { ...base, id: UUID_B, is_hidden_by_admin: true },
        { ...base, id: UUID_C, deleted_for_everyone_at: "2026-10-21T00:00:01Z" },
        { ...base, id: "44444444-4444-4444-8444-444444444444" },
      ],
      "all",
      { hiddenMessageIds: new Set(["44444444-4444-4444-8444-444444444444"]) }
    );
    expect(rows.map((r) => r.messageId)).toEqual([UUID_A]);
  });

  it("query filters admin-hidden / deleted-for-everyone and consults per-user hides", async () => {
    const base = { message_type: "image", content: "u", created_at: "2026-10-21T00:00:00Z", sender_id: "s", metadata: {} };
    const { sb, calls } = makeSupabase({
      community_messenger_messages: [
        { ...base, id: UUID_A },
        { ...base, id: UUID_B },
      ],
      community_messenger_message_user_hides: [{ message_id: UUID_B }],
    });
    repoMocks.sb = sb;
    const res = await listGroupRoomMedia({ userId: "viewer", roomId: "r1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.page.items.map((i) => i.messageId)).toEqual([UUID_A]);
    const msgCalls = calls.filter((c) => c.table === "community_messenger_messages");
    expect(msgCalls).toContainEqual({ table: "community_messenger_messages", method: "is", args: ["deleted_for_everyone_at", null] });
    expect(msgCalls).toContainEqual({ table: "community_messenger_messages", method: "not", args: ["is_hidden_by_admin", "is", true] });
    const hideCalls = calls.filter((c) => c.table === "community_messenger_message_user_hides");
    expect(hideCalls).toContainEqual({ table: "community_messenger_message_user_hides", method: "eq", args: ["user_id", "viewer"] });
  });

  it("non-member is forbidden", async () => {
    repoMocks.sb = makeSupabase({}).sb;
    repoMocks.participant = null;
    const res = await listGroupRoomMedia({ userId: "u", roomId: "r1" });
    expect(res).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("S-1 read-count POST requires active membership", () => {
  it("POST checks fetchActiveParticipant before read counts → 403", () => {
    const src = read("app/api/community-messenger/group-rooms/[roomId]/media/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    const gateAt = post.indexOf("fetchActiveParticipant(sb, roomId, auth.userId)");
    expect(gateAt).toBeGreaterThan(0);
    expect(post.slice(gateAt)).toMatch(/if \(!participant\)\s*\{\s*return jsonError\("권한이 없습니다\.", 403/);
    expect(gateAt).toBeLessThan(post.indexOf("fetchGroupMessageReadCounts("));
  });
});

describe("X-2 open-group join gates", () => {
  it("validateActiveSession + requirePhoneVerified like invite-link join", () => {
    const src = read("app/api/community-messenger/open-groups/[roomId]/join/route.ts");
    const s = src.indexOf("validateActiveSession(auth.userId)");
    const p = src.indexOf("requirePhoneVerified(auth.userId)");
    const j = src.indexOf("joinOpenGroupRoomWithPassword({");
    expect(s).toBeGreaterThan(0);
    expect(p).toBeGreaterThan(s);
    expect(j).toBeGreaterThan(p);
  });
});

describe("G-2 open-group capacity", () => {
  it("counts only active participants, skips already-active joiner, rejects at >= limit", () => {
    const fn = sliceFn(read("lib/community-messenger/service.ts"), "export async function joinOpenGroupRoomWithPassword(");
    const activeReturn = fn.indexOf("existingRow && existingRow.left_at == null");
    const head = fn.indexOf("participantHead");
    expect(activeReturn).toBeGreaterThan(0);
    expect(head).toBeGreaterThan(activeReturn);
    const capacity = fn.slice(head - 200, fn.indexOf('"room_full"') + 20);
    expect(capacity).toContain('.is("left_at", null)');
    expect(capacity).toMatch(/\(participantHead\?\.length \?\? 0\) >= memberLimit/);
    expect(capacity).not.toMatch(/> memberLimit\)/);
  });
});

describe("G-4 group read routes re-check DB membership", () => {
  it("canonical resolve re-checks left_at IS NULL on cache hit and requires active group membership on miss", () => {
    const api = read("lib/community-messenger/server/messenger-room-canonical-resolve-api.ts");
    expect(api).toMatch(/probe\.hit && probe\.canonicalRoomId\s*\?\s*await recheckActiveMessengerParticipant/);
    const core = read("lib/community-messenger/server/messenger-room-canonical-resolve-core.ts");
    const recheck = sliceFn(core, "export async function recheckActiveMessengerParticipant(");
    expect(recheck).toContain('.is("left_at", null)');
    expect(core).toContain("assertActiveGroupMembershipIfGroup");
    const route = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
    const get = route.slice(route.indexOf("export async function GET"));
    expect(get.indexOf("messengerRoomCanonicalOrJsonError(")).toBeLessThan(get.indexOf("listCommunityMessengerRoomMessagesAfter"));
    const groupRoute = read("app/api/community-messenger/group-rooms/[roomId]/messages/route.ts");
    const gget = groupRoute.slice(groupRoute.indexOf("export async function GET"));
    expect(gget.indexOf("assertActivePrivateGroupSender(")).toBeLessThan(gget.indexOf("listCommunityMessengerRoomMessagesBefore"));
  });
});

describe("M-15 before page keyset", () => {
  it("uses (created_at,id) keyset with created_at desc, id desc", () => {
    const fn = sliceFn(read("lib/community-messenger/service.ts"), "export async function listCommunityMessengerRoomMessagesBefore(");
    expect(fn).toContain(
      ".or(`created_at.lt.${anchorCreatedAt},and(created_at.eq.${anchorCreatedAt},id.lt.${anchorId})`)"
    );
    expect(fn).not.toContain('.lt("created_at", anchorCreatedAt)');
    expect(fn).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  });
});

describe("D-1 delete-for-everyone scrubs reply snapshots", () => {
  it("formatReplyQuoteForMessage renders deleted placeholder for deleted preview type", () => {
    const q = formatReplyQuoteForMessage({
      replyToMessageId: UUID_A,
      replyPreviewText: "원문 비밀",
      replyPreviewType: COMMUNITY_MESSENGER_REPLY_PREVIEW_TYPE_DELETED,
      replySenderLabelSnapshot: "A",
    });
    expect(q?.previewText).toBe(resolveDeletedMessagePlaceholder());
    const q2 = formatReplyQuoteForMessage({
      replyToMessageId: UUID_A,
      replyPreviewText: "",
      replyPreviewType: COMMUNITY_MESSENGER_REPLY_PREVIEW_TYPE_DELETED,
      replySenderLabelSnapshot: "A",
    });
    expect(q2?.previewText).toBe(resolveDeletedMessagePlaceholder());
  });

  it("soft delete updates replies (reply_to_message_id = id) after the delete succeeds", () => {
    const fn = sliceFn(
      read("lib/community-messenger/service.ts"),
      "export async function softDeleteCommunityMessengerMessageForEveryone("
    );
    const del = fn.indexOf("deleted_for_everyone_at: nowIso()");
    const scrub = fn.indexOf(
      '.update({ reply_preview_text: "", reply_preview_type: COMMUNITY_MESSENGER_REPLY_PREVIEW_TYPE_DELETED })'
    );
    expect(del).toBeGreaterThan(0);
    expect(scrub).toBeGreaterThan(del);
    expect(fn.slice(scrub, scrub + 300)).toContain('.eq("reply_to_message_id", messageId)');
  });

  it("db mapper renders placeholder for deleted reply type; edit refreshes reply snapshots", () => {
    const src = read("lib/community-messenger/service.ts");
    expect(src).toMatch(
      /replyPreviewTypeRaw === COMMUNITY_MESSENGER_REPLY_PREVIEW_TYPE_DELETED\s*\?\s*resolveDeletedMessagePlaceholder\(\)/
    );
    const edit = sliceFn(src, "export async function editCommunityMessengerTextMessage(");
    expect(edit).toContain(".update({ reply_preview_text: content.slice(0, 280) })");
    expect(edit).toContain('.eq("reply_to_message_id", messageId)');
  });
});
