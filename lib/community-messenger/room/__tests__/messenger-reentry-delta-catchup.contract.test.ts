import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCommunityMessengerMessagesAfterPath,
  selectNewestConfirmedMessageAnchor,
} from "@/lib/community-messenger/room/messenger-room-catchup-anchor";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const UUID_20 = "00000000-0000-4000-8000-000000000020";
const UUID_21 = "00000000-0000-4000-8000-000000000021";
const UUID_22 = "00000000-0000-4000-8000-000000000022";
const ROOM = "a4b49e55-a95f-4872-88a5-cc309f3d9814";

describe("T3 missed realtime catch-up", () => {
  it("anchors after= on newest confirmed UUID, not array tail", () => {
    const anchor = selectNewestConfirmedMessageAnchor([
      { id: UUID_20, createdAt: "2026-08-11T00:00:20.000Z" },
      { id: UUID_22, createdAt: "2026-08-11T00:00:22.000Z" },
      { id: UUID_21, createdAt: "2026-08-11T00:00:21.000Z" },
      { id: "pending:local", createdAt: "2026-08-11T00:00:23.000Z", pending: true },
    ]);
    expect(anchor).toBe(UUID_22);
  });

  it("builds cursor delta path not full history refetch", () => {
    const path = buildCommunityMessengerMessagesAfterPath(ROOM, UUID_20);
    expect(path).toContain(`/rooms/${ROOM}/messages?after=`);
    expect(path).toContain(encodeURIComponent(UUID_20));
    expect(path).toContain("limit=80");
    expect(path).not.toMatch(/after=.*after=/);
  });

  it("room re-entry ready path still runs catchUpNewerMessages (zero-fetch is not history authority)", () => {
    const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
    expect(phase1).toContain("void catchUpNewerMessages()");
    expect(phase1).toContain("roomReadyForRealtime");
    const refresh = read("lib/community-messenger/room/messenger-room-bootstrap-refresh.ts");
    expect(refresh).toContain("silent_fetch_skipped");
    expect(refresh).toContain("mergePrimedTimelineSeedIntoExisting");
    expect(refresh).not.toMatch(/if \(prev\.length === 0\) \{\s*return msgs/);
  });
});
