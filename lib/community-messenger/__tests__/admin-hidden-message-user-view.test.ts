import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mapRealtimeMessageRow } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { resolveAdminHiddenMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";
import {
  resolveMessengerMediaAccess,
  type MessengerMediaAccessDeps,
  type MessengerMediaMessageRow,
} from "@/lib/community-messenger/server/messenger-media-access";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ROOM = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const PATH = "u1/photo.jpg";

const imageRow = (hidden: boolean) => ({
  id: MSG,
  room_id: ROOM,
  sender_id: "sender",
  message_type: "image",
  content: `https://x.supabase.co/storage/v1/object/public/messenger-media/${PATH}`,
  metadata: { storage_bucket: "messenger-media", storagePath: PATH, client_message_id: "c1" },
  created_at: "2026-10-19T00:00:00Z",
  is_hidden_by_admin: hidden,
});

describe("관리자 숨김 메시지 — 사용자 앱 반영", () => {
  it("실시간 UPDATE: 숨김 행은 대체 문구·text·빈 메타로, 해제 행은 원문으로 매핑", () => {
    const hidden = mapRealtimeMessageRow(imageRow(true));
    expect(hidden).toMatchObject({
      id: MSG,
      messageType: "text",
      content: resolveAdminHiddenMessagePlaceholder(),
      metadata: {},
    });
    expect(hidden?.deletedForEveryoneAt).toBeUndefined();
    const restored = mapRealtimeMessageRow(imageRow(false));
    expect(restored).toMatchObject({ messageType: "image", content: imageRow(false).content });
    expect(restored?.metadata).toMatchObject({ storagePath: PATH });
  });

  it("전원 삭제가 관리자 숨김보다 우선 (삭제 문구 유지)", () => {
    const row = { ...imageRow(true), deleted_for_everyone_at: "2026-10-19T01:00:00Z" };
    const mapped = mapRealtimeMessageRow(row);
    expect(mapped?.content).not.toBe(resolveAdminHiddenMessagePlaceholder());
    expect(mapped?.deletedForEveryoneAt).toBe("2026-10-19T01:00:00Z");
  });

  it("미디어 라우트: 숨김 메시지는 참가자 404, 관리자 열람은 허용", async () => {
    const row: MessengerMediaMessageRow = { ...imageRow(true) };
    const deps = (): MessengerMediaAccessDeps => ({
      loadMessage: vi.fn(async () => row),
      isParticipant: vi.fn(async () => true),
      resolveCanonicalRoomId: vi.fn(async () => null),
      authorizeAdmin: vi.fn(async () => ({ ok: true as const })),
      createSignedUrl: vi.fn(async () => "https://signed"),
    });
    const object = { bucket: "messenger-media" as const, path: PATH };
    const member = deps();
    expect(
      await resolveMessengerMediaAccess({ userId: "member", rawRoomId: ROOM, messageId: MSG, object }, member)
    ).toEqual({ ok: false, status: 404, error: "not_found" });
    expect(member.createSignedUrl).not.toHaveBeenCalled();
    const admin = deps();
    expect(
      await resolveMessengerMediaAccess(
        { userId: "admin", rawRoomId: ROOM, messageId: MSG, object, adminContext: true },
        admin
      )
    ).toMatchObject({ ok: true, viewer: "admin" });
  });

  it("서버 조회·매퍼·편집·관리자 조치 경로가 같은 규칙을 쓴다 (계약)", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toMatch(/COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT =\s*\n\s*"[^"]*is_hidden_by_admin"/);
    // 단건/목록 매퍼 + 방 부트스트랩 매퍼 + 방 목록 미리보기 재계산
    expect(svc.match(/resolveAdminHiddenMessagePlaceholder\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(svc).toContain('if (msgRow.is_hidden_by_admin === true) return { ok: false, error: "forbidden" };');
    expect(svc).toContain("export async function syncCommunityMessengerRoomAfterAdminMessageVisibility");
    expect(read("app/api/community-messenger/rooms/[roomId]/messages/[messageId]/media/route.ts")).toContain(
      "is_hidden_by_admin"
    );
    for (const p of [
      "lib/admin-community-messenger/admin-chat-moderation-cas.ts",
      "lib/admin-chats/trade-messenger-bulk-hide.ts",
      "lib/admin-community-messenger/service.ts",
    ]) {
      expect(read(p)).toContain("await syncRoomAfterAdminMessageVisibility(");
    }
  });
});
