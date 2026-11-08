/**
 * C5 (Owner 「C5 구현 승인」 2026-11-09) — `/philife/meetings/[id]` 이동이 try/catch 에 삼켜지지 않는다.
 * Next 의 redirect 는 예외를 던져 동작하므로, 테스트에서도 같은 방식(throw)으로 흉내 낸다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
class NotFoundSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new NotFoundSignal("NEXT_NOT_FOUND");
  },
}));

let roomId: string | null = null;
let queryFails = false;
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => {
    if (queryFails) throw new Error("service key missing");
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { community_messenger_room_id: roomId }, error: null }),
          }),
        }),
      }),
    };
  },
}));

async function visit(meetingId: string): Promise<string> {
  const { default: Page } = await import("@/app/(main)/philife/meetings/[meetingId]/page");
  try {
    await Page({ params: Promise.resolve({ meetingId }) });
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    if (e instanceof NotFoundSignal) return "404";
    throw e;
  }
  return "no-redirect";
}

describe("C5 모임 주소 이동", () => {
  beforeEach(() => {
    roomId = null;
    queryFails = false;
  });

  it("방이 연결된 모임 → 그 채팅방으로 이동 (이전 결함: 항상 기본 화면)", async () => {
    roomId = "room-123";
    expect(await visit("meet-1")).toBe("/community-messenger/rooms/room-123");
  });

  it("방이 없는 모임 → 오픈채팅 모임 탭", async () => {
    expect(await visit("meet-1")).toBe("/community-messenger?section=open_chat&meetingId=meet-1");
  });

  it("조회 실패(서비스 키 없음 등) → 오픈채팅 모임 탭", async () => {
    queryFails = true;
    expect(await visit("meet-1")).toBe("/community-messenger?section=open_chat&meetingId=meet-1");
  });

  it("빈 id → 404", async () => {
    expect(await visit("  ")).toBe("404");
  });
});
