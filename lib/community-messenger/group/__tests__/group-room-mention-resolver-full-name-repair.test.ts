/**
 * T1–T7 — mention resolver minimum repair (no profiles.full_name).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveMentionUserIdsForGroupRoom } from "@/lib/community-messenger/group/group-room-mention-service";

const QQQQ = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const AAAA = "11111111-1111-1111-1111-111111111111";
const ROOM = "3e92fa77-de94-493b-b2e2-eb4813228d39";

function mockSb(profiles: Array<Record<string, unknown>>) {
  const participantIds = profiles.map((p) => String(p.id));
  const from = vi.fn((table: string) => {
    if (table === "community_messenger_participants") {
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              is: async () => ({
                data: participantIds.map((user_id) => ({ user_id })),
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: (cols: string) => {
          // Capture select string for T7 assertion via closure
          (mockSb as unknown as { lastSelect?: string }).lastSelect = cols;
          return {
            in: async () => ({ data: profiles, error: null }),
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as never;
}

describe("resolveMentionUserIdsForGroupRoom — full_name removal", () => {
  it("T1: nickname q테스트1 → qqqq", async () => {
    const sb = mockSb([
      { id: QQQQ, nickname: "q테스트1", display_name: "q테스트1", username: "qqqq" },
      { id: AAAA, nickname: "메인관리자", display_name: "메인관리자", username: "aaaa" },
    ]);
    const ids = await resolveMentionUserIdsForGroupRoom(sb, ROOM, "@q테스트1 hello");
    expect(ids).toEqual([QQQQ]);
  });

  it("T2: display_name resolution", async () => {
    const sb = mockSb([
      {
        id: QQQQ,
        nickname: "other-nick",
        display_name: "DisplayQ",
        username: "qqqq",
      },
    ]);
    const ids = await resolveMentionUserIdsForGroupRoom(sb, ROOM, "@DisplayQ hi");
    expect(ids).toEqual([QQQQ]);
  });

  it("T3: username resolution", async () => {
    const sb = mockSb([
      { id: QQQQ, nickname: "q테스트1", display_name: "q테스트1", username: "qqqq" },
    ]);
    const ids = await resolveMentionUserIdsForGroupRoom(sb, ROOM, "@qqqq ping");
    expect(ids).toEqual([QQQQ]);
  });

  it("T4: unknown mention → no target", async () => {
    const sb = mockSb([
      { id: QQQQ, nickname: "q테스트1", display_name: "q테스트1", username: "qqqq" },
    ]);
    const ids = await resolveMentionUserIdsForGroupRoom(sb, ROOM, "@nobodyhere");
    expect(ids).toEqual([]);
  });

  it("T5: no mention syntax → empty (normal group path preserved)", async () => {
    const sb = mockSb([
      { id: QQQQ, nickname: "q테스트1", display_name: "q테스트1", username: "qqqq" },
    ]);
    const ids = await resolveMentionUserIdsForGroupRoom(sb, ROOM, "plain group message");
    expect(ids).toEqual([]);
  });

  it("T6: mention target → mention_user_ids contains target", async () => {
    const sb = mockSb([
      { id: QQQQ, nickname: "q테스트1", display_name: "q테스트1", username: "qqqq" },
      { id: AAAA, nickname: "메인관리자", display_name: "메인관리자", username: "aaaa" },
    ]);
    const mentionUserIds = await resolveMentionUserIdsForGroupRoom(
      sb,
      ROOM,
      "@q테스트1 R1-MENTION"
    );
    expect(mentionUserIds).toContain(QQQQ);
    expect(mentionUserIds).not.toContain(AAAA);
  });

  it("T7: no profiles.full_name query remains in this function", () => {
    const src = readFileSync(
      resolve(__dirname, "../group-room-mention-service.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/full_name/);
    expect(src).toMatch(/\.select\("id, nickname, display_name, username"\)/);
  });
});
