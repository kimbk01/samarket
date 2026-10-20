/**
 * D13 — 그룹 참여자 이름 = profiles.nickname. 운영에 없는 full_name 을 조회하지 않는다.
 */
import { describe, expect, it } from "vitest";
import { fetchProfileLabels } from "@/lib/community-messenger/group/group-room-repository";
import { fetchActiveParticipantLabels } from "@/lib/community-messenger/group/group-room-read-service";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function mockSb(selects: string[]) {
  return {
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: (cols: string) => {
          selects.push(cols);
          return {
            in: async () => ({
              data: [
                { id: A, nickname: "닉네임A", display_name: "다른이름" },
                { id: B, nickname: "  " },
              ],
              error: null,
            }),
          };
        },
      };
    },
  } as never;
}

describe("group participant labels (D13)", () => {
  it.each([
    ["fetchProfileLabels", (sb: never) => fetchProfileLabels(sb, [A, B])],
    ["fetchActiveParticipantLabels", (sb: never) => fetchActiveParticipantLabels(sb, "room", [A, B])],
  ])("%s: nickname 사용, full_name·display_name 미조회", async (_name, run) => {
    const selects: string[] = [];
    const labels = await run(mockSb(selects));
    expect(selects.join(",")).not.toMatch(/full_name|display_name/);
    expect(labels.get(A)).toBe("닉네임A");
    expect(labels.get(B)).toBe(B.slice(0, 6));
  });
});
