/**
 * F3(2026-11-25) 사진·동영상 보내기 — 글 보내기와 같은 알림·배지·방 bump 경로.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/media-send-fanout-f3-design-2026-11-25.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

/* ── 효과 함수(알림) 의존성 ── */
const pipeline = vi.fn(async (..._a: unknown[]) => ({
  decisionSnapshotsByRecipientId: {},
  deferredPushes: [],
  autoReadRecipientIds: [],
}));
vi.mock("@/lib/notifications/pipeline/notify-message-pipeline", () => ({
  notifyMessagePipeline: (...a: unknown[]) => pipeline(...a),
}));
const mentions = vi.fn(async () => ["m1"]);
vi.mock("@/lib/community-messenger/group/group-room-mention-service", () => ({
  resolveMentionUserIdsForGroupRoom: (...a: unknown[]) => mentions(...(a as [])),
  persistMessageMentionUserIds: async () => undefined,
}));
const hubInvalidate = vi.fn();
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({
  invalidateOwnerHubBadgeCache: (...a: unknown[]) => hubInvalidate(...a),
}));
vi.mock("@/lib/community-messenger/home-sync-snapshot-cache", () => ({ invalidateHomeSyncSnapshotCache: () => undefined }));
vi.mock("@/lib/community-messenger/cm-bootstrap-snapshot-cache", () => ({ invalidateCmBootstrapSnapshotCache: () => undefined }));
vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-cache", () => ({ invalidateFullBootstrapSnapshotCache: () => undefined }));
vi.mock("@/lib/community-messenger/room-bootstrap-snapshot-cache", () => ({ invalidateRoomBootstrapSnapshotCache: () => undefined }));
vi.mock("@/lib/community-messenger/bootstrap-snapshot-invalidation", () => ({ bumpBootstrapSnapshotInvalidationMany: () => undefined }));

/* ── fan-out 의존성 ── */
let serviceSb: unknown = { tag: "svc" };
vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({ resolveServiceSupabaseForApi: () => serviceSb }));
const targetBump = vi.fn(async (..._a: unknown[]) => {
  order.push("target");
  return null;
});
vi.mock("@/lib/notifications/notification-target-messenger-bridge", () => ({
  bumpMessengerRoomTargetsForRecipientsParallel: (...a: unknown[]) => targetBump(...a),
}));
const markRead = vi.fn(async (..._a: unknown[]) => {
  order.push("autoRead");
});
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({ markRoomRead: (...a: unknown[]) => markRead(...a) }));
const textBump = vi.fn(async (..._a: unknown[]) => "fast");
vi.mock("@/lib/community-messenger/server/publish-text-send-room-bump", () => ({
  publishTextSendRoomBump: (...a: unknown[]) => textBump(...a),
}));
const oldBump = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: (...a: unknown[]) => oldBump(...a),
}));
const oldNotify = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/community-messenger/service", () => ({
  notifyCommunityMessengerMessageRecipients: (...a: unknown[]) => oldNotify(...a),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({ tag: "server" }) }));
const afterTasks: Array<() => Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => afterTasks.push(fn) }));

import { appendTypedMessengerMessageAtomic, roomDomainFromKnown } from "@/lib/community-messenger/room-unread-authority-rpc";
import * as effectsMod from "@/lib/community-messenger/server/community-messenger-send-post-ack-effects";
import { runMediaSendFanoutAfterCommit } from "@/lib/community-messenger/server/media-send-fanout";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ROOM = "22222222-2222-4222-8222-222222222222";
const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "33333333-3333-4333-8333-333333333333";
const KNOWN = {
  roomType: "direct",
  chatDomain: "general_direct",
  directKey: `${ME}:${PEER}`,
  domainIdentityKey: "gd:key",
  domainIdentity: "gd:identity",
};

beforeEach(() => {
  order.length = 0;
  afterTasks.length = 0;
  serviceSb = { tag: "svc" };
  vi.clearAllMocks();
});

