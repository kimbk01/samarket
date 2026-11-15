/**
 * PR-A (Owner 2026-11-16 「A·B 진행」) — docs/design/messenger-remaining-risks-design-2026-11-16.md §3
 * D1 보내는 중 표시 · D2 파일·링크 서버 조회 · D3 메뉴 뒤로 키 · D4 삭제 미리보기 · D6 삭제 메시지 메뉴 · D8 스티커 목록 대조
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
/** 로컬에 @capacitor/haptics 가 없어도 돌도록(CI 에는 있음) */
vi.mock("@/lib/ui/light-tap-feedback", () => ({
  triggerInteractionFeedback: () => {},
  prewarmBottomNavHaptics: () => {},
  triggerBottomNavSelectionFeedback: () => {},
  triggerLightTapFeedback: () => {},
  triggerMobileSelectionFeedback: () => {},
}));

import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { isCatalogStickerPath } from "@/lib/stickers/sticker-catalog-validate";
import { FALLBACK_STICKER_ITEMS } from "@/lib/stickers/fallback-sticker-catalog";
import {
  listRoomMediaGallery,
  listRoomMessageCollection,
} from "@/lib/community-messenger/media/room-media-gallery-service";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const base = (over: Partial<CommunityMessengerMessage> & { pending?: boolean }) =>
  ({
    id: "m",
    roomId: "r1",
    senderId: "u1",
    senderLabel: "me",
    messageType: "text",
    content: "hi",
    createdAt: "2026-11-16T00:00:00.000Z",
    isMine: true,
    ...over,
  }) as CommunityMessengerMessage & { pending?: boolean };

describe("D1 보내는 중 행은 넣은 뒤에도 pending 이다", () => {
  it("낙관 행 넣기 → pending:true 유지", () => {
    const out = mergeRoomMessages([], [base({ id: "pending:1", clientMessageId: "c1", pending: true })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.pending).toBe(true);
  });

  it("같은 cid 서버 행이 오면 1행(확정)만 남는다", () => {
    const afterOptimistic = mergeRoomMessages([], [base({ id: "pending:1", clientMessageId: "c1", pending: true })]);
    const out = mergeRoomMessages(afterOptimistic, [base({ id: "srv1", clientMessageId: "c1" })]);
    expect(out.map((m) => [m.id, Boolean(m.pending)])).toEqual([["srv1", false]]);
  });

  it("서버 행이 먼저 와 있으면 늦게 넣은 같은 cid 보내는 중 행은 버린다(중복 없음)", () => {
    const afterServer = mergeRoomMessages([], [base({ id: "srv1", clientMessageId: "c1" })]);
    const out = mergeRoomMessages(afterServer, [base({ id: "pending:1", clientMessageId: "c1", pending: true })]);
    expect(out.map((m) => m.id)).toEqual(["srv1"]);
  });

  it("실패 표시(같은 id 로 다시 넣기)는 보내는 중 행을 바꾸고, 서버 행 병합 뒤에도 남는다", () => {
    const a = mergeRoomMessages([], [base({ id: "pending:1", clientMessageId: "c1", pending: true })]);
    const failed = mergeRoomMessages(a, [base({ id: "pending:1", clientMessageId: "c1", pending: true, sendFailed: true } as never)]);
    expect(failed).toHaveLength(1);
    expect((failed[0] as { sendFailed?: boolean }).sendFailed).toBe(true);
    const later = mergeRoomMessages(failed, [base({ id: "other", clientMessageId: "c9", createdAt: "2026-11-16T00:00:05.000Z" })]);
    const row = later.find((m) => m.id === "pending:1")!;
    expect(row.pending).toBe(true);
    expect((row as { sendFailed?: boolean }).sendFailed).toBe(true);
  });
});

describe("D3 방 화면 직접 띄우는 창은 뒤로 키 처리에 등록", () => {
  it.each([
    "components/community-messenger/room/message/MessageLongPressPopover.tsx",
    "components/community-messenger/room/message/MessageReactionRosterSheet.tsx",
    "components/community-messenger/room/MessengerPhotoSelectSaveSheet.tsx",
  ])("%s", (p) => {
    expect(read(p)).toMatch(/useOverlayHardwareBack\(/);
  });
});

describe("D4 목록 미리보기는 삭제 표시를 따른다", () => {
  it("모두에게서 삭제된 스티커 행 → 「삭제된 메시지입니다」·text", () => {
    const r = listPreviewFromMessengerMessageRow({
      id: "s1",
      message_type: "sticker",
      content: "",
      metadata: {},
      created_at: "2026-11-16T00:00:00.000Z",
      deleted_for_everyone_at: "2026-11-16T00:00:05.000Z",
    });
    expect(r?.lastMessage).toBe("삭제된 메시지입니다");
    expect(r?.lastMessageType).toBe("text");
  });
  it("삭제 안 된 스티커는 그대로 「스티커」", () => {
    const r = listPreviewFromMessengerMessageRow({ id: "s2", message_type: "sticker", content: "", created_at: "2026-11-16T00:00:00.000Z" });
    expect(r?.lastMessage).toBe("스티커");
  });
});

describe("D6 삭제된 메시지는 길게 눌러도 메뉴를 열지 않는다", () => {
  it("말풍선 동작 묶음에서 deletedForEveryone 은 빈 동작", () => {
    const src = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(src).toMatch(/item\.messageType === "gift_certificate" \|\| deletedForEveryone\s*\?\s*\{\}/);
  });
});

describe("D8 스티커 보내기는 목록과 대조", () => {
  it("목록 안 통과 · 목록 밖·없는 파일 거부", () => {
    expect(isCatalogStickerPath(FALLBACK_STICKER_ITEMS[0]!.fileUrl)).toBe(true);
    expect(isCatalogStickerPath("/stickers/packs/basic/zzzz.webp")).toBe(false);
    expect(isCatalogStickerPath("/stickers/evil.webp")).toBe(false);
  });
  it("서비스 스티커 보내기가 대조를 부른다", () => {
    expect(read("lib/community-messenger/service.ts")).toContain('if (!isCatalogStickerPath(path)) return { ok: false, error: "sticker_not_in_catalog" };');
  });
});

/* ---------- D2: 가짜 DB ---------- */
type Row = Record<string, unknown>;
function fakeSb(tables: { messages: Row[]; participant: Row | null; hides: Row[] }) {
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let head = false;
    let limitN = Infinity;
    const api: Record<string, unknown> = {};
    const chain = () => api;
    Object.assign(api, {
      select: (_c: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), chain()),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain()),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), chain()),
      or: (expr: string) => {
        if (expr.startsWith("is_hidden_by_admin")) filters.push((r) => r.is_hidden_by_admin !== true);
        return chain();
      },
      filter: (k: string, op: string, v: string) => {
        if (op === "imatch") filters.push((r) => new RegExp(v, "i").test(String(r[k] ?? "")));
        return chain();
      },
      gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), chain()),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), chain()),
      order: () => chain(),
      limit: (n: number) => ((limitN = n), chain()),
      maybeSingle: async () => ({ data: tables.participant, error: null }),
      then: (resolve: (v: unknown) => void) => {
        const src = table === "community_messenger_messages" ? tables.messages : tables.hides;
        const rows = src.filter((r) => filters.every((f) => f(r))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        resolve(head ? { count: rows.length, error: null } : { data: rows.slice(0, limitN), error: null });
      },
    });
    return api;
  };
  return { from: (t: string) => builder(t) } as never;
}

