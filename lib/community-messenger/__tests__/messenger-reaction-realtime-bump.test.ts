/**
 * 반응 실시간 (2026-11-16 실기 FAIL · docs/audit/messenger-remaining-defects-root-cause-2026-11-16.md R1·R2)
 * R1 상대가 단 반응이 38초 넘게 안 보이고 방에 다시 들어가야 보였다 — 반응 API 가 방 bump 를 보내지 않았다.
 * R2 반응을 지웠는데 칩이 남았다 — 단건 응답이 빈 반응을 생략해 병합({...existing, ...item})이 옛 칩을 유지했다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const publish = vi.fn(async (_args: Record<string, unknown>) => {});
const toggle = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u-peer" }),
}));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/server/messenger-room-canonical-resolve-api", () => ({
  messengerRoomCanonicalOrJsonError: async () => ({ ok: true, canonicalRoomId: "room-canon" }),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  toggleCommunityMessengerMessageReaction: (...a: unknown[]) => toggle(...a),
  listCommunityMessengerMessageReactionParticipants: vi.fn(),
}));
vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: (args: Record<string, unknown>) => publish(args),
}));
/**
 * 가입 확인(설계 2026-11-21 §4 C, 재감사3 #2) — 반응 추가만 가입 확인, 같은 반응 지우기는 가입 없이.
 * 이 파일의 대상은 bump 이므로 「가입 완료 · 기존 반응 없음」으로 둔다.
 */
const registrationGate = vi.hoisted(() => ({ response: null as unknown, mine: null as { reaction_key: string } | null }));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({
  requireRegistrationForAction: async () => registrationGate.response,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: registrationGate.mine, error: null }),
      };
      return q;
    },
  }),
}));

async function post() {
  const { POST } = await import("@/app/api/community-messenger/rooms/[roomId]/messages/[messageId]/reactions/route");
  const req = new NextRequest("https://x.test/api/community-messenger/rooms/room-raw/messages/m1/reactions", {
    method: "POST",
    body: JSON.stringify({ reactionKey: "like" }),
    headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ roomId: "room-raw", messageId: "m1" }) });
}

describe("R1 반응 저장 뒤 서버가 방 bump 를 보낸다", () => {
  beforeEach(() => {
    publish.mockClear();
    toggle.mockReset();
  });

  it("성공: 응답 전에 bump 1회 — messageId 만, 스냅샷 없음, 배지·알림 bump 없음", async () => {
    toggle.mockResolvedValue({ ok: true, reactions: [{ reactionKey: "like", count: 1, mine: true }] });
    const res = await post();
    expect(res.status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
    const args = publish.mock.calls[0]![0];
    expect(args).toMatchObject({
      rawRouteRoomId: "room-raw",
      canonicalRoomId: "room-canon",
      fromUserId: "u-peer",
      messageId: "m1",
      skipBadgeTargetBump: true,
    });
    expect(args.messageForBump ?? null).toBeNull();
  });

  it("실패한 반응은 bump 하지 않는다", async () => {
    toggle.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = await post();
    expect(res.status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
  });

  it("bump 실패해도 반응 저장 응답은 성공", async () => {
    toggle.mockResolvedValue({ ok: true, reactions: [] });
    publish.mockRejectedValueOnce(new Error("rt down"));
    const res = await post();
    expect(res.status).toBe(200);
  });
});

describe("R2 단건 정합은 빈 반응을 [] 로 보내 옛 칩을 지운다", () => {
  const base: CommunityMessengerMessage = {
    id: "m1",
    roomId: "room-canon",
    senderId: "u-me",
    senderLabel: "me",
    messageType: "text",
    content: "hi",
    createdAt: "2026-11-16T00:00:00.000Z",
    isMine: true,
  } as CommunityMessengerMessage;

  it("병합: reactions [] 가 오면 칩이 사라진다", () => {
    const prev = [{ ...base, reactions: [{ reactionKey: "like", count: 1, mine: false }] }];
    const next = mergeRoomMessages(prev, [{ ...base, reactions: [] }]);
    expect(next.find((m) => m.id === "m1")!.reactions ?? []).toHaveLength(0);
  });

  it("병합: 반응 필드가 없는 행(스냅샷 등)은 기존 반응을 유지한다(기존 동작)", () => {
    const prev = [{ ...base, reactions: [{ reactionKey: "like", count: 1, mine: false }] }];
    const next = mergeRoomMessages(prev, [{ ...base }]);
    expect(next.find((m) => m.id === "m1")!.reactions).toHaveLength(1);
  });

  it("병합: 새 반응이 오면 칩이 바뀐다", () => {
    const prev = [{ ...base }];
    const next = mergeRoomMessages(prev, [{ ...base, reactions: [{ reactionKey: "like", count: 1, mine: false }] }]);
    expect(next.find((m) => m.id === "m1")!.reactions).toEqual([{ reactionKey: "like", count: 1, mine: false }]);
  });

  it("서버 단건 함수(getCommunityMessengerRoomMessageById)는 반응이 없으면 [] 를 싣는다", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    const start = src.indexOf("export async function getCommunityMessengerRoomMessageById");
    const end = src.indexOf("\nfunction ", start);
    expect(src.slice(start, end)).toContain("reactions: rx.get(messageId) ?? []");
  });
});

describe("반응 — 섞인 경로 (재감사3 #2)", () => {
  beforeEach(() => {
    vi.resetModules();
    toggle.mockReset();
    publish.mockReset();
    registrationGate.response = new Response(JSON.stringify({ ok: false, code: "signup_incomplete", step: "address" }), {
      status: 403,
    });
  });

  it("가입 진행 중: 새 반응은 403, 처리 함수 호출 없음", async () => {
    registrationGate.mine = null;
    const res = await post();
    expect(res.status).toBe(403);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("가입 진행 중: 같은 반응 지우기는 처리된다", async () => {
    registrationGate.mine = { reaction_key: "like" };
    toggle.mockResolvedValue({ ok: true, reactions: [] });
    const res = await post();
    expect(res.status).toBe(200);
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});