describe("M-1 방 정보 한 번", () => {
  it("알려진 방 도메인 규칙은 DB 조회 규칙과 같다", () => {
    expect(roomDomainFromKnown({ chatDomain: "group", domainIdentityKey: "k" })).toEqual({ chatDomain: "group", domainIdentityKey: "k" });
    expect(roomDomainFromKnown({ chatDomain: "community", domainIdentityKey: "k" })).toBeNull();
    expect(roomDomainFromKnown({ chatDomain: "trade", domainIdentityKey: " " })).toBeNull();
    expect(roomDomainFromKnown(null)).toBeNull();
  });

  it("알려진 방이면 전송 전에 방을 읽지 않는다 · 규칙에 안 맞으면 지금처럼 읽는다", async () => {
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { chat_domain: "group", domain_identity_key: "db" }, error: null }) }) }),
    }));
    const rpc = vi.fn(async (_n: string, args: Record<string, unknown>) => ({
      data: { ok: true, deduped: false, message: { id: "m1", created_at: "2026-11-25T00:00:00Z" }, recipient_user_ids: [PEER], args },
      error: null,
    }));
    const sb = { from, rpc } as never;
    const base = { roomId: ROOM, senderId: ME, messageType: "image" as const, content: "u", idempotencyKey: "k" };

    const r1 = await appendTypedMessengerMessageAtomic(sb, { ...base, knownRoomDomain: KNOWN });
    expect(r1.ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_chat_domain: "general_direct", p_domain_identity_key: "gd:key" });

    await appendTypedMessengerMessageAtomic(sb, { ...base, knownRoomDomain: { chatDomain: null, domainIdentityKey: null } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_chat_domain: "group", p_domain_identity_key: "db" });
  });
});

describe("M-2 알림은 글과 같은 함수 · 사진·동영상 문구 그대로", () => {
  it("미리보기 = 사진·동영상 문구 · 멘션 없음 · 방 재조회 없음", async () => {
    const from = vi.fn();
    const res = await effectsMod.runCommunityMessengerSendDurablePreAckEffects(
      { from } as never,
      {
        roomId: ROOM,
        senderUserId: ME,
        content: "https://x/storage/v1/object/public/a@b.jpg",
        recipientUserIds: [PEER],
        createdAt: "2026-11-25T00:00:00Z",
        itemTradeLedgerId: null,
        messageId: "m1",
        chatDomain: "group",
        roomType: "private_group",
        directKey: null,
        mediaSend: { previewText: "사진 3장" },
      },
      undefined,
      { parallelRecipients: true, deferAutoRead: true }
    );
    expect(from).not.toHaveBeenCalled();
    expect(mentions).not.toHaveBeenCalled();
    const [, args, opts] = pipeline.mock.calls[0]!;
    expect(args).toMatchObject({ preview: "사진 3장", hasMention: false, mentionUserIds: [], recipientUserIds: [PEER] });
    expect(opts).toMatchObject({ deferPush: true, parallelRecipients: true, deferAutoRead: true });
    expect(res.chatDomain).toBe("group");
    /* M-4: 배지는 보내는 사람+받는 사람 1번씩, 「바뀜 표시」 */
    expect(hubInvalidate.mock.calls.map((c) => c[0])).toEqual([ME, PEER]);
    expect(hubInvalidate.mock.calls[0]![1]).toMatchObject({ lazySnapshot: true });
  });
});