const msg = (id: string, type: string, at: string, extra: Row = {}): Row => ({
  id,
  room_id: "r1",
  sender_id: "u2",
  message_type: type,
  content: "",
  created_at: at,
  metadata: {},
  deleted_at: null,
  deleted_for_everyone_at: null,
  is_hidden_by_admin: null,
  ...extra,
});

describe("D2 파일·링크 모음·개수 = 서버 조회", () => {
  const messages = [
    msg("f1", "file", "2026-11-16T01:00:00Z", { content: "https://x/a.pdf", metadata: { fileName: "a.pdf", mimeType: "application/pdf", fileSizeBytes: 1200 } }),
    msg("f2", "file", "2026-11-16T02:00:00Z", { deleted_for_everyone_at: "2026-11-16T02:01:00Z" }),
    msg("l1", "text", "2026-11-16T03:00:00Z", { content: "see https://dibay.app/x" }),
    msg("l2", "text", "2026-11-16T04:00:00Z", { content: "no link here" }),
    msg("i1", "image", "2026-11-16T05:00:00Z", { content: "https://x.supabase.co/storage/v1/object/public/messenger-media/a.webp" }),
  ];
  const sb = () => fakeSb({ messages, participant: { id: "p", cleared_at: null, left_at: null }, hides: [] });

  it("첫 페이지 개수 4종 — 사진 본문 주소는 링크로 세지 않음", async () => {
    const r = await listRoomMediaGallery({ userId: "u1", roomId: "r1", sb: sb() });
    expect(r.ok && r.page.counts).toEqual({ image: 1, voice: 0, file: 1, link: 1 });
  });
  it("파일 모음: 삭제 제외 · 이름·크기", async () => {
    const r = await listRoomMessageCollection({ userId: "u1", roomId: "r1", kind: "file", sb: sb() });
    expect(r.ok && r.page.items.map((x) => [x.id, x.fileName, x.fileSizeBytes])).toEqual([["f1", "a.pdf", 1200]]);
  });
  it("링크 모음: 주소 있는 글만", async () => {
    const r = await listRoomMessageCollection({ userId: "u1", roomId: "r1", kind: "link", sb: sb() });
    expect(r.ok && r.page.items.map((x) => x.id)).toEqual(["l1"]);
  });
  it("시트·메뉴·정보는 불러온 메시지 목록을 쓰지 않는다", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx");
    expect(src).not.toContain("vm.fileMessages");
    expect(src).not.toContain("vm.linkThreadMessages");
    expect(src.match(/vm\.fileMessageCount/g)?.length).toBe(1);
    expect(src.match(/vm\.linkMessageCount/g)?.length).toBe(1);
  });
});
