import { describe, expect, it, vi } from "vitest";
import { selectGroupReadCountMessageIds } from "@/lib/community-messenger/group/group-read-count-message-ids";
import { fetchGroupMessageReadCounts } from "@/lib/community-messenger/group/group-room-read-service";

const ROOM = "8d01f7c7-d7b1-4b3e-8d1b-1c57e05cbafb";
const M1 = "0b6f2b8e-4b7a-4c1e-9d2a-3f1e2d3c4b5a";
const M2 = "1c7a3c9f-5c8b-4d2f-8e3b-4a2f3e4d5c6b";

describe("그룹 읽음 수 — 임시 메시지 id 제외 (운영 Postgres uuid 오류 2026-11-12~13)", () => {
  it("pending·pending:image·빈 값·중복은 빼고 uuid 만 남긴다", () => {
    expect(
      selectGroupReadCountMessageIds([
        `pending:${ROOM}:0`,
        `pending:image:${ROOM}:3`,
        ` ${M1} `,
        M1,
        "",
        42,
        M2,
      ])
    ).toEqual([M1, M2]);
  });

  it("상한 개수까지만", () => {
    expect(selectGroupReadCountMessageIds([M1, M2], 1)).toEqual([M1]);
  });

  it("서버 서비스: 임시 id 는 RPC 인자에 들어가지 않는다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ message_id: M1, read_count: 2 }], error: null });
    const counts = await fetchGroupMessageReadCounts({ rpc } as never, ROOM, [`pending:${ROOM}:0`, M1]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![1]).toEqual({ p_room_id: ROOM, p_message_ids: [M1] });
    expect(counts.get(M1)).toBe(2);
  });

  it("서버 서비스: 임시 id 만 있으면 RPC 를 부르지 않는다", async () => {
    const rpc = vi.fn();
    const counts = await fetchGroupMessageReadCounts({ rpc } as never, ROOM, [`pending:image:${ROOM}:1`]);
    expect(rpc).not.toHaveBeenCalled();
    expect(counts.size).toBe(0);
  });
});