describe("fan-out 순서 (글 보내기 P2 와 같음)", () => {
  const message = { id: "m1", createdAt: "2026-11-25T00:00:00Z", content: "https://x/v.mp4", roomId: ROOM } as never;
  const fanout = { recipientUserIds: [PEER], previewText: "동영상", room: KNOWN };

  it("target(알려진 방) → 알림 저장 → 자동 읽음 · 방 bump·푸시는 응답 뒤", async () => {
    const durable = vi.spyOn(effectsMod, "runCommunityMessengerSendDurablePreAckEffects").mockImplementation(async (_sb, effects) => {
      order.push("durable");
      return {
        effects,
        deferredPushes: [],
        decisionSnapshotsByRecipientId: {},
        chatDomain: "general_direct",
        roomType: "direct",
        directKey: KNOWN.directKey,
        autoReadRecipientIds: [PEER],
      };
    });
    const deferred = vi.spyOn(effectsMod, "runCommunityMessengerSendDeferredPostAckEffects").mockImplementation(async () => {
      order.push("push");
    });

    await runMediaSendFanoutAfterCommit({ rawRouteRoomId: ROOM, canonicalRoomId: ROOM, userId: ME, message, fanout });

    expect(targetBump.mock.calls[0]![1]).toMatchObject({
      roomId: ROOM,
      fromUserId: ME,
      known: { roomType: "direct", chatDomain: "general_direct", directKey: KNOWN.directKey, recipientUserIds: [PEER] },
    });
    expect(durable.mock.calls[0]![1]).toMatchObject({ mediaSend: { previewText: "동영상" }, itemTradeLedgerId: null });
    expect(durable.mock.calls[0]![3]).toEqual({ parallelRecipients: true, deferAutoRead: true });
    /* target·알림 저장은 동시에 시작, 자동 읽음은 둘 다 끝난 뒤(I5) */
    expect([...order].slice(0, 2).sort()).toEqual(["durable", "target"]);
    expect(order[2]).toBe("autoRead");
    expect(textBump).not.toHaveBeenCalled();
    expect(deferred).not.toHaveBeenCalled();

    for (const t of afterTasks) await t();
    expect(textBump.mock.calls[0]![0]).toMatchObject({
      canonicalRoomId: ROOM,
      prefetched: { roomType: "direct", chatDomain: "general_direct", domainIdentity: "gd:identity", recipientUserIds: [PEER] },
    });
    expect(deferred).toHaveBeenCalledTimes(1);
    expect(oldBump).not.toHaveBeenCalled();
    expect(oldNotify).not.toHaveBeenCalled();
  });

  it("서비스 클라이언트가 없으면 예전 알림·예전 bump 로 (알림 유실 없음)", async () => {
    serviceSb = null;
    await runMediaSendFanoutAfterCommit({ rawRouteRoomId: ROOM, canonicalRoomId: ROOM, userId: ME, message, fanout });
    expect(oldNotify.mock.calls[0]![1]).toMatchObject({ messageId: "m1", preview: "동영상", recipientUserIds: [PEER] });
    expect(oldBump).toHaveBeenCalledTimes(1);
    expect(targetBump).not.toHaveBeenCalled();
  });
});

describe("호출부 계약", () => {
  it("사진·동영상 라우트가 송신 가드 방 정보를 넘기고 보내기 표지를 단다", () => {
    for (const p of ["app/api/community-messenger/rooms/[roomId]/images/route.ts", "app/api/community-messenger/rooms/[roomId]/videos/route.ts"]) {
      const src = read(p);
      expect(src).toContain('tagSupabaseCallRequest("post")');
      expect(src).toContain("knownRoom: sendGuard.room");
    }
  });

  it("알려진 방이면 서비스가 예전 알림·배지 재계산을 하지 않고 fanout 으로 넘긴다", () => {
    const src = read("lib/community-messenger/service.ts");
    for (const fn of ["sendCommunityMessengerImageMessage", "sendCommunityMessengerVideoMessage"]) {
      const a = src.indexOf(`export async function ${fn}(`);
      const seg = src.slice(a, src.indexOf("\nexport ", a + 10));
      expect(seg).toContain("if (!appended.deduped && !knownRoom) {");
      expect(seg).toContain("knownRoomDomain: knownRoom");
      expect(seg).toMatch(/fanout: (image|video)Fanout/);
    }
  });

  it("응답 본문에 받는 사람 목록(fanout)을 싣지 않는다", () => {
    for (const p of ["lib/community-messenger/server/messenger-media-upload-send.ts", "lib/community-messenger/server/messenger-video-upload-send.ts"]) {
      expect(read(p)).toContain("const { fanout, ...body } = result;");
    }
  });
});
