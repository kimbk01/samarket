// @vitest-environment jsdom
/**
 * 남은 결함 수정 (Owner 2026-11-16 「3건 수정 + O4 권장값」 · docs/audit/messenger-remaining-defects-root-cause-2026-11-16.md §7)
 * W1 녹음 중 파형 넘침 · S1 말풍선 위 밀기 스크롤 막힘 · M1 모음 서버 개수 · C2/O4 서명·캐시 시간
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceRecordingLiveWaveform } from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  listRoomMediaGallery,
  mapRoomMediaGalleryRow,
} from "@/lib/community-messenger/media/room-media-gallery-service";

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
/** 로컬에 @capacitor/haptics 가 없어도 돌도록(CI 에는 있음) — 화면 진동 모듈만 대체 */
vi.mock("@/lib/ui/light-tap-feedback", () => ({
  triggerInteractionFeedback: () => {},
  prewarmBottomNavHaptics: () => {},
  triggerBottomNavSelectionFeedback: () => {},
  triggerLightTapFeedback: () => {},
  triggerMobileSelectionFeedback: () => {},
}));

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("W1 녹음 중 파형은 칸을 넘치지 않는다", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("넘침 자르기 + 최신 막대를 오른쪽에", () => {
    act(() => root.render(<VoiceRecordingLiveWaveform peaks={Array.from({ length: 36 }, () => 0.5)} />));
    const box = host.querySelector("[data-cm-voice-live-waveform]") as HTMLElement;
    expect(box.className).toContain("overflow-hidden");
    expect(box.className).toContain("justify-end");
    expect(box.className).not.toContain("justify-between");
  });
});

describe("S1 말풍선 위에서 시작한 세로 밀기는 목록을 스크롤한다", () => {
  it("말풍선 touch-action = pan-y, 길게 누르기 취소 처리(pointercancel·8px)는 유지", () => {
    const src = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(src).toMatch(/messageBubbleTouchStyle: CSSProperties = \{\s+touchAction: "pan-y"/);
    expect(src).toContain("onPointerCancel: cancelLongPress");
    expect(src).toContain("Math.sqrt(dx * dx + dy * dy) > 8");
  });
});

describe("C2 · O4 서명·캐시 시간", () => {
  it("업로드 3경로(사진·파일·음성)에 1년 Cache-Control", () => {
    for (const p of [
      "lib/community-messenger/server/messenger-image-upload-process.ts",
      "lib/community-messenger/server/messenger-media-upload-send.ts",
      "app/api/community-messenger/rooms/[roomId]/voice/route.ts",
    ]) {
      expect(read(p)).toContain("cacheControl: MESSENGER_MEDIA_UPLOAD_CACHE_CONTROL");
    }
  });
});

/* ---------- M1: 가짜 DB ---------- */
type Row = Record<string, unknown>;
function fakeSb(tables: { messages: Row[]; participant: Row | null; hides: Row[] }) {
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let head = false;
    let limitN = Infinity;
    const api: Record<string, unknown> = {};
    const chain = () => api;
    Object.assign(api, {
      select: (_c: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return chain();
      },
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
        const rows = src
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        resolve(head ? { count: rows.length, error: null } : { data: rows.slice(0, limitN), error: null });
      },
    });
    return api;
  };
  return { from: (t: string) => builder(t) } as never;
}

const ROOM = "r1";
const msg = (id: string, type: string, at: string, extra: Row = {}): Row => ({
  id,
  room_id: ROOM,
  message_type: type,
  content: type === "image" ? `https://x.supabase.co/storage/v1/object/public/messenger-media/u/${id}.thumb.webp` : "",
  created_at: at,
  metadata: type === "voice" ? { durationSeconds: 4 } : {},
  deleted_at: null,
  deleted_for_everyone_at: null,
  is_hidden_by_admin: null,
  ...extra,
});

describe("M1 방 사진·음성 모음 = 서버 조회·서버 개수", () => {
  const messages = [
    msg("p1", "image", "2026-11-16T01:00:00Z"),
    msg("p2", "image", "2026-11-16T02:00:00Z"),
    msg("p3", "image", "2026-11-16T03:00:00Z", { deleted_for_everyone_at: "2026-11-16T03:01:00Z" }),
    msg("p4", "image", "2026-11-16T04:00:00Z", { is_hidden_by_admin: true }),
    msg("p5", "image", "2026-11-16T05:00:00Z"),
    msg("v1", "voice", "2026-11-16T06:00:00Z"),
    msg("t1", "text", "2026-11-16T07:00:00Z"),
    msg("old", "image", "2026-11-10T00:00:00Z"),
  ];

  it("삭제·전체삭제·관리자숨김·나에게서만 삭제·기록 하한 이전을 빼고 센다", async () => {
    const sb = fakeSb({
      messages,
      participant: { id: "pp", cleared_at: "2026-11-15T00:00:00Z", left_at: null },
      hides: [{ user_id: "u1", message_id: "p5" }],
    });
    const r = await listRoomMediaGallery({ userId: "u1", roomId: ROOM, sb });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.page.counts).toEqual({ image: 2, voice: 1, file: 0, link: 0 });
    expect(r.page.items.map((x) => x.id)).toEqual(["v1", "p2", "p1"]);
    expect(r.page.items[0]!.voiceDurationSeconds).toBe(4);
  });

  it("방을 나간 사람·참가자 아님은 403", async () => {
    const left = await listRoomMediaGallery({
      userId: "u1",
      roomId: ROOM,
      sb: fakeSb({ messages, participant: { id: "pp", left_at: "2026-11-16T00:00:00Z" }, hides: [] }),
    });
    expect(left).toEqual({ ok: false, error: "forbidden" });
    const none = await listRoomMediaGallery({ userId: "u1", roomId: ROOM, sb: fakeSb({ messages, participant: null, hides: [] }) });
    expect(none).toEqual({ ok: false, error: "forbidden" });
  });

  it("사진 묶음 장수·첫 장 썸네일", () => {
    const it = mapRoomMediaGalleryRow(
      msg("a1", "image", "2026-11-16T01:00:00Z", {
        metadata: { image_thumb_urls: ["https://x/a.thumb.webp", "https://x/b.thumb.webp", "https://x/c.thumb.webp"] },
      })
    );
    expect(it?.imageCount).toBe(3);
    expect(it?.thumbSrc).toBe("https://x/a.thumb.webp");
  });

  it("모음 시트·메뉴·정보 시트는 불러온 메시지 목록이 아니라 서버 조회를 쓴다", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx");
    expect(src).not.toContain("vm.mediaGalleryMessages");
    expect(src).toContain("useRoomMediaGallery(");
    expect(src.match(/vm\.photoMessageCount/g)?.length).toBe(1);
  });
});

describe("M1 훅은 방 id 가 없어도 깨지지 않는다(CI: group-drawer-dedupe-d13 에서 roomId.trim 오류)", () => {
  it("roomId undefined + enabled → 요청 없음·오류 없음", async () => {
    const { useRoomMediaGallery } = await import("@/lib/community-messenger/media/use-room-media-gallery");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    function Probe() {
      useRoomMediaGallery(undefined, true);
      return null;
    }
    await act(async () => {
      root.render(<Probe />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
