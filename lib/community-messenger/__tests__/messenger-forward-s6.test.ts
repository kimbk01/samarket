import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canForwardMessage, canShareMessageToRoom } from "@/lib/community-messenger/message-actions/message-share-policy";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const msg = (messageType: string, extra: Record<string, unknown> = {}) =>
  ({ messageType, pending: false, ...extra }) as never;

describe("메시지 전달 S6 (Owner G-4·G-5 2026-11-14)", () => {
  it("text·sticker·image·file 만 · 거래방·주문방·전송 중·삭제 불가", () => {
    expect(canForwardMessage(msg("text"), "direct")).toBe(true);
    expect(canForwardMessage(msg("sticker"), "group")).toBe(true);
    expect(canForwardMessage(msg("image"), "direct")).toBe(true);
    expect(canForwardMessage(msg("file"), "group")).toBe(true);
    for (const t of ["voice", "call_stub", "gift_certificate", "system", "community_post_share"]) {
      expect(canForwardMessage(msg(t), "direct"), t).toBe(false);
    }
    expect(canForwardMessage(msg("text"), "trade")).toBe(false);
    expect(canForwardMessage(msg("text"), "direct", { chatDomain: "store_order" })).toBe(false);
    expect(canForwardMessage(msg("text", { pending: true }), "direct")).toBe(false);
    expect(canForwardMessage(msg("text", { deletedForEveryoneAt: "2026-11-14T00:00:00Z" }), "direct")).toBe(false);
    // 클립보드 「채팅방으로 공유」는 계속 꺼짐(SH-P0-1)
    expect(canShareMessageToRoom(msg("text"), "direct")).toBe(false);
  });

  it("서버 — 원본 정보 없이 forwarded 표시만 · 같은 범용 전송 경로 · 결정적 중복 방지 키", () => {
    const src = read("lib/community-messenger/service.ts");
    const fn = src.slice(src.indexOf("export const COMMUNITY_MESSENGER_FORWARDABLE_TYPES"), src.indexOf("export async function sendCommunityPostShareMessage"));
    expect(fn).toContain("{ client_message_id: clientMessageId, forwarded: true }");
    expect(fn).not.toMatch(/metadata\.(source|origin|original|room_title)/);
    expect(fn).toContain("appendTypedMessengerMessageAtomic");
    expect(fn).toContain('idempotencyKey: `cm_fwd:${input.userId}:${roomId}:${clientMessageId}`');
    expect(fn).toContain('clientMessageId.startsWith("fwd:")');
    expect(fn).toContain("if (!appended.deduped)");
    expect(fn).toContain('COMMUNITY_MESSENGER_FORWARDABLE_TYPES = ["text", "sticker", "image", "file"]');
    expect(fn).toContain("copyMessengerMediaForForward");
    expect(fn).toContain("if (appended.deduped) await purgeCopies();");
    expect(fn).toContain('trimText(row.owner_domain) === "moim"');
  });

  it("대상 선택 — 최대 5곳 · 요청 번호 재사용 재시도", () => {
    const sheet = read("components/community-messenger/forward/MessengerForwardSheet.tsx");
    expect(sheet).toContain("MESSENGER_FORWARD_MAX_TARGETS = 5");
    expect(sheet).toContain("clientMessageId: `fwd:${requestIdRef.current}:${roomId}`");
    expect(sheet).not.toContain("clipboard");
  });
});
